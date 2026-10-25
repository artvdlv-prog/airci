// Accounts and sessions: e-mail and password, sessions by bearer token.
// Passwords: PBKDF2-SHA-256 with a random salt (100 000 iterations — the Workers maximum).
// Tokens: 32 random bytes; only their SHA-256 is stored, so a database leak does not expose sessions.

import { HttpError, badRequest, unauthorized, forbidden, uid, now, str } from './http.js';

const ITERATIONS = 100000;
const SESSION_DAYS = 14;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const MIN_PASSWORD = 10;

const enc = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');

async function pbkdf2(password, salt, iterations) {
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password, stored) {
    const [scheme, iter, salt, hash] = String(stored).split('$');
    if (scheme !== 'pbkdf2') return false;
    const actual = new Uint8Array(await pbkdf2(password, unb64(salt), Number(iter)));
    const expected = unb64(hash);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
}

export function checkPasswordStrength(password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) throw badRequest(`Пароль — не короче ${MIN_PASSWORD} символов.`);
    if (!/[A-Za-zА-Яа-яЁё]/.test(password) || !/\d/.test(password)) throw badRequest('Пароль должен содержать буквы и цифры.');
}

// Temporary password for a new employee: shown to the administrator once
export function temporaryPassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(14));
    return [...bytes].map(b => alphabet[b % alphabet.length]).join('') + '7';
}

async function sha256(text) {
    return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export const normalizeEmail = email => str(email, 254).toLowerCase();

export async function createSession(env, user) {
    const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const created = now();
    await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, company_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
        .bind(await sha256(token), user.id, user.company_id, created, created + SESSION_DAYS * 86400000).run();
    return { token, expires_at: created + SESSION_DAYS * 86400000 };
}

export async function login(env, email, password) {
    email = normalizeEmail(email);
    if (!email || typeof password !== 'string' || !password) throw badRequest('Укажите e-mail и пароль.');
    const attempt = await env.DB.prepare('SELECT failures, locked_until FROM login_attempts WHERE email = ?').bind(email).first();
    if (attempt && attempt.locked_until > now()) throw new HttpError(429, 'Слишком много попыток входа. Попробуйте через 15 минут.', 'locked');

    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    // The password is checked even for an unknown e-mail, so the answer time does not reveal registered addresses
    const ok = await verifyPassword(password, user ? user.password_hash : 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    if (!user || !ok || user.status !== 'active') {
        const failures = (attempt ? attempt.failures : 0) + 1;
        await env.DB.prepare('INSERT INTO login_attempts (email, failures, locked_until) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until')
            .bind(email, failures >= MAX_FAILURES ? 0 : failures, failures >= MAX_FAILURES ? now() + LOCK_MINUTES * 60000 : 0).run();
        throw new HttpError(401, 'Неверный e-mail или пароль.', 'invalid_credentials');
    }
    await env.DB.prepare('DELETE FROM login_attempts WHERE email = ?').bind(email).run();
    return { user, session: await createSession(env, user) };
}

// Session of the request: Authorization: Bearer <token>
export async function authenticate(request, env) {
    const header = request.headers.get('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw unauthorized();
    const row = await env.DB.prepare(
        `SELECT u.id, u.company_id, u.email, u.name, u.role, u.status, u.must_change_password, c.name AS company_name, s.expires_at, s.token_hash
         FROM sessions s JOIN users u ON u.id = s.user_id JOIN companies c ON c.id = u.company_id WHERE s.token_hash = ?`
    ).bind(await sha256(token)).first();
    if (!row || row.expires_at < now()) throw unauthorized('Сессия истекла. Войдите снова.');
    if (row.status !== 'active') throw forbidden('Учётная запись отключена администратором.');
    return row;
}

export async function logout(env, user) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(user.token_hash).run();
}

export async function changePassword(env, user, current, next) {
    const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first();
    if (!(await verifyPassword(String(current || ''), row.password_hash))) throw badRequest('Текущий пароль указан неверно.');
    checkPasswordStrength(next);
    await env.DB.batch([
        env.DB.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').bind(await hashPassword(next), user.id),
        // Other sessions of the user end: only the current one stays
        env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user.id, user.token_hash)
    ]);
}

export function requireAdmin(user) {
    if (user.role !== 'admin') throw forbidden('Действие доступно администратору компании.');
}

// First company and its administrator; possible only once, with SETUP_TOKEN from the server settings
export async function setup(env, body) {
    if (!env.SETUP_TOKEN || str(body.setup_token, 200) !== env.SETUP_TOKEN) throw forbidden('Неверный код установки.');
    const existing = await env.DB.prepare('SELECT COUNT(*) AS n FROM companies').first();
    if (existing.n > 0) throw forbidden('Сервер уже настроен.');
    const company = str(body.company, 200);
    const name = str(body.name, 200);
    const email = normalizeEmail(body.email);
    if (!company || !name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw badRequest('Укажите компанию, имя и e-mail администратора.');
    checkPasswordStrength(body.password);
    const companyId = uid();
    const userId = uid();
    await env.DB.batch([
        env.DB.prepare('INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)').bind(companyId, company, now()),
        env.DB.prepare('INSERT INTO users (id, company_id, email, name, password_hash, role, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
            .bind(userId, companyId, email, name, await hashPassword(body.password), 'admin', now())
    ]);
    return { company_id: companyId, user_id: userId };
}
