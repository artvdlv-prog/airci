// Cash flow (cashflow.html): plan-fact of receipts and payments by contracts, objects and the company,
// payment calendar, balance forecast and cash gaps, scenarios, receivables and payables, advances and
// retentions, financier's recommendations and Excel export. Calculations: cashflow-core.js.
// Data is kept in this browser (localStorage). Not an accounting system.

document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('[data-cashflow]');
    if (!root || !window.AirchitectCashflow) return;
    const C = window.AirchitectCashflow;
    const { money, num, today, CATEGORIES, PRIORITIES, STATUS } = C;
    const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    const CONTRACTS_KEY = 'airchitect-contracts-v1';
    const OBJECTS_KEY = 'airchitect-objects-v1';
    const STATUS_BADGE = { planned: 'review', soon: 'soon', overdue: 'overdue', paid: 'done' };

    let data = C.read();
    const save = () => { if (!C.write(data)) notify('Не удалось сохранить данные в браузере.'); };
    const readStore = (key, fallback) => {
        try {
            return JSON.parse(localStorage.getItem(key)) || fallback;
        } catch (e) {
            return fallback;
        }
    };
    const contracts = () => readStore(CONTRACTS_KEY, { contracts: [] }).contracts;
    const objects = () => readStore(OBJECTS_KEY, { objects: [] }).objects;
    const contractName = c => (c ? `№ ${c.number || 'без номера'}${c.subject ? ' — ' + c.subject : ''}` : '');
    const formatDate = d => (d ? d.split('-').reverse().join('.') : '');
    const short = v => {
        const a = Math.abs(v);
        if (a >= 1e6) return `${(v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`;
        if (a >= 1e3) return `${Math.round(v / 1e3).toLocaleString('ru-RU')} тыс.`;
        return String(Math.round(v));
    };

    let tab = new URLSearchParams(location.search).get('tab') || 'overview';
    let scope = new URLSearchParams(location.search).get('scope') || 'all';

    function h(tag, attrs = {}, ...children) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (v === undefined || v === null || v === false) return;
            if (k === 'class') node.className = v;
            else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
            else node.setAttribute(k, v === true ? '' : v);
        });
        children.flat().forEach(c => { if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : document.createTextNode(c)); });
        return node;
    }
    const svg = (tag, attrs = {}) => {
        const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
        return node;
    };

    function notify(text) {
        const toast = h('div', { class: 'home-ct__toast', role: 'status' }, text);
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // ---- Dialog (same markup as Контракты) -------------------------------------------------

    const dialog = document.querySelector('[data-ct-dialog]');
    const dialogTitle = dialog.querySelector('[data-ct-dialog-title]');
    const dialogBody = dialog.querySelector('[data-ct-dialog-body]');
    const dialogFoot = dialog.querySelector('[data-ct-dialog-foot]');
    const dialogError = dialog.querySelector('[data-ct-dialog-error]');
    dialog.querySelector('[data-ct-dialog-close]').addEventListener('click', () => dialog.close());

    function openDialog(title, fields, submitLabel, onSubmit) {
        dialogTitle.textContent = title;
        dialogBody.textContent = '';
        dialogError.hidden = true;
        fields.forEach(f => {
            let input;
            if (f.type === 'select') {
                input = h('select', { name: f.name, required: f.required },
                    f.options.map(([value, label]) => h('option', { value, selected: String(value) === String(f.value ?? '') }, label)));
            } else if (f.type === 'textarea') {
                input = h('textarea', { name: f.name, rows: f.rows || 3 });
                input.value = f.value || '';
            } else if (f.type === 'checkbox') {
                input = h('input', { type: 'checkbox', name: f.name, checked: !!f.value });
            } else {
                input = h('input', { type: f.type || 'text', name: f.name, required: f.required, step: f.step, min: f.min });
                input.value = f.value ?? '';
            }
            dialogBody.appendChild(h('label', { class: 'home-dialog__field' + (f.type === 'checkbox' ? ' home-cf__check' : '') },
                f.type === 'checkbox' ? [input, h('span', { class: 'home-dialog__label' }, f.label)] : [h('span', { class: 'home-dialog__label' }, f.label + (f.required ? ' *' : '')), input],
                f.hint ? h('span', { class: 'home-dialog__hint' }, f.hint) : null));
        });
        dialogFoot.textContent = '';
        dialogFoot.append(
            h('button', { type: 'button', class: 'home-btn home-btn--secondary', onclick: () => dialog.close() }, 'Отмена'),
            h('button', {
                type: 'submit', class: 'home-btn home-btn--primary', onclick: e => {
                    e.preventDefault();
                    const form = dialog.querySelector('form');
                    if (!form.reportValidity()) return;
                    const values = {};
                    fields.forEach(f => {
                        const input = form.elements[f.name];
                        values[f.name] = f.type === 'checkbox' ? input.checked : input.value.trim();
                    });
                    const error = onSubmit(values);
                    if (error) {
                        dialogError.textContent = error;
                        dialogError.hidden = false;
                        return;
                    }
                    dialog.close();
                    save();
                    render();
                }
            }, submitLabel));
        dialog.showModal();
    }

    // ---- Operations ---------------------------------------------------------------------

    // Payment obligations of the customer found in Контракты: their dates can be used as the plan
    function paymentObligations() {
        return contracts().flatMap(c => c.obligations
            .filter(o => o.party === 'customer' && /оплат|аванс|платеж|платёж|перечисл/i.test(o.text))
            .map(o => ({ contract: c, o })));
    }

    function editOp(op, dir) {
        const isNew = !op;
        op = op || C.blankOp({ dir, category: dir === 'in' ? 'work' : 'subcontract', contractId: scope.startsWith('c:') ? scope.slice(2) : '', objectId: scope.startsWith('o:') ? scope.slice(2) : '' });
        const d = op.dir;
        const obligations = d === 'in' ? paymentObligations() : [];
        const fields = [
            { name: 'title', label: 'Назначение', value: op.title, required: true },
            { name: 'category', label: 'Статья', type: 'select', value: op.category, options: Object.entries(CATEGORIES[d]) },
            { name: 'counterparty', label: d === 'in' ? 'Плательщик' : 'Получатель', value: op.counterparty },
            { name: 'contractId', label: 'Договор', type: 'select', value: op.contractId, options: [['', '— без договора —'], ...contracts().map(c => [c.id, contractName(c)])] },
            { name: 'objectId', label: 'Объект', type: 'select', value: op.objectId, options: [['', '— без объекта —'], ...objects().map(o => [o.id, o.name])] }
        ];
        if (obligations.length) fields.push({ name: 'obligationId', label: 'Срок оплаты из обязательств договора', type: 'select', value: op.obligationId, options: [['', '— не выбрано —'], ...obligations.map(x => [x.o.id, `${contractName(x.contract)}: ${x.o.text.slice(0, 70)}${x.o.due ? ' (до ' + formatDate(x.o.due) + ')' : ''}`])], hint: 'Дата и договор подставятся из «Контрактов», если не указаны.' });
        fields.push(
            { name: 'date', label: 'Плановая дата', type: 'date', value: op.date },
            { name: 'amount', label: 'Сумма к оплате, ₽', type: 'number', step: '0.01', min: '0', value: op.amount || '', hint: d === 'in' ? 'Для оплаты работ можно указать стоимость по акту, зачёт аванса и удержание — сумма рассчитается.' : '' });
        if (d === 'in') fields.push(
            { name: 'gross', label: 'Стоимость работ по акту, ₽', type: 'number', step: '0.01', min: '0', value: op.gross || '' },
            { name: 'advanceOffset', label: 'Зачёт аванса, ₽', type: 'number', step: '0.01', min: '0', value: op.advanceOffset || '' },
            { name: 'retention', label: 'Гарантийное удержание, ₽', type: 'number', step: '0.01', min: '0', value: op.retention || '' });
        if (d === 'out') fields.push({ name: 'priority', label: 'Приоритет платежа', type: 'select', value: isNew ? 'normal' : op.priority, options: Object.entries(PRIORITIES), hint: 'Обязательные: оплата труда, налоги, кредиты. «Можно перенести» учитывается в рекомендациях по разрывам.' });
        fields.push(
            { name: 'basis', label: 'Документ-основание', value: op.basis, hint: d === 'in' ? 'Например: акт КС-2 № 5 и справка КС-3 от 10.10.2026, график платежей договора' : 'Например: счёт № 118, УПД, график платежей субподряда' },
            { name: 'confirmed', label: 'Основание подтверждено (документ подписан или выставлен)', type: 'checkbox', value: op.confirmed },
            { name: 'note', label: 'Комментарий', type: 'textarea', rows: 2, value: op.note });

        openDialog(isNew ? (d === 'in' ? 'Плановое поступление' : 'Плановый платёж') : 'Изменить операцию', fields, 'Сохранить', v => {
            const link = obligations.find(x => x.o.id === v.obligationId);
            const gross = num(v.gross);
            const amount = d === 'in' && gross > 0 ? gross - num(v.advanceOffset) - num(v.retention) : num(v.amount);
            if (amount <= 0) return 'Укажите сумму к оплате (или стоимость работ по акту).';
            const date = v.date || (link && link.o.due) || '';
            if (!date) return 'Укажите плановую дату.';
            Object.assign(op, {
                title: v.title, category: v.category, counterparty: v.counterparty || (link && link.contract.customer) || '',
                contractId: v.contractId || (link && link.contract.id) || '', objectId: v.objectId, obligationId: v.obligationId || '',
                date, amount, gross, advanceOffset: num(v.advanceOffset), retention: num(v.retention), basis: v.basis, confirmed: v.confirmed, note: v.note,
                priority: d === 'out' ? (C.CRITICAL_CATEGORIES.includes(v.category) && v.priority === 'normal' && isNew ? 'critical' : v.priority) : 'normal'
            });
            if (isNew) data.ops.push(op);
            return null;
        });
    }

    function addPayment(op) {
        openDialog(op.dir === 'in' ? 'Поступление оплаты' : 'Оплата платежа', [
            { name: 'date', label: 'Дата оплаты', type: 'date', value: today(), required: true },
            { name: 'amount', label: 'Сумма, ₽', type: 'number', step: '0.01', min: '0', value: C.restOf(op) || '', required: true },
            { name: 'doc', label: 'Платёжный документ', hint: 'Номер платёжного поручения или выписки' }
        ], 'Записать оплату', v => {
            if (num(v.amount) <= 0) return 'Укажите сумму.';
            op.payments = op.payments || [];
            op.payments.push({ id: C.uid(), date: v.date, amount: num(v.amount), doc: v.doc });
            return null;
        });
    }

    function removeOp(op) {
        if (!confirm('Удалить операцию из плана?')) return;
        data.ops = data.ops.filter(x => x !== op);
        save();
        render();
    }

    // Payment reminder to the customer: a draft in the contract's notice journal (Контракты)
    function paymentNotice(op) {
        const store = readStore(CONTRACTS_KEY, { contracts: [] });
        const contract = store.contracts.find(c => c.id === op.contractId);
        if (!contract) return notify('Привяжите операцию к договору из «Контрактов».');
        const rest = C.restOf(op);
        const text = [
            `Кому: ${contract.customer || op.counterparty || '________'}`,
            `От: ${contract.contractor || '________'}`,
            `Исх. № ____ от ${formatDate(today())}`,
            '',
            'УВЕДОМЛЕНИЕ О НЕОБХОДИМОСТИ ОПЛАТЫ',
            '',
            `В рамках договора${contract.number ? ' № ' + contract.number : ''}${contract.date ? ' от ' + formatDate(contract.date) : ''}${contract.subject ? ' (' + contract.subject + ')' : ''} сообщаем, что оплата ${op.title ? '«' + op.title + '» ' : ''}в сумме ${money(rest)} по сроку ${formatDate(op.date)} не поступила.`,
            op.basis ? `Основание: ${op.basis}.` : 'Основание: ________',
            '',
            'Просим произвести оплату в срок до ________ либо сообщить о причинах задержки.',
            '',
            'Приложения: ________',
            '',
            'Должность ________ / ФИО ________ / подпись'
        ].join('\n');
        contract.notices.unshift({ id: C.uid(), type: 'payment', obligationId: op.obligationId || '', clause: '', addressee: contract.customer || op.counterparty || '', due: '', status: 'draft', created: Date.now(), text });
        contract.log.unshift({ at: Date.now(), text: `Подготовлен проект: Уведомление о необходимости оплаты (${money(rest)}) — из раздела ДДС` });
        try {
            localStorage.setItem(CONTRACTS_KEY, JSON.stringify(store));
        } catch (e) {
            return notify('Не удалось сохранить уведомление.');
        }
        op.noticeAt = Date.now();
        save();
        render();
        notify('Проект уведомления добавлен в журнал уведомлений договора в «Контрактах».');
    }

    // ---- Scope: company, a contract or an object ------------------------------------------

    const scoped = () => data.ops.filter(op => scope === 'all' || (scope.startsWith('c:') && op.contractId === scope.slice(2)) || (scope.startsWith('o:') && op.objectId === scope.slice(2)));
    const isCompany = () => scope === 'all';

    // Company: forecast from the account balance. Contract/object: from the actual net flow (saldo)
    function scopedForecast(scenario = {}, shifts = {}) {
        const ops = scoped();
        if (isCompany()) return C.forecast(data, { scenario, shifts });
        const saldo = ops.reduce((s, op) => s + (op.payments || []).filter(p => p.date <= today()).reduce((a, p) => a + (op.dir === 'in' ? 1 : -1) * num(p.amount), 0), 0);
        return C.forecast({ ...data, settings: { ...data.settings, minBalance: 0 } }, { ops, scenario, shifts, start: saldo });
    }

    function renderScope() {
        const select = root.querySelector('[data-cf-scope]');
        select.textContent = '';
        [['all', 'Компания — все операции'], ...contracts().map(c => [`c:${c.id}`, `Договор ${contractName(c)}`]), ...objects().map(o => [`o:${o.id}`, `Объект: ${o.name}`])]
            .forEach(([v, l]) => select.appendChild(h('option', { value: v, selected: v === scope }, l)));
        if (select.value !== scope) scope = 'all';
    }

    // ---- Rendering --------------------------------------------------------------------------

    const panel = root.querySelector('[data-cf-panel]');
    const alertBox = root.querySelector('[data-cf-alert]');
    const TABS = [['overview', 'Обзор'], ['calendar', 'Платёжный календарь'], ['debts', 'Задолженность'], ['planfact', 'План-факт'], ['scenario', 'Сценарии'], ['advice', 'Финансист']];

    function render() {
        renderScope();
        const tabs = root.querySelector('[data-cf-tabs]');
        tabs.textContent = '';
        TABS.forEach(([key, label]) => tabs.appendChild(h('button', { type: 'button', role: 'tab', class: 'home-tab', 'aria-selected': String(key === tab), onclick: () => { tab = key; render(); } }, label)));
        renderAlert();
        panel.textContent = '';
        ({ overview: renderOverview, calendar: renderCalendar, debts: renderDebts, planfact: renderPlanFact, scenario: renderScenario, advice: renderAdvice })[tab]();
    }

    // Notifications: upcoming payments, overdue items and forecast gaps
    function renderAlert() {
        const ops = scoped();
        const overdue = ops.filter(op => C.statusOf(op) === 'overdue');
        const soonOut = ops.filter(op => op.dir === 'out' && C.statusOf(op) === 'soon');
        const f = scopedForecast();
        const parts = [];
        if (f.gaps.length) parts.push(`Прогноз: кассовый разрыв с ${formatDate(f.gaps[0].start)}, до ${money(f.gaps[0].deficit)}.`);
        if (overdue.length) parts.push(`Просрочено операций: ${overdue.length} на ${money(overdue.reduce((s, op) => s + C.restOf(op), 0))}.`);
        if (soonOut.length) parts.push(`Платежи в ближайшие ${C.SOON_DAYS} дней: ${soonOut.length} на ${money(soonOut.reduce((s, op) => s + C.restOf(op), 0))}.`);
        alertBox.hidden = !parts.length;
        alertBox.className = 'home-ct__alert' + (f.gaps.length || overdue.length ? ' home-ct__alert--overdue' : '');
        alertBox.textContent = parts.join(' ');
    }

    const stat = (label, value, hint) => h('li', {}, h('span', { class: 'home-ct__stat-value' }, value), h('span', { class: 'home-ct__stat-label' }, label), hint ? h('span', { class: 'home-cf__stat-hint' }, hint) : null);
    const block = (title, ...content) => h('section', { class: 'home-ct__block' }, h('div', { class: 'home-ct__block-head' }, h('h3', { class: 'home-ct__block-title' }, title)), ...content);
    const blockWith = (title, tools, ...content) => h('section', { class: 'home-ct__block' }, h('div', { class: 'home-ct__block-head' }, h('h3', { class: 'home-ct__block-title' }, title), tools), ...content);

    function renderOverview() {
        const ops = scoped();
        if (!data.ops.length) {
            panel.appendChild(h('div', { class: 'home-staff__panel' }, h('p', { class: 'home-staff__empty' },
                'Операций пока нет. Укажите остаток на счетах, добавьте плановые поступления и платежи по договорам и объектам или откройте демо-данные.')));
            panel.appendChild(openingForm());
            return;
        }
        const f = scopedForecast();
        const d = C.debts(ops);
        const bal = isCompany() ? C.currentBalance(data) : { balance: f.start.balance, hasOpening: true };
        panel.appendChild(h('ul', { class: 'home-ct__stats' },
            stat(isCompany() ? 'Остаток на счетах' : 'Сальдо (факт)', bal.hasOpening ? money(bal.balance) : 'не указан', 'факт'),
            stat('Минимум прогноза', money(f.low.balance), `прогноз, ${formatDate(f.low.date)}`),
            stat('Кассовые разрывы', String(f.gaps.length), f.gaps.length ? `до ${money(Math.max(...f.gaps.map(g => g.deficit)))}` : 'прогноз'),
            stat('Дебиторская просроченная', money(d.sum(d.receivable.overdue)), 'подтверждённая'),
            stat('Кредиторская просроченная', money(d.sum(d.payable.overdue)), 'подтверждённая'),
            stat(`Платежи за ${C.SOON_DAYS} дней`, money(ops.filter(op => op.dir === 'out' && ['soon', 'overdue'].includes(C.statusOf(op))).reduce((s, op) => s + C.restOf(op), 0)), 'план')));
        if (isCompany() && !bal.hasOpening) panel.appendChild(h('div', { class: 'home-ct__alert' }, 'Остаток на счетах не указан: прогноз показывает только изменение денежных средств от нуля. Укажите остаток ниже.'));

        const chart = h('div', { class: 'home-cf__chart' });
        panel.appendChild(block(isCompany() ? 'Прогноз остатка денежных средств' : 'Прогноз сальдо', chart,
            h('p', { class: 'home-tn__group-note home-cf__chart-note' }, `От ${formatDate(f.now)} до ${formatDate(f.end)}. Просроченные операции перенесены на сегодня.${isCompany() && num(data.settings.minBalance) ? ' Пунктир — минимальный остаток ' + money(data.settings.minBalance) + '.' : ''}`)));
        lineChart(chart, [{ name: 'Прогноз', color: 'var(--cf-in)', points: f.points }], f);

        panel.appendChild(block('Кассовые разрывы', gapList(f)));

        const months = h('div', { class: 'home-cf__chart' });
        panel.appendChild(block('Поступления и платежи по месяцам', months,
            h('p', { class: 'home-tn__group-note home-cf__chart-note' }, 'Сплошная заливка — факт (записанные оплаты), светлая — оставшийся план.')));
        barChart(months, C.monthly(ops, C.addMonths(today(), -3), f.end));

        if (isCompany()) panel.appendChild(openingForm());
    }

    function gapList(f) {
        if (!f.gaps.length) return h('p', { class: 'home-staff__empty home-cf__pad' }, `В горизонте прогноза остаток не опускается ниже ${money(f.min)}.`);
        return h('ul', { class: 'home-ct__list' }, f.gaps.map(g => h('li', { class: 'home-ct__row' }, h('div', { class: 'home-ct__row-main' },
            h('p', { class: 'home-ct__row-title' }, h('span', { class: 'home-ct__badge home-ct__badge--overdue' }, `−${money(g.deficit)}`),
                `${formatDate(g.start)} — ${g.end ? formatDate(g.end) : 'не закрывается в горизонте прогноза'}`),
            h('p', { class: 'home-ct__row-meta' }, `Наименьший остаток ${money(g.low)} на ${formatDate(g.lowDate)}.`),
            g.payments.length ? h('p', { class: 'home-ct__row-meta' }, 'Причины — платежи: ' + g.payments.map(e => `${e.op.title} ${money(e.amount)} (${formatDate(e.date)}${e.overdue ? ', просрочен' : ''})`).join('; ') + '.') : null,
            g.expected.length ? h('p', { class: 'home-ct__row-meta' }, 'Поступления позже начала разрыва: ' + g.expected.map(e => `${e.op.title} ${money(e.amount)} (${formatDate(e.date)}${e.op.confirmed ? '' : ', не подтверждено'})`).join('; ') + '.') : null,
            g.overdueIn.length ? h('p', { class: 'home-ct__row-meta' }, `Просроченные поступления: ${g.overdueIn.length} на ${money(g.overdueIn.reduce((s, op) => s + C.restOf(op), 0))}.`) : null))));
    }

    function openingForm() {
        const s = data.settings;
        const form = h('form', { class: 'home-ct__form' },
            h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, 'Остаток на счетах, ₽'), h('input', { type: 'number', name: 'opening', step: '0.01', value: s.opening }),
                h('span', { class: 'home-dialog__hint' }, 'По банковской выписке')),
            h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, 'На дату'), h('input', { type: 'date', name: 'openingDate', value: s.openingDate || today() }),
                h('span', { class: 'home-dialog__hint' }, 'Оплаты после этой даты изменяют остаток')),
            h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, 'Минимальный остаток, ₽'), h('input', { type: 'number', name: 'minBalance', step: '0.01', value: s.minBalance || 0 }),
                h('span', { class: 'home-dialog__hint' }, 'Ниже этого уровня — кассовый разрыв')),
            h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, 'Горизонт прогноза'),
                h('select', { name: 'horizon' }, [3, 6, 12].map(m => h('option', { value: m, selected: num(s.horizon) === m }, `${m} мес.`)))),
            h('div', { class: 'home-ct__wide' }, h('button', { type: 'submit', class: 'home-btn home-btn--primary' }, 'Сохранить')));
        form.addEventListener('submit', e => {
            e.preventDefault();
            data.settings = { opening: form.elements.opening.value, openingDate: form.elements.openingDate.value, minBalance: num(form.elements.minBalance.value), horizon: num(form.elements.horizon.value) };
            save();
            render();
            notify('Сохранено.');
        });
        return block('Остаток и параметры прогноза', h('div', { class: 'home-cf__pad' }, form));
    }

    // ---- Payment calendar ----------------------------------------------------------------

    const filters = { dir: 'all', period: '30', status: 'open' };

    function opRow(op, extra) {
        const s = C.statusOf(op);
        const contract = contracts().find(c => c.id === op.contractId);
        const object = objects().find(o => o.id === op.objectId);
        const paid = C.paidOf(op);
        const actions = [];
        if (s !== 'paid') actions.push([op.dir === 'in' ? 'Поступила оплата' : 'Оплачено', () => addPayment(op)]);
        if (op.dir === 'in' && s === 'overdue' && op.contractId) actions.push(['Уведомление заказчику', () => paymentNotice(op)]);
        actions.push(['Изменить', () => editOp(op)], ['Удалить', () => removeOp(op)]);
        return h('li', { class: 'home-ct__row' },
            h('div', { class: 'home-ct__row-main' },
                h('p', { class: 'home-ct__row-title' },
                    h('span', { class: `home-ct__badge home-ct__badge--${STATUS_BADGE[s]}` }, STATUS[s]),
                    h('span', { class: 'home-cf__dir home-cf__dir--' + op.dir }, op.dir === 'in' ? '+' : '−', money(C.restOf(op) || op.amount)), ' ', op.title),
                h('p', { class: 'home-ct__row-meta' }, [
                    formatDate(op.date), CATEGORIES[op.dir][op.category], op.counterparty,
                    contract ? `Договор ${contractName(contract)}` : '', object ? `Объект: ${object.name}` : '',
                    op.dir === 'out' && op.priority !== 'normal' ? PRIORITIES[op.priority] : ''
                ].filter(Boolean).join(' · ')),
                h('p', { class: 'home-ct__row-meta' }, [
                    `План ${money(op.amount)}`, paid ? `оплачено ${money(paid)}` : '',
                    op.gross ? `по акту ${money(op.gross)}, зачёт аванса ${money(op.advanceOffset)}, удержание ${money(op.retention)}` : '',
                    op.confirmed ? `основание: ${op.basis || 'подтверждено'}` : 'основание не подтверждено',
                    op.noticeAt ? 'уведомление подготовлено' : ''
                ].filter(Boolean).join(' · ')),
                (op.payments || []).length ? h('p', { class: 'home-ct__row-meta' }, 'Оплаты: ' + op.payments.map(p => `${formatDate(p.date)} ${money(p.amount)}${p.doc ? ' (' + p.doc + ')' : ''}`).join('; ')) : null,
                extra || null),
            h('div', { class: 'home-record__actions' }, actions.map(([label, fn]) => h('button', { type: 'button', onclick: fn }, label))));
    }

    function renderCalendar() {
        const sel = (name, options) => {
            const s = h('select', { 'aria-label': name, onchange: e => { filters[name] = e.target.value; render(); } }, options.map(([v, l]) => h('option', { value: v, selected: filters[name] === v }, l)));
            return s;
        };
        const tools = h('div', { class: 'home-ct__filters' },
            sel('dir', [['all', 'Все'], ['in', 'Поступления'], ['out', 'Платежи']]),
            sel('period', [['7', '7 дней'], ['30', '30 дней'], ['90', '90 дней'], ['all', 'Весь период']]),
            sel('status', [['open', 'К оплате'], ['overdue', 'Просроченные'], ['paid', 'Оплаченные'], ['all', 'Все']]));
        const now = today();
        const f = scopedForecast();
        const balanceAt = date => { let b = f.start.balance; f.points.forEach(p => { if (p.date <= date) b = p.balance; }); return b; };
        const items = scoped()
            .filter(op => filters.dir === 'all' || op.dir === filters.dir)
            .filter(op => {
                const s = C.statusOf(op);
                if (filters.status === 'open') return s !== 'paid';
                if (filters.status === 'all') return true;
                return s === filters.status;
            })
            .filter(op => filters.period === 'all' || C.statusOf(op) === 'overdue' || (op.date && C.daysBetween(now, op.date) <= num(filters.period)))
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const list = h('ul', { class: 'home-ct__list' });
        let lastDate = null;
        items.forEach(op => {
            const day = op.date < now && C.statusOf(op) !== 'paid' ? now : op.date;
            if (day !== lastDate && filters.status !== 'paid') {
                lastDate = day;
                list.appendChild(h('li', { class: 'home-cf__day' }, h('span', {}, day === now ? `Сегодня, ${formatDate(day)}` : formatDate(day)),
                    h('span', {}, `Остаток после дня (прогноз): ${money(balanceAt(day))}`)));
            }
            list.appendChild(opRow(op));
        });
        if (!items.length) list.appendChild(h('li', { class: 'home-ct__none' }, 'Нет операций по выбранным фильтрам.'));
        panel.appendChild(blockWith('Платёжный календарь', tools, list));
    }

    // ---- Receivables, payables, advances and retentions ---------------------------------------

    function renderDebts() {
        const d = C.debts(scoped());
        const list = (rows, empty) => h('ul', { class: 'home-ct__list' }, rows.length ? rows.map(r => opRow(r.op, r.status === 'overdue' ? h('p', { class: 'home-ct__row-meta home-tn__neg' }, `Просрочка ${r.days} дн.`) : null)) : h('li', { class: 'home-ct__none' }, empty));
        const head = (title, rows) => `${title}: ${money(d.sum(rows))}`;
        panel.appendChild(h('p', { class: 'home-note' }, 'Задолженность — только операции с подтверждённым основанием (подписанный акт, выставленный счёт, график договора). Неподтверждённые операции — план и потенциальный риск.'));
        panel.append(
            block(head('Дебиторская задолженность — просроченная', d.receivable.overdue), list(d.receivable.overdue, 'Нет.')),
            block(head('Дебиторская задолженность — срок не наступил', d.receivable.current), list(d.receivable.current, 'Нет.')),
            block(head('Кредиторская задолженность — просроченная', d.payable.overdue), list(d.payable.overdue, 'Нет.')),
            block(head('Кредиторская задолженность — срок не наступил', d.payable.current), list(d.payable.current, 'Нет.')),
            block(head('Потенциальные риски: срок прошёл, основание не подтверждено', [...d.receivable.unconfirmedOverdue, ...d.payable.unconfirmedOverdue]),
                list([...d.receivable.unconfirmedOverdue, ...d.payable.unconfirmedOverdue], 'Нет.')));

        const ar = C.advancesAndRetentions(scoped(), contracts());
        panel.appendChild(block('Авансы и гарантийные удержания', ar.length ? h('div', { class: 'home-cab__table-wrap' }, h('table', { class: 'home-cab__table' },
            h('thead', {}, h('tr', {}, ['Договор', 'Аванс получен (факт)', 'Зачтено в актах', 'Не зачтено', 'Удержано', 'Возвращено (факт)', 'К возврату'].map(c => h('th', {}, c)))),
            h('tbody', {}, ar.map(r => h('tr', {}, h('td', {}, r.contract ? contractName(r.contract) : 'Без договора'), ...[r.advanceReceived, r.advanceOffset, r.advanceLeft, r.retentionHeld, r.retentionReturned, r.retentionLeft].map(v => h('td', {}, money(v))))))))
            : h('p', { class: 'home-staff__empty home-cf__pad' }, 'Нет данных: авансы учитываются по статье «Аванс», зачёт аванса и удержания — в поступлениях за выполненные работы.')));
    }

    // ---- Plan-fact ----------------------------------------------------------------------------

    let grouping = 'contract';

    function planFactRows() {
        const cs = contracts();
        const os = objects();
        const keyOf = {
            company: () => 'Компания',
            contract: op => { const c = cs.find(x => x.id === op.contractId); return c ? `Договор ${contractName(c)}` : 'Без договора'; },
            object: op => { const o = os.find(x => x.id === op.objectId); return o ? o.name : 'Без объекта'; },
            category: op => `${op.dir === 'in' ? 'Поступления' : 'Платежи'}: ${CATEGORIES[op.dir][op.category]}`
        }[grouping];
        return C.planFact(scoped(), keyOf);
    }

    const PF_COLUMNS = ['Группа', 'Поступления: план', 'Поступления: факт', 'Остаток к получению', 'из него просрочено', 'Платежи: план', 'Платежи: факт', 'Остаток к оплате', 'из него просрочено', 'Перерасход', 'Чистый поток: факт'];
    const pfCells = r => [r.key, r.planIn, r.factIn, r.restIn, r.overdueIn, r.planOut, r.factOut, r.restOut, r.overdueOut, r.overspend, r.factIn - r.factOut];
    const PF_ALERT = [4, 8, 9];

    function renderPlanFact() {
        const tools = h('div', { class: 'home-ct__filters' }, h('select', { 'aria-label': 'Группировка', onchange: e => { grouping = e.target.value; render(); } },
            [['contract', 'По договорам'], ['object', 'По объектам'], ['category', 'По статьям'], ['company', 'По компании']].map(([v, l]) => h('option', { value: v, selected: grouping === v }, l))));
        const rows = planFactRows();
        panel.appendChild(blockWith('План-факт', tools, rows.length ? h('div', { class: 'home-cab__table-wrap' }, h('table', { class: 'home-cab__table' },
            h('thead', {}, h('tr', {}, PF_COLUMNS.map(c => h('th', {}, c)))),
            h('tbody', {}, rows.map(r => h('tr', {}, pfCells(r).map((v, i) => h('td', { class: PF_ALERT.includes(i) && v > 0 ? 'home-tn__neg' : '' }, i ? money(v) : v)))))))
            : h('p', { class: 'home-staff__empty home-cf__pad' }, 'Нет операций.'),
            h('p', { class: 'home-tn__group-note home-cf__chart-note' }, 'План — суммы плановых операций; факт — записанные оплаты на сегодня; просрочено — неоплаченный остаток с прошедшим сроком. Перерасход — оплачено больше плановой суммы платежа.')));
    }

    // ---- Scenarios ------------------------------------------------------------------------------

    function renderScenario() {
        const sc = data.scenario;
        const form = h('form', { class: 'home-ct__form' },
            h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, 'Задержка поступлений, дней'), h('input', { type: 'number', name: 'delayDays', min: '0', value: sc.delayDays })),
            h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, 'Рост расходов, %'), h('input', { type: 'number', name: 'expenseUpPct', step: '0.1', value: sc.expenseUpPct })),
            h('label', { class: 'home-dialog__field home-cf__check' }, h('input', { type: 'checkbox', name: 'excludeOverdueIn', checked: sc.excludeOverdueIn }), h('span', { class: 'home-dialog__label' }, 'Не учитывать просроченные поступления')),
            h('label', { class: 'home-dialog__field home-cf__check' }, h('input', { type: 'checkbox', name: 'onlyConfirmedIn', checked: sc.onlyConfirmedIn }), h('span', { class: 'home-dialog__label' }, 'Только подтверждённые поступления')),
            h('div', { class: 'home-ct__wide home-ct__info-actions' }, h('button', { type: 'submit', class: 'home-btn home-btn--primary' }, 'Рассчитать сценарий'),
                h('button', { type: 'button', class: 'home-btn home-btn--secondary', onclick: () => { data.scenario = { delayDays: 0, expenseUpPct: 0, excludeOverdueIn: false, onlyConfirmedIn: false }; save(); render(); } }, 'Сбросить')));
        form.addEventListener('submit', e => {
            e.preventDefault();
            data.scenario = { delayDays: num(form.elements.delayDays.value), expenseUpPct: num(form.elements.expenseUpPct.value), excludeOverdueIn: form.elements.excludeOverdueIn.checked, onlyConfirmedIn: form.elements.onlyConfirmedIn.checked };
            save();
            render();
        });
        panel.appendChild(block('Условия сценария', h('div', { class: 'home-cf__pad' }, form)));

        const base = scopedForecast();
        const alt = scopedForecast(sc);
        const maxGap = f => f.gaps.reduce((m, g) => Math.max(m, g.deficit), 0);
        panel.appendChild(h('div', { class: 'home-cab__table-wrap home-cf__compare' }, h('table', { class: 'home-cab__table' },
            h('thead', {}, h('tr', {}, ['Показатель (прогноз)', 'Базовый план', 'Сценарий'].map(c => h('th', {}, c)))),
            h('tbody', {}, [
                ['Минимальный остаток', money(base.low.balance) + ' · ' + formatDate(base.low.date), money(alt.low.balance) + ' · ' + formatDate(alt.low.date)],
                ['Остаток на конец горизонта', money(base.endBalance), money(alt.endBalance)],
                ['Кассовых разрывов', String(base.gaps.length), String(alt.gaps.length)],
                ['Наибольший разрыв', money(maxGap(base)), money(maxGap(alt))],
                ['Первый разрыв', base.gaps[0] ? formatDate(base.gaps[0].start) : '—', alt.gaps[0] ? formatDate(alt.gaps[0].start) : '—']
            ].map(r => h('tr', {}, r.map(c => h('td', {}, c))))))));
        const chart = h('div', { class: 'home-cf__chart' });
        panel.appendChild(block('Остаток: базовый план и сценарий', chart));
        lineChart(chart, [{ name: 'Базовый план', color: 'var(--cf-in)', points: base.points }, { name: 'Сценарий', color: 'var(--cf-out)', dash: true, points: alt.points }], alt);
        panel.appendChild(block('Разрывы в сценарии', gapList(alt)));
    }

    // ---- Financier's recommendations ------------------------------------------------------------

    function renderAdvice() {
        const ops = scoped();
        const plan = isCompany() ? C.deferralPlan(data, {}) : null;
        const f = plan ? plan.before : scopedForecast();
        const d = C.debts(ops);
        const now = today();

        // 1. Cash gaps
        const gapItems = [];
        if (!f.gaps.length) gapItems.push('По текущему плану кассовых разрывов в горизонте прогноза нет. Проверьте сценарий с задержкой поступлений во вкладке «Сценарии».');
        f.gaps.forEach(g => gapItems.push(`Разрыв ${formatDate(g.start)} — ${g.end ? formatDate(g.end) : 'не закрывается'}: не хватает до ${money(g.deficit)} (прогноз).`));
        if (plan && plan.moved.length) {
            gapItems.push(`Перенос платежей с приоритетом «Можно перенести» (${plan.moved.length} на ${money(plan.moved.reduce((s, m) => s + m.amount, 0))}) на даты после разрыва: ${plan.moved.map(m => `${m.op.title} — с ${formatDate(m.from)} на ${formatDate(m.to)}`).join('; ')}.`);
            gapItems.push(plan.financing > 0 ? `После переноса остаётся потребность в финансировании до ${money(plan.financing)} (прогноз). Варианты: овердрафт, кредитная линия, ускорение поступлений.` : 'Перенос этих платежей закрывает разрывы по прогнозу. Согласуйте новые сроки с получателями.');
        } else if (f.gaps.length) {
            gapItems.push(`Платежей с приоритетом «Можно перенести» до самой низкой точки разрыва нет. Потребность в финансировании — до ${money(Math.max(...f.gaps.map(g => g.deficit)))} (прогноз). Отметьте платежи, которые можно перенести, — расчёт обновится.`);
        }
        const critical = ops.filter(op => op.dir === 'out' && op.priority === 'critical' && C.restOf(op) > 0 && op.date && C.daysBetween(now, op.date) <= 30);
        if (critical.length) gapItems.push(`Обязательные платежи в ближайшие 30 дней (оплачивать в первую очередь): ${critical.map(op => `${op.title} ${money(C.restOf(op))} до ${formatDate(op.date)}`).join('; ')}.`);

        // 2. Receipts
        const inItems = [];
        d.receivable.overdue.forEach(r => inItems.push([`Просрочена оплата ${money(r.rest)}: ${r.op.title}${r.op.counterparty ? ' — ' + r.op.counterparty : ''}, ${r.days} дн. Основание: ${r.op.basis || 'подтверждено'}.`, r.op]));
        d.receivable.unconfirmedOverdue.forEach(r => inItems.push([`Срок поступления прошёл, но основание не подтверждено: ${r.op.title} ${money(r.rest)}. Проверьте подписание акта или выставление счёта — без этого требовать оплату преждевременно.`, null]));
        const nearIn = ops.filter(op => op.dir === 'in' && C.restOf(op) > 0 && op.date >= now && C.daysBetween(now, op.date) <= 14);
        if (nearIn.length) inItems.push([`Поступления в ближайшие 14 дней: ${nearIn.map(op => `${op.title} ${money(C.restOf(op))} (${formatDate(op.date)}${op.confirmed ? '' : ', не подтверждено'})`).join('; ')}. Проконтролируйте подписание актов и передачу исполнительной документации.`, null]);
        const ar = C.advancesAndRetentions(ops, contracts()).filter(r => r.retentionLeft > 0);
        ar.forEach(r => inItems.push([`Гарантийные удержания к возврату (${r.contract ? contractName(r.contract) : 'без договора'}): ${money(r.retentionLeft)}. Запланируйте поступление по сроку договора.`, null]));
        if (!inItems.length) inItems.push(['Просроченной дебиторской задолженности нет.', null]);

        // 3. Expenses
        const outItems = [];
        ops.filter(op => op.dir === 'out' && C.paidOf(op) > num(op.amount)).forEach(op => outItems.push(`Перерасход по «${op.title}»: оплачено ${money(C.paidOf(op))} при плане ${money(op.amount)} (+${money(C.paidOf(op) - num(op.amount))}).`));
        planFactRowsBy('object').filter(r => r.overspend > 0 && r.key !== 'Без объекта').forEach(r => outItems.push(`Объект «${r.key}»: перерасход ${money(r.overspend)}.`));
        d.payable.overdue.forEach(r => outItems.push(`Просрочен платёж ${money(r.rest)}: ${r.op.title}${r.op.counterparty ? ' — ' + r.op.counterparty : ''}, ${r.days} дн. Возможны неустойки — проверьте условия договора.`));
        const byCat = {};
        ops.filter(op => op.dir === 'out' && C.restOf(op) > 0).forEach(op => { byCat[op.category] = (byCat[op.category] || 0) + C.restOf(op); });
        const totalOut = Object.values(byCat).reduce((s, v) => s + v, 0);
        if (totalOut) outItems.push('Структура предстоящих платежей (план): ' + Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${CATEGORIES.out[k]} ${Math.round(v / totalOut * 100)}%`).join(', ') + '.');
        if (!outItems.length) outItems.push('Перерасходов и просроченных платежей нет.');

        const askBtn = (label, direction) => h('button', { type: 'button', class: 'home-btn home-btn--secondary home-cab__small', onclick: () => askFinancier(direction) }, label);
        panel.appendChild(h('p', { class: 'home-note' }, 'Выводы рассчитаны по введённым данным: факт — записанные оплаты, план — ожидаемые операции, прогноз — расчёт остатков. Решения о переносе платежей и финансировании принимает компания; обсудите их с финансистом.'));
        panel.append(
            blockWith('Предотвращение кассовых разрывов', askBtn('Обсудить с финансистом', 'gaps'), h('ul', { class: 'home-cf__advice' }, gapItems.map(t => h('li', {}, t)))),
            blockWith('Ускорение поступлений', askBtn('Обсудить с финансистом', 'receipts'), h('ul', { class: 'home-cf__advice' }, inItems.map(([t, op]) => h('li', {}, t,
                op && op.contractId ? h('button', { type: 'button', class: 'home-cab__reset-link home-cf__inline', onclick: () => paymentNotice(op) }, op.noticeAt ? 'Подготовить уведомление ещё раз' : 'Подготовить уведомление заказчику') : null,
                op ? h('button', { type: 'button', class: 'home-cab__reset-link home-cf__inline', onclick: () => askLawyer(op) }, 'Юрист') : null)))),
            blockWith('Оптимизация расходов', askBtn('Обсудить с финансистом', 'expenses'), h('ul', { class: 'home-cf__advice' }, outItems.map(t => h('li', {}, t)))));
    }

    function planFactRowsBy(g) {
        const saved = grouping;
        grouping = g;
        const rows = planFactRows();
        grouping = saved;
        return rows;
    }

    // Context for the financier: figures are labelled as fact, plan or forecast
    function summary() {
        const ops = scoped();
        const f = scopedForecast();
        const d = C.debts(ops);
        const bal = C.currentBalance(data);
        const scopeName = root.querySelector('[data-cf-scope]').selectedOptions[0].textContent;
        return [
            `Движение денежных средств. Область: ${scopeName}.`,
            isCompany() ? (bal.hasOpening ? `Остаток на счетах (факт, выписка на ${formatDate(data.settings.openingDate)} с учётом записанных оплат): ${money(bal.balance)}.` : 'Остаток на счетах не указан.') : `Сальдо по записанным оплатам (факт): ${money(f.start.balance)}.`,
            `Минимальный остаток (прогноз): ${money(f.low.balance)} на ${formatDate(f.low.date)}; горизонт до ${formatDate(f.end)}.`,
            f.gaps.length ? 'Кассовые разрывы (прогноз): ' + f.gaps.map(g => `${formatDate(g.start)}–${g.end ? formatDate(g.end) : 'не закрывается'}, до ${money(g.deficit)}; платежи: ${g.payments.map(e => `${e.op.title} ${money(e.amount)}`).join(', ')}`).join('; ') + '.' : 'Кассовых разрывов по прогнозу нет.',
            `Дебиторская задолженность (подтверждённая): просрочено ${money(d.sum(d.receivable.overdue))}, срок не наступил ${money(d.sum(d.receivable.current))}. Плановые поступления без подтверждения: ${money(d.sum(d.receivable.planned) + d.sum(d.receivable.unconfirmedOverdue))}.`,
            `Кредиторская задолженность (подтверждённая): просрочено ${money(d.sum(d.payable.overdue))}, срок не наступил ${money(d.sum(d.payable.current))}.`,
            'Предстоящие операции (план): ' + ops.filter(op => C.restOf(op) > 0).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 25)
                .map(op => `${formatDate(op.date)} ${op.dir === 'in' ? '+' : '−'}${money(C.restOf(op))} ${op.title} (${CATEGORIES[op.dir][op.category]}${op.dir === 'out' ? ', ' + PRIORITIES[op.priority].toLowerCase() : ''}${op.confirmed ? ', подтверждено' : ', не подтверждено'})`).join('; ') + '.'
        ].join('\n');
    }

    function askFinancier(direction) {
        if (typeof window.AirchitectOpenSpecialist !== 'function') return;
        const task = {
            gaps: 'Предложи, как предотвратить кассовые разрывы: приоритеты платежей, какие платежи можно перенести, оценка потребности в финансировании и подходящие инструменты.',
            receipts: 'Предложи, как ускорить поступления: контроль оплат заказчиков, работа с дебиторской задолженностью, какие уведомления подготовить.',
            expenses: 'Предложи, как оптимизировать расходы: перерасходы, анализ обязательств, снижение финансовой нагрузки.'
        }[direction];
        window.AirchitectOpenSpecialist('financier', `${summary()}\n\n${task} Опирайся только на приведённые данные и отделяй факт, план и прогноз.\n\nВопрос: `);
    }

    function askLawyer(op) {
        if (typeof window.AirchitectOpenSpecialist !== 'function') return;
        const contract = contracts().find(c => c.id === op.contractId);
        window.AirchitectOpenSpecialist('construction-lawyer', `Просрочена оплата ${money(C.restOf(op))} по ${contract ? 'договору ' + contractName(contract) : 'операции'} «${op.title}», срок ${formatDate(op.date)}. Основание: ${op.basis || 'не указано'}.\n\nКакие действия предпринять: уведомление, претензия, неустойка, приостановка работ — с учётом условий договора.\n\nВопрос: `);
    }

    // ---- Charts -----------------------------------------------------------------------------------
    // Balance forecast: step line (balance changes on payment dates), minimum balance, gap bands, crosshair.

    function chartSize(container) {
        return { w: Math.max(300, container.clientWidth || panel.clientWidth || 640), h: 240, m: { t: 16, r: 16, b: 28, l: 64 } };
    }

    function lineChart(container, series, ref) {
        container.textContent = '';
        const { w, h: H, m } = chartSize(container);
        const t0 = new Date(ref.now).getTime();
        const t1 = Math.max(new Date(ref.end).getTime(), t0 + 86400000);
        const values = series.flatMap(s => s.points.map(p => p.balance)).concat([0, ref.min]);
        let lo = Math.min(...values);
        let hi = Math.max(...values);
        if (hi === lo) hi = lo + 1;
        const pad = (hi - lo) * 0.08;
        lo -= pad; hi += pad;
        const x = d => m.l + (new Date(d).getTime() - t0) / (t1 - t0) * (w - m.l - m.r);
        const y = v => m.t + (hi - v) / (hi - lo) * (H - m.t - m.b);
        const root = svg('svg', { width: w, height: H, viewBox: `0 0 ${w} ${H}`, class: 'home-cf__svg', role: 'img', 'aria-label': series.map(s => s.name).join(', ') });

        // gap bands under the lines
        ref.gaps.forEach(g => {
            const x0 = x(g.start);
            const x1 = x(g.end || ref.end);
            root.appendChild(svg('rect', { x: x0, y: m.t, width: Math.max(2, x1 - x0), height: H - m.t - m.b, class: 'home-cf__gap' }));
        });
        // grid and y labels
        for (let i = 0; i <= 4; i++) {
            const v = lo + (hi - lo) * i / 4;
            root.appendChild(svg('line', { x1: m.l, x2: w - m.r, y1: y(v), y2: y(v), class: 'home-cf__grid' }));
            const label = svg('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'home-cf__axis' });
            label.textContent = short(v);
            root.appendChild(label);
        }
        if (lo < 0) root.appendChild(svg('line', { x1: m.l, x2: w - m.r, y1: y(0), y2: y(0), class: 'home-cf__zero' }));
        if (ref.min) root.appendChild(svg('line', { x1: m.l, x2: w - m.r, y1: y(ref.min), y2: y(ref.min), class: 'home-cf__minline' }));
        // x labels: months
        for (let d = ref.now.slice(0, 7) + '-01'; d <= ref.end; d = C.addMonths(d, 1)) {
            if (d < ref.now) continue;
            const label = svg('text', { x: x(d), y: H - 8, 'text-anchor': 'middle', class: 'home-cf__axis' });
            label.textContent = new Date(d).toLocaleDateString('ru-RU', { month: 'short' });
            root.appendChild(label);
        }
        // step lines
        series.forEach(s => {
            let path = '';
            s.points.forEach((p, i) => {
                path += i ? ` H${x(p.date)} V${y(p.balance)}` : `M${x(p.date)} ${y(p.balance)}`;
            });
            path += ` H${x(ref.end)}`;
            root.appendChild(svg('path', { d: path, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-dasharray': s.dash ? '6 4' : 'none', 'stroke-linejoin': 'round' }));
        });
        const cross = svg('line', { y1: m.t, y2: H - m.b, class: 'home-cf__cross', visibility: 'hidden' });
        root.appendChild(cross);

        const wrap = h('div', { class: 'home-cf__plot' });
        const tip = h('div', { class: 'home-cf__tip', hidden: true });
        wrap.append(root, tip);
        if (series.length > 1) container.appendChild(legend(series.map(s => [s.name, s.color, s.dash ? 'dash' : 'line'])));
        container.appendChild(wrap);

        const at = (s, date) => { let b = s.points[0].balance; s.points.forEach(p => { if (p.date <= date) b = p.balance; }); return b; };
        root.addEventListener('pointermove', e => {
            const rect = root.getBoundingClientRect();
            const px = Math.min(Math.max(e.clientX - rect.left, m.l), w - m.r);
            const date = new Date(t0 + (px - m.l) / (w - m.l - m.r) * (t1 - t0)).toISOString().slice(0, 10);
            cross.setAttribute('x1', px);
            cross.setAttribute('x2', px);
            cross.setAttribute('visibility', 'visible');
            tip.textContent = '';
            tip.appendChild(h('span', { class: 'home-cf__tip-date' }, formatDate(date)));
            series.forEach(s => tip.appendChild(h('span', { class: 'home-cf__tip-row' }, h('i', { style: `background:${s.color}` }), h('strong', {}, money(at(s, date))), ` ${s.name}`)));
            const day = series[0].points.find(p => p.date === date);
            if (day && day.events.length) tip.appendChild(h('span', { class: 'home-cf__tip-ops' }, day.events.slice(0, 4).map(ev => `${ev.dir === 'in' ? '+' : '−'}${short(ev.amount)} ${ev.op.title}`).join('\n')));
            tip.hidden = false;
            tip.style.left = `${Math.min(px + 12, w - 220)}px`;
        });
        root.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
    }

    // Months: receipts and payments side by side; solid = fact, light = remaining plan
    function barChart(container, months) {
        container.textContent = '';
        const { w, h: H, m } = chartSize(container);
        const hi = Math.max(1, ...months.map(x => Math.max(x.factIn + x.planIn, x.factOut + x.planOut)));
        const band = (w - m.l - m.r) / months.length;
        const bw = Math.max(4, Math.min(28, band / 2 - 6));
        const y = v => m.t + (1 - v / hi) * (H - m.t - m.b);
        const root = svg('svg', { width: w, height: H, viewBox: `0 0 ${w} ${H}`, class: 'home-cf__svg', role: 'img', 'aria-label': 'Поступления и платежи по месяцам' });
        for (let i = 0; i <= 4; i++) {
            const v = hi * i / 4;
            root.appendChild(svg('line', { x1: m.l, x2: w - m.r, y1: y(v), y2: y(v), class: 'home-cf__grid' }));
            const label = svg('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'home-cf__axis' });
            label.textContent = short(v);
            root.appendChild(label);
        }
        const wrap = h('div', { class: 'home-cf__plot' });
        const tip = h('div', { class: 'home-cf__tip', hidden: true });
        const bar = (x0, fact, plan, color) => {
            // fact at the baseline, remaining plan stacked above with a 2px surface gap
            const base = y(0);
            if (fact > 0) root.appendChild(svg('rect', { x: x0, y: y(fact), width: bw, height: Math.max(1, base - y(fact)), rx: 3, fill: color }));
            if (plan > 0) {
                const top = y(fact + plan);
                const bottom = fact > 0 ? y(fact) - 2 : base;
                root.appendChild(svg('rect', { x: x0, y: top, width: bw, height: Math.max(1, bottom - top), rx: 3, fill: color, 'fill-opacity': 0.32 }));
            }
        };
        months.forEach((mo, i) => {
            const cx = m.l + band * i + band / 2;
            bar(cx - bw - 1, mo.factIn, mo.planIn, 'var(--cf-in)');
            bar(cx + 1, mo.factOut, mo.planOut, 'var(--cf-out)');
            const label = svg('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'home-cf__axis' });
            label.textContent = new Date(mo.month + '-01').toLocaleDateString('ru-RU', { month: 'short' });
            root.appendChild(label);
            const hit = svg('rect', { x: m.l + band * i, y: m.t, width: band, height: H - m.t - m.b, fill: 'transparent', tabindex: 0 });
            const show = () => {
                tip.textContent = '';
                tip.append(h('span', { class: 'home-cf__tip-date' }, new Date(mo.month + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })),
                    h('span', { class: 'home-cf__tip-row' }, h('i', { style: 'background:var(--cf-in)' }), h('strong', {}, money(mo.factIn)), ' поступления, факт'),
                    h('span', { class: 'home-cf__tip-row' }, h('i', { style: 'background:var(--cf-in);opacity:.35' }), h('strong', {}, money(mo.planIn)), ' поступления, план'),
                    h('span', { class: 'home-cf__tip-row' }, h('i', { style: 'background:var(--cf-out)' }), h('strong', {}, money(mo.factOut)), ' платежи, факт'),
                    h('span', { class: 'home-cf__tip-row' }, h('i', { style: 'background:var(--cf-out);opacity:.35' }), h('strong', {}, money(mo.planOut)), ' платежи, план'));
                tip.hidden = false;
                tip.style.left = `${Math.min(m.l + band * i + band, w - 220)}px`;
            };
            hit.addEventListener('pointerenter', show);
            hit.addEventListener('focus', show);
            hit.addEventListener('pointerleave', () => { tip.hidden = true; });
            hit.addEventListener('blur', () => { tip.hidden = true; });
            root.appendChild(hit);
        });
        container.appendChild(legend([['Поступления', 'var(--cf-in)', 'rect'], ['Платежи', 'var(--cf-out)', 'rect']]));
        wrap.append(root, tip);
        container.appendChild(wrap);
    }

    function legend(items) {
        return h('div', { class: 'home-cf__legend' }, items.map(([name, color, kind]) => h('span', {}, h('i', { class: 'home-cf__key home-cf__key--' + kind, style: `--key:${color}` }), name)));
    }

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { if (['overview', 'scenario'].includes(tab)) render(); }, 200);
    });

    // ---- Excel ---------------------------------------------------------------------------------

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${url}"]`)) return resolve();
            const script = h('script', { src: url });
            script.onload = resolve;
            script.onerror = () => reject(new Error('Не удалось загрузить модуль экспорта. Проверьте подключение к интернету.'));
            document.head.appendChild(script);
        });
    }

    async function exportXlsx() {
        try {
            await loadScript(XLSX_URL);
            const X = window.XLSX;
            const cs = contracts();
            const os = objects();
            const ops = scoped();
            const f = scopedForecast();
            const d = C.debts(ops);
            const scopeName = root.querySelector('[data-cf-scope]').selectedOptions[0].textContent;
            const book = X.utils.book_new();
            const add = (name, title, columns, rows, widths) => {
                const sheet = X.utils.aoa_to_sheet([[title], [`${scopeName}. Сформировано ${formatDate(today())}`], [], columns, ...rows]);
                sheet['!cols'] = columns.map((c, i) => ({ wch: (widths && widths[i]) || 16 }));
                X.utils.book_append_sheet(book, sheet, name);
            };
            const opCells = op => [formatDate(op.date), op.dir === 'in' ? 'Поступление' : 'Платёж', CATEGORIES[op.dir][op.category], op.title, op.counterparty,
                contractName(cs.find(c => c.id === op.contractId)), (os.find(o => o.id === op.objectId) || {}).name || '',
                num(op.amount), C.paidOf(op), C.restOf(op), STATUS[C.statusOf(op)], op.confirmed ? 'да' : 'нет', op.basis, op.dir === 'out' ? PRIORITIES[op.priority] : ''];
            const opCols = ['Плановая дата', 'Направление', 'Статья', 'Назначение', 'Контрагент', 'Договор', 'Объект', 'План, ₽', 'Оплачено (факт), ₽', 'Остаток, ₽', 'Статус', 'Основание подтверждено', 'Документ-основание', 'Приоритет'];
            const opW = [12, 12, 22, 36, 24, 30, 24, 14, 14, 14, 12, 10, 30, 16];
            add('Операции', 'Реестр операций (план и факт)', opCols, [...ops].sort((a, b) => a.date.localeCompare(b.date)).map(opCells), opW);
            add('Оплаты', 'Реестр оплат (факт)', ['Дата оплаты', 'Направление', 'Назначение', 'Контрагент', 'Сумма, ₽', 'Платёжный документ'],
                ops.flatMap(op => (op.payments || []).map(p => [formatDate(p.date), op.dir === 'in' ? 'Поступление' : 'Платёж', op.title, op.counterparty, num(p.amount), p.doc || ''])), [12, 12, 36, 24, 14, 24]);
            add('Календарь', 'Платёжный календарь и прогноз остатка', ['Дата', 'Поступления (план), ₽', 'Платежи (план), ₽', 'Остаток (прогноз), ₽', 'Операции'],
                f.points.map(p => [formatDate(p.date), Math.round(p.inflow), Math.round(p.outflow), Math.round(p.balance), p.events.map(e => `${e.dir === 'in' ? '+' : '−'}${Math.round(e.amount)} ${e.op.title}`).join('; ')]), [12, 16, 16, 16, 70]);
            add('Разрывы', 'Кассовые разрывы (прогноз)', ['Начало', 'Окончание', 'Наименьший остаток, ₽', 'Дата', 'Не хватает, ₽', 'Крупные платежи'],
                f.gaps.map(g => [formatDate(g.start), g.end ? formatDate(g.end) : 'не закрывается', Math.round(g.low), formatDate(g.lowDate), Math.round(g.deficit), g.payments.map(e => `${e.op.title} ${Math.round(e.amount)}`).join('; ')]), [12, 16, 18, 12, 16, 60]);
            const debtRows = [
                ...d.receivable.overdue.map(r => ['Дебиторская', 'просрочена', r.days, ...opCells(r.op)]),
                ...d.receivable.current.map(r => ['Дебиторская', 'срок не наступил', '', ...opCells(r.op)]),
                ...d.payable.overdue.map(r => ['Кредиторская', 'просрочена', r.days, ...opCells(r.op)]),
                ...d.payable.current.map(r => ['Кредиторская', 'срок не наступил', '', ...opCells(r.op)]),
                ...[...d.receivable.unconfirmedOverdue, ...d.payable.unconfirmedOverdue].map(r => ['Риск (не подтверждено)', 'срок прошёл', r.days, ...opCells(r.op)])
            ];
            add('Задолженность', 'Дебиторская и кредиторская задолженность (подтверждённая) и риски', ['Вид', 'Состояние', 'Дней просрочки', ...opCols], debtRows, [18, 16, 10, ...opW]);
            add('План-факт', 'План-факт по договорам', PF_COLUMNS, planFactRowsBy('contract').map(pfCells), [36, 16, 16, 16, 14, 16, 16, 16, 14, 14, 16]);
            add('План-факт объекты', 'План-факт по объектам', PF_COLUMNS, planFactRowsBy('object').map(pfCells), [36, 16, 16, 16, 14, 16, 16, 16, 14, 14, 16]);
            X.writeFile(book, `ДДС — ${scopeName.replace(/[\\/:*?"<>|]/g, ' ')} — ${formatDate(today())}.xlsx`);
        } catch (e) {
            notify(e.message);
        }
    }

    // ---- Demo: invented values for presentation, marked as demo -----------------------------------

    function demo() {
        if (data.ops.some(op => op.source === 'demo')) return notify('Демо-данные уже добавлены.');
        const t = today();
        const at = n => C.addDays(t, n);
        const op = (f, paid) => {
            const o = C.blankOp({ ...f, source: 'demo', title: f.title });
            if (paid) o.payments = [{ id: C.uid(), date: paid[0], amount: paid[1], doc: 'демо' }];
            data.ops.push(o);
        };
        data.settings = { ...data.settings, opening: data.settings.opening === '' ? 1200000 : data.settings.opening, openingDate: data.settings.openingDate || at(-30), minBalance: data.settings.minBalance || 500000 };
        op({ dir: 'in', category: 'advance', title: 'Демо: аванс по договору подряда', counterparty: 'Демо-заказчик', date: at(-25), amount: 6000000, confirmed: true, basis: 'договор, п. об авансе' }, [at(-24), 6000000]);
        op({ dir: 'in', category: 'work', title: 'Демо: оплата работ за прошлый месяц', counterparty: 'Демо-заказчик', date: at(-5), gross: 9000000, advanceOffset: 1800000, retention: 450000, amount: 6750000, confirmed: true, basis: 'акт КС-2 и справка КС-3 (демо)' });
        op({ dir: 'in', category: 'work', title: 'Демо: оплата работ за текущий месяц', counterparty: 'Демо-заказчик', date: at(35), gross: 10000000, advanceOffset: 2000000, retention: 500000, amount: 7500000, confirmed: false, basis: 'акт будет подписан после приёмки' });
        op({ dir: 'out', category: 'subcontract', title: 'Демо: субподряд — монолитные работы', counterparty: 'Демо-субподрядчик', date: at(4), amount: 5800000, confirmed: true, basis: 'акт субподрядчика (демо)', priority: 'normal' });
        op({ dir: 'out', category: 'materials', title: 'Демо: арматура и бетон', counterparty: 'Демо-поставщик', date: at(9), amount: 4600000, confirmed: true, basis: 'счёт (демо)', priority: 'deferrable' }, [at(-2), 400000]);
        op({ dir: 'out', category: 'payroll', title: 'Демо: заработная плата', date: at(12), amount: 1900000, confirmed: true, basis: 'ведомость', priority: 'critical' });
        op({ dir: 'out', category: 'taxes', title: 'Демо: налоги и взносы', date: at(26), amount: 900000, confirmed: true, basis: 'расчёт', priority: 'critical' });
        op({ dir: 'out', category: 'machinery', title: 'Демо: аренда крана', counterparty: 'Демо-арендодатель', date: at(-3), amount: 450000, confirmed: true, basis: 'счёт (демо)', priority: 'normal' }, [at(-3), 520000]);
        op({ dir: 'out', category: 'overhead', title: 'Демо: офис и связь', date: at(15), amount: 300000, confirmed: false, priority: 'deferrable' });
        op({ dir: 'out', category: 'payroll', title: 'Демо: заработная плата', date: at(42), amount: 1900000, confirmed: false, priority: 'critical' });
        save();
        tab = 'overview';
        render();
    }

    // ---- Wiring ------------------------------------------------------------------------------------

    root.querySelector('[data-cf-scope]').addEventListener('change', e => { scope = e.target.value; render(); });
    root.querySelector('[data-cf-add-in]').addEventListener('click', () => editOp(null, 'in'));
    root.querySelector('[data-cf-add-out]').addEventListener('click', () => editOp(null, 'out'));
    root.querySelector('[data-cf-excel]').addEventListener('click', exportXlsx);
    root.querySelector('[data-cf-demo]').addEventListener('click', demo);
    window.addEventListener('storage', e => {
        if (![C.STORE_KEY, CONTRACTS_KEY, OBJECTS_KEY].includes(e.key)) return;
        data = C.read();
        render();
    });

    render();
});
