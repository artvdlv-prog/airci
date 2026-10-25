// Access rules and data of the company: employees, projects, contracts, obligations, tasks, results.
// Every query is filtered by the company of the session; a project is reachable for its members and the
// company administrators. Records of another company answer «not found», so their existence is not revealed.

import { badRequest, forbidden, notFound, uid, now, str } from './http.js';
import { hashPassword, temporaryPassword, normalizeEmail } from './auth.js';
import { SPECIALISTS } from './specialists.js';

export async function projectAccess(env, user, projectId) {
    if (!projectId) throw badRequest('Выберите проект.');
    const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ? AND company_id = ?').bind(projectId, user.company_id).first();
    if (!project) throw notFound('Проект не найден.');
    if (user.role === 'admin') return project;
    const member = await env.DB.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').bind(projectId, user.id).first();
    if (!member) throw forbidden('Нет доступа к проекту.');
    return project;
}

const assertSpecialist = slug => {
    if (!SPECIALISTS[slug]) throw badRequest('Неизвестный специалист.');
    return slug;
};

// ---- Employees (company administrator) ---------------------------------------------------

export async function listUsers(env, user) {
    const { results } = await env.DB.prepare('SELECT id, email, name, role, status, must_change_password, created_at FROM users WHERE company_id = ? ORDER BY name').bind(user.company_id).all();
    return results;
}

export async function createUser(env, admin, body) {
    const email = normalizeEmail(body.email);
    const name = str(body.name, 200);
    const role = body.role === 'admin' ? 'admin' : 'member';
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw badRequest('Укажите имя и корректный e-mail сотрудника.');
    const taken = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (taken) throw badRequest('Сотрудник с таким e-mail уже зарегистрирован.');
    const password = temporaryPassword();
    const id = uid();
    const statements = [env.DB.prepare('INSERT INTO users (id, company_id, email, name, password_hash, role, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
        .bind(id, admin.company_id, email, name, await hashPassword(password), role, now())];
    for (const projectId of Array.isArray(body.project_ids) ? body.project_ids : []) {
        await projectAccess(env, admin, projectId);
        statements.push(env.DB.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, company_id, role) VALUES (?, ?, ?, ?)').bind(projectId, id, admin.company_id, 'member'));
    }
    await env.DB.batch(statements);
    // The temporary password is returned once and never stored in clear text
    return { id, email, name, role, temporary_password: password };
}

export async function updateUser(env, admin, id, body) {
    const target = await env.DB.prepare('SELECT id, role FROM users WHERE id = ? AND company_id = ?').bind(id, admin.company_id).first();
    if (!target) throw notFound('Сотрудник не найден.');
    if (id === admin.id && (body.status === 'disabled' || body.role === 'member')) throw badRequest('Нельзя отключить себя или снять с себя права администратора.');
    const statements = [];
    if (body.status === 'active' || body.status === 'disabled') {
        statements.push(env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind(body.status, id));
        if (body.status === 'disabled') statements.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id));
    }
    if (body.role === 'admin' || body.role === 'member') statements.push(env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(body.role, id));
    let password = null;
    if (body.reset_password) {
        password = temporaryPassword();
        statements.push(env.DB.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').bind(await hashPassword(password), id));
        statements.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id));
    }
    if (statements.length) await env.DB.batch(statements);
    return { id, ...(password ? { temporary_password: password } : {}) };
}

// ---- Projects ---------------------------------------------------------------------------

export async function listProjects(env, user) {
    const sql = user.role === 'admin'
        ? 'SELECT * FROM projects WHERE company_id = ? AND status = \'active\' ORDER BY created_at DESC'
        : 'SELECT p.* FROM projects p JOIN project_members m ON m.project_id = p.id WHERE p.company_id = ? AND m.user_id = ? AND p.status = \'active\' ORDER BY p.created_at DESC';
    const stmt = env.DB.prepare(sql);
    const { results } = await (user.role === 'admin' ? stmt.bind(user.company_id) : stmt.bind(user.company_id, user.id)).all();
    return results;
}

