// Workspace of the procurement and supply specialist in Штат (staff.html?id=procurement-specialist):
// the dialog on top, below — purchases (needs of the objects), comparison of supplier offers, procurement
// documents and supply control points of Договоры (obligations of the zone «Закупки и снабжение»).
// The choice of the supplier, approval of analogs and sending of documents are marked only by the employee.
// Prepared documents and saved answers go to the specialist's register («Документы и результаты закупок»).

(function () {
    const SLUG = 'procurement-specialist';
    const SELECTED = 'airchitect-procurement-selected-v1';
    const selectedId = () => { try { return (JSON.parse(localStorage.getItem(SELECTED)) || {}).id || ''; } catch (e) { return ''; } };
    const select = id => { try { localStorage.setItem(SELECTED, JSON.stringify({ id })); } catch (e) { /* ignore */ } };

    // Supply control points: obligations of Договоры in the zone «Закупки и снабжение»
    function supplyPoints() {
        const CC = window.AirchitectContracts;
        if (!CC) return [];
        return CC.read().contracts.flatMap(c => (CC.ensure(c).obligations || []).filter(o => CC.zone(o) === 'supply').map(o => ({ c, o, s: CC.obligationStatus(o) })));
    }

    // Chat extension (script.js): the selected purchase and supply points go as context;
    // the answer can be saved to the register of the specialist
    function chatExtension() {
        let bar = null;
        const P = window.AirchitectProcurement;
        const current = () => P && P.read().purchases.find(p => p.id === selectedId());
        const draw = () => {
            if (!bar) return;
            const p = current();
            bar.textContent = p ? `Контекст: ${P.title(p)}${p.demo ? ' (демо-пример)' : ''}. Специалист получит позиции, предложения и расчёт сравнения.` : 'Без закупки. Чтобы специалист учёл позиции и предложения, выберите закупку в рабочем пространстве ниже.';
        };
        return {
            attach({ form }) {
                bar = document.createElement('p');
                bar.className = 'home-ws__context';
                form.prepend(bar);
                draw();
                document.addEventListener('procurementselect', draw);
                window.addEventListener('storage', draw);
            },
            payload() {
                const p = current();
                const CC = window.AirchitectContracts;
                const points = supplyPoints().filter(x => x.s !== 'done').slice(0, 20).map(x => `${CC.name(x.c)}, п. ${x.o.clause || '—'}: ${x.o.text}${x.o.due ? ' — срок ' + CC.formatDate(x.o.due) : ''} (${CC.STATUS_LABEL[x.s]})`);
                return { type: 'procurement', id: p ? p.id : '', context: [p ? P.context(p) : '', points.length ? 'Контрольные точки поставки по договорам:\n' + points.join('\n') : ''].filter(Boolean).join('\n\n') };
            },
            reset() { draw(); },
            afterAnswer(message, answerText) {
                const actions = document.createElement('div');
                actions.className = 'home-tn__answer-actions';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = 'Сохранить в реестр';
                btn.addEventListener('click', () => {
                    const msgs = [...document.querySelectorAll('.home-chat__message--user')];
                    const question = msgs.length ? msgs[msgs.length - 1].innerText.trim().replace(/\s+/g, ' ').slice(0, 90) : 'Ответ специалиста';
                    const p = current();
                    const reg = window.AirchitectStaffRegistry;
                    if (reg) reg.add({ kind: 'result', name: question, text: answerText.trim(), meta: p ? P.title(p) : '' });
                    const note = document.createElement('p');
                    note.className = 'home-chat__note';
                    note.textContent = reg ? 'Сохранено в реестр «Документы и результаты закупок».' : 'Не удалось сохранить.';
                    message.appendChild(note);
                    btn.disabled = true;
                });
                actions.appendChild(btn);
                message.appendChild(actions);
            }
        };
    }
    window.AirchitectChatExtensions = window.AirchitectChatExtensions || {};
    window.AirchitectChatExtensions.procurement = chatExtension;

    document.addEventListener('DOMContentLoaded', () => {
        const page = document.querySelector('[data-chat-page]');
        const P = window.AirchitectProcurement;
        const K = window.AirchitectWorkspaceKit;
        const CC = window.AirchitectContracts;
        if (!page || !P || !K || new URLSearchParams(location.search).get('id') !== SLUG) return;
        const chatPanel = page.querySelector('[data-tab-panel="chat"]');
        if (!chatPanel) return;
        const { h, notify, badge, rowEl, openCard } = K;
        const askChat = text => K.askChat(page, text);
        const { formatDate, money } = P;
        let data = P.read();
        let tab = 'purchases';
        const save = () => { if (!P.write(data)) notify('Не удалось сохранить.'); };
        const current = () => data.purchases.find(p => p.id === selectedId());
        const ask = (title, fields, fn, label) => K.ask(title, fields, v => { const err = fn(v); if (err) return err; save(); render(); return null; }, label);
        const log = (p, text) => p.log.unshift({ at: Date.now(), text });
        const choose = id => { select(id); document.dispatchEvent(new Event('procurementselect')); };
        const need = () => { const p = current(); if (!p) notify('Выберите закупку во вкладке «Закупки».'); return p; };

        const root = h('section', { class: 'home-ws', 'aria-label': 'Рабочее пространство специалиста по закупкам и снабжению' });
        chatPanel.after(root);

        const TABS = [['purchases', 'Закупки'], ['compare', 'Сравнение предложений'], ['documents', 'Документы'], ['supply', 'Поставки по договорам']];
        const TONE = { review: 'review', active: 'review', soon: 'soon', pastdue: 'soon', overdue: 'overdue', done: 'done' };

        function render() {
            data = P.read();
            data.purchases.forEach(P.ensure);
            const p = current();
            const alerts = supplyPoints().filter(x => ['soon', 'pastdue', 'overdue'].includes(x.s));
            root.textContent = '';
            const pick = h('select', { 'aria-label': 'Закупка', onchange: ev => { choose(ev.target.value); render(); } },
                h('option', { value: '' }, '— без закупки —'), data.purchases.map(x => h('option', { value: x.id, selected: p && x.id === p.id }, `${P.title(x)}${x.demo ? ' (демо)' : ''}`)));
            root.append(
                h('div', { class: 'home-ws__head' }, h('div', {}, h('p', { class: 'home-eyebrow' }, 'Рабочее пространство'), h('h3', { class: 'home-ws__title' }, 'Закупки и снабжение')),
                    h('div', { class: 'home-ws__pick' }, pick)),
                alerts.length ? h('div', { class: 'home-ws__alerts' }, h('p', { class: 'home-dialog__label' }, `Уведомления по поставкам: ${alerts.length}`), h('ul', { class: 'home-ct__list' }, alerts.slice(0, 5).map(x => rowEl([badge(CC.STATUS_LABEL[x.s], TONE[x.s]), x.o.text], [`${CC.name(x.c)} · п. ${x.o.clause || '—'}${x.o.due ? ' · срок ' + CC.formatDate(x.o.due) : ''}`], [['Карточка договора', () => openCard(x.c)]])))) : null,
                h('div', { class: 'home-tabs', role: 'tablist', 'aria-label': 'Рабочие вкладки' }, TABS.map(([k, l]) => h('button', { type: 'button', role: 'tab', class: 'home-tab', 'aria-selected': String(k === tab), onclick: () => { tab = k; render(); } }, l))));
            const panel = h('div', { class: 'home-ws__panel' });
            root.appendChild(panel);
            ({ purchases: renderPurchases, compare: renderCompare, documents: renderDocuments, supply: renderSupply })[tab](panel, p);
            root.appendChild(h('p', { class: 'home-note' }, 'Специалист работает с данными, которые вы внесли и приложили: актуальные рыночные цены и надёжность поставщиков он не проверяет. Выбор поставщика, согласование аналогов и отправку документов подтверждает сотрудник. Документы и сохранённые ответы — во вкладке реестра выше.'));
        }

        // ---- Purchases ---------------------------------------------------------------------------

        const parseItems = text => text.split('\n').map(l => l.split('|').map(x => x.trim())).filter(x => x[0]).map(([name, spec = '', unit = '', qty = '']) => ({ name, spec, unit, qty }));
        const itemsText = p => (p ? p.items.map(i => [i.name, i.spec, i.unit, i.qty].join(' | ')).join('\n') : '');

        function editPurchase(p) {
            const contracts = CC ? CC.read().contracts : [];
            ask(p ? 'Закупка' : 'Новая закупка', [
                { name: 'number', label: 'Номер закупки', value: p && p.number, required: true },
                { name: 'date', label: 'Дата', type: 'date', value: p ? p.date : P.today(), required: true },
                { name: 'title', label: 'Что закупаем', value: p && p.title, required: true, hint: 'Например: арматура и бетон для фундаментов' },
                { name: 'object', label: 'Объект', value: p && p.object },
                { name: 'contractId', label: 'Договор с заказчиком', type: 'select', value: p ? p.contractId || '' : '', options: [['', '— не выбран —'], ...contracts.map(c => [c.id, CC.name(c)])] },
                { name: 'address', label: 'Адрес поставки', value: p && p.address },
                { name: 'requiredDate', label: 'Требуемый срок поставки', type: 'date', value: p && p.requiredDate, hint: 'Срок, который нужен объекту; подтверждённый поставщиком срок указывается в предложении' },
                { name: 'items', label: 'Позиции: каждая с новой строки «наименование | характеристики | ед. | количество»', type: 'textarea', rows: 5, value: itemsText(p), required: true },
                { name: 'requirements', label: 'Дополнительные требования', type: 'textarea', rows: 2, value: p && p.requirements, hint: 'Документы о качестве, упаковка, разгрузка, график поставки' },
                { name: 'rfqDeadline', label: 'Срок ответа на запрос КП', type: 'date', value: p && p.rfqDeadline }
            ], v => {
                const items = parseItems(v.items);
                if (!items.length) return 'Добавьте хотя бы одну позицию.';
                const contract = contracts.find(c => c.id === v.contractId);
                const fields = { ...v, items, contractName: contract ? CC.name(contract) : '' };
                if (p) { Object.assign(p, fields); log(p, 'Изменена закупка'); } else {
                    const np = P.ensure({ id: P.uid(), status: 'draft', created: Date.now(), ...fields });
                    log(np, 'Создана закупка');
                    data.purchases.unshift(np);
                    choose(np.id);
                }
                return null;
            });
        }

        function renderPurchases(panel, p) {
            panel.appendChild(h('div', { class: 'home-ct__actions' },
                h('button', { type: 'button', class: 'home-btn home-btn--primary home-cab__small', onclick: () => editPurchase() }, 'Новая закупка'),
                !data.purchases.some(x => x.demo) ? h('button', { type: 'button', class: 'home-cab__reset-link', onclick: () => { const d = P.demo(); data.purchases.unshift(d); save(); choose(d.id); tab = 'compare'; render(); } }, 'Демо-пример') : null));
            panel.appendChild(h('ul', { class: 'home-ct__list' }, data.purchases.length ? data.purchases.map(x => rowEl(
                [x.demo ? badge('Демо', 'review') : null, badge(P.STATUS[x.status] || x.status, x.status === 'decision' || x.status === 'closed' ? 'done' : 'soon'), x.id === (p && p.id) ? badge('Выбрана', 'done') : null, P.title(x)],
                [[x.object, x.requiredDate ? 'нужно к ' + formatDate(x.requiredDate) : 'требуемый срок не указан', `позиций: ${x.items.length}`, `предложений: ${x.offers.length}`].filter(Boolean).join(' · '), x.decision ? `Выбран поставщик: ${x.decision.supplier} (${x.decision.by}, ${formatDate(x.decision.date)})` : ''],
                [['Работать', () => { choose(x.id); tab = 'compare'; render(); }], ['Изменить', () => editPurchase(x)], ['Удалить', () => { if (!confirm('Удалить закупку?')) return; data.purchases = data.purchases.filter(y => y !== x); if (selectedId() === x.id) choose(''); save(); render(); }]]))
                : h('li', { class: 'home-ct__none' }, 'Закупок нет. Создайте закупку по заявке объекта или откройте демо-пример.')));
        }

        // ---- Offers and comparison -------------------------------------------------------------

        function editOffer(p, o) {
            ask(o ? 'Коммерческое предложение' : 'Новое коммерческое предложение', [
                { name: 'supplier', label: 'Поставщик', value: o && o.supplier, required: true },
                { name: 'number', label: 'Номер и дата КП', value: o && o.number },
                { name: 'price', label: 'Стоимость товара, ₽', type: 'number', value: o && o.price, required: true },
                { name: 'priceWithVat', label: 'Стоимость указана с НДС', type: 'checkbox', value: o ? o.priceWithVat : true },
                { name: 'vat', label: 'НДС', type: 'select', value: o ? o.vat ?? '' : '20', options: P.VAT },
                { name: 'delivery', label: 'Доставка', value: o && o.delivery, hint: 'Сумма с НДС, «включено» или пусто, если в КП не указано' },
                { name: 'unloading', label: 'Разгрузка', value: o && o.unloading, hint: 'Сумма с НДС, «включено» или пусто, если не указано' },
                { name: 'extra', label: 'Прочие расходы: каждый с новой строки «статья: сумма»', type: 'textarea', rows: 2, value: o && o.extra, hint: 'Например: «упаковка: 12000», «хранение: не указано»' },
                { name: 'completeness', label: 'Комплектность', type: 'select', value: o ? o.completeness || 'unknown' : 'unknown', options: [['full', 'Полная'], ['partial', 'Неполная'], ['unknown', 'Не подтверждена']] },
                { name: 'missing', label: 'Чего не хватает', value: o && o.missing },
                { name: 'advancePct', label: 'Аванс, %', type: 'number', value: o && o.advancePct, hint: 'Пусто — если условия оплаты не указаны' },
                { name: 'payment', label: 'Условия оплаты', value: o && o.payment },
                { name: 'warranty', label: 'Гарантия', value: o && o.warranty },
                { name: 'confirmedDate', label: 'Срок поставки, подтверждённый поставщиком', type: 'date', value: o && o.confirmedDate },
                { name: 'statedTerm', label: 'Срок без даты (как в КП)', value: o && o.statedTerm, hint: 'Например: «2–3 недели» — останется неподтверждённым' },
                { name: 'analog', label: 'Предложен технический аналог', type: 'checkbox', value: o && o.analog },
                { name: 'analogNote', label: 'Что предложено вместо требуемого', value: o && o.analogNote }
            ], v => {
                if (o) { Object.assign(o, v); if (!v.analog) o.analogStatus = ''; log(p, `Изменено предложение: ${v.supplier}`); } else { p.offers.push({ id: P.uid(), analogStatus: '', ...v }); log(p, `Добавлено предложение: ${v.supplier}`); }
                if (p.status === 'draft' || p.status === 'rfq') p.status = 'comparison';
                return null;
            });
        }

        // Technical analog: approved or rejected by the responsible employee, with the name
        function decideAnalog(p, o) {
            ask('Согласование технического аналога', [
                { name: 'decision', label: 'Решение', type: 'select', value: 'approved', options: [['approved', 'Согласован'], ['rejected', 'Не согласован']] },
                { name: 'by', label: 'Кто согласовал (должность, ФИО)', required: true, hint: 'Главный инженер, инженер ПТО, проектировщик' },
                { name: 'ok', label: 'Подтверждаю: решение принято профильным сотрудником', type: 'checkbox', required: true }
            ], v => { o.analogStatus = v.decision; o.analogBy = v.by; log(p, `Аналог ${o.supplier}: ${v.decision === 'approved' ? 'согласован' : 'не согласован'} (${v.by})`); return null; }, 'Сохранить решение');
        }

        // The choice of the supplier is recorded only by the employee
        function decide(p) {
            const { rows } = P.compare(p);
            ask('Выбор поставщика', [
                { name: 'supplier', label: 'Поставщик', type: 'select', value: rows[0] ? rows[0].o.supplier : '', options: rows.map(r => [r.o.supplier, r.o.supplier]) },
                { name: 'reason', label: 'Основание выбора', type: 'textarea', rows: 3, required: true, hint: 'Полная стоимость, срок, комплектность, условия оплаты' },
                { name: 'by', label: 'Кто принял решение (должность, ФИО)', required: true },
                { name: 'ok', label: 'Подтверждаю выбор поставщика', type: 'checkbox', required: true }
            ], v => {
                const r = rows.find(x => x.o.supplier === v.supplier);
                if (r && r.o.analog && r.o.analogStatus !== 'approved') return 'Предложение с техническим аналогом можно выбрать только после согласования аналога.';
                p.decision = { supplier: v.supplier, reason: v.reason, by: v.by, date: P.today() };
                p.status = 'decision';
                log(p, `Выбран поставщик: ${v.supplier} (${v.by})`);
                return null;
            }, 'Подтвердить выбор');
        }

        function renderCompare(panel, p) {
            if (!p) { panel.appendChild(h('p', { class: 'home-staff__empty' }, 'Выберите закупку во вкладке «Закупки».')); return; }
            const { rows, lowest } = P.compare(p);
            panel.appendChild(h('p', { class: 'home-ct__row-meta' }, [p.demo ? 'Демо-пример: данные условные' : '', P.title(p), p.requiredDate ? 'требуемый срок ' + formatDate(p.requiredDate) : 'требуемый срок не указан'].filter(Boolean).join(' · ')));
            panel.appendChild(h('div', { class: 'home-ct__actions' },
                h('button', { type: 'button', class: 'home-btn home-btn--primary home-cab__small', onclick: () => editOffer(p) }, 'Добавить предложение'),
                rows.length ? h('button', { type: 'button', class: 'home-btn home-btn--secondary home-cab__small', onclick: () => decide(p) }, 'Выбрать поставщика') : null,
                rows.length ? h('button', { type: 'button', class: 'home-btn home-btn--secondary home-cab__small', onclick: () => askChat('Проверь коммерческие предложения по выбранной закупке на пропуски, расхождения с заявкой и дополнительные расходы; что запросить у поставщиков.') }, 'Проверить со специалистом') : null));
            if (!rows.length) { panel.appendChild(h('p', { class: 'home-staff__empty' }, 'Предложений нет. Добавьте коммерческие предложения поставщиков или приложите их в диалоге.')); return; }
            panel.appendChild(h('div', { class: 'home-cab__table-wrap' }, h('table', { class: 'home-cab__table' },
                h('thead', {}, h('tr', {}, ['Поставщик', 'Цена с НДС', 'Доставка', 'Разгрузка', 'Известная полная стоимость', 'Срок поставки', 'Оплата', 'Гарантия'].map(x => h('th', {}, x)))),
                h('tbody', {}, rows.map(({ o, e }) => h('tr', {},
                    h('td', {}, o.supplier, lowest && lowest.o === o ? h('div', {}, badge('Наименьшая известная', 'done')) : null),
                    h('td', {}, P.priceText(o, e)),
                    h('td', {}, e.delivery.known ? (e.delivery.included ? 'включена' : money(e.delivery.amount)) : badge('не указана', 'soon')),
                    h('td', {}, e.unloading.known ? (e.unloading.included ? 'включена' : money(e.unloading.amount)) : badge('не указана', 'soon')),
                    h('td', {}, e.total !== null ? money(e.total) : '—'),
                    h('td', {}, badge(e.date.status === 'ok' ? 'в срок' : e.date.status === 'late' ? 'позже требуемого' : 'не подтверждён', e.date.status === 'ok' ? 'done' : e.date.status === 'late' ? 'overdue' : 'soon'), h('div', { class: 'home-ct__row-meta' }, e.date.text)),
                    h('td', {}, o.advancePct !== '' && o.advancePct !== undefined ? `аванс ${o.advancePct} %${o.payment ? ', ' + o.payment : ''}` : 'не указано'),
                    h('td', {}, o.warranty || 'не указана')))))));
            panel.appendChild(h('ul', { class: 'home-ct__list' }, rows.map(({ o, e }) => rowEl([o.supplier, o.analog ? badge(o.analogStatus === 'approved' ? 'Аналог согласован' : o.analogStatus === 'rejected' ? 'Аналог отклонён' : 'Аналог — на согласование', o.analogStatus === 'approved' ? 'done' : o.analogStatus === 'rejected' ? 'overdue' : 'soon') : null],
                [e.unknown.length ? `Неизвестные расходы и сведения: ${e.unknown.join(', ')}` : 'Все расходы указаны', e.warnings.length ? e.warnings.join('; ') : '', o.analogNote ? `Аналог: ${o.analogNote}` : ''],
                [['Изменить', () => editOffer(p, o)], ...(o.analog ? [['Согласование аналога', () => decideAnalog(p, o)]] : []), ['Удалить', () => { p.offers = p.offers.filter(x => x !== o); log(p, `Удалено предложение: ${o.supplier}`); save(); render(); }]]))));
            panel.appendChild(h('p', { class: 'home-note' }, 'Известная полная стоимость = цена с НДС + доставка + разгрузка + прочие указанные расходы. Не указанные в предложении расходы в сумму не входят и показаны отдельно. Срок без даты считается неподтверждённым.'));
            if (p.decision) panel.appendChild(h('p', { class: 'home-ct__row-meta' }, `Решение: ${p.decision.supplier} — ${p.decision.reason} (${p.decision.by}, ${formatDate(p.decision.date)})`));
        }

        // ---- Documents -------------------------------------------------------------------------

        async function make(p, kind, ...args) {
            const doc = P.documents[kind](p, ...args);
            const ok = await K.docx(doc.name, doc.blocks);
            if (!ok) return;
            if (window.AirchitectStaffRegistry) window.AirchitectStaffRegistry.add({ kind: 'doc', name: doc.name, blocks: doc.blocks, meta: p.demo ? 'демо-пример' : P.title(p) });
            log(p, `Подготовлен документ: ${doc.name}`);
            if (kind === 'rfq' && p.status === 'draft') p.status = 'rfq';
            save();
            render();
        }

        function renderDocuments(panel, p) {
            if (!p) { panel.appendChild(h('p', { class: 'home-staff__empty' }, 'Выберите закупку во вкладке «Закупки».')); return; }
            const hasOffers = p.offers.length > 0;
            const DOCS = [['rfq', 'Запрос коммерческих предложений', 'Позиции, требуемый срок и адрес, условия, которые должен указать поставщик.', true],
                ['table', 'Сравнительная таблица', 'Полная стоимость, сроки, оплата, гарантия и неизвестные расходы.', hasOffers],
                ['note', 'Закупочная справка для руководителя', 'Потребность, предложения, риски и вопросы на решение.', hasOffers],
                ['protocol', 'Проект протокола выбора поставщика', 'Рассмотренные предложения и решение (если оно подтверждено).', hasOffers]];
            panel.appendChild(h('p', { class: 'home-ct__row-meta' }, `Реквизиты всех документов одинаковые: ${P.title(p)}, ${p.object || 'объект не указан'}, ${p.requiredDate ? 'требуемый срок ' + formatDate(p.requiredDate) : 'требуемый срок не указан'}.`));
            panel.appendChild(h('ul', { class: 'home-ct__list' }, DOCS.map(([k, t, d, can]) => rowEl([t], [can ? d : 'Нужны коммерческие предложения во вкладке «Сравнение предложений».'], can ? [['Word', () => make(p, k)]] : []))));
            panel.appendChild(h('p', { class: 'home-dialog__label' }, 'Письма поставщику'));
            const chosen = p.decision ? p.offers.find(o => o.supplier === p.decision.supplier) : null;
            panel.appendChild(h('div', { class: 'home-ws__actions' },
                [['delay', 'Задержка поставки'], ['short', 'Недопоставка'], ['mismatch', 'Несоответствие товара']].map(([k, l]) => h('button', { type: 'button', class: 'home-chat__action', onclick: () => make(p, 'letter', k, chosen) }, l))));
            if (!chosen) panel.appendChild(h('p', { class: 'home-ct__row-meta' }, 'Поставщик не выбран — в письме останется поле для наименования.'));
            panel.appendChild(h('p', { class: 'home-note' }, 'Чтобы документы были подготовлены по шаблонам компании, приложите шаблон в диалоге и выберите задачу «Собрать комплект закупочных документов».'));
        }

        // ---- Supply control points of Договоры --------------------------------------------------

        function renderSupply(panel) {
            if (!CC) return;
            const points = supplyPoints();
            panel.appendChild(h('p', { class: 'home-ct__row-meta' }, 'Обязательства договоров с зоной ответственности «Закупки и снабжение». Зону можно изменить в карточке договора: «Изменить» у обязательства.'));
            panel.appendChild(h('ul', { class: 'home-ct__list' }, points.length ? points.map(({ c, o, s }) => rowEl([badge(CC.STATUS_LABEL[s], TONE[s]), o.text],
                [`${CC.name(c)} · ${CC.PARTIES[o.party] || ''} · п. ${o.clause || '—'}${o.due ? ' · срок ' + CC.formatDate(o.due) : o.condition ? ' · ' + o.condition : ''}${o.responsible ? ' · ответственный: ' + o.responsible : ''}`],
                [['Карточка договора', () => openCard(c)], ['Письмо', () => askChat(`Подготовь проект письма поставщику по обязательству «${o.text}» (${CC.name(c)}, п. ${o.clause || '—'}${o.due ? ', срок ' + CC.formatDate(o.due) : ''}): задержка, недопоставка или несоответствие — уточни ситуацию: `)]]))
                : h('li', { class: 'home-ct__none' }, 'Обязательств по поставке в договорах нет. Отметьте их зоной «Закупки и снабжение» в разделе «Договоры».')));
        }

        window.addEventListener('storage', ev => { if ([P.STORE_KEY, SELECTED, CC && CC.STORE_KEY].includes(ev.key)) render(); });
        render();
    });
})();
