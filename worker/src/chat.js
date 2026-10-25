// Dialog with a specialist: history and documents are read from the database and R2 (checked against the
// company and project of the session), the answer is streamed as Server-Sent Events and saved with its sources.
//
// Request:  POST /chat (or /api/chat)
//   { specialist, project_id, dialog_id?, text, document_ids?: [...], analysis?: {...} }
// Response: text/event-stream
//   {"type":"dialog","id":"…"}                       - dialog of the message (new or existing)
//   {"type":"status","text":"…"}                     - progress (web pages, registries)
//   {"type":"text","text":"…"}                       - answer fragment
//   {"type":"citation","n":1,"source":{…}}           - source of the preceding fragment
//   {"type":"data","data":{…}}                       - structured data (counterparty registries)
//   {"type":"done","message_id":"…","stop_reason":"…","review_required":true|false}
//   {"type":"error","message":"…"}

import Anthropic from '@anthropic-ai/sdk';
import { SPECIALISTS, buildSystemPrompt } from './specialists.js';
import { validInn, checkCounterparty } from './registries.js';
import { badRequest, notFound, uid, now, str, log } from './http.js';
import { projectAccess } from './store.js';
import { documentAccess, documentBlock } from './documents.js';
import { checkLimits, recordUsage } from './limits.js';

const MAX_TEXT = 20000;
const MAX_HISTORY = 40;
const MAX_DOCS_PER_MESSAGE = 10;

export const modelOf = env => env.MODEL || 'claude-opus-5-5';
export const client = env => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}), maxRetries: 2 });

export function describeError(err) {
    if (err instanceof Anthropic.RateLimitError) return 'Сервис ИИ перегружен. Попробуйте через минуту.';
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return 'Сервер ИИ настроен неверно (ключ API). Сообщите администратору.';
    if (err instanceof Anthropic.BadRequestError) return 'Запрос не принят сервисом ИИ: возможно, документы слишком большие или повреждены.';
    if (err instanceof Anthropic.APIConnectionError) return 'Сервис ИИ недоступен. Попробуйте позже.';
    if (err instanceof Anthropic.APIError) return 'Сервис ИИ временно недоступен. Попробуйте позже.';
    return err && err.status ? err.message : 'Не удалось получить ответ. Попробуйте позже.';
}

// ---- Sources -------------------------------------------------------------------------------

