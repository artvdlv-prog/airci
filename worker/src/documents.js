// Documents of a project: upload, text and tables extraction, storage in R2, blocks for the model.
// PDF goes to the model as the file itself (the model reads text and page images and cites pages);
// DOCX, XLSX and TXT go as extracted text (the model cites the quoted fragment).
// When extraction fails the document is marked «error» with the reason — its content is never guessed.

import { unzipSync, strFromU8 } from 'fflate';
import { extractText, getDocumentProxy } from 'unpdf';
import { badRequest, notFound, forbidden, uid, now, str, log } from './http.js';
import { projectAccess } from './store.js';

const KINDS = {
    pdf: { mime: 'application/pdf' },
    docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    txt: { mime: 'text/plain' }
};

const limits = env => ({
    fileBytes: Number(env.MAX_FILE_MB || 15) * 1024 * 1024,
    pdfPages: Number(env.MAX_PDF_PAGES || 300),
    textChars: Number(env.MAX_DOCUMENT_CHARS || 600000)
});

const keyOf = (doc, part) => `${doc.company_id}/${doc.project_id}/${doc.id}/${part}`;

function kindOf(name, mime) {
    const ext = String(name).toLowerCase().split('.').pop();
    if (KINDS[ext]) return ext;
    const byMime = Object.entries(KINDS).find(([, k]) => k.mime === mime);
    return byMime ? byMime[0] : null;
}

