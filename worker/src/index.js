// AIRCHITECT chat proxy (Cloudflare Worker).
// Receives the conversation from chat.html, adds the specialist's role and
// streams Claude's answer back as Server-Sent Events. The API key stays here.
//
// Request:  POST /chat
//   { specialist: "financier",
//     messages: [{ role: "user" | "assistant", text: "...",
//                  files: [{ name, type, data /* base64 */ }] }] }
// Response: text/event-stream with lines
//   data: {"type":"text","text":"..."}            - answer fragment
//   data: {"type":"done","stop_reason":"end_turn"} - finished (refusal / max_tokens possible)
//   data: {"type":"error","message":"..."}        - failed
//
// Request:  POST /extract   { file: { name, type, data /* base64 PDF or text */ } }
// Response: JSON { contract: {...}, obligations: [{ party, text, clause, due, condition }] }
//           Obligations of a construction contract for the "Исполнение договора" tab (contracts.html).
//
// Request:  POST /registry  { inn }      -> JSON: public registries (ЕГРЮЛ, «Прозрачный бизнес», ГИР БО, НОСТРОЙ)
// Request:  POST /egrul-pdf { token }    -> application/pdf: official ЕГРЮЛ/ЕГРИП extract (registries.js)

import Anthropic from '@anthropic-ai/sdk';
import { SPECIALISTS, buildSystemPrompt } from './specialists.js';
import { validInn, checkCounterparty, egrulPdf } from './registries.js';

const MODEL = 'claude-opus-5-5';
const MAX_TOKENS = 16000;
const MAX_MESSAGES = 40;
const MAX_TEXT_LENGTH = 20000;
const MAX_FILES_PER_MESSAGE = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 24 * 1024 * 1024;

const FILE_KINDS = {
    'application/pdf': 'pdf',
    'text/plain': 'text',
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/webp': 'image',
    'image/gif': 'image'
};

class RequestError extends Error {}

