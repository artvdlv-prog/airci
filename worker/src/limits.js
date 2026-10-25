// Limits of model use: requests per minute (rate limiter binding), requests per employee per day and the
// monthly budget of the company in dollars. Cost is estimated from the token usage the API reports.

import { HttpError } from './http.js';

const day = () => new Date().toISOString().slice(0, 10);
const month = () => new Date().toISOString().slice(0, 7);

// Prices per million tokens (Claude Opus 5.5 by default); override with variables when the model changes
const prices = env => ({
    input: Number(env.PRICE_INPUT_PER_MTOK || 4),
    output: Number(env.PRICE_OUTPUT_PER_MTOK || 20),
    cacheWrite: Number(env.PRICE_CACHE_WRITE_PER_MTOK || 5),
    cacheRead: Number(env.PRICE_CACHE_READ_PER_MTOK || 0.2)
});

export async function checkLimits(env, user) {
    if (env.CHAT_LIMITER) {
        const { success } = await env.CHAT_LIMITER.limit({ key: user.id });
        if (!success) throw new HttpError(429, 'Слишком много запросов. Попробуйте через минуту.', 'rate_limited');
    }
    const perDay = Number(env.USER_DAILY_REQUESTS || 150);
    const today = await env.DB.prepare('SELECT requests FROM usage_daily WHERE company_id = ? AND user_id = ? AND day = ?').bind(user.company_id, user.id, day()).first();
    if (today && today.requests >= perDay) throw new HttpError(429, `Дневной лимит обращений исчерпан (${perDay}). Лимит обновится завтра или его может изменить администратор.`, 'daily_limit');
    const budget = Number(env.COMPANY_MONTHLY_BUDGET_USD || 200);
    const spent = await env.DB.prepare('SELECT COALESCE(SUM(cost_micro_usd), 0) AS cost FROM usage_daily WHERE company_id = ? AND day LIKE ?').bind(user.company_id, `${month()}-%`).first();
    if (spent.cost / 1e6 >= budget) throw new HttpError(402, 'Месячный бюджет компании на работу специалистов исчерпан. Обратитесь к администратору.', 'budget_exhausted');
}

export function costOf(env, usage) {
    const p = prices(env);
    return Math.round(
        (usage.input_tokens || 0) * p.input + (usage.output_tokens || 0) * p.output +
        (usage.cache_creation_input_tokens || 0) * p.cacheWrite + (usage.cache_read_input_tokens || 0) * p.cacheRead
    ); // millionths of a dollar: tokens × $/MTok
}

export async function recordUsage(env, user, usage) {
    await env.DB.prepare(
        `INSERT INTO usage_daily (company_id, user_id, day, requests, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_micro_usd)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
         ON CONFLICT(company_id, user_id, day) DO UPDATE SET requests = requests + 1, input_tokens = input_tokens + excluded.input_tokens,
            output_tokens = output_tokens + excluded.output_tokens, cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens,
            cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens, cost_micro_usd = cost_micro_usd + excluded.cost_micro_usd`
    ).bind(user.company_id, user.id, day(), usage.input_tokens || 0, usage.output_tokens || 0, usage.cache_read_input_tokens || 0, usage.cache_creation_input_tokens || 0, costOf(env, usage)).run();
}

// Summary for the administrator: this month by employees
export async function usageSummary(env, admin) {
    const { results } = await env.DB.prepare(
        `SELECT u.name, u.email, SUM(d.requests) AS requests, SUM(d.input_tokens) AS input_tokens, SUM(d.output_tokens) AS output_tokens, SUM(d.cost_micro_usd) AS cost_micro_usd
         FROM usage_daily d JOIN users u ON u.id = d.user_id WHERE d.company_id = ? AND d.day LIKE ? GROUP BY d.user_id ORDER BY cost_micro_usd DESC`
    ).bind(admin.company_id, `${month()}-%`).all();
    const total = results.reduce((s, r) => s + r.cost_micro_usd, 0);
    return { month: month(), budget_usd: Number(env.COMPANY_MONTHLY_BUDGET_USD || 200), spent_usd: total / 1e6, by_user: results.map(r => ({ ...r, cost_usd: r.cost_micro_usd / 1e6 })) };
}
