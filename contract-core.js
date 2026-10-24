// Contracts (Контракт — Исполнение): one store and the shared rules used by contracts.html,
// the contract specialist's workspace in Штат (contract-workspace.js) and the cabinet.
// A passed deadline without a mark of execution is «Требует подтверждения исполнения», not a breach:
// a breach is recorded only by the user («Не исполнено»).

(function () {
    const STORE_KEY = 'airchitect-contracts-v1';
    const SELECTED_KEY = 'airchitect-contract-specialist-v1';
    const SOON_DAYS = 7;

    const STATUS_LABEL = {
        review: 'Не подтверждено (найдено автоматически)', active: 'В работе', soon: 'Скоро срок',
        pastdue: 'Требует подтверждения исполнения', overdue: 'Не исполнено', done: 'Исполнено'
    };
    const STATUS_TONE = { review: 'review', active: '', soon: 'soon', pastdue: 'soon', overdue: 'overdue', done: 'done' };
    const PARTIES = { customer: 'Заказчик', contractor: 'Подрядчик', both: 'Обе стороны' };
    const AMENDMENT_STATUS = { draft: 'Проект', approval: 'На согласовании', signed: 'Подписано' };

    function read() {
        try {
            return JSON.parse(localStorage.getItem(STORE_KEY)) || { contracts: [] };
        } catch (e) {
            return { contracts: [] };
        }
    }
    function write(data) {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            return false;
        }
    }
    const readKey = (key, fallback) => {
        try {
            return JSON.parse(localStorage.getItem(key)) || fallback;
        } catch (e) {
            return fallback;
        }
    };
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const today = () => new Date().toISOString().slice(0, 10);
    const daysUntil = date => (date ? Math.round((new Date(date + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000) : null);
    const formatDate = d => (d ? d.split('-').reverse().join('.') : '');
    const parsePrice = s => { const m = String(s || '').replace(/[\s ]/g, '').replace(',', '.').match(/\d+(\.\d+)?/); return m ? Number(m[0]) : 0; };
    const name = c => (c ? `Договор № ${c.number || 'без номера'}${c.date ? ' от ' + formatDate(c.date) : ''}` : '');

    function obligationStatus(o) {
        if (o.status === 'done') return 'done';
        if (o.status === 'breached') return 'overdue';
        if (!o.confirmed) return 'review';
        const days = daysUntil(o.due);
        if (days !== null && days < 0) return 'pastdue';
        if (days !== null && days <= SOON_DAYS) return 'soon';
        return 'active';
    }

    const isPayment = o => /оплат|аванс|платеж|платёж|перечисл|возврат\w* (гарантийн|удержан)/i.test(o.text || '');
    const isDocument = o => /документ|исполнительн|акт\b|акты|справк|отч[её]т|передат|предостав|направ/i.test(o.text || '');

    function ensure(c) {
        c.obligations = c.obligations || [];
        c.notices = c.notices || [];
        c.events = c.events || [];
        c.log = c.log || [];
        c.amendments = c.amendments || [];
        c.risks = c.risks || [];
        c.analyses = c.analyses || [];
        c.terms = { advancePct: '', paymentTerms: '', retentionPct: '', warrantyMonths: '', penalty: '', acceptance: '', ...(c.terms || {}) };
        // Essential terms at signing: changes are tracked against them
        if (!c.baseline) c.baseline = { price: c.price || '', start: c.start || '', end: c.end || '' };
        return c;
    }

    // Linked data of other sections: objects (КС, ИД), cash flow (payments)
    function linked(c) {
        const objects = (readKey('airchitect-objects-v1', { objects: [] }).objects || []).filter(o => (o.contractIds || []).includes(c.id) || (o.ksSettings || {}).contractId === c.id);
        const ops = (readKey('airchitect-cashflow-v1', {}).ops || []).filter(op => op.contractId === c.id);
        const ks2 = objects.flatMap(o => (o.ks2 || []).filter(a => a.contractId === c.id).map(a => ({ ...a, object: o })));
        const ks3 = objects.flatMap(o => (o.ks3 || []).filter(a => a.contractId === c.id).map(a => ({ ...a, object: o })));
        return { objects, ops, ks2, ks3 };
    }
    const paid = op => (op.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);

    // Warnings of the contract specialist: from the system data and confirmed events only
    function warnings(c) {
        ensure(c);
        const out = [];
        const add = (kind, level, text, date, ref) => out.push({ kind, level, text, date: date || '', ref: ref || null });
        c.obligations.forEach(o => {
            const s = obligationStatus(o);
            const days = daysUntil(o.due);
            if (s === 'soon') add(isPayment(o) ? 'payment' : isDocument(o) ? 'documents' : 'deadline', 1, `${isPayment(o) ? 'Наступает срок оплаты' : 'Приближается срок'}: ${o.text} (п. ${o.clause || '—'}, через ${days} дн.)`, o.due, o);
            if (s === 'pastdue') add(isPayment(o) ? 'payment' : isDocument(o) ? 'documents' : 'deadline', 2, `Срок прошёл ${formatDate(o.due)}, сведений об исполнении нет — требует подтверждения: ${o.text}${isDocument(o) ? ' (предоставление документов)' : ''}.`, o.due, o);
            if (s === 'overdue') add('breach', 3, `Обязательство не исполнено: ${o.text} (п. ${o.clause || '—'}).`, o.due, o);
            if (s === 'review') add('confirm', 1, `Обязательство найдено автоматически и не подтверждено: ${o.text}.`, o.due, o);
        });
        const l = linked(c);
        l.ops.filter(op => op.dir === 'in' && paid(op) < Number(op.amount || 0)).forEach(op => {
            const days = daysUntil(op.date);
            if (days !== null && days <= SOON_DAYS) add('payment', days < 0 ? 2 : 1, days < 0 ? `Оплата заказчика по сроку ${formatDate(op.date)} не поступила: ${op.title} (ДДС).` : `Срок оплаты заказчиком через ${days} дн.: ${op.title} (ДДС).`, op.date);
        });
        const price = parsePrice(c.price);
        const accepted = l.ks3.filter(k => k.status === 'signed').reduce((s, k) => {
            const base = (k.object.ks2 || []).filter(a => k.ks2Ids.includes(a.id)).reduce((x, a) => x + a.lines.reduce((t, ln) => t + Number(ln.qty) * Number(ln.price), 0), 0);
            return s + base * (k.vatPct === 'none' ? 1 : 1 + Number(k.vatPct) / 100);
        }, 0);
        const signedAm = c.amendments.filter(a => a.status === 'signed');
        if (price && accepted > price * 1.0001) add('amendment', 2, `Принято по КС-3 ${Math.round(accepted).toLocaleString('ru-RU')} ₽ больше цены договора ${Math.round(price).toLocaleString('ru-RU')} ₽: нужно дополнительное соглашение об изменении цены.`);
        const openObl = c.obligations.filter(o => !['done'].includes(obligationStatus(o)) && o.party !== 'customer');
        const endDays = daysUntil(c.end);
        if (endDays !== null && endDays < 0 && openObl.length) add('amendment', 2, `Срок окончания работ ${formatDate(c.end)} прошёл, обязательств подрядчика не закрыто: ${openObl.length}. Нужно дополнительное соглашение о сроках или подтверждение исполнения.`, c.end);
        else if (endDays !== null && endDays >= 0 && endDays <= 30) add('end', 1, `До окончания работ по договору ${endDays} дн. (${formatDate(c.end)}).`, c.end);
        // Essential terms changed without a signed supplementary agreement
        ['price', 'end', 'start'].forEach(k => {
            const was = (c.baseline || {})[k] || '';
            const now = c[k] || '';
            const covered = signedAm.some(a => (a.changes || {})[k] === now);
            if (was && now && was !== now && !covered) add('terms', 2, `Изменено существенное условие «${{ price: 'цена', end: 'срок окончания', start: 'срок начала' }[k]}»: было «${k === 'price' ? was : formatDate(was)}», стало «${k === 'price' ? now : formatDate(now)}» — нет подписанного дополнительного соглашения.`);
        });
        c.amendments.filter(a => a.status !== 'signed').forEach(a => add('amendment', 1, `Дополнительное соглашение № ${a.number || '—'} не подписано: ${a.subject}.`, a.date));
        return out.sort((a, b) => b.level - a.level || (a.date || '9').localeCompare(b.date || '9'));
    }

    // Readiness to close the contract: each item states what blocks it
    function closeReadiness(c) {
        ensure(c);
        const l = linked(c);
        const items = [];
        const add = (ok, text) => items.push({ ok, text });
        const notDone = c.obligations.filter(o => obligationStatus(o) !== 'done');
        add(!notDone.length, notDone.length ? `Не закрыто обязательств: ${notDone.length} (${notDone.slice(0, 3).map(o => o.text.slice(0, 60)).join('; ')}).` : 'Все обязательства исполнены.');
        const ks2Open = l.ks2.filter(a => a.status !== 'signed');
        add(!ks2Open.length, l.ks2.length ? (ks2Open.length ? `Не подписаны КС-2: ${ks2Open.map(a => '№ ' + a.number).join(', ')}.` : 'Все КС-2 подписаны.') : 'Акты КС-2 по договору не оформлялись в «Объектах».');
        const ks3Open = l.ks3.filter(k => k.status !== 'signed');
        add(!ks3Open.length, ks3Open.length ? `Не подписаны КС-3: ${ks3Open.map(k => '№ ' + k.number).join(', ')}.` : 'Справки КС-3 подписаны или не требуются.');
        const unpaid = l.ops.filter(op => op.dir === 'in' && paid(op) < Number(op.amount || 0));
        add(!unpaid.length, unpaid.length ? `Не получены оплаты: ${unpaid.length} на ${Math.round(unpaid.reduce((s, op) => s + Number(op.amount) - paid(op), 0)).toLocaleString('ru-RU')} ₽ (ДДС).` : 'Оплаты по договору получены или не запланированы в ДДС.');
        const idOpen = l.objects.flatMap(o => o.id || []).filter(d => d.status !== 'signed');
        add(!idOpen.length, idOpen.length ? `Не подписана исполнительная документация: ${idOpen.length} док.` : 'Исполнительная документация подписана или не ведётся.');
        const drafts = c.notices.filter(n => n.status === 'draft');
        add(!drafts.length, drafts.length ? `Не отправлено уведомлений: ${drafts.length}.` : 'Неотправленных уведомлений нет.');
        const am = c.amendments.filter(a => a.status !== 'signed');
        add(!am.length, am.length ? `Не подписаны дополнительные соглашения: ${am.length}.` : 'Неподписанных дополнительных соглашений нет.');
        const retention = l.ops.filter(op => op.category === 'retention' && paid(op) < Number(op.amount || 0));
        if (retention.length) add(false, `Гарантийные удержания к возврату: ${retention.length} (возврат — после гарантийного срока по договору).`);
        return { ready: items.every(i => i.ok), items };
    }

    // Context of the contract card for the specialists' chat (the card is user data, not a verified source)
    function context(c) {
        ensure(c);
        const w = warnings(c);
        return [
            `${name(c)}${c.subject ? ': ' + c.subject : ''}. Заказчик: ${c.customer || '—'}. Подрядчик: ${c.contractor || '—'}. Цена: ${c.price || 'не указана'}. Сроки работ: ${formatDate(c.start) || '—'} — ${formatDate(c.end) || '—'}.`,
            `Финансовые условия: аванс ${c.terms.advancePct || '—'}%; порядок оплаты: ${c.terms.paymentTerms || '—'}; гарантийное удержание ${c.terms.retentionPct || '—'}%; гарантийный срок ${c.terms.warrantyMonths || '—'} мес.; ответственность: ${c.terms.penalty || '—'}; приёмка: ${c.terms.acceptance || '—'}.`,
            `Обязательства (${c.obligations.length}): ` + c.obligations.slice(0, 30).map(o => `[${STATUS_LABEL[obligationStatus(o)]}] ${PARTIES[o.party] || ''}, п. ${o.clause || '—'}: ${o.text}${o.due ? ' — до ' + formatDate(o.due) : o.condition ? ' — ' + o.condition : ''}`).join('; ') + '.',
            c.amendments.length ? 'Дополнительные соглашения: ' + c.amendments.map(a => `№ ${a.number || '—'} от ${formatDate(a.date)} (${AMENDMENT_STATUS[a.status]}): ${a.subject}`).join('; ') + '.' : 'Дополнительных соглашений нет.',
            c.notices.length ? 'Уведомления: ' + c.notices.map(n => `${n.type} → ${n.addressee} (${n.status})`).join('; ') + '.' : '',
            w.length ? 'Предупреждения системы: ' + w.slice(0, 12).map(x => x.text).join(' ') : 'Предупреждений нет.',
            c.risks.length ? 'Риски в карточке: ' + c.risks.map(r => `${r.text} (${r.level})`).join('; ') + '.' : ''
        ].filter(Boolean).join('\n');
    }

    const NOTICE_TITLES = { start: 'Уведомление о начале работ', obstacle: 'Предупреждение об обстоятельствах (ст. 716 ГК РФ)', extra: 'Уведомление о дополнительных работах', delay: 'Уведомление о переносе сроков', breach: 'Уведомление о нарушении обязательств', suspend: 'Уведомление о приостановке работ', payment: 'Уведомление о необходимости оплаты', claim: 'Претензия', other: 'Уведомление по договору' };
    const NOTICE_STATUS = { draft: 'Проект', sent: 'Отправлено', received: 'Получено адресатом' };

    // All documents of the contract in one list: the card file, confirmations, notices, agreements, КС from Объекты
    function documents(c) {
        ensure(c);
        const out = [];
        if (c.file) out.push({ kind: 'Договор', title: c.file.name, file: c.file });
        c.obligations.forEach(o => (o.files || []).forEach(f => out.push({ kind: 'Подтверждение', title: f.name, file: f, meta: `п. ${o.clause || '—'}: ${String(o.text).slice(0, 80)}` })));
        c.events.forEach(e => (e.files || []).forEach(f => out.push({ kind: 'Событие', title: f.name, file: f, meta: `${formatDate(e.date)} · ${e.title}` })));
        c.notices.forEach(n => out.push({ kind: n.type === 'claim' ? 'Претензия' : 'Уведомление', title: `${NOTICE_TITLES[n.type] || NOTICE_TITLES.other} → ${n.addressee}`, meta: `${NOTICE_STATUS[n.status] || n.status}${n.sentAt ? ', отправлено ' + formatDate(n.sentAt) : ''}` }));
        c.amendments.forEach(a => { out.push({ kind: 'Доп. соглашение', title: `№ ${a.number || '—'} от ${formatDate(a.date)}: ${a.subject}`, meta: AMENDMENT_STATUS[a.status] }); (a.files || []).forEach(f => out.push({ kind: 'Доп. соглашение', title: f.name, file: f })); });
        const l = linked(c);
        l.ks2.forEach(a => out.push({ kind: 'КС-2', title: `№ ${a.number} от ${formatDate(a.date)} — ${a.object.name}`, meta: a.status === 'signed' ? `подписан ${formatDate(a.signedAt)}` : 'не подписан' }));
        l.ks3.forEach(k => out.push({ kind: 'КС-3', title: `№ ${k.number} от ${formatDate(k.date)} — ${k.object.name}`, meta: k.status === 'signed' ? `подписана ${formatDate(k.signedAt)}` : 'не подписана' }));
        return out;
    }

    // Result of reading the contract (contract-extract.js): fill empty requisites, add new control points
    function applyExtraction(c, result, source, fileName) {
        ensure(c);
        ['number', 'date', 'subject', 'customer', 'contractor', 'price', 'start', 'end'].forEach(key => {
            if (!c[key] && result.contract && result.contract[key]) c[key] = result.contract[key];
        });
        if (!c.baseline.price && !c.baseline.end) c.baseline = { price: c.price || '', start: c.start || '', end: c.end || '' };
        const known = new Set(c.obligations.map(o => `${o.clause}|${(o.text || '').slice(0, 60)}`));
        const added = (result.obligations || []).filter(o => !known.has(`${o.clause}|${(o.text || '').slice(0, 60)}`)).map(o => ({
            id: uid(), party: o.party || 'both', text: o.text, clause: o.clause, due: /^\d{4}-\d{2}-\d{2}$/.test(o.due) ? o.due : '', condition: o.condition || '',
            responsible: '', status: 'active', confirmed: false, source, files: []
        }));
        c.obligations.push(...added);
        c.log.unshift({ at: Date.now(), text: `Из договора «${fileName}» найдено контрольных точек: ${added.length} (требуют подтверждения)` });
        return added.length;
    }

    // Selected contract of the specialist's workspace (shared between Штат and Контракты)
    const selected = () => readKey(SELECTED_KEY, {}).id || '';
    const select = id => { try { localStorage.setItem(SELECTED_KEY, JSON.stringify({ id })); } catch (e) { /* ignore */ } };

    // Chat extension of the contract specialist: the selected card goes to the specialist as context;
    // the answer can be saved to the card («Риски и заключения»)
    function chatExtension() {
        let bar = null;
        const current = () => read().contracts.find(c => c.id === selected());
        const draw = () => {
            if (!bar) return;
            const c = current();
            bar.textContent = c ? `Контекст: ${name(c)}${c.subject ? ' — ' + c.subject : ''}. Специалист получит актуальную карточку.` : 'Договор не выбран: выберите договор в рабочем пространстве ниже, чтобы специалист получил его карточку.';
        };
        return {
            attach({ form }) {
                bar = document.createElement('p');
                bar.className = 'home-ws__context';
                form.prepend(bar);
                draw();
                window.addEventListener('storage', draw);
                document.addEventListener('contractselect', draw);
            },
            payload() {
                const c = current();
                return c ? { type: 'contract', id: c.id, context: context(c) } : null;
            },
            reset() { draw(); },
            afterAnswer(message, answerText, request) {
                if (!request || request.type !== 'contract') return;
                const box = document.createElement('div');
                box.className = 'home-tn__answer-actions';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = 'Сохранить в карточку договора';
                btn.addEventListener('click', () => {
                    const data = read();
                    const c = data.contracts.find(x => x.id === request.id);
                    if (!c) return;
                    ensure(c);
                    c.analyses.unshift({ id: uid(), at: Date.now(), text: answerText.trim(), by: 'Договорной специалист' });
                    c.log.unshift({ at: Date.now(), text: 'Сохранено заключение договорного специалиста из чата' });
                    const p = document.createElement('p');
                    p.className = 'home-chat__note';
                    p.textContent = write(data) ? `Сохранено в «Контракты»: ${name(c)} → «Условия и документы».` : 'Не удалось сохранить.';
                    message.appendChild(p);
                });
                box.appendChild(btn);
                message.appendChild(box);
            }
        };
    }
    window.AirchitectChatExtensions = window.AirchitectChatExtensions || {};
    window.AirchitectChatExtensions.contract = chatExtension;

    window.AirchitectContracts = { STORE_KEY, SOON_DAYS, STATUS_LABEL, STATUS_TONE, PARTIES, AMENDMENT_STATUS, read, write, uid, today, daysUntil, formatDate, parsePrice, name, obligationStatus, isPayment, isDocument, ensure, linked, warnings, closeReadiness, context, selected, select, applyExtraction, documents, NOTICE_TITLES };
})();