export default {
    async fetch(request, env) {
        const cors = corsHeaders(request, env);
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cors });
        }

        const url = new URL(request.url);
        if (request.method !== 'POST' || !['/chat', '/extract', '/registry', '/egrul-pdf'].includes(url.pathname)) {
            return json({ error: 'not_found' }, 404, cors);
        }
        if (!cors['Access-Control-Allow-Origin']) {
            return json({ error: 'origin_not_allowed' }, 403, cors);
        }

        // Optional rate limit (see wrangler.toml): protects the API budget of a public chat
        if (env.CHAT_LIMITER) {
            const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
            const { success } = await env.CHAT_LIMITER.limit({ key: ip });
            if (!success) {
                return json({ error: 'Слишком много запросов. Попробуйте через минуту.' }, 429, cors);
            }
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return json({ error: 'invalid_json' }, 400, cors);
        }

        if (url.pathname === '/extract') {
            return extractObligations(body, env, cors);
        }
        if (url.pathname === '/registry') {
            const inn = String((body && body.inn) || '').trim();
            if (!validInn(inn)) return json({ error: 'Некорректный ИНН: проверьте количество цифр и контрольное число.' }, 400, cors);
            return json(await checkCounterparty(inn), 200, cors);
        }
        if (url.pathname === '/egrul-pdf') {
            try {
                const pdf = await egrulPdf(body && body.token);
                return new Response(pdf.body, { headers: { ...cors, 'Content-Type': 'application/pdf' } });
            } catch (err) {
                return json({ error: err.message || 'Не удалось получить выписку' }, 502, cors);
            }
        }

        if (!body || !SPECIALISTS[body.specialist]) {
            return json({ error: 'unknown_specialist' }, 400, cors);
        }

        let messages;
        try {
            messages = toApiMessages(body.messages);
        } catch (err) {
            if (err instanceof RequestError) return json({ error: err.message }, 400, cors);
            throw err;
        }

        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                const send = event => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                try {
                    // Tender analysis: the links are opened on Anthropic's servers with the web fetch tool
                    const tender = tenderRequest(body);
                    if (tender) {
                        const last = messages[messages.length - 1];
                        last.content.push({ type: 'text', text: tenderInstruction(tender) });
                    }
                    // Counterparty check: public registries are queried here, the model gets only received facts
                    const cp = counterpartyRequest(body);
                    if (cp) {
                        send({ type: 'status', text: 'Запрашиваю сведения ФНС и НОСТРОЙ…' });
                        const results = [];
                        for (const inn of cp) results.push(await checkCounterparty(inn));
                        send({ type: 'data', data: { counterparties: results } });
                        const last = messages[messages.length - 1];
                        last.content.push({ type: 'text', text: counterpartyInstruction(results) });
                    }
                    let conversation = messages;
                    let final;
                    // A long server-tool turn can pause: resend the paused turn to continue (bounded)
                    for (let round = 0; round < 4; round++) {
                        const answer = client.beta.messages.stream({
                            model: MODEL,
                            max_tokens: tender ? TENDER_MAX_TOKENS : MAX_TOKENS,
                            // Chat answers: medium effort; tender reports need more care
                            output_config: { effort: tender ? 'high' : 'medium' },
                            // On a safety decline the API continues on Anthropic's recommended fallback model
                            betas: ['server-side-fallback-2026-07-01'],
                            fallbacks: 'default',
                            // The role and earlier turns (including uploaded documents) are reused from cache
                            cache_control: { type: 'ephemeral' },
                            system: buildSystemPrompt(body.specialist),
                            ...(tender ? { tools: [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: tender.urls.length * 3 + 2 }] } : {}),
                            messages: conversation
                        });

                        for await (const event of answer) {
                            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                                send({ type: 'text', text: event.delta.text });
                            } else if (event.type === 'content_block_start' && event.content_block.type === 'server_tool_use') {
                                send({ type: 'status', text: 'Открываю страницу закупки…' });
                            }
                        }

                        final = await answer.finalMessage();
                        if (final.stop_reason !== 'pause_turn') break;
                        conversation = [...conversation, { role: 'assistant', content: final.content }];
                    }
                    send({ type: 'done', stop_reason: final.stop_reason });
                } catch (err) {
                    send({ type: 'error', message: describeError(err) });
                }
                controller.close();
            }
        });

        return new Response(stream, {
            headers: {
                ...cors,
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache'
            }
        });
    }
};

// ---- Counterparty check (security specialist) ------------------------------------------

function counterpartyRequest(body) {
    const a = body && body.analysis;
    if (!a || a.type !== 'counterparty' || body.specialist !== 'security-specialist' || !Array.isArray(a.inns)) return null;
    const inns = [...new Set(a.inns.map(x => String(x).trim()).filter(validInn))].slice(0, 5);
    return inns.length ? inns : null;
}