// ---- Extraction ---------------------------------------------------------------------------

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = s => s.replace(/&(amp|lt|gt|quot|apos);|&#(\d+);|&#x([0-9a-f]+);/gi, (m, name, dec, hexa) => (name ? XML_ENTITIES[name] : String.fromCodePoint(dec ? Number(dec) : parseInt(hexa, 16))));

// DOCX: paragraphs and tables of word/document.xml in reading order; table cells separated by « | »
function docxText(bytes) {
    const files = unzipSync(bytes, { filter: f => f.name === 'word/document.xml' });
    const xml = files['word/document.xml'];
    if (!xml) throw new Error('В файле нет основного текста документа (word/document.xml).');
    const body = strFromU8(xml);
    // Text runs, tabs and line breaks of a fragment in order
    const textOf = fragment => {
        const parts = [];
        for (const [m, t] of fragment.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>/g)) parts.push(t !== undefined ? unxml(t) : m.startsWith('<w:tab') ? '\t' : '\n');
        return parts.join('');
    };
    const out = [];
    // Split the body into tables and the rest, keeping the order
    const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g;
    let m;
    while ((m = re.exec(body))) {
        const block = m[0];
        if (block.startsWith('<w:tbl>')) {
            const rows = block.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
            out.push('[Таблица]');
            rows.forEach(r => out.push((r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(c => (c.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(textOf).join(' ').trim()).join(' | ')));
            out.push('[Конец таблицы]');
        } else {
            const text = textOf(block).trim();
            if (text) out.push(text);
        }
    }
    return out.join('\n');
}

const colIndex = ref => ref.replace(/\d+/g, '').split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

// XLSX: every sheet with its name; each row is prefixed with its number so sources can be named
function xlsxText(bytes) {
    const files = unzipSync(bytes, { filter: f => /^xl\/(workbook\.xml|sharedStrings\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/.test(f.name) });
    const read = name => (files[name] ? strFromU8(files[name]) : '');
    const shared = (read('xl/sharedStrings.xml').match(/<si>[\s\S]*?<\/si>/g) || []).map(si => unxml((si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('')));
    const rels = Object.fromEntries([...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map(([, id, target]) => [id, 'xl/' + target.replace(/^\/?xl\//, '')]));
    const sheets = [...read('xl/workbook.xml').matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map(([, name, rid]) => ({ name: unxml(name), file: rels[rid] }));
    if (!sheets.length) throw new Error('В книге не найдены листы.');
    const out = [];
    for (const sheet of sheets) {
        const xml = read(sheet.file);
        out.push(`[Лист «${sheet.name}»]`);
        for (const row of xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []) {
            const number = (row.match(/<row[^>]*\sr="(\d+)"/) || [])[1] || '?';
            const cells = [];
            for (const c of row.match(/<c[^>]*\/>|<c[^>]*>[\s\S]*?<\/c>/g) || []) {
                const ref = (c.match(/\sr="([A-Z]+\d+)"/) || [])[1];
                const type = (c.match(/\st="([^"]+)"/) || [])[1];
                const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
                let value = '';
                if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
                else if (type === 'inlineStr') value = unxml(((c.match(/<is>([\s\S]*?)<\/is>/) || [])[1] || '').replace(/<[^>]+>/g, ''));
                else if (type === 'b') value = v === '1' ? 'ИСТИНА' : 'ЛОЖЬ';
                else if (v !== undefined) value = unxml(v);
                if (ref) cells[colIndex(ref)] = value;
            }
            if (cells.some(x => x !== undefined && x !== '')) out.push(`Строка ${number}: ${Array.from(cells, x => x ?? '').join(' | ')}`);
        }
    }
    return out.join('\n');
}

// Windows-1251 (Russian text files from older programs), used when the bytes are not valid UTF-8
const CP1251 = 'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—�™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕїАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя';
function textFile(bytes) {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
    } catch {
        return Array.from(bytes, b => (b < 0x80 ? String.fromCharCode(b) : CP1251[b - 0x80])).join('');
    }
}

async function pdfInfo(bytes) {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = text.map((t, i) => `[Страница ${i + 1}]\n${t.trim()}`).join('\n\n');
    return { pages: totalPages, text: pages, chars: text.join('').replace(/\s+/g, '').length };
}

// ---- Upload and access --------------------------------------------------------------------

export async function uploadDocument(env, user, request) {
    let form;
    try {
        form = await request.formData();
    } catch {
        throw badRequest('Загрузите файл формой (multipart/form-data).');
    }
    const file = form.get('file');
    const project = await projectAccess(env, user, str(form.get('project_id'), 64));
    if (!file || typeof file === 'string') throw badRequest('Выберите файл.');
    const name = str(file.name, 250) || 'Документ';
    const kind = kindOf(name, file.type);
    if (!kind) throw badRequest('Поддерживаются PDF, DOCX, XLSX и TXT.');
    const lim = limits(env);
    if (file.size > lim.fileBytes) throw badRequest(`Файл больше ${Math.round(lim.fileBytes / 1048576)} МБ.`);
    if (!file.size) throw badRequest('Файл пустой.');
    let contractId = str(form.get('contract_id'), 64) || null;
    if (contractId) {
        const contract = await env.DB.prepare('SELECT id FROM contracts WHERE id = ? AND company_id = ? AND project_id = ?').bind(contractId, user.company_id, project.id).first();
        if (!contract) contractId = null;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = { id: uid(), company_id: user.company_id, project_id: project.id };
    let text = '';
    let status = 'ok';
    let note = null;
    let pages = null;
    try {
        if (kind === 'pdf') {
            const info = await pdfInfo(bytes);
            pages = info.pages;
            text = info.text;
            if (pages > lim.pdfPages) throw badRequest(`В PDF ${pages} страниц, допускается до ${lim.pdfPages}. Разделите документ.`);
            // A scan has no text layer: the model still reads the page images, but the user is warned
            if (info.chars < 30 * pages) { status = 'no_text'; note = 'В PDF нет текстового слоя (скан). Специалист прочитает изображения страниц; качество распознавания проверяйте по оригиналу.'; }
        } else if (kind === 'docx') {
            text = docxText(bytes);
            note = 'Автоматическая нумерация пунктов DOCX в извлечённом тексте может отсутствовать — номера пунктов сверяйте с оригиналом.';
        } else if (kind === 'xlsx') {
            text = xlsxText(bytes);
            note = 'Формулы переданы рассчитанными значениями, сохранёнными в файле; даты — числами Excel, если ячейка не текстовая.';
        } else {
            text = textFile(bytes);
        }
        if (kind !== 'pdf' && !text.trim()) { status = 'error'; note = 'Текст не извлечён: документ пустой или защищён.'; }
        if (text.length > lim.textChars) { status = 'error'; note = `Документ слишком большой для анализа целиком (${text.length.toLocaleString('ru-RU')} символов). Разделите его на части.`; }
    } catch (err) {
        if (err.status) throw err;
        status = 'error';
        note = `Не удалось прочитать файл: ${kind === 'pdf' ? 'PDF повреждён или зашифрован' : 'файл повреждён или имеет другой формат'}.`;
        log('document_extract_failed', { company: user.company_id, kind, error: err.name });
    }

    await env.FILES.put(keyOf(doc, 'original'), bytes, { httpMetadata: { contentType: KINDS[kind].mime } });
    if (text && status !== 'error') await env.FILES.put(keyOf(doc, 'text.txt'), text, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
    await env.DB.prepare('INSERT INTO documents (id, company_id, project_id, contract_id, name, kind, mime, size, status, status_note, pages, text_chars, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(doc.id, doc.company_id, doc.project_id, contractId, name, kind, KINDS[kind].mime, file.size, status, note, pages, status === 'error' ? 0 : text.length, user.id, now()).run();
    return { id: doc.id, name, kind, size: file.size, status, status_note: note, pages, text_chars: status === 'error' ? 0 : text.length };
}

export async function listDocuments(env, user, projectId) {
    await projectAccess(env, user, projectId);
    const { results } = await env.DB.prepare(
        `SELECT d.id, d.name, d.kind, d.size, d.status, d.status_note, d.pages, d.text_chars, d.contract_id, d.created_at, u.name AS uploaded_by_name
         FROM documents d JOIN users u ON u.id = d.uploaded_by WHERE d.company_id = ? AND d.project_id = ? ORDER BY d.created_at DESC LIMIT 500`
    ).bind(user.company_id, projectId).all();
    return results;
}

// A document of the company the user can reach (by project); others answer «not found»
export async function documentAccess(env, user, id) {
    const doc = await env.DB.prepare('SELECT * FROM documents WHERE id = ? AND company_id = ?').bind(id, user.company_id).first();
    if (!doc) throw notFound('Документ не найден.');
    await projectAccess(env, user, doc.project_id);
    return doc;
}

export async function downloadDocument(env, user, id, cors) {
    const doc = await documentAccess(env, user, id);
    const object = await env.FILES.get(keyOf(doc, 'original'));
    if (!object) throw notFound('Файл не найден в хранилище.');
    return new Response(object.body, { headers: { ...cors, 'Content-Type': doc.mime, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`, 'Cache-Control': 'no-store' } });
}

export async function deleteDocument(env, user, id) {
    const doc = await documentAccess(env, user, id);
    if (doc.uploaded_by !== user.id && user.role !== 'admin') throw forbidden('Удалить документ может загрузивший его сотрудник или администратор.');
    await env.FILES.delete([keyOf(doc, 'original'), keyOf(doc, 'text.txt')]);
    await env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id).run();
    return { ok: true };
}

// Content blocks for the model; citations are enabled on every document of the request
export async function documentBlock(env, doc) {
    if (doc.status === 'error') throw badRequest(`Документ «${doc.name}» не прочитан: ${doc.status_note || 'ошибка извлечения'}. Загрузите исправленный файл.`);
    const title = doc.name.slice(0, 250);
    if (doc.kind === 'pdf') {
        const object = await env.FILES.get(keyOf(doc, 'original'));
        if (!object) throw notFound(`Файл «${doc.name}» не найден в хранилище.`);
        const bytes = new Uint8Array(await object.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return { block: { type: 'document', title, citations: { enabled: true }, source: { type: 'base64', media_type: 'application/pdf', data: btoa(binary) } }, size: bytes.length, chars: doc.text_chars };
    }
    const object = await env.FILES.get(keyOf(doc, 'text.txt'));
    if (!object) throw notFound(`Текст документа «${doc.name}» не найден.`);
    const text = await object.text();
    const context = doc.kind === 'xlsx' ? 'Таблица Excel: листы и строки с номерами.' : doc.kind === 'docx' ? 'Текст документа Word с таблицами.' : undefined;
    return { block: { type: 'document', title, ...(context ? { context } : {}), citations: { enabled: true }, source: { type: 'text', media_type: 'text/plain', data: text } }, size: text.length, chars: text.length };
}
