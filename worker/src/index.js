// AIRCHITECT API (Cloudflare Worker): accounts, projects, documents, dialogs with the specialists and their results.
// The Claude API key, the database (D1) and the files (R2) are reachable only here; the site sends a bearer token.
//
// Without a session:  POST /api/setup (first company, once, SETUP_TOKEN)   POST /api/auth/login
// With a session:     everything else — see the table of routes below; details in README.md.
// Paths of the first version stay: /chat, /extract, /registry, /egrul-pdf (now behind the session as well).

import { HttpError, corsHeaders, json, readJson, log, str, notFound } from './http.js';
import { setup, login, authenticate, logout, changePassword, requireAdmin } from './auth.js';
import * as store from './store.js';
import { uploadDocument, listDocuments, documentAccess, downloadDocument, deleteDocument } from './documents.js';
import { chat, listDialogs, getDialog, deleteDialog } from './chat.js';
import { extractObligations } from './extract.js';
import { usageSummary } from './limits.js';
import { validInn, checkCounterparty, egrulPdf } from './registries.js';
import { SPECIALISTS } from './specialists.js';

const me = user => ({ id: user.id, email: user.email, name: user.name, role: user.role, must_change_password: !!user.must_change_password, company: { id: user.company_id, name: user.company_name } });

// [method, pattern, handler(ctx)]; :id parts become ctx.params
const ROUTES = [
    ['GET', '/api/me', async ({ user, env }) => ({ ...me(user), projects: await store.listProjects(env, user), specialists: Object.entries(SPECIALISTS).map(([slug, s]) => ({ slug, title: s.title })) })],
    ['POST', '/api/auth/logout', async ({ user, env }) => { await logout(env, user); return { ok: true }; }],
    ['POST', '/api/auth/password', async ({ user, env, body }) => { await changePassword(env, user, body.current, body.next); return { ok: true }; }],

    ['GET', '/api/users', async ({ user, env }) => { requireAdmin(user); return store.listUsers(env, user); }],
    ['POST', '/api/users', async ({ user, env, body }) => { requireAdmin(user); return store.createUser(env, user, body); }],
    ['PATCH', '/api/users/:id', async ({ user, env, body, params }) => { requireAdmin(user); return store.updateUser(env, user, params.id, body); }],
    ['GET', '/api/usage', async ({ user, env }) => { requireAdmin(user); return usageSummary(env, user); }],

    ['GET', '/api/projects', ({ user, env }) => store.listProjects(env, user)],
    ['POST', '/api/projects', async ({ user, env, body }) => { requireAdmin(user); return store.createProject(env, user, body); }],
    ['GET', '/api/projects/:id/members', ({ user, env, params }) => store.listMembers(env, user, params.id)],
    ['POST', '/api/projects/:id/members', async ({ user, env, body, params }) => { requireAdmin(user); return store.setMember(env, user, params.id, body); }],

    ['GET', '/api/documents', ({ user, env, query }) => listDocuments(env, user, query.get('project_id'))],
    ['POST', '/api/documents', ({ user, env, request }) => uploadDocument(env, user, request)],
    ['GET', '/api/documents/:id', ({ user, env, params }) => documentAccess(env, user, params.id).then(({ id, name, kind, size, status, status_note, pages, text_chars, project_id, contract_id, created_at }) => ({ id, name, kind, size, status, status_note, pages, text_chars, project_id, contract_id, created_at }))],
    ['GET', '/api/documents/:id/file', ({ user, env, params, cors }) => downloadDocument(env, user, params.id, cors)],
    ['DELETE', '/api/documents/:id', ({ user, env, params }) => deleteDocument(env, user, params.id)],

    ['POST', '/api/chat', ({ user, env, body, cors }) => chat(env, user, body, cors)],
    ['POST', '/chat', ({ user, env, body, cors }) => chat(env, user, body, cors)],
    ['GET', '/api/dialogs', ({ user, env, query }) => listDialogs(env, user, query.get('project_id'), query.get('specialist'))],
    ['GET', '/api/dialogs/:id', ({ user, env, params }) => getDialog(env, user, params.id)],
    ['DELETE', '/api/dialogs/:id', ({ user, env, params }) => deleteDialog(env, user, params.id)],

    ['GET', '/api/results', ({ user, env, query }) => store.listResults(env, user, query.get('project_id'), query.get('specialist'))],
    ['POST', '/api/results', ({ user, env, body }) => store.createResult(env, user, body)],
    ['DELETE', '/api/results/:id', ({ user, env, params }) => store.deleteResult(env, user, params.id)],

    ['GET', '/api/contracts', ({ user, env, query }) => store.listContracts(env, user, query.get('project_id'))],
    ['POST', '/api/contracts', ({ user, env, body }) => store.createContract(env, user, body)],
    ['GET', '/api/obligations', ({ user, env, query }) => store.listObligations(env, user, query.get('contract_id'))],
    ['POST', '/api/obligations', ({ user, env, body }) => store.createObligation(env, user, body)],
    ['GET', '/api/tasks', ({ user, env, query }) => store.listTasks(env, user, query.get('project_id'))],
    ['POST', '/api/tasks', ({ user, env, body }) => store.createTask(env, user, body)],
    ['GET', '/api/notifications', ({ user, env }) => store.listNotifications(env, user)],

    ['POST', '/extract', ({ user, env, body }) => extractObligations(env, user, body)],
    ['POST', '/api/extract', ({ user, env, body }) => extractObligations(env, user, body)],
    ['POST', '/registry', async ({ body }) => {
        const inn = str(body && body.inn, 12);
        if (!validInn(inn)) throw new HttpError(400, 'Некорректный ИНН: проверьте количество цифр и контрольное число.');
        return checkCounterparty(inn);
    }],
    ['POST', '/egrul-pdf', async ({ body, cors }) => {
        try {
            const pdf = await egrulPdf(body && body.token);
            return new Response(pdf.body, { headers: { ...cors, 'Content-Type': 'application/pdf' } });
        } catch (err) {
            throw new HttpError(502, err.message || 'Не удалось получить выписку');
        }
    }]
];

