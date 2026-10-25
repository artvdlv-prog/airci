// HTTP helpers: JSON responses, CORS for the allowed sites, request errors and technical logging.
// Logs carry the route, status, ids and the error class only — never message texts or document contents.

export class HttpError extends Error {
    constructor(status, message, code) {
        super(message);
        this.status = status;
        this.code = code || 'error';
    }
}

export const badRequest = message => new HttpError(400, message, 'bad_request');
export const unauthorized = (message = 'Войдите в кабинет.') => new HttpError(401, message, 'unauthorized');
export const forbidden = (message = 'Нет доступа.') => new HttpError(403, message, 'forbidden');
export const notFound = (message = 'Не найдено.') => new HttpError(404, message, 'not_found');

export function corsHeaders(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const headers = {
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '600',
        'Vary': 'Origin'
    };
    if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    return headers;
}

export function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
}

export async function readJson(request) {
    try {
        return await request.json();
    } catch {
        throw badRequest('Некорректный запрос.');
    }
}

// One line of JSON per event, for Workers Logs
export function log(event, fields = {}) {
    console.log(JSON.stringify({ event, at: new Date().toISOString(), ...fields }));
}

export const uid = () => crypto.randomUUID();
export const now = () => Date.now();

export const str = (value, max = 500) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