export async function createProject(env, admin, body) {
    const name = str(body.name, 200);
    if (!name) throw badRequest('Укажите название проекта.');
    const id = uid();
    await env.DB.batch([
        env.DB.prepare('INSERT INTO projects (id, company_id, name, code, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, admin.company_id, name, str(body.code, 60) || null, admin.id, now()),
        env.DB.prepare('INSERT INTO project_members (project_id, user_id, company_id, role) VALUES (?, ?, ?, ?)').bind(id, admin.id, admin.company_id, 'manager')
    ]);
    return { id, name };
}

export async function setMember(env, admin, projectId, body) {
    await projectAccess(env, admin, projectId);
    const target = await env.DB.prepare('SELECT id FROM users WHERE id = ? AND company_id = ?').bind(str(body.user_id, 64), admin.company_id).first();
    if (!target) throw notFound('Сотрудник не найден.');
    if (body.remove) {
        await env.DB.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').bind(projectId, target.id).run();
    } else {
        await env.DB.prepare('INSERT INTO project_members (project_id, user_id, company_id, role) VALUES (?, ?, ?, ?) ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role')
            .bind(projectId, target.id, admin.company_id, body.role === 'manager' ? 'manager' : 'member').run();
    }
    return { ok: true };
}

export async function listMembers(env, user, projectId) {
    await projectAccess(env, user, projectId);
    const { results } = await env.DB.prepare('SELECT u.id, u.name, u.email, m.role FROM project_members m JOIN users u ON u.id = m.user_id WHERE m.project_id = ? AND m.company_id = ? ORDER BY u.name').bind(projectId, user.company_id).all();
    return results;
}

// ---- Contracts, obligations, tasks (foundation for stage B) ------------------------------

export async function listContracts(env, user, projectId) {
    await projectAccess(env, user, projectId);
    const { results } = await env.DB.prepare('SELECT * FROM contracts WHERE company_id = ? AND project_id = ? ORDER BY created_at DESC').bind(user.company_id, projectId).all();
    return results;
}

export async function createContract(env, user, body) {
    const project = await projectAccess(env, user, str(body.project_id, 64));
    const id = uid();
    await env.DB.prepare('INSERT INTO contracts (id, company_id, project_id, number, date, subject, customer, contractor, price, start_date, end_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, user.company_id, project.id, str(body.number, 100), str(body.date, 10), str(body.subject, 500), str(body.customer, 300), str(body.contractor, 300), str(body.price, 100), str(body.start_date, 10), str(body.end_date, 10), user.id, now()).run();
    return { id };
}

async function contractAccess(env, user, contractId) {
    const contract = await env.DB.prepare('SELECT * FROM contracts WHERE id = ? AND company_id = ?').bind(contractId, user.company_id).first();
    if (!contract) throw notFound('Договор не найден.');
    await projectAccess(env, user, contract.project_id);
    return contract;
}

export async function listObligations(env, user, contractId) {
    await contractAccess(env, user, contractId);
    const { results } = await env.DB.prepare('SELECT * FROM obligations WHERE company_id = ? AND contract_id = ? ORDER BY due IS NULL, due').bind(user.company_id, contractId).all();
    return results;
}

export async function createObligation(env, user, body) {
    const contract = await contractAccess(env, user, str(body.contract_id, 64));
    const text = str(body.text, 2000);
    if (!text) throw badRequest('Опишите обязательство.');
    const party = ['customer', 'contractor', 'both'].includes(body.party) ? body.party : 'both';
    const id = uid();
    await env.DB.prepare('INSERT INTO obligations (id, company_id, project_id, contract_id, party, text, clause, due, condition, specialist, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, user.company_id, contract.project_id, contract.id, party, text, str(body.clause, 50), str(body.due, 10) || null, str(body.condition, 1000), body.specialist ? assertSpecialist(body.specialist) : null, 'active', now()).run();
    return { id };
}

export async function listTasks(env, user, projectId) {
    await projectAccess(env, user, projectId);
    const { results } = await env.DB.prepare('SELECT * FROM tasks WHERE company_id = ? AND project_id = ? ORDER BY created_at DESC').bind(user.company_id, projectId).all();
    return results;
}

// At stage A tasks are created by a person; automatic distribution by competence comes at stage B
export async function createTask(env, user, body) {
    const project = await projectAccess(env, user, str(body.project_id, 64));
    const title = str(body.title, 500);
    if (!title) throw badRequest('Сформулируйте задачу.');
    const id = uid();
    await env.DB.prepare('INSERT INTO tasks (id, company_id, project_id, contract_id, obligation_id, title, specialist, due, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, user.company_id, project.id, str(body.contract_id, 64) || null, str(body.obligation_id, 64) || null, title, assertSpecialist(body.specialist), str(body.due, 10) || null, user.id, now()).run();
    return { id };
}

// ---- Results of the specialists ----------------------------------------------------------

export async function listResults(env, user, projectId, specialist) {
    await projectAccess(env, user, projectId);
    const sql = `SELECT r.id, r.specialist, r.kind, r.title, r.content, r.sources, r.dialog_id, r.created_at, u.name AS author
                 FROM results r JOIN users u ON u.id = r.created_by WHERE r.company_id = ? AND r.project_id = ?${specialist ? ' AND r.specialist = ?' : ''} ORDER BY r.created_at DESC LIMIT 200`;
    const stmt = env.DB.prepare(sql);
    const { results } = await (specialist ? stmt.bind(user.company_id, projectId, assertSpecialist(specialist)) : stmt.bind(user.company_id, projectId)).all();
    return results.map(r => ({ ...r, sources: JSON.parse(r.sources || '[]') }));
}

export async function createResult(env, user, body) {
    const project = await projectAccess(env, user, str(body.project_id, 64));
    const title = str(body.title, 300);
    const content = typeof body.content === 'string' ? body.content.slice(0, 200000) : '';
    if (!title || !content) throw badRequest('У результата должны быть название и содержание.');
    let sources = '[]';
    let dialogId = null;
    let messageId = null;
    if (body.message_id) {
        // The saved answer must belong to a dialog of this user in this project
        const message = await env.DB.prepare('SELECT m.id, m.sources, d.id AS dialog_id FROM messages m JOIN dialogs d ON d.id = m.dialog_id WHERE m.id = ? AND d.company_id = ? AND d.user_id = ? AND d.project_id = ?')
            .bind(str(body.message_id, 64), user.company_id, user.id, project.id).first();
        if (!message) throw notFound('Ответ не найден.');
        sources = message.sources;
        dialogId = message.dialog_id;
        messageId = message.id;
    }
    const id = uid();
    await env.DB.prepare('INSERT INTO results (id, company_id, project_id, contract_id, specialist, dialog_id, message_id, kind, title, content, sources, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, user.company_id, project.id, str(body.contract_id, 64) || null, assertSpecialist(body.specialist), dialogId, messageId, str(body.kind, 40) || 'answer', title, content, sources, user.id, now()).run();
    return { id };
}

export async function deleteResult(env, user, id) {
    const row = await env.DB.prepare('SELECT id, project_id, created_by FROM results WHERE id = ? AND company_id = ?').bind(id, user.company_id).first();
    if (!row) throw notFound('Результат не найден.');
    await projectAccess(env, user, row.project_id);
    if (row.created_by !== user.id && user.role !== 'admin') throw forbidden('Удалить результат может автор или администратор.');
    await env.DB.prepare('DELETE FROM results WHERE id = ?').bind(id).run();
    return { ok: true };
}

export async function listNotifications(env, user) {
    const { results } = await env.DB.prepare('SELECT id, kind, title, ref, read_at, created_at FROM notifications WHERE company_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 100').bind(user.company_id, user.id).all();
    return results;
}
