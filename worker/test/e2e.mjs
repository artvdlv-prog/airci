// End-to-end test of the API on `wrangler dev` with the local mock of the Claude API (test/mock-anthropic.mjs).
// Run: npm test (both servers must be running — see README.md). Uses the local D1 database of wrangler.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { zipSync, strToU8 } from 'fflate';

const API = process.env.API || 'http://127.0.0.1:8787';
const ORIGIN = 'http://127.0.0.1:8766';
const REQUESTS = new URL('./.requests.jsonl', import.meta.url);
let failures = 0;
const ok = (cond, name, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) failures++; };

async function call(method, path, { token, body, form, origin = ORIGIN } = {}) {
    const headers = { Origin: origin };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(API + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
    const type = res.headers.get('Content-Type') || '';
    return { status: res.status, cors: res.headers.get('Access-Control-Allow-Origin'), data: type.includes('json') ? await res.json() : type.includes('event-stream') ? parseSse(await res.text()) : await res.arrayBuffer() };
}
const parseSse = text => text.split('\n\n').filter(Boolean).map(chunk => JSON.parse(chunk.replace(/^data: /, '')));
const sql = command => execFileSync('npx', ['wrangler', 'd1', 'execute', 'airchitect', '--local', '--command', command], { cwd: new URL('..', import.meta.url).pathname, stdio: 'pipe' }).toString();
const lastRequest = () => { const lines = fs.readFileSync(REQUESTS, 'utf8').trim().split('\n'); return JSON.parse(lines[lines.length - 1]); };

// ---- Fixtures: real files of the four supported formats -------------------------------------------

const docx = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    'word/document.xml': strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Договор подряда № 12/26</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">4.2. Оплата в течение </w:t></w:r><w:r><w:t>10 дней &amp; без аванса.</w:t></w:r></w:p><w:tbl><w:tblPr/><w:tr><w:tc><w:p><w:r><w:t>Этап</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Срок</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Фундаменты</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>01.03.2027</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>')
});
const xlsx = zipSync({
    'xl/workbook.xml': strToU8('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Смета" sheetId="1" r:id="rId1"/><sheet name="КП" sheetId="2" r:id="rId2"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="worksheet" Target="/xl/worksheets/sheet2.xml"/></Relationships>'),
    'xl/sharedStrings.xml': strToU8('<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Позиция</t></si><si><t>Бетон В25</t></si><si><r><t>Арматура </t></r><r><t>А500С</t></r></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8('<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Объём</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>120</v></c></row><row r="5"><c r="A5" t="s"><v>2</v></c><c r="C5"><v>18.5</v></c></row></sheetData></worksheet>'),
    'xl/worksheets/sheet2.xml': strToU8('<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="str"><v>Поставщик А</v></c><c r="B1"><v>2950000</v></c></row></sheetData></worksheet>')
});
function pdf(lines) {
    const content = `BT /F1 12 Tf 72 720 Td ${lines.map(l => `(${l}) Tj 0 -16 Td`).join(' ')} ET`;
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    let out = '%PDF-1.4\n';
    const offsets = [];
    objects.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(out, 'latin1');
}
const cp1251 = Buffer.from([0xc4, 0xee, 0xe3, 0xee, 0xe2, 0xee, 0xf0, 0x20, 0xef, 0xee, 0xf1, 0xf2, 0xe0, 0xe2, 0xea, 0xe8]); // «Договор поставки»

async function upload(token, projectId, name, bytes, type) {
    const form = new FormData();
    form.append('project_id', projectId);
    form.append('file', new Blob([bytes], { type }), name);
    return call('POST', '/api/documents', { token, form });
}

async function pbkdf2(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
    const b64 = b => Buffer.from(b).toString('base64');
    return `pbkdf2$100000$${b64(salt)}$${b64(bits)}`;
}

// ---- Scenario --------------------------------------------------------------------------------------

const ADMIN = { email: 'admin@a.test', password: 'AdminPass2026' };
let r = await call('POST', '/api/setup', { body: { setup_token: 'wrong', company: 'ООО «Альфа»', name: 'Админ', ...ADMIN } });
ok(r.status === 403, 'setup with a wrong code is refused');
r = await call('POST', '/api/setup', { body: { setup_token: 'local-setup-token-123', company: 'ООО «Альфа»', name: 'Админ', ...ADMIN } });
ok(r.status === 200, 'first company and administrator are created');
r = await call('POST', '/api/setup', { body: { setup_token: 'local-setup-token-123', company: 'ООО «Бета»', name: 'X', email: 'x@b.test', password: 'Password2026' } });
ok(r.status === 403, 'setup works only once');

r = await call('POST', '/api/auth/login', { body: ADMIN });
ok(r.status === 200 && r.data.token && r.data.user.role === 'admin', 'administrator signs in');
const admin = r.data.token;
ok(r.cors === ORIGIN, 'CORS answers the allowed site');
r = await call('GET', '/api/me', { token: admin, origin: 'https://evil.example' });
ok(r.status === 403 && !r.cors, 'a foreign site is refused');

r = await call('POST', '/api/projects', { token: admin, body: { name: 'ЖК «Северный»', code: 'SEV' } });
const p1 = r.data.id;
r = await call('POST', '/api/projects', { token: admin, body: { name: 'Склад «Восток»' } });
const p2 = r.data.id;
ok(p1 && p2, 'projects are created');

r = await call('POST', '/api/users', { token: admin, body: { email: 'pto@a.test', name: 'Иванов И.И.', role: 'member', project_ids: [p1] } });
ok(r.status === 200 && r.data.temporary_password, 'employee is created with a temporary password');
const temp = r.data.temporary_password;
r = await call('POST', '/api/auth/login', { body: { email: 'pto@a.test', password: temp } });
let member = r.data.token;
ok(r.data.user.must_change_password, 'temporary password must be changed');
r = await call('GET', `/api/documents?project_id=${p1}`, { token: member });
ok(r.status === 403 && r.data.code === 'password_change_required', 'nothing works before the change');
r = await call('POST', '/api/auth/password', { token: member, body: { current: temp, next: 'short' } });
ok(r.status === 400, 'weak password is refused');
r = await call('POST', '/api/auth/password', { token: member, body: { current: temp, next: 'PtoEngineer2026' } });
ok(r.status === 200, 'password is changed');

r = await call('GET', '/api/me', { token: member });
ok(r.data.projects.length === 1 && r.data.projects[0].id === p1, 'employee sees only his project', JSON.stringify(r.data.projects.map(p => p.name)));
r = await call('GET', `/api/documents?project_id=${p2}`, { token: member });
ok(r.status === 403, 'no access to another project of the company');

// Upload and extraction
r = await upload(member, p1, 'Договор.docx', docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
ok(r.status === 200 && r.data.status === 'ok' && r.data.text_chars > 50, 'DOCX: text and table extracted', `${r.data.text_chars} chars`);
const dDocx = r.data.id;
r = await upload(member, p1, 'Смета.xlsx', xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
ok(r.status === 200 && r.data.status === 'ok', 'XLSX: sheets extracted');
const dXlsx = r.data.id;
r = await upload(member, p1, 'Договор.pdf', pdf(['Construction contract 12/26', 'Clause 4.2 payment within 10 days', 'Clause 6.1 as-built documents within 5 working days', 'Penalty 0.1 percent per day', 'Warranty 60 months after acceptance']), 'application/pdf');
ok(r.status === 200 && r.data.pages === 1, 'PDF: pages counted', `${r.data.status}, ${r.data.text_chars} chars`);
const dPdf = r.data.id;
r = await upload(member, p1, 'Поставка.txt', cp1251, 'text/plain');
ok(r.status === 200 && r.data.status === 'ok', 'TXT in Windows-1251 accepted');
const dTxt = r.data.id;
r = await upload(member, p1, 'Вирус.exe', Buffer.from('MZ'), 'application/octet-stream');
ok(r.status === 400, 'unsupported format is refused');
r = await upload(member, p1, 'Битый.docx', Buffer.from('not a zip'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
ok(r.status === 200 && r.data.status === 'error', 'broken DOCX is marked as not read', r.data.status_note);
const dBroken = r.data.id;

// Dialog with documents
r = await call('POST', '/api/chat', { token: member, body: { specialist: 'pto-engineer', project_id: p1, text: 'Какие сроки оплаты? ПРОВЕРКА', document_ids: [dPdf, dDocx, dXlsx, dTxt] } });
const events = r.data;
const dialogEvent = events.find(e => e.type === 'dialog');
const done = events.find(e => e.type === 'done');
const answer = events.filter(e => e.type === 'text').map(e => e.text).join('');
ok(r.status === 200 && dialogEvent && done, 'answer is streamed', answer.slice(0, 80));
ok(events.some(e => e.type === 'citation' && e.source.pages === 'с. 1' && e.source.title === 'Договор.pdf'), 'source of the conclusion: document and page');
ok(answer.includes('[1]'), 'source number follows the cited fragment');
ok(done.review_required === true, '«Требует проверки» is detected');
let sent = lastRequest();
const docBlocks = sent.body.messages[0].content.filter(b => b.type === 'document');
ok(docBlocks.length === 4 && docBlocks.every(b => b.citations && b.citations.enabled), 'four documents with citations reached the model');
ok(docBlocks[0].source.media_type === 'application/pdf' && docBlocks[1].source.data.includes('Этап | Срок') && docBlocks[2].source.data.includes('Строка 5: Арматура А500С |  | 18.5') && docBlocks[3].source.data === 'Договор поставки', 'PDF as file; DOCX table, XLSX rows and CP1251 text decoded');
ok(sent.body.system.includes('Ты — Инженер ПТО') && sent.body.system.includes('Требует проверки'), 'instruction of the position is used');
ok(sent.headers.key === 'set' && sent.body.model === 'claude-opus-5-5' && sent.body.fallbacks === 'default', 'key, model and fallback set on the server');

r = await call('POST', '/api/chat', { token: member, body: { specialist: 'pto-engineer', project_id: p1, dialog_id: dialogEvent.id, text: 'А штрафы?' } });
sent = lastRequest();
ok(sent.body.messages.length === 3 && sent.body.messages[0].content.filter(b => b.type === 'document').length === 4 && sent.body.messages[1].role === 'assistant', 'history with documents is replayed in place');
r = await call('POST', '/api/chat', { token: member, body: { specialist: 'pto-engineer', project_id: p1, text: 'x', document_ids: [dBroken] } });
ok(r.status === 400 && /не прочитан/.test(r.data.error), 'a document that was not read is not sent to the model');
r = await call('POST', '/api/chat', { token: member, body: { specialist: 'unknown-role', project_id: p1, text: 'x' } });
ok(r.status === 400, 'unknown specialist is refused');

r = await call('GET', `/api/dialogs?project_id=${p1}&specialist=pto-engineer`, { token: member });
ok(r.data.length === 1 && r.data[0].messages === 4, 'history of dialogs');
r = await call('GET', `/api/dialogs/${dialogEvent.id}`, { token: member });
const assistantMessage = r.data.messages.find(m => m.role === 'assistant');
ok(r.data.messages[0].documents.length === 4 && assistantMessage.sources.length >= 1, 'dialog keeps documents and sources');

r = await call('POST', '/api/results', { token: member, body: { project_id: p1, specialist: 'pto-engineer', title: 'Сроки оплаты по договору', content: answer, message_id: assistantMessage.id } });
ok(r.status === 200, 'result is saved');
const result = r.data.id;
r = await call('GET', `/api/results?project_id=${p1}&specialist=pto-engineer`, { token: admin });
ok(r.data.length === 1 && r.data[0].sources.length >= 1 && r.data[0].author === 'Иванов И.И.', 'result with sources is visible to the project');

r = await call('POST', '/api/contracts', { token: member, body: { project_id: p1, number: '12/26', subject: 'Фундаменты' } });
const contract = r.data.id;
r = await call('POST', '/api/obligations', { token: member, body: { contract_id: contract, party: 'contractor', text: 'Передать ИД', clause: '6.1', specialist: 'pto-engineer' } });
ok(r.status === 200, 'contract and obligation of the stage-B model');
r = await call('POST', '/api/tasks', { token: member, body: { project_id: p1, contract_id: contract, title: 'Подготовить реестр ИД', specialist: 'pto-engineer' } });
ok(r.status === 200, 'task by competence (manual)');
r = await call('POST', '/api/tasks', { token: member, body: { project_id: p1, title: 'x', specialist: 'hacker' } });
ok(r.status === 400, 'task for an unknown specialist is refused');

r = await call('POST', '/extract', { token: member, body: { file: { name: 'Договор.txt', type: 'text/plain', data: Buffer.from('Договор подряда 12/26. 6.1 Передать ИД.').toString('base64') } } });
ok(r.status === 200 && r.data.obligations.length === 1, 'obligations extraction (/extract) works behind the session');

// Isolation between companies: company «Бета» is created directly in the database
const hash = await pbkdf2('BetaUser2026');
sql(`INSERT INTO companies (id, name, created_at) VALUES ('cb', 'ООО «Бета»', 0); INSERT INTO users (id, company_id, email, name, password_hash, role, must_change_password, created_at) VALUES ('ub', 'cb', 'boss@b.test', 'Бета', '${hash}', 'admin', 0, 0);`);
r = await call('POST', '/api/auth/login', { body: { email: 'boss@b.test', password: 'BetaUser2026' } });
const beta = r.data.token;
ok(r.status === 200 && r.data.user.company.name === 'ООО «Бета»', 'administrator of another company signs in');
r = await call('GET', '/api/me', { token: beta });
ok(r.data.projects.length === 0, 'another company sees no projects of «Альфа»');
r = await call('GET', `/api/documents/${dPdf}`, { token: beta });
ok(r.status === 404, 'document of another company: not found');
r = await call('GET', `/api/documents/${dPdf}/file`, { token: beta });
ok(r.status === 404, 'file of another company cannot be downloaded');
r = await call('GET', `/api/documents?project_id=${p1}`, { token: beta });
ok(r.status === 404, 'project of another company: not found');
r = await call('GET', `/api/dialogs/${dialogEvent.id}`, { token: beta });
ok(r.status === 404, 'dialog of another company: not found');
r = await call('POST', '/api/chat', { token: beta, body: { specialist: 'pto-engineer', project_id: p1, text: 'x', document_ids: [dPdf] } });
ok(r.status === 404, 'documents of another company cannot be put into a request');
r = await call('DELETE', `/api/results/${result}`, { token: beta });
ok(r.status === 404, 'result of another company cannot be deleted');
r = await call('GET', '/api/users', { token: admin });
ok(r.data.every(u => u.email.endsWith('@a.test')), 'administrator sees only his employees');
r = await call('GET', '/api/users', { token: member });
ok(r.status === 403, 'employee cannot manage employees');
r = await call('GET', `/api/dialogs/${dialogEvent.id}`, { token: admin });
ok(r.status === 404, 'dialogs are personal even for the administrator');

// API failures and limits
r = await call('POST', '/api/chat', { token: member, body: { specialist: 'financier', project_id: p1, text: 'FAIL_529' } });
const failed = r.data.find(e => e.type === 'error');
ok(failed && /недоступен|перегружен/.test(failed.message), 'unavailable model: clear error', failed && failed.message);
r = await call('GET', `/api/dialogs?project_id=${p1}&specialist=financier`, { token: member });
ok(r.data.length === 0, 'unanswered message does not stay in the history');
sql(`UPDATE usage_daily SET requests = 150 WHERE user_id = (SELECT id FROM users WHERE email = 'pto@a.test')`);
r = await call('POST', '/api/chat', { token: member, body: { specialist: 'pto-engineer', project_id: p1, text: 'x' } });
ok(r.status === 429 && r.data.code === 'daily_limit', 'daily limit of the employee');
sql(`UPDATE usage_daily SET requests = 0, cost_micro_usd = 250000000 WHERE user_id = (SELECT id FROM users WHERE email = 'pto@a.test')`);
r = await call('POST', '/api/chat', { token: member, body: { specialist: 'pto-engineer', project_id: p1, text: 'x' } });
ok(r.status === 402 && r.data.code === 'budget_exhausted', 'monthly budget of the company');
r = await call('GET', '/api/usage', { token: admin });
ok(r.status === 200 && r.data.spent_usd >= 250, 'usage summary for the administrator', `${r.data.spent_usd} $`);

// Sign-in protection and sessions
for (let i = 0; i < 5; i++) await call('POST', '/api/auth/login', { body: { email: 'pto@a.test', password: 'wrong-password-1' } });
r = await call('POST', '/api/auth/login', { body: { email: 'pto@a.test', password: 'PtoEngineer2026' } });
ok(r.status === 429, 'sign-in locked after 5 wrong passwords');
r = await call('PATCH', `/api/users/${(await call('GET', '/api/users', { token: admin })).data.find(u => u.email === 'pto@a.test').id}`, { token: admin, body: { status: 'disabled' } });
r = await call('GET', '/api/me', { token: member });
ok(r.status === 401, 'disabled employee loses the session');
r = await call('POST', '/api/auth/logout', { token: admin });
r = await call('GET', '/api/me', { token: admin });
ok(r.status === 401, 'session ends on sign-out');
r = await call('POST', '/registry', { body: { inn: '7707083893' } });
ok(r.status === 401, 'registry check requires a session');

// Logs contain no texts of messages or documents
const logs = fs.existsSync('/tmp/wdev.log') ? fs.readFileSync('/tmp/wdev.log', 'utf8') : '';
ok(!/Какие сроки оплаты|Договор поставки|Clause 4\.2/.test(logs), 'technical log has no confidential content');

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