function counterpartyInstruction(results) {
    const compact = results.map(r => ({
        inn: r.inn, fetchedAt: r.fetchedAt,
        sources: r.sources.map(s => `${s.title}: ${s.status}${s.message ? ' (' + s.message + ')' : ''}`),
        egrul: r.egrul ? { name: r.egrul.name, ogrn: r.egrul.ogrn, registered: r.egrul.registered, head: r.egrul.head, liquidated: r.egrul.liquidated || '' } : null,
        status: r.pb ? { status: r.pb.status, unreliable: r.pb.unreliable, liquidation: r.pb.liquidation, okved: `${r.pb.okved} ${r.pb.okvedName}` } : null,
        financeThousandRub: r.finance.slice(-3).map(y => ({ year: y.year, revenue2110: y.lines['2110'], profit2400: y.lines['2400'], equity1300: y.lines['1300'], assets1600: y.lines['1600'], current1200: y.lines['1200'], shortDebt1500: y.lines['1500'], longDebt1400: y.lines['1400'] })),
        sro: r.sro.map(x => ({ sro: x.sro, number: x.sroNumber, status: x.status, right: x.right, levelOdo: `${x.levelOdo} ${x.levelOdoCost}`.trim(), levelVv: `${x.levelVv} ${x.levelVvCost}`.trim() }))
    }));
    return [
        'Сведения открытых реестров (ФНС: ЕГРЮЛ, «Прозрачный бизнес», ГИР БО; НОСТРОЙ), полученные сервером AIRCHITECT. Используй только их и сведения пользователя; не придумывай факты.',
        'Судебные дела (kad.arbitr.ru), исполнительные производства (ФССП), банкротство (ЕФРСБ), реестры недобросовестных поставщиков в этой проверке не запрашивались — прямо укажи, что их нужно проверить по официальным источникам.',
        'Если сведения источника не получены (status error/captcha/empty), укажи это как недостаточность данных, а не как низкий риск.',
        'Структура ответа: регистрационные сведения; финансовое состояние (динамика, ликвидность, капитал — с годами); СРО; оценка по категориям (низкий/умеренный/высокий/критический/нет данных) с обоснованием; одно из решений: «Рекомендуется сотрудничество», «Рекомендуется при выполнении условий», «Требуется дополнительная проверка», «Не рекомендуется сотрудничество»; меры защиты в договоре; источники с датой.',
        results.length > 1 ? 'Компаний несколько: добавь сравнительную таблицу.' : '',
        'Не делай обвинительных выводов: косвенные признаки и заявленные требования не являются доказанными нарушениями.',
        JSON.stringify(compact)
    ].filter(Boolean).join('\n');
}

// ---- Tender analysis (tender specialist) ------------------------------------------

const TENDER_MAX_TOKENS = 32000;
const MAX_TENDER_URLS = 6;

function tenderRequest(body) {
    const a = body && body.analysis;
    if (!a || a.type !== 'tenders' || body.specialist !== 'tender-specialist' || !Array.isArray(a.urls)) return null;
    const urls = a.urls.filter(u => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, MAX_TENDER_URLS);
    return urls.length ? { urls, mode: a.mode === 'compare' && urls.length > 1 ? 'compare' : 'each' } : null;
}

function tenderInstruction({ urls, mode }) {
    return `Задача: аналитическая справка по закупкам${mode === 'compare' ? ' со сводным сравнением' : ' — отдельно по каждой'}.

Ссылки:
${urls.map((u, i) => `${i + 1}. ${u}`).join('\n')}

Порядок работы:
1. Открой каждую ссылку инструментом web_fetch. Используй только то, что действительно получено со страницы или из приложенных документов. Если страница не открылась, требует входа или документация (извещение, ТЗ, проект договора) недоступна, прямо напиши это и попроси пользователя загрузить документы в чат. Ничего не додумывай: недоступные сведения помечай «нет данных».
2. Для каждой закупки укажи источники (ссылку и какие документы прочитаны).

Структура справки:
## Сведения о закупке — заказчик, номер, закон (44-ФЗ / 223-ФЗ / коммерческая), предмет, НМЦК, сроки подачи и подведения итогов, место и сроки выполнения.
## Требования — к участникам (в том числе дополнительные), к опыту, допускам и членству в СРО, ключевые требования ТЗ.
## Обеспечения и расходы — строго разделяй три группы: (а) суммы обеспечения заявки, исполнения и гарантийных обязательств — блокируются или обеспечиваются банковской гарантией, это не расход; (б) фактические расходы — комиссии по банковским гарантиям, проценты, сборы площадки (если ставка не известна — укажи допущение); (в) прогнозы. Покажи формулы и исходные проценты.
## Условия оплаты — аванс, порядок и сроки оплаты, удержания, график платежей; оцени потребность в оборотных средствах и риск кассовых разрывов.
## Договорные и финансовые риски — неустойки, односторонний отказ, приёмка, изменение цены, антидемпинговые меры и т. п. со ссылками на пункты документации.
## Прогноз рентабельности — только с явными допущениями (себестоимость, снижение цены), отдельно от фактов.
## Заключение и рекомендации — целесообразность участия с обоснованием; оптимальный способ обеспечения и потребность в финансировании; как повысить конкурентоспособность заявки; как снизить договорные и финансовые риски; конкретный план действий до подачи заявки с датами.
${mode === 'compare' ? '## Сравнение — таблица по закупкам: НМЦК, обеспечения, расходы, требования, риски, рентабельность, итоговая оценка.' : ''}
Где нужна оценка финансиста, юриста или специалиста по безопасности (проверка заказчика и контрагентов), отметь это.

В самом конце ответа добавь блок с данными для реестра строго в формате (null для неизвестных значений):
\`\`\`airchitect-data
{"tenders":[{"url":"","number":null,"law":null,"title":null,"customer":null,"nmck":null,"submission_deadline":"ГГГГ-ММ-ДД или null","results_date":null,"bid_security":null,"contract_security":null,"warranty_security":null,"advance":null,"payment_terms":null,"requirements":null,"contract_terms":null,"recommendation":null}]}
\`\`\``;
}

