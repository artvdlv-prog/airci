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

import Anthropic from '@anthropic-ai/sdk';
import { SPECIALISTS, buildSystemPrompt } from './specialists.js';

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
        if (request.method !== 'POST' || url.pathname !== '/chat') {
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
                    const answer = client.beta.messages.stream({
                        model: MODEL,
                        max_tokens: MAX_TOKENS,
                        // Chat answers: medium effort keeps latency and cost reasonable
                        output_config: { effort: 'medium' },
                        // On a safety decline the API continues on Anthropic's recommended fallback model
                        betas: ['server-side-fallback-2026-07-01'],
                        fallbacks: 'default',
                        // The role and earlier turns (including uploaded documents) are reused from cache
                        cache_control: { type: 'ephemeral' },
                        system: buildSystemPrompt(body.specialist),
                        messages
                    });

                    for await (const event of answer) {
                        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                            send({ type: 'text', text: event.delta.text });
                        }
                    }

                    const final = await answer.finalMessage();
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