function sourceOf(citation, docIds) {
    const quote = String(citation.cited_text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (citation.type === 'web_search_result_location') return { kind: 'web', title: citation.title || citation.url, url: citation.url, quote };
    const doc = { kind: 'document', document_id: docIds[citation.document_index] || null, title: citation.document_title || 'Документ', quote };
    if (citation.type === 'page_location') {
        const a = citation.start_page_number;
        const b = (citation.end_page_number || a + 1) - 1; // the end page is exclusive
        doc.pages = b > a ? `с. ${a}–${b}` : `с. ${a}`;
    }
    return doc;
}

// ---- Analysis modes kept from the first version (tenders, legal sources, cards, registries) ---

const LEGAL_DOMAINS = ['pravo.gov.ru', 'kremlin.ru', 'government.ru', 'vsrf.ru', 'arbitr.ru', 'kad.arbitr.ru', 'ksrf.ru', 'consultant.ru', 'garant.ru', 'minstroyrf.gov.ru', 'zakupki.gov.ru', 'nostroy.ru', 'nopriz.ru', 'fas.gov.ru'];
const TENDER_MAX_TOKENS = 32000;
const MAX_TENDER_URLS = 6;
const CONTEXT_LABEL = {
    contract: 'Карточка договора из раздела «Договоры»',
    procurement: 'Данные закупки и контрольные точки поставки из раздела «Закупки»',
    estimates: 'Данные сметы из раздела «Сметы»'
};

function analysisOf(specialist, analysis) {
    const a = analysis && typeof analysis === 'object' ? analysis : null;
    if (!a) return {};
    if (a.type === 'tenders' && specialist === 'tender-specialist' && Array.isArray(a.urls)) {
        const urls = a.urls.filter(u => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, MAX_TENDER_URLS);
        if (urls.length) return { tender: { urls, mode: a.mode === 'compare' && urls.length > 1 ? 'compare' : 'each' } };
    }
    if (a.type === 'legal' && specialist === 'construction-lawyer') return { legal: { context: typeof a.context === 'string' ? a.context.slice(0, 12000) : '' } };
    if (a.type === 'counterparty' && specialist === 'security-specialist' && Array.isArray(a.inns)) {
        const inns = [...new Set(a.inns.map(x => String(x).trim()).filter(validInn))].slice(0, 5);
        if (inns.length) return { counterparty: inns };
    }
    if (CONTEXT_LABEL[a.type] && typeof a.context === 'string' && a.context.trim()) return { card: { label: CONTEXT_LABEL[a.type], context: a.context.slice(0, 12000) } };
    return {};
}

function legalInstruction(context) {
    return [
        context ? `Карточка договора из раздела «Договоры» (данные пользователя, не проверенный источник):\n${context}` : '',
        'Каждый вывод подкрепляй правовым основанием: акт, статья, часть, пункт. Перед ссылкой проверь действующую редакцию поиском по официальным источникам и справочно-правовым системам и дай ссылку.',
        'Судебную практику приводи только найденную: суд, номер дела, дата, ссылка. Если практика или норма не найдена или редакцию проверить не удалось — прямо скажи об этом.',
        'Разделяй условия договора, нормы закона и свою оценку.'
    ].filter(Boolean).join('\n\n');
}

function tenderInstruction({ urls, mode }) {
    return `Задача: аналитическая справка по закупкам${mode === 'compare' ? ' со сводным сравнением' : ' — отдельно по каждой'}.

Ссылки:
${urls.map((u, i) => `${i + 1}. ${u}`).join('\n')}

Открой каждую ссылку инструментом web_fetch. Используй только то, что действительно получено со страницы или из приложенных документов; если страница не открылась или документация недоступна — прямо напиши это и попроси загрузить документы. Недоступные сведения помечай «нет данных». Укажи источники по каждой закупке.

Структура: сведения о закупке; требования к участникам; обеспечения и расходы (раздельно: суммы обеспечения, фактические расходы, прогнозы — с формулами); условия оплаты; договорные и финансовые риски со ссылками на пункты; прогноз рентабельности с допущениями; заключение и план действий${mode === 'compare' ? '; сравнительная таблица' : ''}.

В конце ответа добавь блок для реестра (null для неизвестных значений):
\`\`\`airchitect-data
{"tenders":[{"url":"","number":null,"law":null,"title":null,"customer":null,"nmck":null,"submission_deadline":"ГГГГ-ММ-ДД или null","results_date":null,"bid_security":null,"contract_security":null,"warranty_security":null,"advance":null,"payment_terms":null,"requirements":null,"contract_terms":null,"recommendation":null}]}
\`\`\``;
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
        'Сведения открытых реестров (ФНС: ЕГРЮЛ, «Прозрачный бизнес», ГИР БО; НОСТРОЙ), полученные сервером AIRCHITECT. Используй только их и сведения пользователя.',
        'Судебные дела, исполнительные производства, банкротство и реестры недобросовестных поставщиков в этой проверке не запрашивались — укажи, что их нужно проверить по официальным источникам.',
        'Если сведения источника не получены, это недостаточность данных, а не низкий риск.',
        results.length > 1 ? 'Компаний несколько: добавь сравнительную таблицу.' : '',
        JSON.stringify(compact)
    ].filter(Boolean).join('\n');
}

// ---- Dialog ----------------------------------------------------------------------------------

async function loadDialog(env, user, body, project) {
    if (body.dialog_id) {
        const dialog = await env.DB.prepare('SELECT * FROM dialogs WHERE id = ? AND company_id = ? AND user_id = ?').bind(str(body.dialog_id, 64), user.company_id, user.id).first();
        if (!dialog) throw notFound('Диалог не найден.');
        if (dialog.project_id !== project.id || dialog.specialist !== body.specialist) throw badRequest('Диалог относится к другому проекту или специалисту.');
        return { dialog, isNew: false };
    }
    const title = (str(body.text, 90) || 'Диалог').replace(/\s+/g, ' ');
    return { dialog: { id: uid(), company_id: user.company_id, project_id: project.id, user_id: user.id, specialist: body.specialist, title, created_at: now(), updated_at: now() }, isNew: true };
}

