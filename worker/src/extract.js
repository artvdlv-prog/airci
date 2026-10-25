// Obligations of a construction contract for Договоры (contracts.html): POST /extract { file: { name, type, data } }
// → { contract: {...}, obligations: [{ party, text, clause, due, condition }] }. Structured output by JSON schema.

import { badRequest, HttpError } from './http.js';
import { client, modelOf, describeError } from './chat.js';
import { checkLimits, recordUsage } from './limits.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const CONTRACT_FIELDS = ['number', 'date', 'subject', 'customer', 'contractor', 'price', 'start', 'end'];
const SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['contract', 'obligations'],
    properties: {
        contract: { type: 'object', additionalProperties: false, required: CONTRACT_FIELDS, properties: Object.fromEntries(CONTRACT_FIELDS.map(f => [f, { type: 'string' }])) },
        obligations: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['party', 'text', 'clause', 'due', 'condition'],
                properties: {
                    party: { type: 'string', enum: ['customer', 'contractor', 'both'] },
                    text: { type: 'string' }, clause: { type: 'string' }, due: { type: 'string' }, condition: { type: 'string' }
                }
            }
        }
    }
};

const PROMPT = `Ты — договорной специалист AIRCHITECT. Перед тобой строительный договор (как правило, договор подряда).

Извлеки:
1. Реквизиты: number (номер), date (дата в формате ГГГГ-ММ-ДД), subject (предмет кратко), customer (заказчик), contractor (подрядчик), price (цена с валютой), start и end (сроки работ в формате ГГГГ-ММ-ДД).
2. Все обязательства сторон, которые нужно исполнить и проконтролировать: выполнение работ и этапов, оплата и авансы, передача документации и площадки, приёмка, уведомления и сроки их направления, гарантийные обязательства, предоставление обеспечения, страхование и другие.

Для каждого обязательства: party (customer, contractor или both), text (что нужно сделать, кратко и точно), clause (номер пункта договора, например «4.2.1»), due (контрольная дата ГГГГ-ММ-ДД, только если она прямо указана в договоре), condition (условие или порядок исполнения).

Правила: ничего не придумывай. Если срок задан относительно события, оставь due пустым и опиши срок в condition. Если сведения нет в договоре, оставь поле пустой строкой. Указывай пункт договора для каждого обязательства.`;

function decodeBase64Text(data) {
    return new TextDecoder().decode(Uint8Array.from(atob(data), c => c.charCodeAt(0)));
}

export async function extractObligations(env, user, body) {
    const file = body && body.file;
    const kind = file && ({ 'application/pdf': 'pdf', 'text/plain': 'text' })[file.type];
    if (!file || typeof file.data !== 'string' || !kind) throw badRequest('Приложите договор в формате PDF или текстовым файлом.');
    if (Math.floor(file.data.length * 3 / 4) > MAX_FILE_BYTES) throw badRequest('Файл договора больше 10 МБ.');
    await checkLimits(env, user);
    const title = String(file.name || 'Договор').slice(0, 200);
    const docBlock = kind === 'pdf'
        ? { type: 'document', title, source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
        : { type: 'document', title, source: { type: 'text', media_type: 'text/plain', data: decodeBase64Text(file.data) } };
    try {
        // Streaming keeps a long contract from hitting request timeouts; the result is read at the end
        const stream = client(env).beta.messages.stream({
            model: modelOf(env),
            max_tokens: 16000,
            output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            messages: [{ role: 'user', content: [docBlock, { type: 'text', text: PROMPT }] }]
        });
        const message = await stream.finalMessage();
        await recordUsage(env, user, message.usage);
        if (message.stop_reason === 'refusal') throw new HttpError(422, 'Договор не удалось обработать. Добавьте обязательства вручную.');
        if (message.stop_reason === 'max_tokens') throw new HttpError(422, 'Договор слишком большой для автоматического разбора. Разделите его на части.');
        return JSON.parse(message.content.filter(b => b.type === 'text').map(b => b.text).join(''));
    } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(502, describeError(err));
    }
}