function match(method, path) {
    for (const [m, pattern, handler] of ROUTES) {
        if (m !== method) continue;
        const a = pattern.split('/');
        const b = path.split('/');
        if (a.length !== b.length) continue;
        const params = {};
        if (a.every((part, i) => (part.startsWith(':') ? (params[part.slice(1)] = decodeURIComponent(b[i])) : part === b[i]))) return { handler, params };
    }
    return null;
}

export default {
    async fetch(request, env) {
        const cors = corsHeaders(request, env);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        const url = new URL(request.url);
        const started = Date.now();
        let user = null;
        try {
            // Only the allowed sites may call the API from a browser
            if (request.headers.get('Origin') && !cors['Access-Control-Allow-Origin']) throw new HttpError(403, 'Источник запроса не разрешён.', 'origin_not_allowed');
            if (request.method === 'POST' && url.pathname === '/api/setup') return json(await setup(env, await readJson(request)), 200, cors);
            if (request.method === 'POST' && url.pathname === '/api/auth/login') {
                if (env.LOGIN_LIMITER) {
                    const { success } = await env.LOGIN_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
                    if (!success) throw new HttpError(429, 'Слишком много попыток входа. Попробуйте через минуту.', 'rate_limited');
                }
                const body = await readJson(request);
                const { user: u, session } = await login(env, body.email, body.password);
                const full = await authenticate(new Request(request.url, { headers: { Authorization: `Bearer ${session.token}` } }), env);
                return json({ token: session.token, expires_at: session.expires_at, user: me(full) }, 200, cors);
            }
            const route = match(request.method, url.pathname);
            if (!route) throw notFound();
            user = await authenticate(request, env);
            // Until the temporary password is changed, only the change itself and sign-out are available
            if (user.must_change_password && !['/api/auth/password', '/api/auth/logout', '/api/me'].includes(url.pathname)) throw new HttpError(403, 'Смените временный пароль.', 'password_change_required');
            const isJson = (request.headers.get('Content-Type') || '').includes('application/json');
            const body = ['POST', 'PATCH'].includes(request.method) && isJson ? await readJson(request) : {};
            const result = await route.handler({ request, env, user, body, params: route.params, query: url.searchParams, cors });
            if (result instanceof Response) return result;
            return json(result, 200, cors);
        } catch (err) {
            const status = err instanceof HttpError ? err.status : 500;
            if (status >= 500) log('request_failed', { route: url.pathname, method: request.method, status, company: user && user.company_id, error: err && err.constructor ? err.constructor.name : 'Error', ms: Date.now() - started });
            return json({ error: err instanceof HttpError ? err.message : 'Внутренняя ошибка сервера. Попробуйте позже.', code: err.code || 'internal' }, status, cors);
        }
    }
};