export async function chat(env, user, body, cors) {
    if (!body || !SPECIALISTS[body.specialist]) throw badRequest('Неизвестный специалист.');
    const project = await projectAccess(env, user, str(body.project_id, 64));
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
    const newDocIds = [...new Set((Array.isArray(body.document_ids) ? body.document_ids : []).map(x => str(x, 64)).filter(Boolean))];
    if (!text && !newDocIds.length) throw badRequest('Напишите вопрос или выберите документы.');
    if (newDocIds.length > MAX_DOCS_PER_MESSAGE) throw badRequest(`Можно приложить не больше ${MAX_DOCS_PER_MESSAGE} документов к сообщению.`);
    for (const id of newDocIds) {
        const doc = await documentAccess(env, user, id);
        if (doc.project_id !== project.id) throw badRequest('Документ относится к другому проекту.');
    }
    await checkLimits(env, user);

    const { dialog, isNew } = await loadDialog(env, user, body, project);
    const { results: history } = isNew ? { results: [] } : await env.DB.prepare('SELECT * FROM messages WHERE dialog_id = ? ORDER BY created_at').bind(dialog.id).all();
    if (history.length >= MAX_HISTORY) throw badRequest('Диалог слишком длинный. Начните новый — документы проекта останутся доступны.');

    // Documents are replayed in the messages where they were attached, so the prefix stays the same between turns
    const docIds = [];
    const docLimits = { bytes: Number(env.MAX_REQUEST_PDF_MB || 28) * 1048576, chars: Number(env.MAX_CONTEXT_CHARS || 1500000) };
    let pdfBytes = 0;
    let chars = 0;
    const blocksOf = async ids => {
        const blocks = [];
        for (const id of ids) {
            const doc = await env.DB.prepare('SELECT * FROM documents WHERE id = ? AND company_id = ? AND project_id = ?').bind(id, user.company_id, project.id).first();
            if (!doc) continue; // deleted since: the dialog continues without it
            const { block, size, chars: c } = await documentBlock(env, doc);
            if (doc.kind === 'pdf') pdfBytes += size;
            chars += c || 0;
            docIds.push(doc.id);
            blocks.push(block);
        }
        return blocks;
    };
    const messages = [];
    for (const m of history) {
        if (m.role === 'assistant') { messages.push({ role: 'assistant', content: m.text || '…' }); continue; }
        messages.push({ role: 'user', content: [...await blocksOf(JSON.parse(m.documents || '[]')), { type: 'text', text: m.text || 'Посмотри приложенные документы.' }] });
    }
    const lastContent = [...await blocksOf(newDocIds), { type: 'text', text: text || 'Посмотри приложенные документы.' }];
    if (pdfBytes > docLimits.bytes || chars > docLimits.chars) throw badRequest('Документов в диалоге слишком много для одного запроса. Начните новый диалог и выберите только нужные документы.');

    const mode = analysisOf(body.specialist, body.analysis);
    if (mode.legal) lastContent.push({ type: 'text', text: legalInstruction(mode.legal.context) });
    if (mode.tender) lastContent.push({ type: 'text', text: tenderInstruction(mode.tender) });
    if (mode.card) lastContent.push({ type: 'text', text: `${mode.card.label} (данные пользователя, не проверенный источник):\n${mode.card.context}\n\nОпирайся на них и на документы; если сведений нет — так и скажи.` });
    messages.push({ role: 'user', content: lastContent });

    // The user message is saved before the answer; on failure it is removed so the history stays consistent
    const userMessageId = uid();
    const statements = [];
    if (isNew) statements.push(env.DB.prepare('INSERT INTO dialogs (id, company_id, project_id, user_id, specialist, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(dialog.id, user.company_id, project.id, user.id, dialog.specialist, dialog.title, dialog.created_at, dialog.updated_at));
    statements.push(env.DB.prepare('INSERT INTO messages (id, dialog_id, company_id, role, text, documents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(userMessageId, dialog.id, user.company_id, 'user', text, JSON.stringify(newDocIds), now()));
    await env.DB.batch(statements);

    const api = client(env);
    const encoder = new TextEncoder();
    const started = now();
    const stream = new ReadableStream({
        async start(controller) {
            const send = event => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
            let answer = '';
            const sources = [];
            const sourceKeys = new Map();
            try {
                send({ type: 'dialog', id: dialog.id, title: dialog.title });
                if (mode.counterparty) {
                    send({ type: 'status', text: 'Запрашиваю сведения ФНС и НОСТРОЙ…' });
                    const results = [];
                    for (const inn of mode.counterparty) results.push(await checkCounterparty(inn));
                    send({ type: 'data', data: { counterparties: results } });
                    lastContent.push({ type: 'text', text: counterpartyInstruction(results) });
                }
                const tools = mode.tender ? [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: mode.tender.urls.length * 3 + 2 }]
                    : mode.legal ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6, allowed_domains: LEGAL_DOMAINS }, { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 6, allowed_domains: LEGAL_DOMAINS }] : null;
                let conversation = messages;
                let final;
                // A long server-tool turn can pause: resend the paused turn to continue (bounded)
                for (let round = 0; round < 4; round++) {
                    const response = api.beta.messages.stream({
                        model: modelOf(env),
                        max_tokens: mode.tender ? TENDER_MAX_TOKENS : Number(env.MAX_TOKENS || 16000),
                        output_config: { effort: mode.tender || mode.legal ? 'high' : (env.EFFORT || 'medium') },
                        // On a safety decline the API continues on Anthropic's recommended fallback model
                        betas: ['server-side-fallback-2026-07-01'],
                        fallbacks: 'default',
                        // The role, documents and earlier turns are reused from the prompt cache
                        cache_control: { type: 'ephemeral' },
                        system: buildSystemPrompt(body.specialist),
                        ...(tools ? { tools } : {}),
                        messages: conversation
                    });
                    let blockCitations = [];
                    for await (const event of response) {
                        if (event.type === 'content_block_start') {
                            blockCitations = [];
                            if (event.content_block.type === 'server_tool_use') send({ type: 'status', text: mode.legal ? 'Проверяю нормы и практику по официальным источникам…' : 'Открываю страницу закупки…' });
                        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                            answer += event.delta.text;
                            send({ type: 'text', text: event.delta.text });
                        } else if (event.type === 'content_block_delta' && event.delta.type === 'citations_delta') {
                            const source = sourceOf(event.delta.citation, docIds);
                            const key = `${source.document_id || source.url}|${source.pages || ''}|${source.quote.slice(0, 80)}`;
                            if (!sourceKeys.has(key)) {
                                sources.push(source);
                                sourceKeys.set(key, sources.length);
                                send({ type: 'citation', n: sources.length, source });
                            }
                            const n = sourceKeys.get(key);
                            if (!blockCitations.includes(n)) blockCitations.push(n);
                        } else if (event.type === 'content_block_stop' && blockCitations.length) {
                            // The numbers of the sources follow the cited fragment
                            const marker = ` ${blockCitations.map(n => `[${n}]`).join('')}`;
                            answer += marker;
                            send({ type: 'text', text: marker });
                            blockCitations = [];
                        }
                    }
                    final = await response.finalMessage();
                    for (const k of Object.keys(usage)) usage[k] += final.usage[k] || 0;
                    if (final.stop_reason !== 'pause_turn') break;
                    conversation = [...conversation, { role: 'assistant', content: final.content }];
                }
                const reviewRequired = /^\s*\**Требует проверки/m.test(answer) || final.stop_reason === 'refusal';
                const assistantId = uid();
                await env.DB.batch([
                    env.DB.prepare('INSERT INTO messages (id, dialog_id, company_id, role, text, sources, stop_reason, review_required, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
                        .bind(assistantId, dialog.id, user.company_id, 'assistant', answer || (final.stop_reason === 'refusal' ? 'Специалист не может ответить на этот запрос.' : '…'), JSON.stringify(sources), final.stop_reason, reviewRequired ? 1 : 0, now()),
                    env.DB.prepare('UPDATE dialogs SET updated_at = ? WHERE id = ?').bind(now(), dialog.id)
                ]);
                await recordUsage(env, user, usage);
                send({ type: 'done', message_id: assistantId, stop_reason: final.stop_reason, review_required: reviewRequired });
                log('chat', { company: user.company_id, user: user.id, specialist: body.specialist, ms: now() - started, stop: final.stop_reason, input: usage.input_tokens, output: usage.output_tokens, cache_read: usage.cache_read_input_tokens, docs: docIds.length });
            } catch (err) {
                log('chat_failed', { company: user.company_id, user: user.id, specialist: body.specialist, error: err && err.constructor ? err.constructor.name : 'Error', status: err && err.status });
                // Remove the unanswered user message (and the empty new dialog) so the next try starts clean
                const cleanup = [env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(userMessageId)];
                if (isNew) cleanup.push(env.DB.prepare('DELETE FROM dialogs WHERE id = ?').bind(dialog.id));
                await env.DB.batch(cleanup).catch(() => {});
                if (usage.input_tokens || usage.output_tokens) await recordUsage(env, user, usage).catch(() => {});
                send({ type: 'error', message: describeError(err) });
            }
            controller.close();
        }
    });
    return new Response(stream, { headers: { ...cors, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' } });
}

export async function listDialogs(env, user, projectId, specialist) {
    await projectAccess(env, user, projectId);
    if (!SPECIALISTS[specialist]) throw badRequest('Неизвестный специалист.');
    const { results } = await env.DB.prepare(
        `SELECT d.id, d.title, d.created_at, d.updated_at, (SELECT COUNT(*) FROM messages m WHERE m.dialog_id = d.id) AS messages
         FROM dialogs d WHERE d.company_id = ? AND d.user_id = ? AND d.project_id = ? AND d.specialist = ? ORDER BY d.updated_at DESC LIMIT 100`
    ).bind(user.company_id, user.id, projectId, specialist).all();
    return results;
}

export async function getDialog(env, user, id) {
    const dialog = await env.DB.prepare('SELECT * FROM dialogs WHERE id = ? AND company_id = ? AND user_id = ?').bind(id, user.company_id, user.id).first();
    if (!dialog) throw notFound('Диалог не найден.');
    const { results } = await env.DB.prepare('SELECT id, role, text, documents, sources, stop_reason, review_required, created_at FROM messages WHERE dialog_id = ? ORDER BY created_at').bind(id).all();
    const docIds = [...new Set(results.flatMap(m => JSON.parse(m.documents || '[]')))];
    const names = {};
    for (const docId of docIds) {
        const doc = await env.DB.prepare('SELECT id, name FROM documents WHERE id = ? AND company_id = ?').bind(docId, user.company_id).first();
        if (doc) names[doc.id] = doc.name;
    }
    return {
        ...dialog,
        messages: results.map(m => ({ ...m, documents: JSON.parse(m.documents || '[]').map(d => ({ id: d, name: names[d] || 'документ удалён' })), sources: JSON.parse(m.sources || '[]'), review_required: !!m.review_required }))
    };
}

export async function deleteDialog(env, user, id) {
    const dialog = await env.DB.prepare('SELECT id FROM dialogs WHERE id = ? AND company_id = ? AND user_id = ?').bind(id, user.company_id, user.id).first();
    if (!dialog) throw notFound('Диалог не найден.');
    await env.DB.batch([
        env.DB.prepare('UPDATE results SET dialog_id = NULL, message_id = NULL WHERE dialog_id = ?').bind(id),
        env.DB.prepare('DELETE FROM messages WHERE dialog_id = ?').bind(id),
        env.DB.prepare('DELETE FROM dialogs WHERE id = ?').bind(id)
    ]);
    return { ok: true };
}
