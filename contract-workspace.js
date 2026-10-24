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
        if (!c) notify('Выберите договор в «Мои договоры» или создайте карточку.');
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
        tab = 'obligations';
        render();
        document.dispatchEvent(new Event('contractselect'));
    }

    // ---- Layout ----------------------------------------------------------------------------------

    const fileInput = h('input', { type: 'file', accept: '.pdf,.docx,.txt', hidden: true, onchange: ev => { if (ev.target.files[0]) createFromFile(ev.target.files[0]); ev.target.value = ''; } });
    const root = h('section', { class: 'home-ws home-ws--contracts', 'aria-label': 'Рабочее пространство договорного специалиста' });
    layout.before(root);
    root.appendChild(fileInput);

    const ACTIONS = [
        ['Проверить договор', () => { const c = needContract(); if (c) askChat(`Проверь договор: стороны, предмет, цена и сроки, финансовые условия, ответственность сторон, порядок оплаты и приёмки, приложения. Выдели юридические и финансовые риски и сформируй краткое заключение.${c.file ? ' Приложи файл договора к сообщению для полной проверки текста.' : ''}`); }],
        ['Создать карточку договора', () => fileInput.click()],
        ['Показать обязательства', () => { tab = 'obligations'; onlyPayments = false; render(); }],
        ['Проверить сроки оплаты', () => { tab = 'deadlines'; onlyPayments = true; render(); }],
        ['Выявить риски', () => { const c = needContract(); if (c) askChat('Выяви договорные, финансовые и организационные риски по договору с учётом предупреждений системы и предложи меры их снижения. Отдели риски, подтверждённые условиями договора, от предположений.'); }],
        ['Подготовить дополнительное соглашение', () => { const c = needContract(); if (c) openCard(c, 'amendment'); }],
        ['Подготовить уведомление', () => { const c = needContract(); if (c) openCard(c, 'notice'); }],
        ['Подготовить претензию', () => { const c = needContract(); if (c) openCard(c, 'claim'); }],
        ['Проверить готовность к закрытию', () => { tab = 'contracts'; render(); setTimeout(() => { const el = root.querySelector('[data-ws-ready]'); if (el) el.scrollIntoView({ block: 'center' }); }, 50); }]
    ];
    const TEAM = [
        ['Юрист', 'construction-lawyer', 'Правовая экспертиза условий, претензии, ответственность, изменение и расторжение договора.'],
        ['Финансист', 'financier', 'Авансы, платежи, удержания, денежный поток и финансовые риски по договору.'],
        ['Инженер ПТО', 'pto-engineer', 'Объёмы работ, техническая и исполнительная документация, приёмка.'],
        ['Специалист по безопасности', 'security-specialist', 'Проверка контрагента и связанных рисков.'],
        ['Тендерный специалист', 'tender-specialist', 'Условия закупки, по которой заключён договор.'],
        ['Руководитель проекта', 'project-manager', 'Состояние договора, просроченные обязательства и задачи руководителя.']
    ];
    const TABS = [['contracts', 'Мои договоры'], ['obligations', 'Обязательства'], ['deadlines', 'Сроки'], ['documents', 'Документы'], ['risks', 'Риски'], ['history', 'История']];

    function render() {
        data = CC.read();
        data.contracts.forEach(CC.ensure);
        const c = selectedContract();
        root.textContent = '';
        root.appendChild(fileInput);
        const select = h('select', { 'aria-label': 'Договор', onchange: ev => { CC.select(ev.target.value); const x = data.contracts.find(y => y.id === ev.target.value); if (x) openCard(x); else render(); } },
            h('option', { value: '' }, data.contracts.length ? '— выберите договор —' : 'Договоров пока нет'), data.contracts.map(x => h('option', { value: x.id, selected: c && x.id === c.id }, `${CC.name(x)}${x.subject ? ' — ' + x.subject : ''}${x.closed ? ' (закрыт)' : ''}`)));
        root.append(
            h('div', { class: 'home-ws__head' }, h('div', {}, h('p', { class: 'home-eyebrow' }, 'Договорной специалист'), h('h3', { class: 'home-ws__title' }, 'Сопровождение договоров от подписания до окончательного расчёта')),
                h('div', { class: 'home-ws__pick' }, select, h('button', { type: 'button', class: 'home-btn home-btn--primary home-cab__small', onclick: () => askChat('') }, 'Диалог со специалистом'))),
            h('div', { class: 'home-ws__actions' }, ACTIONS.map(([l, fn]) => h('button', { type: 'button', class: 'home-chat__action', onclick: fn }, l))),
            h('div', { class: 'home-tabs', role: 'tablist', 'aria-label': 'Рабочие вкладки' }, TABS.map(([k, l]) => h('button', { type: 'button', role: 'tab', class: 'home-tab', 'aria-selected': String(k === tab), onclick: () => { tab = k; if (k !== 'deadlines') onlyPayments = false; render(); } }, l))));
        const panel = h('div', { class: 'home-ws__panel' });
        root.appendChild(panel);
        ({ contracts: renderContracts, obligations: renderObligations, deadlines: renderDeadlines, documents: renderDocuments, risks: renderRisks, history: renderHistory })[tab](panel, c);
        if (c) root.appendChild(h('div', { class: 'home-ws__team' }, h('p', { class: 'home-dialog__label' }, 'Подключить специалиста к договору'), h('div', { class: 'home-ws__actions' },
            TEAM.map(([l, slug, task]) => h('button', { type: 'button', class: 'home-chat__action', title: task, onclick: () => {
                if (typeof window.AirchitectOpenSpecialist === 'function') window.AirchitectOpenSpecialist(slug, `${CC.context(c)}\n\nЗадача от договорного специалиста: ${task}\n\nВопрос: `);
            } }, l)))));
        root.appendChild(h('p', { class: 'home-note' }, 'Договорной специалист работает с карточками договоров ниже: изменения сразу видны в карточке. Срок без сведений об исполнении отмечается как «Требует подтверждения», а не как нарушение.'));
    }

    function stats(c) {
        const s = c.obligations.map(CC.obligationStatus);
        const n = k => s.filter(x => x === k).length;
        return `обязательств ${c.obligations.length} · исполнено ${n('done')} · требуют подтверждения ${n('pastdue') + n('review')} · не исполнено ${n('overdue')}`;
    }

    function renderContracts(panel, c) {
        const active = data.contracts.filter(x => !x.closed);
        const closed = data.contracts.filter(x => x.closed);
        const list = (items, empty) => h('ul', { class: 'home-ct__list' }, items.length ? items.map(x => rowEl([x.id === (c && c.id) ? badge('Выбран', 'done') : null, `${CC.name(x)}${x.subject ? ' · ' + x.subject : ''}`],
            [[x.customer && `Заказчик: ${x.customer}`, x.contractor && `Подрядчик: ${x.contractor}`, x.price && `цена ${x.price}`, x.end && `окончание ${formatDate(x.end)}`].filter(Boolean).join(' · '), stats(x), CC.warnings(x).filter(w => w.level >= 2).length ? `Предупреждений: ${CC.warnings(x).filter(w => w.level >= 2).length}` : ''],
            [['Открыть карточку', () => openCard(x)]])) : h('li', { class: 'home-ct__none' }, empty));
        panel.append(h('p', { class: 'home-dialog__label' }, 'Действующие'), list(active, 'Действующих договоров нет. Нажмите «Создать карточку договора» и загрузите файл.'), h('p', { class: 'home-dialog__label' }, 'Завершённые'), list(closed, 'Завершённых договоров нет.'));
        if (c) {
            const ready = CC.closeReadiness(c);
            panel.appendChild(h('div', { class: 'home-ws__ready', 'data-ws-ready': '' }, h('p', { class: 'home-dialog__label' }, `Готовность к закрытию: ${CC.name(c)} — ${ready.ready ? 'готов' : 'не готов'}`),
                h('ul', { class: 'home-ct__list' }, ready.items.map(i => rowEl([badge(i.ok ? 'Готово' : 'Не готово', i.ok ? 'done' : 'soon'), i.text], [])))));
        }
    }

    function renderObligations(panel, c) {
        const items = (c ? [c] : data.contracts).flatMap(x => x.obligations.map(o => ({ x, o, s: CC.obligationStatus(o) })))
            .sort((a, b) => ({ overdue: 0, pastdue: 1, soon: 2, review: 3, active: 4, done: 5 }[a.s] - { overdue: 0, pastdue: 1, soon: 2, review: 3, active: 4, done: 5 }[b.s]) || (a.o.due || '9').localeCompare(b.o.due || '9'));
        panel.appendChild(h('ul', { class: 'home-ct__list' }, items.length ? items.map(({ x, o, s }) => rowEl([badge(STATUS_LABEL[s], STATUS_TONE[s]), o.text],
            [`${PARTIES[o.party] || ''} · п. ${o.clause || '—'} · ${o.due ? 'срок ' + formatDate(o.due) : o.condition || 'срок не указан'}${c ? '' : ' · ' + CC.name(x)}`, o.status === 'done' ? `Исполнено ${formatDate(o.doneAt)}${o.doneNote ? ' — ' + o.doneNote : ''}` : '', o.status === 'breached' ? `Не исполнено: ${o.breachBasis}` : ''],
            [...(!o.confirmed ? [['Подтвердить', () => { o.confirmed = true; x.log.unshift({ at: Date.now(), text: `Подтверждено обязательство (п. ${o.clause || '—'}) договорным специалистом` }); save(); render(); }]] : []),
                ...(o.status !== 'done' ? [['Исполнено', () => ask('Подтвердить исполнение', [{ name: 'date', label: 'Дата исполнения', type: 'date', value: CC.today(), required: true }, { name: 'note', label: 'Подтверждение (документ, письмо)', required: true }], v => { Object.assign(o, { status: 'done', doneAt: v.date, doneNote: v.note }); x.log.unshift({ at: Date.now(), text: `Исполнено (п. ${o.clause || '—'}): ${o.text.slice(0, 80)} — ${v.note}` }); })]] : []),
                ...(o.status !== 'done' && o.status !== 'breached' && o.confirmed ? [['Не исполнено', () => ask('Обязательство не исполнено', [{ name: 'date', label: 'Дата фиксации', type: 'date', value: CC.today(), required: true }, { name: 'basis', label: 'Чем подтверждается неисполнение', type: 'textarea', required: true }], v => { Object.assign(o, { status: 'breached', breachAt: v.date, breachBasis: v.basis }); x.log.unshift({ at: Date.now(), text: `Отмечено неисполнение (п. ${o.clause || '—'}): ${v.basis}` }); })]] : [])])) : h('li', { class: 'home-ct__none' }, 'Обязательств нет.')));
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

    function renderRisks(panel, c) {
        if (!c) { panel.appendChild(h('p', { class: 'home-staff__empty' }, 'Выберите договор.')); return; }
        const w = CC.warnings(c).filter(x => x.level >= 2);
        panel.appendChild(h('ul', { class: 'home-ct__list' },
            ...w.map(x => rowEl([badge(x.level >= 3 ? 'Нарушение' : 'Внимание', x.level >= 3 ? 'overdue' : 'soon'), x.text], ['Предупреждение системы по данным карточки'])),
            ...c.risks.map(x => rowEl([badge(x.level === 'high' ? 'Высокий' : x.level === 'medium' ? 'Средний' : 'Низкий', x.level === 'high' ? 'overdue' : 'soon'), x.text], [[x.kind, x.measure && 'мера: ' + x.measure, x.source].filter(Boolean).join(' · ')])),
            ...c.analyses.slice(0, 3).map(x => rowEl([badge('Заключение', 'review'), `${x.by}, ${new Date(x.at).toLocaleDateString('ru-RU')}`], [x.text.slice(0, 400) + (x.text.length > 400 ? '…' : '')])),
            !w.length && !c.risks.length && !c.analyses.length ? h('li', { class: 'home-ct__none' }, 'Рисков пока нет. Нажмите «Выявить риски» — ответ специалиста можно сохранить в карточку.') : null));
        panel.appendChild(h('div', { class: 'home-ct__actions' }, h('button', { type: 'button', class: 'home-btn home-btn--secondary home-cab__small', onclick: () => ask('Риск по договору', [{ name: 'text', label: 'Риск', type: 'textarea', required: true }, { name: 'measure', label: 'Мера снижения' }, { name: 'source', label: 'Источник (пункт договора, заключение)' }], v => { c.risks.push({ id: CC.uid(), at: Date.now(), kind: 'Договорной', level: 'medium', ...v }); c.log.unshift({ at: Date.now(), text: `Добавлен риск: ${v.text.slice(0, 80)}` }); }) }, 'Добавить риск')));
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
