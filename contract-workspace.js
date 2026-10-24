// Workspace of the contract specialist in Договоры (contracts.html): above the list of contracts —
// quick actions, all contracts, obligations, deadlines, documents, risks and history (one store,
// contract-core.js). Actions change the same cards; requests go to the specialist's chat window.

document.addEventListener('DOMContentLoaded', () => {
    const page = document.querySelector('[data-contracts]');
    const CC = window.AirchitectContracts;
    if (!page || !CC || !window.AirchitectWorkspaceKit) return;
    const layout = page.querySelector('.home-staff');
    if (!layout) return;

    const K = window.AirchitectWorkspaceKit;
    const { h, notify, badge, rowEl, storeFile, openFile } = K;
    // The card of Договоры on this page (contracts.js listens): open a contract, optionally with an action
    const openCard = (c, action) => document.dispatchEvent(new CustomEvent('contractopen', { detail: { id: c.id, action: action || '' } }));
    // Requests go to the contract specialist's chat window; the selected card is its context
    const askChat = text => {
        const c = selectedContract();
        if (c) CC.select(c.id);
        if (typeof window.AirchitectOpenSpecialist === 'function') window.AirchitectOpenSpecialist('contract-specialist', text);
    };
    // Small forms on obligations: the form saves, then the workspace is redrawn
    const ask = (title, fields, onSubmit) => K.ask(title, fields, v => { onSubmit(v); save(); render(); return null; });
    const API = typeof HOME_ASSISTANT_API !== 'undefined' && HOME_ASSISTANT_API ? HOME_ASSISTANT_API.replace(/\/chat$/, '/extract') : null;
    const { formatDate, STATUS_LABEL, STATUS_TONE, PARTIES } = CC;
    let tab = 'contracts';
    let onlyPayments = false;
    let data = CC.read();
    data.contracts.forEach(CC.ensure);
    const save = () => {
        if (!CC.write(data)) notify('Не удалось сохранить.');
        document.dispatchEvent(new CustomEvent('contractschange', { detail: { source: 'workspace' } }));
    };
    const selectedContract = () => data.contracts.find(c => c.id === CC.selected());

    function needContract() {
        const c = selectedContract();
        if (!c) notify('Откройте договор в списке или создайте новый из файла.');
        return c;
    }

    // New card from the contract file: the same reading as in Договоры (contract-extract.js)
    async function createFromFile(file) {
        const c = CC.ensure({ id: CC.uid(), number: '', date: '', subject: '', customer: '', contractor: '', price: '', start: '', end: '', file: null, obligations: [], notices: [], events: [], log: [] });
        c.file = await storeFile(file);
        c.log.unshift({ at: Date.now(), text: `Карточка создана договорным специалистом из файла «${file.name}»` });
        data.contracts.unshift(c);
        CC.select(c.id);
        save();
        render();
        notify(API ? 'Специалист читает договор…' : 'Читаю договор и ищу контрольные точки…');
        try {
            const result = await window.AirchitectContractExtract.run(file, c.file, API);
            data = CC.read();
            const card = data.contracts.find(x => x.id === c.id);
            const n = CC.applyExtraction(card, result, API ? 'ai' : 'auto', file.name);
            save();
            notify(`Карточка создана в «Договоры». Найдено контрольных точек: ${n} — подтвердите их.`);
        } catch (err) {
            notify(`Карточка создана, но договор не прочитан: ${err.message}`);
        }
        render();
        openCard(c);
    }

    // ---- Layout: a row of quick actions and a collapsible summary of all contracts -----------------

    const fileInput = h('input', { type: 'file', accept: '.pdf,.docx,.txt', hidden: true, onchange: ev => { if (ev.target.files[0]) createFromFile(ev.target.files[0]); ev.target.value = ''; } });
    const root = h('section', { class: 'home-ws home-ws--contracts', 'aria-label': 'Быстрые действия и сводка по договорам' });
    layout.before(root);

    // Actions on the open card use it; the summary covers all contracts
    const ACTIONS = [
        ['Новый договор из файла', () => fileInput.click(), true],
        ['Проверить договор', () => { const c = needContract(); if (c) askChat(`Проверь договор: стороны, предмет, цена и сроки, финансовые условия, ответственность сторон, порядок оплаты и приёмки, приложения. Выдели юридические и финансовые риски и сформируй краткое заключение.${c.file ? ' Приложи файл договора к сообщению для полной проверки текста.' : ''}`); }],
        ['Выявить риски', () => { const c = needContract(); if (c) askChat('Выяви договорные, финансовые и организационные риски по договору с учётом предупреждений системы и предложи меры их снижения. Отдели риски, подтверждённые условиями договора, от предположений.'); }],
        ['Доп. соглашение', () => { const c = needContract(); if (c) openCard(c, 'amendment'); }],
        ['Претензия', () => { const c = needContract(); if (c) openCard(c, 'claim'); }],
        ['Готовность к закрытию', () => { const c = needContract(); if (c) openCard(c, 'closing'); }]
    ];
    const TABS = [['obligations', 'Обязательства'], ['deadlines', 'Сроки'], ['documents', 'Документы'], ['risks', 'Риски'], ['history', 'История']];
    tab = null;

    function counts() {
        const active = data.contracts.filter(x => !x.closed);
        const warn = active.flatMap(x => CC.warnings(x));
        return {
            obligations: active.reduce((n, x) => n + x.obligations.filter(o => CC.obligationStatus(o) !== 'done').length, 0),
            deadlines: warn.length,
            documents: data.contracts.reduce((n, x) => n + CC.documents(x).length, 0),
            risks: warn.filter(w => w.level >= 2).length + active.reduce((n, x) => n + x.risks.length, 0),
            history: null
        };
    }

    function render() {
        data = CC.read();
        data.contracts.forEach(CC.ensure);
        root.textContent = '';
        root.appendChild(fileInput);
        const n = counts();
        root.append(
            h('div', { class: 'home-ws__actions' }, ACTIONS.map(([l, fn, primary]) => h('button', { type: 'button', class: 'home-chat__action' + (primary ? ' is-primary' : ''), onclick: fn }, l))),
            h('div', { class: 'home-ws__summary', role: 'tablist', 'aria-label': 'Сводка по договорам' }, TABS.map(([k, l]) => h('button', {
                type: 'button', role: 'tab', class: 'home-ws__chip', 'aria-selected': String(k === tab), 'aria-expanded': String(k === tab),
                onclick: () => { tab = tab === k ? null : k; if (k !== 'deadlines') onlyPayments = false; render(); }
            }, l, n[k] !== null && n[k] !== undefined ? h('span', { class: 'home-ws__count' }, String(n[k])) : null))));
        if (!tab) return;
        const panel = h('div', { class: 'home-ws__panel' });
        root.appendChild(panel);
        ({ obligations: renderObligations, deadlines: renderDeadlines, documents: renderDocuments, risks: renderRisks, history: renderHistory })[tab](panel, null);
    }

    function renderObligations(panel, c) {
        const items = (c ? [c] : data.contracts.filter(x => !x.closed)).flatMap(x => x.obligations.map(o => ({ x, o, s: CC.obligationStatus(o) }))).filter(i => i.s !== 'done')
            .sort((a, b) => ({ overdue: 0, pastdue: 1, soon: 2, review: 3, active: 4, done: 5 }[a.s] - { overdue: 0, pastdue: 1, soon: 2, review: 3, active: 4, done: 5 }[b.s]) || (a.o.due || '9').localeCompare(b.o.due || '9'));
        panel.appendChild(h('ul', { class: 'home-ct__list' }, items.length ? items.map(({ x, o, s }) => rowEl([badge(STATUS_LABEL[s], STATUS_TONE[s]), o.text],
            [`${PARTIES[o.party] || ''} · п. ${o.clause || '—'} · ${o.due ? 'срок ' + formatDate(o.due) : o.condition || 'срок не указан'}${c ? '' : ' · ' + CC.name(x)}`, o.status === 'done' ? `Исполнено ${formatDate(o.doneAt)}${o.doneNote ? ' — ' + o.doneNote : ''}` : '', o.status === 'breached' ? `Не исполнено: ${o.breachBasis}` : ''],
            [...(!o.confirmed ? [['Подтвердить', () => { o.confirmed = true; x.log.unshift({ at: Date.now(), text: `Подтверждено обязательство (п. ${o.clause || '—'}) договорным специалистом` }); save(); render(); }]] : []),
                ...(o.status !== 'done' ? [['Исполнено', () => ask('Подтвердить исполнение', [{ name: 'date', label: 'Дата исполнения', type: 'date', value: CC.today(), required: true }, { name: 'note', label: 'Подтверждение (документ, письмо)', required: true }], v => { Object.assign(o, { status: 'done', doneAt: v.date, doneNote: v.note }); x.log.unshift({ at: Date.now(), text: `Исполнено (п. ${o.clause || '—'}): ${o.text.slice(0, 80)} — ${v.note}` }); })]] : []),
                ...(o.status !== 'done' && o.status !== 'breached' && o.confirmed ? [['Не исполнено', () => ask('Обязательство не исполнено', [{ name: 'date', label: 'Дата фиксации', type: 'date', value: CC.today(), required: true }, { name: 'basis', label: 'Чем подтверждается неисполнение', type: 'textarea', required: true }], v => { Object.assign(o, { status: 'breached', breachAt: v.date, breachBasis: v.basis }); x.log.unshift({ at: Date.now(), text: `Отмечено неисполнение (п. ${o.clause || '—'}): ${v.basis}` }); })]] : [])])) : h('li', { class: 'home-ct__none' }, 'Открытых обязательств нет.')));
    }

    function renderDeadlines(panel, c) {
        const kinds = { payment: 'Оплата', documents: 'Документы', deadline: 'Срок', breach: 'Нарушение', confirm: 'Подтверждение', amendment: 'Доп. соглашение', terms: 'Условия', end: 'Окончание работ' };
        const list = (c ? [c] : data.contracts.filter(x => !x.closed)).flatMap(x => CC.warnings(x).map(w => ({ ...w, x }))).filter(w => !onlyPayments || w.kind === 'payment');
        panel.appendChild(h('div', { class: 'home-ct__filters' }, h('label', { class: 'home-cf__check' }, h('input', { type: 'checkbox', checked: onlyPayments, onchange: ev => { onlyPayments = ev.target.checked; render(); } }), ' Только сроки оплаты')));
        panel.appendChild(h('ul', { class: 'home-ct__list' }, list.length ? list.map(w => rowEl([badge(kinds[w.kind] || 'Контроль', w.level >= 3 ? 'overdue' : w.level === 2 ? 'soon' : 'review'), w.text], [`${w.date ? formatDate(w.date) + ' · ' : ''}${CC.name(w.x)}`],
            [['Карточка', () => openCard(w.x)], ...(w.kind === 'payment' ? [['Уведомление об оплате', () => openCard(w.x, 'notice')]] : []), ...(w.kind === 'amendment' || w.kind === 'terms' ? [['Доп. соглашение', () => openCard(w.x, 'amendment')]] : [])])) : h('li', { class: 'home-ct__none' }, onlyPayments ? 'Сроков оплаты в ближайшие дни нет.' : 'Предупреждений нет.')));
    }

    function renderDocuments(panel, c) {
        const docs = (c ? [c] : data.contracts).flatMap(x => CC.documents(x).map(d => ({ ...d, x })));
        panel.appendChild(h('ul', { class: 'home-ct__list' }, docs.length ? docs.map(d => rowEl([badge(d.kind), d.file ? h('button', { type: 'button', class: 'home-ct__file', onclick: () => openFile(d.file) }, d.title) : d.title], [[d.meta, c ? '' : CC.name(d.x)].filter(Boolean).join(' · ')])) : h('li', { class: 'home-ct__none' }, 'Документов нет.')));
    }

    function renderRisks(panel) {
        const items = data.contracts.filter(x => !x.closed).flatMap(x => [
            ...CC.warnings(x).filter(w => w.level >= 2).map(w => rowEl([badge(w.level >= 3 ? 'Нарушение' : 'Внимание', w.level >= 3 ? 'overdue' : 'soon'), w.text], [CC.name(x)], [['Карточка', () => openCard(x)]])),
            ...x.risks.map(r => rowEl([badge(r.level === 'high' ? 'Высокий' : r.level === 'medium' ? 'Средний' : 'Низкий', r.level === 'high' ? 'overdue' : 'soon'), r.text], [[CC.name(x), r.kind, r.measure && 'мера: ' + r.measure].filter(Boolean).join(' · ')], [['Карточка', () => openCard(x)]]))]);
        panel.appendChild(h('ul', { class: 'home-ct__list' }, items.length ? items : h('li', { class: 'home-ct__none' }, 'Рисков нет. «Выявить риски» отправит открытый договор специалисту; ответ сохраняется в карточку.')));
    }

    function renderHistory(panel, c) {
        const items = (c ? [c] : data.contracts).flatMap(x => (x.log || []).map(l => ({ ...l, x }))).sort((a, b) => b.at - a.at).slice(0, 60);
        panel.appendChild(h('ul', { class: 'home-ct__history' }, items.length ? items.map(l => h('li', {}, h('span', { class: 'home-ct__history-date' }, new Date(l.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })), h('span', {}, `${c ? '' : CC.name(l.x) + ': '}${l.text}`))) : h('li', {}, 'Истории нет.')));
    }

    // Changes of the card on this page, in another tab or in the cabinet are shown here
    window.addEventListener('storage', ev => { if (ev.key === CC.STORE_KEY || ev.key === 'airchitect-contract-specialist-v1') render(); });
    document.addEventListener('contractschange', ev => { if (!ev.detail || ev.detail.source !== 'workspace') render(); });
    document.addEventListener('contractselect', render);
    render();
});