// Fields are always present (empty string when the contract does not state them)
const CONTRACT_FIELDS = ['number', 'date', 'subject', 'customer', 'contractor', 'price', 'start', 'end'];
const EXTRACT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['contract', 'obligations'],
    properties: {
        contract: {
            type: 'object',
            additionalProperties: false,
            required: CONTRACT_FIELDS,
            properties: Object.fromEntries(CONTRACT_FIELDS.map(f => [f, { type: 'string' }]))
        },
        obligations: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['party', 'text', 'clause', 'due', 'condition'],
                properties: {
                    party: { type: 'string', enum: ['customer', 'contractor', 'both'] },
                    text: { type: 'string' },
                    clause: { type: 'string' },
                    due: { type: 'string' },
                    condition: { type: 'string' }
                }
            }
        }
    }
};

const EXTRACT_PROMPT = `Ты — договорной специалист AIRCHITECT. Перед тобой строительный договор (как правило, договор подряда).

Извлеки:
1. Реквизиты: number (номер), date (дата в формате ГГГГ-ММ-ДД), subject (предмет кратко), customer (заказчик), contractor (подрядчик), price (цена с валютой), start и end (сроки работ в формате ГГГГ-ММ-ДД).
2. Все обязательства сторон, которые нужно исполнить и проконтролировать: выполнение работ и этапов, оплата и авансы, передача документации и площадки, приёмка, уведомления и сроки их направления, гарантийные обязательства, предоставление обеспечения, страхование и другие.

Для каждого обязательства: party (customer, contractor или both), text (что нужно сделать, кратко и точно), clause (номер пункта договора, например «4.2.1»), due (контрольная дата ГГГГ-ММ-ДД, только если она прямо указана в договоре), condition (условие или порядок исполнения, например «в течение 10 рабочих дней с даты подписания акта КС-2»).

Правила: ничего не придумывай. Если срок задан относительно события, оставь due пустым и опиши срок в condition. Если сведения нет в договоре, оставь поле пустой строкой. Указывай пункт договора для каждого обязательства.`;

async function extractObligations(body, env, cors) {
    const file = body && body.file;
    const kind = file && FILE_KINDS[file.type];
    if (!file || typeof file.data !== 'string' || (kind !== 'pdf' && kind !== 'text')) {
        return json({ error: 'Приложите договор в формате PDF или текстовым файлом.' }, 400, cors);
    }
    if (Math.floor(file.data.length * 3 / 4) > MAX_FILE_BYTES) {
        return json({ error: 'Файл договора больше 10 МБ.' }, 400, cors);
    }
    const title = String(file.name || 'Договор').slice(0, 200);
    const docBlock = kind === 'pdf'
        ? { type: 'document', title, source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
        : { type: 'document', title, source: { type: 'text', media_type: 'text/plain', data: decodeBase64Text(file.data) } };

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
        // Streaming keeps a long contract from hitting request timeouts; the result is read at the end
        const stream = client.beta.messages.stream({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            output_config: { effort: 'medium', format: { type: 'json_schema', schema: EXTRACT_SCHEMA } },
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            messages: [{ role: 'user', content: [docBlock, { type: 'text', text: EXTRACT_PROMPT }] }]
        });
        const message = await stream.finalMessage();
        if (message.stop_reason === 'refusal') {
            return json({ error: 'Договор не удалось обработать. Добавьте обязательства вручную.' }, 422, cors);
        }
        if (message.stop_reason === 'max_tokens') {
            return json({ error: 'Договор слишком большой для автоматического разбора. Разделите его на части.' }, 422, cors);
        }
        const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
        return json(JSON.parse(text), 200, cors);
    } catch (err) {
        return json({ error: describeError(err) }, 502, cors);
    }
}

// Converts the site's simple message format into Messages API content blocks
function toApiMessages(input) {
    if (!Array.isArray(input) || input.length === 0) throw new RequestError('messages_required');
    if (input.length > MAX_MESSAGES) throw new RequestError('Диалог слишком длинный. Начните новый.');

    let totalFileBytes = 0;
    const messages = input.map(message => {
        if (!message || (message.role !== 'user' && message.role !== 'assistant')) {
            throw new RequestError('invalid_role');
        }
        const text = typeof message.text === 'string' ? message.text.slice(0, MAX_TEXT_LENGTH) : '';
        const files = Array.isArray(message.files) ? message.files : [];

        if (message.role === 'assistant') {
            return { role: 'assistant', content: text || '…' };
        }
        if (files.length > MAX_FILES_PER_MESSAGE) {
            throw new RequestError(`Можно приложить не больше ${MAX_FILES_PER_MESSAGE} файлов к сообщению.`);
        }

        const content = [];
        for (const file of files) {
            const kind = FILE_KINDS[file && file.type];
            if (!kind || typeof file.data !== 'string') {
                throw new RequestError('Поддерживаются PDF, изображения (PNG, JPEG, WEBP, GIF) и текстовые файлы.');
            }
            const bytes = Math.floor(file.data.length * 3 / 4);
            totalFileBytes += bytes;
            if (bytes > MAX_FILE_BYTES || totalFileBytes > MAX_TOTAL_FILE_BYTES) {
                throw new RequestError('Файлы слишком большие. Максимум 10 МБ на файл.');
            }
            const title = String(file.name || 'Документ').slice(0, 200);
            if (kind === 'pdf') {
                content.push({ type: 'document', title, source: { type: 'base64', media_type: 'application/pdf', data: file.data } });
            } else if (kind === 'text') {
                content.push({ type: 'document', title, source: { type: 'text', media_type: 'text/plain', data: decodeBase64Text(file.data) } });
            } else {
                content.push({ type: 'image', source: { type: 'base64', media_type: file.type, data: file.data } });
            }
        }
        content.push({ type: 'text', text: text || 'Посмотри приложенные документы.' });
        return { role: 'user', content };
    });

    if (messages[0].role !== 'user' || messages[messages.length - 1].role !== 'user') {
        throw new RequestError('invalid_conversation');
    }
    return messages;
}

function decodeBase64Text(data) {
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

function describeError(err) {
    if (err instanceof Anthropic.RateLimitError) return 'Сервис перегружен. Попробуйте через минуту.';
    if (err instanceof Anthropic.AuthenticationError) return 'Чат настроен неверно (ключ API). Сообщите администратору.';
    if (err instanceof Anthropic.BadRequestError) return 'Запрос не принят: возможно, документ слишком большой или повреждён.';
    if (err instanceof Anthropic.APIError) return 'Сервис временно недоступен. Попробуйте позже.';
    return 'Не удалось получить ответ. Попробуйте позже.';
}

function corsHeaders(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const headers = {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin'
    };
    if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    return headers;
}

function json(data, status, headers) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }
    });
}
