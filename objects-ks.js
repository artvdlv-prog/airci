// Construction forms and acts for Объекты (Инженер ПТО): estimate and volumes (КС-6а), КС-2 and КС-3
// with the approval route, journals of works, other unified forms (КС-8 … КС-18), checks and
// recommendations, links to ИД, Договоры and Движение денежных средств, export to Word / Excel / PDF.
// Data lives in the object itself (airchitect-objects-v1): o.estimate, o.volumes, o.ks2, o.ks3,
// o.journals, o.ksDocs, o.ksSettings. Loaded before objects.js, which calls AirchitectObjectsKs(ctx).
//
// Volumes are kept apart: performed (КС-6а records), presented (in КС-2 passed to the customer)
// and accepted (in КС-2 signed by the customer). КС-3 sums its КС-2, each КС-2 belongs to one КС-3,
// and only a signed КС-3 is passed to cash flow, once - no double counting of cost.

window.AirchitectObjectsKs = function (ctx) {
    const { h, block, row, rows, small, save, render, log, openDialog, notify, formatDate, today, uid, daysUntil, contracts, storeFiles, fileLinks, normLink } = ctx;
    const KF = window.AirchitectKsForms;
    const CASHFLOW_KEY = 'airchitect-cashflow-v1';
    const CONTRACTS_KEY = 'airchitect-contracts-v1';

    // Unified forms of primary documents for capital construction. Since 2013 they are not mandatory
    // by themselves (ст. 9 402-ФЗ); they are used when the contract (or another law) requires them.
    const FORMS = [
        { code: 'КС-2', title: 'Акт о приёмке выполненных работ', okud: '0322005', basis: 'постановление Госкомстата России от 11.11.1999 № 100', managed: 'acts' },
        { code: 'КС-3', title: 'Справка о стоимости выполненных работ и затрат', okud: '0322001', basis: 'постановление Госкомстата России от 11.11.1999 № 100', managed: 'acts' },
        { code: 'КС-6а', title: 'Журнал учёта выполненных работ', okud: '0322006', basis: 'постановление Госкомстата России от 11.11.1999 № 100', managed: 'volumes' },
        { code: 'КС-6', title: 'Общий журнал работ', okud: '', basis: 'постановление Госкомстата России от 30.10.1997 № 71а', managed: 'journals', note: 'При строительстве, реконструкции и капитальном ремонте с 01.09.2023 общий журнал ведётся по форме приказа Минстроя России № 1026/пр.' },
        { code: 'КС-8', title: 'Акт о сдаче в эксплуатацию временного (нетитульного) сооружения', okud: '0322007', basis: 'постановление Госкомстата России от 11.11.1999 № 100' },
        { code: 'КС-9', title: 'Акт о разборке временных (нетитульных) сооружений', okud: '0322008', basis: 'постановление Госкомстата России от 11.11.1999 № 100' },
        { code: 'КС-10', title: 'Акт об оценке подлежащих сносу (переносу) объектов и насаждений', okud: '0322009', basis: 'постановление Госкомстата России от 11.11.1999 № 100' },
        { code: 'КС-11', title: 'Акт приёмки законченного строительством объекта', okud: '0336003', basis: 'постановление Госкомстата России от 30.10.1997 № 71а', note: 'Оформляется между заказчиком и подрядчиком. Не заменяет разрешение на ввод объекта в эксплуатацию (ст. 55 ГрК РФ).' },
        { code: 'КС-14', title: 'Акт приёмки законченного строительством объекта приёмочной комиссией', okud: '0336004', basis: 'постановление Госкомстата России от 30.10.1997 № 71а', note: 'Применяется, если приёмка комиссией предусмотрена договором или решением застройщика.' },
        { code: 'КС-17', title: 'Акт о приостановлении строительства', okud: '0322010', basis: 'постановление Госкомстата России от 11.11.1999 № 100' },
        { code: 'КС-18', title: 'Акт о приостановлении проектно-изыскательских работ по неосуществлённому строительству', okud: '0322011', basis: 'постановление Госкомстата России от 11.11.1999 № 100' }
    ];
    const BASIS = {
        unified: 'Унифицированные формы КС-2 и КС-3 (по договору)',
        own: 'Собственная форма с обязательными реквизитами (ч. 2 ст. 9 402-ФЗ)',
        eis: 'Электронный документ о приёмке в ЕИС (ст. 94 44-ФЗ) с приложением КС-2 / КС-3 по контракту'
    };
    const VAT = [['22', '22%'], ['20', '20%'], ['10', '10%'], ['7', '7%'], ['5', '5%'], ['0', '0%'], ['none', 'Без НДС']];
    const STATUS = { draft: 'Подготовлен', sent: 'Передан заказчику', remarks: 'Замечания', resent: 'Передан повторно', signed: 'Подписан' };
    const TONE = { draft: '', sent: 'soon', remarks: 'overdue', resent: 'soon', signed: 'done' };
    const PRESENTED = ['sent', 'remarks', 'resent', 'signed'];
    const JOURNAL_TITLES = ['Журнал бетонных работ', 'Журнал сварочных работ', 'Журнал антикоррозионной защиты сварных соединений', 'Журнал замоноличивания монтажных стыков и узлов', 'Журнал монтажа строительных конструкций', 'Журнал входного контроля', 'Журнал производства земляных работ', 'Журнал погружения свай'];
    const DOCX_URL = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';
    const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

    let sub = 'volumes';

    const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const round2 = v => Math.round(v * 100) / 100;
    const money = v => `${round2(num(v)).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
    const qtyText = v => round2(num(v)).toLocaleString('ru-RU', { maximumFractionDigits: 3 });
    const parsePrice = s => {
        const m = String(s || '').replace(/[\s ]/g, '').replace(',', '.').match(/\d+(\.\d+)?/);
        return m ? Number(m[0]) : 0;
    };
    const readStore = (key, fallback) => {
        try {
            return JSON.parse(localStorage.getItem(key)) || fallback;
        } catch (e) {
            return fallback;
        }
    };

    function ensure(o) {
        o.estimate = o.estimate || [];
        o.volumes = o.volumes || [];
        o.ks2 = o.ks2 || [];
        o.ks3 = o.ks3 || [];
        o.journals = o.journals || [];
        o.ksDocs = o.ksDocs || [];
        o.ksSettings = { basis: 'unified', contractId: (o.contractIds || [])[0] || '', vatPct: '22', reviewDays: 20, paymentDays: 30, advancePct: 0, retentionPct: 0, ...(o.ksSettings || {}) };
        return o;
    }

    const contractOf = o => contracts().find(c => c.id === o.ksSettings.contractId) || null;
    const contractName = c => (c ? `№ ${c.number || 'без номера'}${c.date ? ' от ' + formatDate(c.date) : ''}` : '—');
    const itemOf = (o, id) => o.estimate.find(i => i.id === id);
    const party = (o, roles) => roles.map(r => o.participants.find(p => p.role === r)).find(p => p && p.org) || {};
    const customerOf = o => party(o, ['Технический заказчик', 'Застройщик']);
    const contractorOf = o => party(o, ['Генеральный подрядчик', 'Подрядчик']);

    // ---- Volumes: performed / presented / accepted per estimate item -----------------------

    function volumes(o, item) {
        const done = o.volumes.filter(v => v.itemId === item.id).reduce((s, v) => s + num(v.qty), 0);
        const inActs = statuses => o.ks2.filter(a => statuses.includes(a.status)).reduce((s, a) => s + a.lines.filter(l => l.itemId === item.id).reduce((x, l) => x + num(l.qty), 0), 0);
        const presented = inActs(PRESENTED);
        const accepted = inActs(['signed']);
        const drafted = inActs(['draft']);
        return { done, presented, accepted, drafted, remaining: num(item.qty) - accepted, toPresent: done - presented - drafted };
    }

    const ks2Total = a => round2(a.lines.reduce((s, l) => s + num(l.qty) * num(l.price), 0));
    const ks3Base = (o, k) => round2(o.ks2.filter(a => k.ks2Ids.includes(a.id)).reduce((s, a) => s + ks2Total(a), 0));
    const vatOf = (k, base) => (k.vatPct === 'none' ? 0 : round2(base * num(k.vatPct) / 100));
    const ks3Total = (o, k) => { const base = ks3Base(o, k); return round2(base + vatOf(k, base)); };

    // Cumulative values for КС-3: from the start of works and from the start of the year (same contract)
    function ks3Cumulative(o, k) {
        const same = o.ks3.filter(x => x.contractId === k.contractId && x.date && x.date <= k.date);
        const sum = list => round2(list.reduce((s, x) => s + ks3Base(o, x), 0));
        return { fromStart: sum(same), fromYear: sum(same.filter(x => x.date.slice(0, 4) === k.date.slice(0, 4))), period: ks3Base(o, k) };
    }

    function summary(o) {
        const c = contractOf(o);
        const price = c ? parsePrice(c.price) : 0;
        const doneCost = round2(o.estimate.reduce((s, i) => s + volumes(o, i).done * num(i.price), 0));
        const presented = round2(o.ks2.filter(a => PRESENTED.includes(a.status)).reduce((s, a) => s + ks2Total(a), 0));
        const accepted = round2(o.ks2.filter(a => a.status === 'signed').reduce((s, a) => s + ks2Total(a), 0));
        const acceptedVat = round2(o.ks3.filter(k => k.status === 'signed').reduce((s, k) => s + ks3Total(o, k), 0));
        return { contract: c, price, doneCost, presented, accepted, acceptedVat, rest: price ? round2(price - acceptedVat) : null };
    }

    // ---- Rendering --------------------------------------------------------------------------

    const SUBS = [['volumes', 'Смета и объёмы (КС-6а)'], ['acts', 'КС-2 и КС-3'], ['journals', 'Журналы работ'], ['forms', 'Реестр форм'], ['check', 'Проверка и рекомендации']];

    function renderTab(o) {
        ensure(o);
        const bar = h('div', { class: 'home-ks__subtabs', role: 'tablist' }, SUBS.map(([key, label]) =>
            h('button', { type: 'button', role: 'tab', class: 'home-ks__subtab', 'aria-selected': String(key === sub), onclick: () => { sub = key; render(); } }, label)));
        ctx.el.panel.appendChild(bar);
        ({ volumes: renderVolumes, acts: renderActs, journals: renderJournals, forms: renderForms, check: renderCheck })[sub](o);
    }

    const table = (columns, body, cls) => h('div', { class: 'home-cab__table-wrap' }, h('table', { class: 'home-cab__table ' + (cls || '') },
        h('thead', {}, h('tr', {}, columns.map(c => h('th', {}, c)))), h('tbody', {}, body)));
    const linkBtn = (label, fn) => h('button', { type: 'button', class: 'home-ks__link', onclick: fn }, label);

    function renderVolumes(o) {
        const panel = ctx.el.panel;
        panel.appendChild(block('Смета: позиции договора', [small('Добавить позицию', () => editItem(o), true), small('Вставить из Excel', () => pasteItems(o)), small('КС-6а — Excel', () => exportKs6aXlsx(o))],
            o.estimate.length ? table(['№ по смете', 'Наименование работ', 'Ед.', 'По смете', 'Цена, ₽', 'Выполнено (КС-6а)', 'Предъявлено', 'Принято', 'Остаток', ''],
                o.estimate.map(i => {
                    const v = volumes(o, i);
                    return h('tr', {},
                        h('td', {}, i.code), h('td', {}, i.name, i.workId ? h('span', { class: 'home-ks__sub' }, ctx.workName(o, i.workId)) : null), h('td', {}, i.unit),
                        h('td', {}, qtyText(i.qty)), h('td', {}, money(i.price)),
                        h('td', { class: v.done > num(i.qty) ? 'home-tn__neg' : '' }, qtyText(v.done)),
                        h('td', { class: v.presented > v.done ? 'home-tn__neg' : '' }, qtyText(v.presented)),
                        h('td', {}, qtyText(v.accepted)), h('td', {}, qtyText(v.remaining)),
                        h('td', { class: 'home-ks__cell-actions' }, linkBtn('Объём', () => editVolume(o, null, i)),
                            i.estimateId ? linkBtn('В смете', () => { location.href = `estimates.html?id=${encodeURIComponent(i.estimateId)}${document.documentElement.classList.contains('is-cabinet') ? '&cabinet=1' : ''}`; }) : linkBtn('Изменить', () => editItem(o, i))));
                })) : h('p', { class: 'home-staff__empty home-cf__pad' }, 'Позиций сметы нет. Добавьте позиции договорной сметы или вставьте их из Excel: номер, наименование, единица, количество, цена.')));

        const recs = [...o.volumes].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        panel.appendChild(block('Журнал учёта выполненных работ (КС-6а)', [small('Записать объём', () => editVolume(o), true), small('Word', () => exportDocx(o, 'ks6a'))], rows(recs, 'Выполненные объёмы не записаны.', v => {
            const i = itemOf(o, v.itemId) || {};
            const ids = o.id.filter(d => (v.idRefs || []).includes(d.id));
            const unsigned = ids.filter(d => d.status !== 'signed');
            return row(formatDate(v.date), 'review', `${i.name || 'Позиция удалена'} — ${qtyText(v.qty)} ${i.unit || ''}`,
                [ids.length ? `ИД: ${ids.map(d => `${d.number ? '№ ' + d.number + ' ' : ''}${d.title} (${ctx.ID_STATUS[d.status]})`).join('; ')}` : 'Не привязано к ИД',
                    unsigned.length ? `Не подписано документов ИД: ${unsigned.length}` : '', v.note, v.author ? `Записал: ${v.author}` : ''],
                [['Изменить', () => editVolume(o, v)], ['Удалить', () => { o.volumes = o.volumes.filter(x => x !== v); log(o, 'Удалена запись КС-6а'); save(); render(); }]]);
        })));
        if (o.estimate.some(i => i.estimateId)) panel.appendChild(h('p', { class: 'home-note' }, 'Позиции договорной сметы приходят из раздела «Сметы»: объёмы и цены меняются там, затем «Обновить позиции». Цены — без НДС за единицу.'));
        panel.appendChild(h('p', { class: 'home-note' }, 'Выполненный объём фиксируется в КС-6а с привязкой к исполнительной документации. Предъявленный — включён в КС-2, переданный заказчику. Принятый — в КС-2, подписанном заказчиком.'));
    }

    function editItem(o, i) {
        openDialog(i ? 'Позиция сметы' : 'Новая позиция сметы', [
            { name: 'code', label: '№ позиции по смете', value: i && i.code, required: true },
            { name: 'name', label: 'Наименование работ', value: i && i.name, required: true },
            { name: 'unit', label: 'Единица измерения', value: i && i.unit, required: true },
            { name: 'qty', label: 'Количество по смете', type: 'number', value: i && i.qty, required: true },
            { name: 'price', label: 'Цена за единицу без НДС, ₽', type: 'number', value: i && i.price, required: true, hint: 'По договорной смете (расчёту стоимости)' },
            { name: 'rate', label: 'Номер единичной расценки', value: i && i.rate },
            { name: 'work', label: 'Вид работ (для связи с ИД)', type: 'select', value: i && i.workId, options: [['', '— не указан —'], ...o.works.map(w => [w.id, w.name])] }
        ], 'Сохранить', v => {
            if (num(v.qty) <= 0) return 'Количество должно быть больше нуля.';
            const fields = { code: v.code, name: v.name, unit: v.unit, qty: num(v.qty), price: num(v.price), rate: v.rate, workId: v.work };
            if (i) {
                const acc = volumes(o, i).accepted;
                if (fields.qty < acc) return `Количество меньше уже принятого объёма (${qtyText(acc)}).`;
                Object.assign(i, fields);
            } else o.estimate.push({ id: uid(), ...fields });
            log(o, `Смета: ${v.code} ${v.name}`);
        });
    }

    // Rows copied from Excel: № | наименование | ед. | количество | цена (tab-separated)
    function pasteItems(o) {
        openDialog('Вставить позиции из Excel', [
            { name: 'text', label: 'Строки сметы', type: 'textarea', rows: 8, required: true, hint: 'Скопируйте столбцы из Excel в порядке: № позиции, наименование, единица, количество, цена за единицу без НДС.' }
        ], 'Добавить', v => {
            const lines = v.text.split('\n').map(l => l.split('\t').map(c => c.trim())).filter(c => c.length >= 5);
            const parsed = lines.map(c => ({ code: c[0], name: c[1], unit: c[2], qty: parsePrice(c[3]), price: parsePrice(c[4]) })).filter(x => x.name && x.qty > 0);
            if (!parsed.length) return 'Не найдено строк с пятью столбцами и количеством больше нуля.';
            parsed.forEach(x => o.estimate.push({ id: uid(), ...x, rate: '', workId: '' }));
            log(o, `Смета: добавлено позиций — ${parsed.length}`);
            return null;
        });
    }

    function editVolume(o, v, item) {
        if (!o.estimate.length) return notify('Сначала добавьте позиции сметы.');
        const itemId = v ? v.itemId : item ? item.id : o.estimate[0].id;
        openDialog(v ? 'Запись КС-6а' : 'Выполненный объём (КС-6а)', [
            { name: 'position', label: 'Позиция сметы', type: 'select', value: itemId, options: o.estimate.map(i => [i.id, `${i.code} · ${i.name} (${i.unit})`]) },
            { name: 'date', label: 'Дата / окончание периода', type: 'date', value: v ? v.date : today(), required: true },
            { name: 'qty', label: 'Выполненный объём', type: 'number', value: v && v.qty, required: true },
            { name: 'ids', label: 'Исполнительная документация', type: 'multi', value: v ? v.idRefs : [], options: o.id.map(d => [d.id, `${d.number ? '№ ' + d.number + ' · ' : ''}${d.title} — ${ctx.ID_STATUS[d.status]}`]), hint: 'Акты скрытых работ, исполнительные схемы, испытания, подтверждающие объём' },
            { name: 'author', label: 'Кто зафиксировал', value: v ? v.author : '' },
            { name: 'note', label: 'Примечание', type: 'textarea', rows: 2, value: v ? v.note : '' }
        ], 'Сохранить', vals => {
            const i = itemOf(o, vals.position);
            const qty = num(vals.qty);
            if (qty <= 0) return 'Объём должен быть больше нуля.';
            const others = o.volumes.filter(x => x.itemId === i.id && x !== v).reduce((s, x) => s + num(x.qty), 0);
            if (others + qty > num(i.qty)) return `Выполненный объём превысит сметный (${qtyText(i.qty)} ${i.unit}). Дополнительные работы оформите отдельной позицией по соглашению с заказчиком.`;
            const fields = { itemId: i.id, date: vals.date, qty, idRefs: vals.ids, author: vals.author, note: vals.note };
            if (v) Object.assign(v, fields);
            else o.volumes.push({ id: uid(), ...fields });
            log(o, `КС-6а: ${i.name} — ${qtyText(qty)} ${i.unit}`);
        });
    }

    // ---- КС-2 and КС-3 ----------------------------------------------------------------------------

    function renderActs(o) {
        const panel = ctx.el.panel;
        const s = summary(o);
        const st = o.ksSettings;
        panel.appendChild(h('ul', { class: 'home-ct__stats home-ks__stats' }, [
            ['Цена договора', s.price ? money(s.price) : 'не указана'],
            ['Выполнено (КС-6а)', money(s.doneCost)],
            ['Предъявлено (КС-2)', money(s.presented)],
            ['Принято (КС-2)', money(s.accepted)],
            ['Принято с НДС (КС-3)', money(s.acceptedVat)],
            ['Остаток по договору', s.rest === null ? '—' : money(s.rest)]
        ].map(([l, v]) => h('li', {}, h('span', { class: 'home-ct__stat-value home-ks__stat' }, v), h('span', { class: 'home-ct__stat-label' }, l)))));

        panel.appendChild(block('Условия договора для актирования', [small('Изменить', () => editSettings(o))], h('p', { class: 'home-ct__row-meta home-cf__pad' }, [
            `Договор: ${s.contract ? contractName(s.contract) + (s.contract.subject ? ' — ' + s.contract.subject : '') : 'не выбран'}`,
            BASIS[st.basis], `НДС: ${st.vatPct === 'none' ? 'без НДС' : st.vatPct + '%'}`,
            `рассмотрение актов: ${st.reviewDays} дн.`, `оплата: ${st.paymentDays} дн. после подписания`,
            num(st.advancePct) ? `зачёт аванса ${st.advancePct}%` : '', num(st.retentionPct) ? `гарантийное удержание ${st.retentionPct}%` : ''
        ].filter(Boolean).join(' · '))));

        panel.appendChild(block('Акты о приёмке выполненных работ (КС-2)', [small('Сформировать КС-2', () => newKs2(o), true), small('Реестр — Excel', () => exportRegistryXlsx(o))],
            rows([...o.ks2].sort((a, b) => (b.date || '').localeCompare(a.date || '')), 'Актов КС-2 нет. Нажмите «Сформировать КС-2» — строки заполнятся по выполненным и ещё не предъявленным объёмам.', a => ks2Row(o, a))));
        panel.appendChild(block('Справки о стоимости выполненных работ (КС-3)', [small('Сформировать КС-3', () => newKs3(o), true)],
            rows([...o.ks3].sort((a, b) => (b.date || '').localeCompare(a.date || '')), 'Справок КС-3 нет. КС-3 формируется по актам КС-2 и не учитывает стоимость повторно.', k => ks3Row(o, k))));
        panel.appendChild(h('p', { class: 'home-note' }, 'Отметка «Подписан» ставится только при наличии подписанного заказчиком экземпляра или документа о приёмке в ЕИС — с указанием подтверждения. AIRCHITECT не создаёт подписи и не подтверждает приёмку за стороны.'));
    }

    function editSettings(o) {
        const st = o.ksSettings;
        const list = contracts().filter(c => (o.contractIds || []).includes(c.id));
        openDialog('Условия договора для актирования', [
            { name: 'contract', label: 'Договор', type: 'select', value: st.contractId, options: [['', '— не выбран —'], ...list.map(c => [c.id, `${contractName(c)}${c.subject ? ' — ' + c.subject : ''}`])], hint: list.length ? 'Договоры, привязанные к объекту во вкладке «Сведения»' : 'Привяжите договор к объекту во вкладке «Сведения».' },
            { name: 'basis', label: 'Формы приёмки по договору', type: 'select', value: st.basis, options: Object.entries(BASIS) },
            { name: 'vat', label: 'НДС', type: 'select', value: st.vatPct, options: VAT, hint: 'С 01.01.2026 основная ставка — 22% (Федеральный закон № 425-ФЗ). Проверьте применимую ставку.' },
            { name: 'reviewDays', label: 'Срок рассмотрения актов заказчиком, дней', type: 'number', value: st.reviewDays, hint: 'По договору. По 44-ФЗ — не более 20 рабочих дней (ст. 94).' },
            { name: 'paymentDays', label: 'Срок оплаты после подписания, дней', type: 'number', value: st.paymentDays },
            { name: 'advancePct', label: 'Зачёт аванса, % от стоимости КС-3', type: 'number', value: st.advancePct },
            { name: 'retentionPct', label: 'Гарантийное удержание, % от стоимости КС-3', type: 'number', value: st.retentionPct }
        ], 'Сохранить', v => {
            Object.assign(st, { contractId: v.contract, basis: v.basis, vatPct: v.vat, reviewDays: num(v.reviewDays), paymentDays: num(v.paymentDays), advancePct: num(v.advancePct), retentionPct: num(v.retentionPct) });
            log(o, 'Изменены условия актирования');
        });
    }

    function history(doc, text) {
        doc.history = doc.history || [];
        doc.history.unshift({ at: Date.now(), text });
    }

    // Approval route actions shared by КС-2 and КС-3
    function routeActions(o, doc, kind) {
        const name = `${kind} № ${doc.number}`;
        const open = (doc.remarks || []).filter(r => r.status === 'open');
        const actions = [];
        if (doc.status === 'draft') actions.push(['Передать заказчику', () => sendDoc(o, doc, kind, false)]);
        if (doc.status === 'remarks' && !open.length) actions.push(['Передать повторно', () => sendDoc(o, doc, kind, true)]);
        if (['sent', 'resent'].includes(doc.status)) actions.push(['Замечания заказчика', () => addRemarks(o, doc, name)], ['Подписан заказчиком', () => signDoc(o, doc, kind)]);
        if (open.length) actions.push(['Замечания устранены', () => fixRemarks(o, doc, name)]);
        return actions;
    }

    function ks2Row(o, a) {
        const in3 = o.ks3.find(k => k.ks2Ids.includes(a.id));
        const open = (a.remarks || []).filter(r => r.status === 'open');
        const idDocs = relatedId(o, a);
        const unsigned = idDocs.filter(d => d.status !== 'signed');
        const actions = [...routeActions(o, a, 'КС-2')];
        if (['draft', 'remarks'].includes(a.status)) actions.push(['Изменить', () => editKs2(o, a)]);
        actions.push(['Word', () => exportDocx(o, 'ks2', a)], ['Excel', () => exportKs2Xlsx(o, a)], ['PDF', () => printDoc(o, 'ks2', a)]);
        if (a.status === 'draft' && !in3) actions.push(['Удалить', () => { o.ks2 = o.ks2.filter(x => x !== a); log(o, `Удалён проект КС-2 № ${a.number}`); save(); render(); }]);
        const days = a.sentAt && ['sent', 'resent'].includes(a.status) ? -daysUntil(a.resentAt || a.sentAt) : null;
        return row(STATUS[a.status], TONE[a.status], `КС-2 № ${a.number} от ${formatDate(a.date)} · ${money(ks2Total(a))}`,
            [`Отчётный период ${formatDate(a.from)} — ${formatDate(a.to)} · позиций: ${a.lines.length}${in3 ? ` · в КС-3 № ${in3.number}` : ' · не включён в КС-3'}`,
                idDocs.length ? `ИД по видам работ: подписано ${idDocs.length - unsigned.length} из ${idDocs.length}` : 'Связанная ИД не найдена: укажите вид работ у позиций сметы',
                a.sentAt ? `Передан ${formatDate(a.sentAt)}${a.sendRef ? ' (' + a.sendRef + ')' : ''}${a.resentAt ? ', повторно ' + formatDate(a.resentAt) : ''}${days !== null ? ` · на рассмотрении ${days} дн.` : ''}` : '',
                a.signedAt ? `Подписан ${formatDate(a.signedAt)} · ${a.signRef}` : '',
                open.length ? `Открытые замечания: ${open.map(r => r.text).join('; ')}` : ''],
            actions, fileLinks(a.files));
    }

    function ks3Row(o, k) {
        const acts = o.ks2.filter(a => k.ks2Ids.includes(a.id));
        const base = ks3Base(o, k);
        const pay = paymentState(k);
        const actions = [...routeActions(o, k, 'КС-3')];
        if (k.status === 'signed' && !k.cashflowOpId) actions.push(['Передать в «Финансы»', () => toCashflow(o, k)]);
        actions.push(['Word', () => exportDocx(o, 'ks3', k)], ['Excel', () => exportKs3Xlsx(o, k)], ['PDF', () => printDoc(o, 'ks3', k)]);
        if (k.status === 'draft') actions.push(['Удалить', () => { o.ks3 = o.ks3.filter(x => x !== k); log(o, `Удалён проект КС-3 № ${k.number}`); save(); render(); }]);
        return row(STATUS[k.status], TONE[k.status], `КС-3 № ${k.number} от ${formatDate(k.date)} · ${money(ks3Total(o, k))} с НДС`,
            [`КС-2: ${acts.map(a => `№ ${a.number} (${STATUS[a.status].toLowerCase()})`).join(', ') || '—'} · без НДС ${money(base)}, НДС ${k.vatPct === 'none' ? 'не облагается' : money(vatOf(k, base))}`,
                k.sentAt ? `Передана ${formatDate(k.sentAt)}${k.resentAt ? ', повторно ' + formatDate(k.resentAt) : ''}` : '',
                k.signedAt ? `Подписана ${formatDate(k.signedAt)} · ${k.signRef}` : '',
                pay, ((k.remarks || []).filter(r => r.status === 'open')).map(r => `Замечание: ${r.text}`).join('; ')],
            actions, fileLinks(k.files));
    }

    // ИД of the work types used in the act's lines
    function relatedId(o, a) {
        const works = new Set(a.lines.map(l => (itemOf(o, l.itemId) || {}).workId).filter(Boolean));
        const fromVolumes = new Set(o.volumes.filter(v => a.lines.some(l => l.itemId === v.itemId)).flatMap(v => v.idRefs || []));
        return o.id.filter(d => works.has(d.workId) || fromVolumes.has(d.id));
    }

    function nextNumber(list) {
        const n = list.map(x => parseInt(x.number, 10)).filter(Number.isFinite);
        return String(n.length ? Math.max(...n) + 1 : 1);
    }

    function newKs2(o) {
        if (!o.estimate.length) return notify('Добавьте позиции сметы и выполненные объёмы во вкладке «Смета и объёмы».');
        const last = [...o.ks2].sort((a, b) => (b.to || '').localeCompare(a.to || ''))[0];
        const lines = o.estimate.map(i => ({ itemId: i.id, qty: round2(Math.max(0, volumes(o, i).toPresent)), price: num(i.price) })).filter(l => l.qty > 0);
        if (!lines.length) return notify('Нет выполненных и ещё не предъявленных объёмов. Запишите объёмы в КС-6а.');
        const a = { id: uid(), number: nextNumber(o.ks2), date: today(), from: last && last.to ? addDay(last.to) : (o.start || today()), to: today(), contractId: o.ksSettings.contractId, lines, status: 'draft', remarks: [], history: [], files: [] };
        editKs2(o, a, true);
    }

    const addDay = d => new Date(new Date(d + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);

    function editKs2(o, a, isNew) {
        const inputs = {};
        const extra = h('div', { class: 'home-ks__lines' }, h('p', { class: 'home-dialog__label' }, 'Объёмы к предъявлению'),
            table(['Позиция', 'Можно предъявить', 'В акте'], o.estimate.map(i => {
                const v = volumes(o, i);
                const own = (a.lines.find(l => l.itemId === i.id) || {}).qty || 0;
                const available = round2(v.done - v.presented - v.drafted + (isNew ? 0 : own));
                const input = h('input', { type: 'number', step: 'any', min: '0', value: isNew ? (a.lines.find(l => l.itemId === i.id) || {}).qty || '' : own || '', class: 'home-ks__qty' });
                inputs[i.id] = { input, available, item: i };
                return h('tr', {}, h('td', {}, `${i.code} · ${i.name}`), h('td', {}, `${qtyText(Math.max(0, available))} ${i.unit}`), h('td', {}, input));
            })));
        openDialog(isNew ? 'Новый акт КС-2' : `КС-2 № ${a.number}`, [
            { name: 'number', label: 'Номер акта', value: a.number, required: true },
            { name: 'date', label: 'Дата составления', type: 'date', value: a.date, required: true },
            { name: 'from', label: 'Отчётный период с', type: 'date', value: a.from, required: true },
            { name: 'to', label: 'по', type: 'date', value: a.to, required: true }
        ], 'Сохранить', v => {
            if (v.from > v.to) return 'Начало периода позже окончания.';
            if (o.ks2.some(x => x !== a && x.number === v.number)) return `КС-2 № ${v.number} уже есть.`;
            const lines = [];
            for (const [itemId, x] of Object.entries(inputs)) {
                const qty = num(x.input.value);
                if (!qty) continue;
                if (qty < 0) return 'Объём не может быть отрицательным.';
                if (qty > x.available + 1e-9) return `«${x.item.name}»: в акт можно включить не больше ${qtyText(Math.max(0, x.available))} ${x.item.unit} — выполненный и ещё не предъявленный объём по КС-6а.`;
                const prev = a.lines.find(l => l.itemId === itemId);
                lines.push({ itemId, qty: round2(qty), price: prev ? prev.price : num(x.item.price) });
            }
            if (!lines.length) return 'Укажите объём хотя бы по одной позиции.';
            Object.assign(a, { number: v.number, date: v.date, from: v.from, to: v.to, lines, contractId: a.contractId || o.ksSettings.contractId });
            if (isNew) { o.ks2.push(a); history(a, 'Акт сформирован по данным КС-6а'); } else history(a, 'Акт изменён');
            log(o, `КС-2 № ${a.number}: ${isNew ? 'сформирован' : 'изменён'} (${money(ks2Total(a))})`);
            return null;
        }, extra);
    }

    function newKs3(o) {
        const used = new Set(o.ks3.flatMap(k => k.ks2Ids));
        const free = o.ks2.filter(a => !used.has(a.id));
        if (!free.length) return notify('Все акты КС-2 уже включены в справки КС-3. Сформируйте новый КС-2.');
        const contractIds = [...new Set(free.map(a => a.contractId || ''))];
        openDialog('Новая справка КС-3', [
            { name: 'number', label: 'Номер справки', value: nextNumber(o.ks3), required: true },
            { name: 'date', label: 'Дата', type: 'date', value: today(), required: true },
            { name: 'acts', label: 'Акты КС-2', type: 'multi', value: free.map(a => a.id), options: free.map(a => [a.id, `КС-2 № ${a.number} от ${formatDate(a.date)} — ${money(ks2Total(a))} (${STATUS[a.status].toLowerCase()})`]), hint: 'Каждый акт КС-2 включается только в одну справку КС-3.' }
        ], 'Сформировать', v => {
            if (!v.acts.length) return 'Выберите акты КС-2.';
            const acts = o.ks2.filter(a => v.acts.includes(a.id));
            if (new Set(acts.map(a => a.contractId || '')).size > 1 && contractIds.length > 1) return 'В одну справку включаются акты одного договора.';
            if (o.ks3.some(k => k.number === v.number)) return `КС-3 № ${v.number} уже есть.`;
            const k = {
                id: uid(), number: v.number, date: v.date, contractId: acts[0].contractId || o.ksSettings.contractId, ks2Ids: v.acts,
                from: acts.map(a => a.from).sort()[0], to: acts.map(a => a.to).sort().slice(-1)[0], vatPct: o.ksSettings.vatPct,
                status: 'draft', remarks: [], history: [], files: [], cashflowOpId: ''
            };
            history(k, `Справка сформирована по КС-2 № ${acts.map(a => a.number).join(', ')}`);
            o.ks3.push(k);
            log(o, `КС-3 № ${k.number}: сформирована (${money(ks3Total(o, k))} с НДС)`);
            return null;
        });
    }

    function sendDoc(o, doc, kind, again) {
        if (kind === 'КС-2' && !again) {
            const bad = doc.lines.filter(l => { const i = itemOf(o, l.itemId); return !i || volumes(o, i).presented + num(l.qty) > volumes(o, i).done + 1e-9; });
            if (bad.length) return notify('Предъявляемый объём превышает выполненный по КС-6а — исправьте акт.');
        }
        openDialog(again ? `Повторная передача: ${kind} № ${doc.number}` : `Передача заказчику: ${kind} № ${doc.number}`, [
            { name: 'date', label: 'Дата передачи', type: 'date', value: today(), required: true },
            { name: 'ref', label: 'Способ и подтверждение передачи', required: true, hint: 'Например: сопроводительное письмо исх. № 45, нарочно; ЭДО; документ о приёмке в ЕИС' }
        ], 'Отметить передачу', v => {
            if (again) { doc.resentAt = v.date; doc.status = 'resent'; } else { doc.sentAt = v.date; doc.status = 'sent'; }
            doc.sendRef = v.ref;
            history(doc, `${again ? 'Передан повторно' : 'Передан заказчику'} ${formatDate(v.date)}: ${v.ref}`);
            log(o, `${kind} № ${doc.number} ${again ? 'передан повторно' : 'передан заказчику'}`);
            reviewObligation(o, doc, kind, v.date);
            return null;
        });
    }

    function addRemarks(o, doc, name) {
        openDialog(`Замечания заказчика: ${name}`, [
            { name: 'text', label: 'Замечания (каждое с новой строки)', type: 'textarea', rows: 5, required: true },
            { name: 'files', label: 'Мотивированный отказ / письмо', type: 'file' }
        ], 'Сохранить', async v => {
            const files = await storeFiles(v.files);
            doc.remarks = doc.remarks || [];
            v.text.split('\n').map(s => s.trim()).filter(Boolean).forEach(text => doc.remarks.push({ id: uid(), text, at: today(), status: 'open' }));
            doc.files = [...(doc.files || []), ...files];
            doc.status = 'remarks';
            history(doc, `Получены замечания заказчика: ${v.text.split('\n').filter(Boolean).length}`);
            log(o, `${name}: замечания заказчика`);
        });
    }

    function fixRemarks(o, doc, name) {
        openDialog(`Устранение замечаний: ${name}`, [
            { name: 'answer', label: 'Что исправлено', type: 'textarea', rows: 3, required: true }
        ], 'Отметить', v => {
            (doc.remarks || []).filter(r => r.status === 'open').forEach(r => { r.status = 'fixed'; r.answer = v.answer; r.fixedAt = today(); });
            history(doc, `Замечания устранены: ${v.answer}`);
            log(o, `${name}: замечания устранены`);
        });
    }

    function signDoc(o, doc, kind) {
        if (kind === 'КС-3') {
            const notSigned = o.ks2.filter(a => doc.ks2Ids.includes(a.id) && a.status !== 'signed');
            if (notSigned.length) return notify(`Сначала отметьте подписание КС-2 № ${notSigned.map(a => a.number).join(', ')}.`);
        }
        openDialog(`Подписание заказчиком: ${kind} № ${doc.number}`, [
            { name: 'date', label: 'Дата подписания заказчиком', type: 'date', value: today(), required: true },
            { name: 'ref', label: 'Подтверждение подписания', required: true, hint: 'Подписанный экземпляр (вх. №), ЭДО с электронной подписью заказчика или документ о приёмке в ЕИС. Без подтверждения отметку не ставьте.' },
            { name: 'files', label: 'Скан подписанного документа', type: 'file' }
        ], 'Отметить подписание', async v => {
            const files = await storeFiles(v.files);
            doc.status = 'signed';
            doc.signedAt = v.date;
            doc.signRef = v.ref;
            doc.files = [...(doc.files || []), ...files];
            history(doc, `Подписан заказчиком ${formatDate(v.date)}: ${v.ref}`);
            log(o, `${kind} № ${doc.number} подписан заказчиком`);
            closeReviewObligation(doc, v.date, v.ref);
        });
    }

    // ---- Договоры: acceptance and payment deadlines as obligations of the customer ------------------

    function updateContracts(fn) {
        const store = readStore(CONTRACTS_KEY, { contracts: [] });
        const result = fn(store);
        try {
            localStorage.setItem(CONTRACTS_KEY, JSON.stringify(store));
        } catch (e) {
            notify('Не удалось обновить «Договоры».');
        }
        return result;
    }

    function reviewObligation(o, doc, kind, date) {
        if (!doc.contractId) return;
        const due = addDays(date, num(o.ksSettings.reviewDays) || 20);
        updateContracts(store => {
            const c = store.contracts.find(x => x.id === doc.contractId);
            if (!c) return;
            const existing = c.obligations.find(ob => ob.id === doc.obligationId);
            if (existing) { existing.due = due; existing.status = 'active'; return; }
            const ob = { id: uid(), party: 'customer', text: `Рассмотреть ${kind} № ${doc.number} от ${formatDate(doc.date)} (${o.name}): подписать или направить мотивированный отказ`, clause: '', due, condition: '', responsible: '', status: 'active', confirmed: false, source: 'auto', files: [] };
            c.obligations.push(ob);
            c.log.unshift({ at: Date.now(), text: `Добавлен срок рассмотрения ${kind} № ${doc.number} — из раздела «Объекты»` });
            doc.obligationId = ob.id;
        });
    }

    function closeReviewObligation(doc, date, ref) {
        if (!doc.contractId || !doc.obligationId) return;
        updateContracts(store => {
            const c = store.contracts.find(x => x.id === doc.contractId);
            const ob = c && c.obligations.find(x => x.id === doc.obligationId);
            if (ob) Object.assign(ob, { status: 'done', doneAt: date, doneNote: ref });
        });
    }

    const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);

    // ---- Финансы: a signed КС-3 becomes one confirmed receipt -------------------

    function toCashflow(o, k) {
        if (k.cashflowOpId) return notify('Справка уже передана в «Финансы».');
        const st = o.ksSettings;
        const total = ks3Total(o, k);
        const c = contracts().find(x => x.id === k.contractId);
        openDialog(`Передать в «Финансы»: КС-3 № ${k.number}`, [
            { name: 'date', label: 'Ожидаемая дата оплаты', type: 'date', value: addDays(k.signedAt || today(), num(st.paymentDays) || 30), required: true, hint: `Срок оплаты по договору: ${st.paymentDays} дн. после подписания` },
            { name: 'offset', label: 'Зачёт аванса, ₽', type: 'number', value: round2(total * num(st.advancePct) / 100) },
            { name: 'retention', label: 'Гарантийное удержание, ₽', type: 'number', value: round2(total * num(st.retentionPct) / 100) }
        ], 'Передать', v => {
            const offset = num(v.offset);
            const retention = num(v.retention);
            if (offset + retention >= total) return 'Зачёт аванса и удержание не могут быть больше стоимости справки.';
            const store = readStore(CASHFLOW_KEY, {});
            store.ops = store.ops || [];
            if (store.ops.some(op => op.ks3Id === k.id)) return 'Эта справка уже есть в «Финансах».';
            const op = {
                id: uid(), dir: 'in', category: 'work', title: `Оплата по КС-3 № ${k.number} от ${formatDate(k.date)} — ${o.name}`, counterparty: (c && c.customer) || customerOf(o).org || '',
                contractId: k.contractId || '', objectId: o.key, obligationId: '', date: v.date, amount: round2(total - offset - retention), gross: total, advanceOffset: offset, retention,
                basis: `КС-3 № ${k.number} от ${formatDate(k.date)}, КС-2 № ${o.ks2.filter(a => k.ks2Ids.includes(a.id)).map(a => a.number).join(', ')}; подписано ${formatDate(k.signedAt)}`,
                confirmed: true, priority: 'normal', payments: [], note: 'Передано из «Объектов» (формы КС)', source: 'ks3', ks3Id: k.id, created: Date.now()
            };
            store.ops.push(op);
            try {
                localStorage.setItem(CASHFLOW_KEY, JSON.stringify(store));
            } catch (e) {
                return 'Не удалось сохранить в «Финансы».';
            }
            k.cashflowOpId = op.id;
            history(k, `Передана в «Финансы»: к оплате ${money(op.amount)} до ${formatDate(v.date)}`);
            log(o, `КС-3 № ${k.number} передана в «Финансы»`);
            if (k.contractId) updateContracts(store2 => {
                const cc = store2.contracts.find(x => x.id === k.contractId);
                if (cc) cc.obligations.push({ id: uid(), party: 'customer', text: `Оплатить работы по КС-3 № ${k.number} от ${formatDate(k.date)}: ${money(op.amount)}`, clause: '', due: v.date, condition: '', responsible: '', status: 'active', confirmed: false, source: 'auto', files: [] });
            });
            return null;
        });
    }

    // Payment of a КС-3 as recorded in Финансы
    function paymentState(k) {
        if (!k.cashflowOpId) return k.status === 'signed' ? 'Не передана в «Финансы»: ожидаемая оплата не контролируется.' : '';
        const op = (readStore(CASHFLOW_KEY, {}).ops || []).find(x => x.id === k.cashflowOpId);
        if (!op) return 'Операция в «Финансах» не найдена (удалена).';
        const paid = (op.payments || []).reduce((s, p) => s + num(p.amount), 0);
        if (paid >= num(op.amount)) return `Оплачено полностью: ${money(paid)}.`;
        const days = daysUntil(op.date);
        return `Финансы: к оплате ${money(op.amount - paid)} до ${formatDate(op.date)}${paid ? `, оплачено ${money(paid)}` : ''}${days < 0 ? ` · просрочено ${-days} дн.` : ''}.`;
    }

    // ---- Journals ----------------------------------------------------------------------------

    function renderJournals(o) {
        const panel = ctx.el.panel;
        const general = o.journals.find(j => j.kind === 'general');
        panel.appendChild(h('div', { class: 'home-ct__actions' },
            general ? null : h('button', { type: 'button', class: 'home-btn home-btn--primary', onclick: () => addJournal(o, 'general') }, h('span', {}, 'Открыть общий журнал работ')),
            small('Специальный журнал', () => addJournal(o, 'special'))));
        if (!o.journals.length) panel.appendChild(h('p', { class: 'home-staff__empty' }, 'Журналов нет. Общий журнал работ при строительстве, реконструкции и капитальном ремонте ведётся по форме приказа Минстроя России № 1026/пр; специальные журналы — по видам работ.'));
        [...o.journals].sort((a, b) => (a.kind === 'general' ? -1 : 1) - (b.kind === 'general' ? -1 : 1)).forEach(j => {
            const entries = [...(j.entries || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            panel.appendChild(block(`${j.title}${j.kind === 'general' ? ' (приказ № 1026/пр)' : ''}`, [small('Запись', () => addEntry(o, j), true), small('Word', () => exportDocx(o, 'journal', j))],
                h('p', { class: 'home-ct__row-meta home-cf__pad' }, [`Начат ${formatDate(j.started)}`, j.responsible ? `Ответственный: ${j.responsible}` : '', j.idDocId ? 'в реестре ИД' : ''].filter(Boolean).join(' · ')),
                rows(entries.slice(0, 20), 'Записей нет.', e => row(formatDate(e.date), 'review', e.text, [ctx.workName(o, e.workId) !== '—' ? ctx.workName(o, e.workId) : '', e.author],
                    [['Удалить', () => { j.entries = j.entries.filter(x => x !== e); save(); render(); }]]))));
        });
        panel.appendChild(h('p', { class: 'home-note' }, 'Форма и порядок ведения общего журнала: ', normLink('p1026'), '. Журнал учёта выполненных работ КС-6а ведётся во вкладке «Смета и объёмы». Журналы включаются в реестр исполнительной документации.'));
    }

    function addJournal(o, kind) {
        const listId = 'ks-journal-titles';
        openDialog(kind === 'general' ? 'Общий журнал работ' : 'Специальный журнал работ', [
            ...(kind === 'special' ? [{ name: 'title', label: 'Наименование журнала', required: true, hint: `Например: ${JOURNAL_TITLES.slice(0, 3).join(', ')}` }] : []),
            { name: 'started', label: 'Дата начала ведения', type: 'date', value: o.start || today(), required: true },
            { name: 'responsible', label: 'Ответственный за ведение', value: (contractorOf(o).person || '') }
        ], 'Открыть журнал', v => {
            const title = kind === 'general' ? 'Общий журнал работ' : v.title;
            let doc = o.id.find(d => d.type === 'journal' && d.title.toLowerCase() === title.toLowerCase());
            if (!doc) {
                doc = { id: uid(), workId: '', type: 'journal', title, templateTitle: title, number: '', date: v.started, due: '', responsible: v.responsible, status: 'draft', rdRef: '', files: [] };
                o.id.push(doc);
            }
            o.journals.push({ id: uid(), kind, title, started: v.started, responsible: v.responsible, idDocId: doc.id, entries: [] });
            log(o, `Открыт журнал: ${title}`);
        });
        const input = document.querySelector('[data-ct-dialog] input[name=title]');
        if (input) {
            input.setAttribute('list', listId);
            if (!document.getElementById(listId)) document.body.appendChild(h('datalist', { id: listId }, JOURNAL_TITLES.map(t => h('option', { value: t }))));
        }
    }

    function addEntry(o, j) {
        openDialog(`Запись: ${j.title}`, [
            { name: 'date', label: 'Дата', type: 'date', value: today(), required: true },
            { name: 'work', label: 'Вид работ', type: 'select', options: [['', '— не указан —'], ...o.works.map(w => [w.id, w.name])] },
            { name: 'text', label: 'Содержание записи', type: 'textarea', rows: 4, required: true, hint: 'Выполненные работы, условия производства, результаты контроля' },
            { name: 'author', label: 'Кто внёс запись (ФИО, должность)', required: true }
        ], 'Добавить', v => {
            j.entries = j.entries || [];
            j.entries.push({ id: uid(), date: v.date, workId: v.work, text: v.text, author: v.author });
            log(o, `${j.title}: запись от ${formatDate(v.date)}`);
        });
    }

    // ---- Registry of forms and other unified forms ------------------------------------------------

    function renderForms(o) {
        const panel = ctx.el.panel;
        panel.appendChild(h('div', { class: 'home-ct__alert' }, 'С 01.01.2013 унифицированные формы не обязательны сами по себе: первичный документ должен содержать реквизиты ч. 2 ст. 9 Федерального закона № 402-ФЗ, а форма определяется договором или учётной политикой. По контрактам 44-ФЗ приёмка оформляется электронным документом о приёмке в ЕИС (ст. 94). Применимость формы проверяйте по условиям договора.'));
        panel.appendChild(block('Реестр строительных форм', null, table(['Форма', 'Наименование', 'ОКУД', 'Утверждена', 'Где ведётся', 'Документов'], FORMS.map(f => {
            const count = f.code === 'КС-2' ? o.ks2.length : f.code === 'КС-3' ? o.ks3.length : f.code === 'КС-6а' ? o.volumes.length : f.code === 'КС-6' ? o.journals.filter(j => j.kind === 'general').length : o.ksDocs.filter(d => d.form === f.code).length;
            const where = f.managed === 'acts' ? linkBtn('КС-2 и КС-3', () => { sub = 'acts'; render(); })
                : f.managed === 'volumes' ? linkBtn('Смета и объёмы', () => { sub = 'volumes'; render(); })
                    : f.managed === 'journals' ? linkBtn('Журналы работ', () => { sub = 'journals'; render(); })
                        : linkBtn('Сформировать', () => newFormDoc(o, f));
            return h('tr', {}, h('td', {}, f.code), h('td', {}, f.title, f.note ? h('span', { class: 'home-ks__sub' }, f.note) : null), h('td', {}, f.okud || '—'), h('td', {}, f.basis), h('td', {}, where), h('td', {}, String(count)));
        }))));
        const docs = [...o.ksDocs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        panel.appendChild(block('Акты по другим формам', null, rows(docs, 'Документов нет. Выберите форму в реестре и нажмите «Сформировать».', d => {
            const f = KF.FORMS[d.form];
            const issues = formChecks(o, d);
            const actions = [...routeActions(o, d, d.form)];
            if (['draft', 'remarks'].includes(d.status)) actions.push(['Изменить', () => editFormDoc(o, d)]);
            actions.push(['Word', () => exportFormDocx(o, d)], ['Excel', () => exportFormXlsx(o, d)], ['PDF', () => printFormDoc(o, d)]);
            if (d.status === 'draft') actions.push(['Удалить', () => { o.ksDocs = o.ksDocs.filter(x => x !== d); log(o, `Удалён проект ${d.form} № ${d.number}`); save(); render(); }]);
            const sum = f ? f.summary(d).map(([l, v]) => `${l}: ${Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 2 })}`).join(' · ') : '';
            return row(STATUS[d.status], TONE[d.status], `${d.form} № ${d.number} от ${formatDate(d.date)} · ${f ? f.title : ''}`,
                [sum, issues.length ? `Проверка — нарушений: ${issues.filter(x => x.level === 'error').length}, предупреждений: ${issues.filter(x => x.level !== 'error').length}. ${issues.slice(0, 3).map(x => x.text).join(' ')}` : 'Проверка: нарушений нет',
                    d.signedAt ? `Подписан ${formatDate(d.signedAt)} · ${d.signRef}` : '', ((d.remarks || []).filter(x => x.status === 'open')).map(x => `Замечание: ${x.text}`).join('; ')], actions, fileLinks(d.files));
        })));
    }

    // ---- Other unified forms: autofill from the object, contract, estimate, КС-2/КС-3 and ИД ------------------

    function autoValue(o, key) {
        const c = contractOf(o);
        const p = roles => o.participants.find(x => roles.includes(x.role)) || {};
        const org = x => x.org || '';
        const person = x => [x.person, x.org].filter(Boolean).join(', ');
        const s = summary(o);
        const signedId = o.id.filter(d => d.status === 'signed');
        switch (key) {
            case 'contractor': return org(p(['Генеральный подрядчик', 'Подрядчик']));
            case 'customer': return org(p(['Технический заказчик', 'Застройщик']));
            case 'investor': return org(p(['Застройщик']));
            case 'designer': return org(p(['Проектировщик']));
            case 'customerPerson': return person(p(['Технический заказчик', 'Застройщик']));
            case 'contractorPerson': return person(p(['Генеральный подрядчик', 'Подрядчик']));
            case 'contract': return c ? `${contractName(c)}${c.subject ? ', ' + c.subject : ''}` : '';
            case 'address': return o.address || '';
            case 'object': return [o.name, o.stage, o.address].filter(Boolean).join(', ');
            case 'permit': return o.permit || '';
            case 'subcontractors': return o.participants.filter(x => x.role === 'Субподрядчик').map(x => x.org).join('\n');
            case 'designers': return o.participants.filter(x => x.role === 'Проектировщик').map(x => x.org).join('\n');
            case 'start': return o.start || '';
            case 'end': return o.end || '';
            case 'tests': return signedId.filter(d => d.type === 'tests').map(d => `${d.title}${d.number ? ' № ' + d.number : ''}${d.date ? ' от ' + formatDate(d.date) : ''}`).join('\n');
            case 'contractPrice': return s.price || '';
            case 'accepted': return s.acceptedVat || '';
            case 'documentation': return [`Исполнительная документация: подписано ${signedId.length} из ${o.id.length} документов`, ...o.handovers.filter(x => x.status === 'accepted').map(x => `${x.title} — принят ${formatDate(x.acceptedAt)}`)].join('\n');
            case 'members': return o.participants.filter(x => x.person).map(x => `${x.role}: ${x.person}`).join('\n');
            default: return '';
        }
    }

    function autoTables(o, code) {
        const s = summary(o);
        if (code === 'КС-17') return { items: [{ name: o.name, code: o.code || '', start: o.start ? formatDate(o.start) : '', full: s.price || 0, fullSmr: 0, done: s.acceptedVat || 0, doneSmr: 0, actual: 0, settle: 0, losses: 0, conservation: 0 }] };
        if (code === 'КС-11' || code === 'КС-14') return { indicators: [], housing: [], remaining: o.estimate.map(i => ({ i, v: volumes(o, i) })).filter(x => x.v.remaining > 0).map(x => ({ name: x.i.name, unit: x.i.unit, qty: round2(x.v.remaining), due: '' })) };
        if (code === 'КС-9') {
            const ks8 = o.ksDocs.filter(d => d.form === 'КС-8').sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
            return { materials: ks8 ? (ks8.tables.materials || []).map(m => ({ name: m.name, nomenclature: '', unit: m.unit, expQty: m.qty, expFit: m.fit, qty: m.qty, fit: m.fit, price: m.price, note: '' })) : [] };
        }
        return {};
    }

    function newFormDoc(o, f) {
        const meta = KF.FORMS[f.code];
        if (!meta) return notify('Форма ведётся в своём разделе.');
        const fields = {};
        meta.fields.forEach(x => { if (x.auto) fields[x.key] = autoValue(o, x.auto); });
        const d = { id: uid(), form: f.code, number: nextNumber(o.ksDocs.filter(x => x.form === f.code)), date: today(), contractId: o.ksSettings.contractId, fields, tables: autoTables(o, f.code), status: 'draft', remarks: [], history: [{ at: Date.now(), text: 'Сформирован с автозаполнением' }], files: [] };
        editFormDoc(o, d, true);
    }

    // Editor: requisites as fields, tabular parts as editable rows (calculated graphs are recomputed on save)
    function editFormDoc(o, d, isNew) {
        const meta = KF.FORMS[d.form];
        const boxes = {};
        const extra = h('div', { class: 'home-es__extra' }, ...meta.tables.map(t => {
            const box = h('div', { class: 'home-ks__form-rows' });
            boxes[t.key] = box;
            const addRow = (r = {}) => {
                const rowEl = h('div', { class: 'home-ks__form-row' }, ...t.columns.map(c => h('label', { class: 'home-ks__form-cell' + (c.calc ? ' is-calc' : '') }, h('span', {}, c.label),
                    h('input', { 'data-c': c.key, type: c.type === 'number' ? 'number' : 'text', step: c.type === 'number' ? 'any' : null, value: r[c.key] ?? '', readonly: !!c.calc, placeholder: c.calc ? 'считается' : '' }))),
                h('button', { type: 'button', class: 'home-ks__link', onclick: ev => ev.target.closest('.home-ks__form-row').remove() }, 'Удалить строку'));
                box.appendChild(rowEl);
            };
            ((d.tables || {})[t.key] || []).forEach(addRow);
            return h('div', {}, h('p', { class: 'home-dialog__label' }, t.title), box, h('button', { type: 'button', class: 'home-ks__link', onclick: () => addRow() }, '+ строка'));
        }), h('p', { class: 'home-dialog__hint' }, `${meta.use} Графы — по бланку (${meta.basis}). Сведения, подставленные автоматически, проверьте перед подписанием.`));
        openDialog(`${d.form} — ${meta.title}`, [
            { name: 'number', label: 'Номер документа', value: d.number, required: true },
            { name: 'date', label: 'Дата составления', type: 'date', value: d.date, required: true },
            ...meta.fields.map(x => ({ name: 'f_' + x.key, label: x.label, type: x.type === 'textarea' ? 'textarea' : x.type || 'text', rows: 3, value: (d.fields || {})[x.key] ?? '', required: false, hint: x.hint }))
        ], 'Сохранить', v => {
            d.number = v.number;
            d.date = v.date;
            d.fields = {};
            meta.fields.forEach(x => { d.fields[x.key] = v['f_' + x.key]; });
            d.tables = {};
            meta.tables.forEach(t => {
                d.tables[t.key] = [...boxes[t.key].querySelectorAll('.home-ks__form-row')].map(rowEl => {
                    const r = {};
                    t.columns.forEach(c => { const inp = rowEl.querySelector(`[data-c="${c.key}"]`); r[c.key] = c.type === 'number' ? (inp.value === '' ? 0 : Number(inp.value)) : inp.value.trim(); });
                    return KF.rowValues(t, r);
                }).filter(r => t.columns.some(c => !c.calc && r[c.key] !== '' && r[c.key] !== 0));
            });
            if (isNew) o.ksDocs.push(d);
            history(d, isNew ? 'Сформирован' : 'Изменён');
            log(o, `${d.form} № ${d.number}: ${isNew ? 'сформирован' : 'изменён'}`);
            return null;
        }, extra);
    }

    // Form checks plus object prerequisites for acceptance (КС-11, КС-14)
    function formChecks(o, d) {
        const list = KF.check(d);
        if (d.form === 'КС-11' || d.form === 'КС-14') {
            const unsigned = o.id.filter(x => x.status !== 'signed');
            if (unsigned.length) list.push({ level: 'error', text: `Не подписана исполнительная документация: ${unsigned.length} док. (${unsigned.slice(0, 3).map(x => x.title).join('; ')}).` });
            const openRem = o.remarks.filter(x => x.status === 'open');
            if (openRem.length) list.push({ level: 'error', text: `Открытые замечания по РД и ИД: ${openRem.length}.` });
            const notSigned = o.ks2.filter(a => a.status !== 'signed');
            if (notSigned.length) list.push({ level: 'warning', text: `Не подписаны КС-2: ${notSigned.map(a => '№ ' + a.number).join(', ')}.` });
            const rem = ((d.tables || {}).remaining || []).length;
            if (rem) list.push({ level: 'warning', text: `В акте указаны работы, подлежащие выполнению: ${rem}. Согласуйте сроки с заказчиком.` });
            if (!o.handovers.some(x => x.status === 'accepted')) list.push({ level: 'warning', text: 'Нет принятых заказчиком комплектов ИД.' });
        }
        return list;
    }

    // ---- Checks and the PTO engineer's recommendations ------------------------------------------

    function checks(o) {
        ensure(o);
        const list = [];
        const add = (level, area, text, norm) => list.push({ level, area, text, norm });
        const st = o.ksSettings;
        if ((o.ks2.length || o.estimate.length) && !st.contractId) add('warning', 'Условия актирования', 'Не выбран договор: сроки приёмки и оплаты не контролируются в «Договорах».', 'l402');
        if (o.ks2.length && !o.participants.some(p => ['Застройщик', 'Технический заказчик'].includes(p.role))) add('error', 'Реквизиты', 'Не указан заказчик (застройщик) в участниках строительства — обязательный реквизит акта.', 'l402');
        if (o.ks2.length && !o.participants.some(p => ['Генеральный подрядчик', 'Подрядчик'].includes(p.role))) add('error', 'Реквизиты', 'Не указан подрядчик в участниках строительства — обязательный реквизит акта.', 'l402');
        o.participants.filter(p => ['Застройщик', 'Технический заказчик', 'Генеральный подрядчик', 'Подрядчик'].includes(p.role) && !p.person).forEach(p => add('warning', 'Подписи', `${p.role}: не указан представитель (должность, ФИО) для подписи актов.`, 'l402'));
        o.estimate.forEach(i => {
            const v = volumes(o, i);
            if (!num(i.price)) add('error', 'Смета', `«${i.name}»: не указана цена за единицу.`, 'l402');
            if (v.presented > v.done + 1e-9) add('error', 'Объёмы', `«${i.name}»: предъявлено ${qtyText(v.presented)} при выполненных ${qtyText(v.done)} ${i.unit} по КС-6а.`, 'l402');
            if (v.done > num(i.qty) + 1e-9) add('error', 'Объёмы', `«${i.name}»: выполнено больше сметного объёма.`, 'l402');
            if (!i.workId) add('warning', 'Связь с ИД', `«${i.name}»: не указан вид работ — нельзя проверить исполнительную документацию.`, 'p344');
        });
        o.volumes.filter(v => !(v.idRefs || []).length).forEach(v => { const i = itemOf(o, v.itemId) || {}; add('warning', 'КС-6а', `Объём «${i.name || '—'}» от ${formatDate(v.date)} не подтверждён исполнительной документацией.`, 'p344'); });
        o.ks2.forEach(a => {
            const name = `КС-2 № ${a.number}`;
            if (!a.number || !a.date || !a.from || !a.to) add('error', name, 'Не заполнены номер, дата или отчётный период.', 'l402');
            a.lines.forEach(l => { if (!itemOf(o, l.itemId)) add('error', name, 'Строка акта ссылается на удалённую позицию сметы.', 'l402'); });
            if (a.status !== 'signed') {
                const unsigned = relatedId(o, a).filter(d => d.status !== 'signed');
                if (unsigned.length) add(PRESENTED.includes(a.status) ? 'error' : 'warning', name, `Не подписана ИД по видам работ акта: ${unsigned.slice(0, 4).map(d => d.title).join('; ')}${unsigned.length > 4 ? ' и др.' : ''}. Риск отказа в приёмке.`, 'p344');
                const openRem = o.remarks.filter(r => r.status === 'open' && r.target === 'id' && relatedId(o, a).some(d => d.id === r.refId));
                if (openRem.length) add('warning', name, `Открытые замечания по ИД: ${openRem.length}.`, 'p344');
            }
            if (['sent', 'resent'].includes(a.status)) {
                const days = -daysUntil(a.resentAt || a.sentAt);
                if (days > num(st.reviewDays)) add('error', name, `На рассмотрении ${days} дн. при сроке ${st.reviewDays} дн.: запросите подписание или мотивированный отказ, проверьте условия договора.`, 'l44');
            }
            if ((a.remarks || []).some(r => r.status === 'open')) add('error', name, 'Есть неустранённые замечания заказчика.', 'l402');
            if (a.status === 'signed' && !a.signRef) add('error', name, 'Отмечен подписанным без подтверждения.', 'l402');
            if (a.status === 'signed' && !o.ks3.some(k => k.ks2Ids.includes(a.id))) add('warning', name, 'Подписан, но не включён в справку КС-3 — стоимость не предъявлена к оплате.', 'l402');
        });
        const seen = {};
        o.ks3.forEach(k => k.ks2Ids.forEach(id => { if (seen[id]) add('error', `КС-3 № ${k.number}`, 'Акт КС-2 включён в несколько справок КС-3 — двойной учёт стоимости.', 'l402'); seen[id] = true; }));
        o.ks3.forEach(k => {
            const name = `КС-3 № ${k.number}`;
            if (!k.vatPct) add('error', name, 'Не указана ставка НДС.', 'l402');
            if (k.status === 'signed' && !k.cashflowOpId) add('warning', name, 'Подписана, но не передана в «Финансы» — ожидаемая оплата не контролируется.', 'l402');
            const pay = k.cashflowOpId ? (readStore(CASHFLOW_KEY, {}).ops || []).find(x => x.id === k.cashflowOpId) : null;
            if (pay) {
                const paid = (pay.payments || []).reduce((s, p) => s + num(p.amount), 0);
                if (paid < num(pay.amount) && daysUntil(pay.date) < 0) add('error', name, `Оплата просрочена на ${-daysUntil(pay.date)} дн.: ${money(num(pay.amount) - paid)}.`, 'l402');
            }
        });
        o.ksDocs.forEach(d => formChecks(o, d).forEach(x => add(x.level, `${d.form} № ${d.number}`, x.text, d.form === 'КС-11' || d.form === 'КС-14' ? 'p344' : 'l402')));
        const s = summary(o);
        if (s.price && s.acceptedVat > s.price + 0.01) add('error', 'Договор', `Принято по КС-3 (${money(s.acceptedVat)}) больше цены договора (${money(s.price)}).`, 'l402');
        if ((o.volumes.length || o.ks2.length) && !o.journals.some(j => j.kind === 'general')) add('warning', 'Журналы', 'Не открыт общий журнал работ.', 'p1026');
        return list;
    }

    function renderCheck(o) {
        const panel = ctx.el.panel;
        const list = checks(o);
        const errors = list.filter(c => c.level === 'error');
        panel.appendChild(h('div', { class: 'home-ct__alert' + (errors.length ? ' home-ct__alert--overdue' : '') },
            list.length ? `Нарушений: ${errors.length}, предупреждений: ${list.length - errors.length}.` : 'Нарушений не найдено.'));

        // Readiness of drafts to be passed to the customer
        const ready = o.ks2.filter(a => a.status === 'draft').map(a => {
            const unsigned = relatedId(o, a).filter(d => d.status !== 'signed');
            const issues = list.filter(c => c.area === `КС-2 № ${a.number}` && c.level === 'error');
            return [a, unsigned, issues];
        });
        const risks = list.filter(c => /Риск|рассмотрении|просрочена|замечания|не передана|не включён/i.test(c.text));
        panel.append(
            block('Недостающие документы и ошибки оформления', [small('Инженер ПТО', () => ctx.askPto(o, null, list))],
                rows(list.filter(c => !risks.includes(c)), 'Ошибок оформления не найдено.', c => row(c.level === 'error' ? 'Нарушение' : 'Предупреждение', c.level === 'error' ? 'overdue' : 'soon', c.text, [c.area], [], h('p', { class: 'home-ct__row-meta' }, 'Основание: ', normLink(c.norm))))),
            block('Готовность к сдаче заказчику', null, rows(ready, 'Проектов КС-2 нет.', ([a, unsigned, issues]) =>
                row(unsigned.length || issues.length ? 'Не готов' : 'Готов', unsigned.length || issues.length ? 'overdue' : 'done', `КС-2 № ${a.number} · ${money(ks2Total(a))}`,
                    [unsigned.length ? `Подпишите ИД: ${unsigned.map(d => d.title).join('; ')}` : 'ИД по видам работ подписана', issues.map(i => i.text).join(' ')],
                    unsigned.length || issues.length ? [] : [['Передать заказчику', () => sendDoc(o, a, 'КС-2', false)]]))),
            block('Риски отказа в приёмке, задержки подписания и оплаты', null, rows(risks, 'Рисков не выявлено.', c => row(c.level === 'error' ? 'Риск' : 'Внимание', c.level === 'error' ? 'overdue' : 'soon', c.text, [c.area]))));
        panel.appendChild(h('p', { class: 'home-note' }, 'Проверки выполняются по правилам: обязательные реквизиты (ч. 2 ст. 9 402-ФЗ), соответствие объёмов смете и КС-6а, расчёты, связь с ИД, сроки договора. Содержание документов и применимость форм разберёт инженер ПТО, условия договора — юрист.'));
    }

    // Short summary for the object overview
    function overview(o) {
        ensure(o);
        if (!o.ks2.length && !o.estimate.length) return null;
        const s = summary(o);
        const pending = o.ks2.filter(a => ['sent', 'resent', 'remarks'].includes(a.status));
        return block('Формы КС', [small('Открыть', () => { ctx.setTab('ks'); sub = 'acts'; render(); })], rows([1], '', () => row(null, '', `Принято по КС-2: ${money(s.accepted)} · предъявлено ${money(s.presented)} · выполнено ${money(s.doneCost)}`,
            [pending.length ? `На подписании у заказчика: ${pending.map(a => `КС-2 № ${a.number} (${STATUS[a.status].toLowerCase()})`).join(', ')}` : 'Актов на подписании нет',
                s.rest !== null ? `Остаток по договору: ${money(s.rest)}` : ''], [])));
    }

    // ---- Export -------------------------------------------------------------------------------

    function ks2Rows(o, a) {
        return a.lines.map((l, n) => {
            const i = itemOf(o, l.itemId) || {};
            return [n + 1, i.code || '', i.name || '', i.rate || '', i.unit || '', qtyText(l.qty), money(l.price), money(num(l.qty) * num(l.price))];
        });
    }
    const KS2_COLS = ['№ по порядку', '№ позиции по смете', 'Наименование работ', 'Номер единичной расценки', 'Единица измерения', 'Количество', 'Цена за единицу, руб.', 'Стоимость, руб.'];
    const KS3_COLS = ['№ п/п', 'Наименование работ и затрат', 'Код', 'С начала проведения работ', 'С начала года', 'В том числе за отчётный период'];

    function header(o, doc) {
        const c = contracts().find(x => x.id === doc.contractId);
        return [
            ['Инвестор / заказчик', `${customerOf(o).org || '________'}`],
            ['Подрядчик (субподрядчик)', `${contractorOf(o).org || '________'}`],
            ['Стройка / объект', `${o.name}${o.address ? ', ' + o.address : ''}`],
            ['Договор (контракт)', c ? `${contractName(c)}${c.subject ? ', ' + c.subject : ''}` : '________']
        ];
    }

    function ks3Rows(o, k) {
        const cum = ks3Cumulative(o, k);
        const base = ks3Base(o, k);
        const vat = vatOf(k, base);
        return {
            rows: [[1, `Работы по объекту «${o.name}» (КС-2 № ${o.ks2.filter(a => k.ks2Ids.includes(a.id)).map(a => a.number).join(', ')})`, '', money(cum.fromStart), money(cum.fromYear), money(cum.period)]],
            totals: [['Итого', money(base)], [`НДС ${k.vatPct === 'none' ? '(не облагается)' : k.vatPct + '%'}`, money(vat)], ['Всего с НДС', money(base + vat)]]
        };
    }

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${url}"]`)) return resolve();
            const script = h('script', { src: url });
            script.onload = resolve;
            script.onerror = () => reject(new Error('Не удалось загрузить модуль экспорта. Проверьте подключение к интернету.'));
            document.head.appendChild(script);
        });
    }

    function download(blob, name) {
        const link = h('a', { href: URL.createObjectURL(blob), download: name });
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    }

    const signLines = o => [`Сдал: ${contractorOf(o).person || 'должность ____________'} ____________ (подпись)`, `Принял: ${customerOf(o).person || 'должность ____________'} ____________ (подпись)`];
    const TEMPLATE_NOTE = 'Документ подготовлен в AIRCHITECT по составу сведений унифицированной формы. Сверьте с формой, предусмотренной договором. Подписи ставятся сторонами.';

    async function exportDocx(o, kind, doc) {
        try {
            await loadScript(DOCX_URL);
            const D = window.docx;
            const p = (text, opts = {}) => new D.Paragraph({ alignment: opts.center ? D.AlignmentType.CENTER : opts.right ? D.AlignmentType.RIGHT : undefined, spacing: { after: 100 }, children: [new D.TextRun({ text, bold: opts.bold, size: opts.size || 20, font: 'Times New Roman' })] });
            const cell = (text, bold) => new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: String(text ?? ''), bold, size: 18, font: 'Times New Roman' })] })] });
            const tbl = (columns, data) => new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [new D.TableRow({ tableHeader: true, children: columns.map(c => cell(c, true)) }), ...data.map(r => new D.TableRow({ children: r.map(c => cell(c)) }))] });
            let children;
            let name;
            if (kind === 'ks2') {
                name = `КС-2 № ${doc.number} — ${o.name}`;
                children = [p('Унифицированная форма № КС-2 (ОКУД 0322005)', { right: true, size: 16 }), ...header(o, doc).map(([l, v]) => p(`${l}: ${v}`)),
                    p(`АКТ О ПРИЁМКЕ ВЫПОЛНЕННЫХ РАБОТ № ${doc.number}`, { bold: true, center: true, size: 24 }),
                    p(`Дата составления: ${formatDate(doc.date)} · Отчётный период: с ${formatDate(doc.from)} по ${formatDate(doc.to)}`, { center: true }),
                    tbl(KS2_COLS, [...ks2Rows(o, doc), ['', '', 'Итого', '', '', '', '', money(ks2Total(doc))]]), p(''), ...signLines(o).map(t => p(t)), p(TEMPLATE_NOTE, { size: 14 })];
            } else if (kind === 'ks3') {
                const r = ks3Rows(o, doc);
                name = `КС-3 № ${doc.number} — ${o.name}`;
                children = [p('Унифицированная форма № КС-3 (ОКУД 0322001)', { right: true, size: 16 }), ...header(o, doc).map(([l, v]) => p(`${l}: ${v}`)),
                    p(`СПРАВКА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ № ${doc.number}`, { bold: true, center: true, size: 24 }),
                    p(`Дата составления: ${formatDate(doc.date)} · Отчётный период: с ${formatDate(doc.from)} по ${formatDate(doc.to)}`, { center: true }),
                    tbl(KS3_COLS, r.rows), ...r.totals.map(([l, v]) => p(`${l}: ${v}`, { right: true, bold: l.startsWith('Всего') })), p(''),
                    p(`Заказчик (генподрядчик): ${customerOf(o).person || 'должность ____________'} ____________ (подпись)`), p(`Подрядчик (субподрядчик): ${contractorOf(o).person || 'должность ____________'} ____________ (подпись)`), p(TEMPLATE_NOTE, { size: 14 })];
            } else if (kind === 'ks6a') {
                name = `КС-6а — ${o.name}`;
                const recs = [...o.volumes].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                children = [p('Унифицированная форма № КС-6а (ОКУД 0322006)', { right: true, size: 16 }), p(`Объект: ${o.name}`), p('ЖУРНАЛ УЧЁТА ВЫПОЛНЕННЫХ РАБОТ', { bold: true, center: true, size: 24 }),
                    tbl(['№', 'Позиция сметы', 'Наименование работ', 'Ед.', 'По смете', 'Дата', 'Выполнено', 'Цена, руб.', 'Стоимость, руб.'], recs.map((v, n) => {
                        const i = itemOf(o, v.itemId) || {};
                        return [n + 1, i.code || '', i.name || '', i.unit || '', qtyText(i.qty), formatDate(v.date), qtyText(v.qty), money(i.price), money(num(v.qty) * num(i.price))];
                    })), p(''), p(`Ответственный: ${contractorOf(o).person || '____________'} ____________ (подпись)`), p(TEMPLATE_NOTE, { size: 14 })];
            } else if (kind === 'journal') {
                name = `${doc.title} — ${o.name}`;
                const entries = [...(doc.entries || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                const specials = o.journals.filter(j => j.kind === 'special');
                children = [p(doc.title.toUpperCase(), { bold: true, center: true, size: 24 }), p(`Объект: ${o.name}${o.address ? ', ' + o.address : ''}`), p(`Начат: ${formatDate(doc.started)}${doc.responsible ? ' · ответственный: ' + doc.responsible : ''}`),
                    ...(doc.kind === 'general' ? [p('Перечень специальных журналов, в которых ведётся учёт выполнения работ', { bold: true }), tbl(['№', 'Наименование журнала', 'Дата начала', 'Ответственный'], specials.map((j, n) => [n + 1, j.title, formatDate(j.started), j.responsible || '']))] : []),
                    p('Записи о выполнении работ', { bold: true }),
                    tbl(['№', 'Дата', 'Вид работ', 'Содержание', 'Кто внёс запись'], entries.map((e, n) => [n + 1, formatDate(e.date), ctx.workName(o, e.workId), e.text, e.author])),
                    p(doc.kind === 'general' ? 'Выгрузка записей. Журнал ведётся по форме и в порядке приказа Минстроя России от 02.12.2022 № 1026/пр.' : 'Выгрузка записей специального журнала.', { size: 14 })];
            } else {
                const f = FORMS.find(x => x.code === doc.form) || {};
                name = `${doc.form} № ${doc.number} — ${o.name}`;
                children = [p(`Унифицированная форма № ${doc.form}${f.okud ? ' (ОКУД ' + f.okud + ')' : ''}`, { right: true, size: 16 }), ...header(o, doc).map(([l, v]) => p(`${l}: ${v}`)),
                    p(`${(f.title || '').toUpperCase()} № ${doc.number}`, { bold: true, center: true, size: 24 }), p(`Дата составления: ${formatDate(doc.date)}`, { center: true }),
                    p(doc.subject), p('Остальные сведения по форме: ________'), p(''), ...o.participants.map(x => p(`${x.role}: ${x.person || '____________'} ____________ (подпись)`)), p(TEMPLATE_NOTE, { size: 14 })];
            }
            const file = new D.Document({ sections: [{ properties: { page: { size: { orientation: ['ks2', 'ks6a'].includes(kind) ? D.PageOrientation.LANDSCAPE : D.PageOrientation.PORTRAIT }, margin: { top: 851, bottom: 851, left: 1134, right: 851 } } }, children }] });
            download(await D.Packer.toBlob(file), `${name}.docx`);
        } catch (e) {
            notify(e.message || 'Не удалось сформировать документ.');
        }
    }

    async function xlsx(name, sheets) {
        try {
            await loadScript(XLSX_URL);
            const X = window.XLSX;
            const book = X.utils.book_new();
            sheets.forEach(([title, aoa, widths]) => {
                const sheet = X.utils.aoa_to_sheet(aoa);
                sheet['!cols'] = (widths || []).map(w => ({ wch: w }));
                X.utils.book_append_sheet(book, sheet, title);
            });
            X.writeFile(book, `${name}.xlsx`);
        } catch (e) {
            notify(e.message);
        }
    }

    const exportKs2Xlsx = (o, a) => xlsx(`КС-2 № ${a.number} — ${o.name}`, [['КС-2', [['Акт о приёмке выполненных работ (форма КС-2)'], ...header(o, a), [`№ ${a.number}`, `от ${formatDate(a.date)}`, `период ${formatDate(a.from)} — ${formatDate(a.to)}`], [], KS2_COLS,
        ...a.lines.map((l, n) => { const i = itemOf(o, l.itemId) || {}; return [n + 1, i.code, i.name, i.rate || '', i.unit, num(l.qty), num(l.price), round2(num(l.qty) * num(l.price))]; }), ['', '', 'Итого', '', '', '', '', ks2Total(a)]], [8, 12, 50, 14, 10, 12, 14, 16]]]);
    const exportKs3Xlsx = (o, k) => {
        const cum = ks3Cumulative(o, k);
        const base = ks3Base(o, k);
        return xlsx(`КС-3 № ${k.number} — ${o.name}`, [['КС-3', [['Справка о стоимости выполненных работ и затрат (форма КС-3)'], ...header(o, k), [`№ ${k.number}`, `от ${formatDate(k.date)}`], [], KS3_COLS,
            [1, `Работы по объекту «${o.name}»`, '', cum.fromStart, cum.fromYear, cum.period], [], ['', 'Итого', '', '', '', base], ['', `НДС ${k.vatPct === 'none' ? '—' : k.vatPct + '%'}`, '', '', '', vatOf(k, base)], ['', 'Всего с НДС', '', '', '', round2(base + vatOf(k, base))]], [8, 50, 8, 20, 20, 20]]]);
    };
    const exportKs6aXlsx = o => xlsx(`КС-6а — ${o.name}`, [['КС-6а', [['Журнал учёта выполненных работ (форма КС-6а)'], [`Объект: ${o.name}`], [], ['№ позиции', 'Наименование работ', 'Ед.', 'По смете', 'Цена, руб.', 'Выполнено', 'Предъявлено', 'Принято', 'Остаток', 'Стоимость выполненного, руб.'],
        ...o.estimate.map(i => { const v = volumes(o, i); return [i.code, i.name, i.unit, num(i.qty), num(i.price), v.done, v.presented, v.accepted, v.remaining, round2(v.done * num(i.price))]; })], [10, 50, 8, 12, 14, 12, 12, 12, 12, 18]],
    ['Записи', [['Дата', 'Позиция', 'Наименование', 'Объём', 'Ед.', 'ИД', 'Кто зафиксировал'], ...o.volumes.map(v => { const i = itemOf(o, v.itemId) || {}; return [formatDate(v.date), i.code, i.name, num(v.qty), i.unit, o.id.filter(d => (v.idRefs || []).includes(d.id)).map(d => d.title).join('; '), v.author || '']; })], [12, 10, 50, 12, 8, 60, 20]]]);
    const exportRegistryXlsx = o => xlsx(`Реестр КС-2 и КС-3 — ${o.name}`, [
        ['КС-2', [['Документ', 'Номер', 'Дата', 'Период с', 'по', 'Стоимость без НДС', 'Статус', 'Передан', 'Подписан', 'Подтверждение', 'В КС-3'],
            ...o.ks2.map(a => ['КС-2', a.number, formatDate(a.date), formatDate(a.from), formatDate(a.to), ks2Total(a), STATUS[a.status], formatDate(a.sentAt), formatDate(a.signedAt), a.signRef || '', (o.ks3.find(k => k.ks2Ids.includes(a.id)) || {}).number || ''])], [8, 8, 12, 12, 12, 18, 16, 12, 12, 40, 8]],
        ['КС-3', [['Документ', 'Номер', 'Дата', 'КС-2', 'Без НДС', 'НДС', 'С НДС', 'Статус', 'Подписана', 'В «Финансах»'],
            ...o.ks3.map(k => { const b = ks3Base(o, k); return ['КС-3', k.number, formatDate(k.date), o.ks2.filter(a => k.ks2Ids.includes(a.id)).map(a => a.number).join(', '), b, vatOf(k, b), round2(b + vatOf(k, b)), STATUS[k.status], formatDate(k.signedAt), k.cashflowOpId ? 'да' : 'нет']; })], [8, 8, 12, 14, 18, 14, 18, 16, 12, 8]]]);

    // PDF through the browser print dialog
    function printDoc(o, kind, doc) {
        const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const tableHtml = (cols, data) => `<table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${data.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        let title;
        let body;
        if (kind === 'ks2') {
            title = `Акт о приёмке выполненных работ № ${doc.number}`;
            body = tableHtml(KS2_COLS, [...ks2Rows(o, doc), ['', '', 'Итого', '', '', '', '', money(ks2Total(doc))]]);
        } else {
            const r = ks3Rows(o, doc);
            title = `Справка о стоимости выполненных работ и затрат № ${doc.number}`;
            body = tableHtml(KS3_COLS, r.rows) + r.totals.map(([l, v]) => `<p style="text-align:right">${esc(l)}: ${esc(v)}</p>`).join('');
        }
        const win = window.open('', '_blank');
        if (!win) return notify('Разрешите всплывающие окна, чтобы сохранить PDF.');
        win.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title>
            <style>@page{size:${kind === 'ks2' ? 'landscape' : 'portrait'}}body{font-family:'Times New Roman',serif;font-size:11pt;margin:12mm}h1{font-size:13pt;text-align:center}table{width:100%;border-collapse:collapse}td,th{border:1px solid #000;padding:3px 5px;vertical-align:top}th{background:#eee}.n{font-size:8pt;color:#555}</style></head>
            <body>${header(o, doc).map(([l, v]) => `<p>${esc(l)}: ${esc(v)}</p>`).join('')}<h1>${esc(title)}</h1><p style="text-align:center">от ${esc(formatDate(doc.date))}, период ${esc(formatDate(doc.from))} — ${esc(formatDate(doc.to))}</p>
            ${body}${signLines(o).map(t => `<p>${esc(t)}</p>`).join('')}<p class="n">${esc(TEMPLATE_NOTE)}</p></body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
    }

    // ---- Export of the other forms by their structure ---------------------------------------------

    const fmtN = v => (typeof v === 'number' ? v.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : String(v ?? ''));

    async function exportFormDocx(o, d) {
        try {
            await loadScript(DOCX_URL);
            const D = window.docx;
            const meta = KF.FORMS[d.form];
            const p = (text, opts = {}) => new D.Paragraph({ alignment: opts.center ? D.AlignmentType.CENTER : opts.right ? D.AlignmentType.RIGHT : undefined, spacing: { after: 80 }, children: [new D.TextRun({ text, bold: opts.bold, size: opts.size || 20, font: 'Times New Roman' })] });
            const cell = (text, bold) => new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: String(text ?? ''), bold, size: 16, font: 'Times New Roman' })] })] });
            const tbl = (cols, data) => new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [new D.TableRow({ tableHeader: true, children: cols.map(c => cell(c, true)) }), ...data.map(r => new D.TableRow({ children: r.map(c => cell(c)) }))] });
            const children = [p(`Унифицированная форма № ${d.form}`, { right: true, size: 16 }), p(`Утверждена ${meta.basis}`, { right: true, size: 16 }), p(`Форма по ОКУД ${meta.okud}`, { right: true, size: 16 }),
                p(`${meta.title.toUpperCase()}`, { bold: true, center: true, size: 24 }), p(`Номер документа ${d.number} · Дата составления ${formatDate(d.date)}`, { center: true }),
                tbl(['Реквизит', 'Значение'], meta.fields.map(x => [x.label, x.type === 'date' ? formatDate((d.fields || {})[x.key]) : fmtN((d.fields || {})[x.key]) || '________']))];
            meta.tables.forEach(t => {
                const data = ((d.tables || {})[t.key] || []).map(r => KF.rowValues(t, r));
                children.push(p(t.title, { bold: true }), tbl(['№', ...t.columns.map(c => c.label)], [['1', ...t.columns.map((c, i) => String(i + 2))], ...data.map((r, i) => [String(i + 1), ...t.columns.map(c => fmtN(r[c.key]))])]));
                const totals = Array.isArray(t.total) ? t.total : t.total ? [t.total] : [];
                if (totals.length) children.push(p(`Итого: ${totals.map(k => `${t.columns.find(c => c.key === k).label} — ${fmtN(KF.tableTotal(d, t.key, k))}`).join('; ')}`, { right: true }));
            });
            meta.summary(d).forEach(([l, v, words]) => children.push(p(`${l}: ${fmtN(v)}${words ? ' (' + KF.rubles(v) + ')' : ''}`, { bold: true })));
            children.push(p(''), ...meta.signs.map(x => p(`${x}: ____________ / ____________ (должность, подпись, расшифровка подписи)`)), p(TEMPLATE_NOTE, { size: 14 }));
            const file = new D.Document({ sections: [{ properties: { page: { size: { orientation: D.PageOrientation.LANDSCAPE }, margin: { top: 851, bottom: 851, left: 1134, right: 851 } } }, children }] });
            download(await D.Packer.toBlob(file), `${d.form} № ${d.number} — ${o.name}.docx`);
        } catch (e) {
            notify(e.message || 'Не удалось сформировать документ.');
        }
    }

    // Excel: requisites and tables; calculated graphs and totals as formulas
    async function exportFormXlsx(o, d) {
        try {
            await loadScript(XLSX_URL);
            const X = window.XLSX;
            const meta = KF.FORMS[d.form];
            const aoa = [[`Унифицированная форма № ${d.form} (ОКУД ${meta.okud}), ${meta.basis}`], [meta.title.toUpperCase()], [`№ ${d.number}`, `от ${formatDate(d.date)}`], []];
            meta.fields.forEach(x => aoa.push([x.label, x.type === 'number' ? Number((d.fields || {})[x.key]) || '' : x.type === 'date' ? formatDate((d.fields || {})[x.key]) : (d.fields || {})[x.key] || '']));
            const formulas = [];
            meta.tables.forEach(t => {
                aoa.push([], [t.title], ['№', ...t.columns.map(c => c.label)], ['1', ...t.columns.map((c, i) => String(i + 2))]);
                const first = aoa.length + 1;
                ((d.tables || {})[t.key] || []).forEach((r0, i) => {
                    const r = KF.rowValues(t, r0);
                    const rowNum = aoa.length + 1;
                    aoa.push([i + 1, ...t.columns.map(c => (c.type === 'number' ? r[c.key] : r[c.key] || ''))]);
                    t.columns.forEach((c, ci) => {
                        if (c.key === 'sum' && t.columns.some(x => x.key === 'qty') && t.columns.some(x => x.key === 'price')) {
                            const col = k => X.utils.encode_col(t.columns.findIndex(x => x.key === k) + 1);
                            formulas.push([rowNum - 1, ci + 1, `ROUND(${col('qty')}${rowNum}*${col('price')}${rowNum},2)`]);
                        }
                    });
                });
                const last = aoa.length;
                const totals = Array.isArray(t.total) ? t.total : t.total ? [t.total] : [];
                if (totals.length) {
                    const tr = aoa.length;
                    aoa.push(['Итого', ...t.columns.map(() => '')]);
                    totals.forEach(k => { const ci = t.columns.findIndex(x => x.key === k) + 1; const col = X.utils.encode_col(ci); formulas.push([tr, ci, last >= first ? `SUM(${col}${first}:${col}${last})` : '0']); });
                }
            });
            const sheet = X.utils.aoa_to_sheet(aoa);
            formulas.forEach(([rr, cc, f]) => { sheet[X.utils.encode_cell({ r: rr, c: cc })] = { t: 'n', f }; });
            sheet['!cols'] = [{ wch: 48 }, ...Array(12).fill({ wch: 18 })];
            const book = X.utils.book_new();
            X.utils.book_append_sheet(book, sheet, d.form);
            X.writeFile(book, `${d.form} № ${d.number} — ${o.name}.xlsx`);
        } catch (e) {
            notify(e.message);
        }
    }

    function printFormDoc(o, d) {
        const meta = KF.FORMS[d.form];
        const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const tables = meta.tables.map(t => {
            const data = ((d.tables || {})[t.key] || []).map(r => KF.rowValues(t, r));
            return `<h3>${esc(t.title)}</h3><table><tr><th>№</th>${t.columns.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr><tr>${['1', ...t.columns.map((c, i) => i + 2)].map(x => `<td class="c">${x}</td>`).join('')}</tr>${data.map((r, i) => `<tr><td>${i + 1}</td>${t.columns.map(c => `<td>${esc(fmtN(r[c.key]))}</td>`).join('')}</tr>`).join('')}</table>`;
        }).join('');
        const win = window.open('', '_blank');
        if (!win) return notify('Разрешите всплывающие окна, чтобы сохранить PDF.');
        win.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(d.form)} № ${esc(d.number)}</title><style>@page{size:landscape}body{font-family:'Times New Roman',serif;font-size:10pt;margin:10mm}h1{font-size:13pt;text-align:center}h3{font-size:11pt;margin:10px 0 4px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #000;padding:3px 5px;vertical-align:top}.c{text-align:center;font-size:8pt}.r{text-align:right;font-size:8pt}</style></head><body>
            <p class="r">Унифицированная форма № ${esc(d.form)} · ОКУД ${esc(meta.okud)} · ${esc(meta.basis)}</p><h1>${esc(meta.title)}</h1><p style="text-align:center">№ ${esc(d.number)} от ${esc(formatDate(d.date))}</p>
            <table>${meta.fields.map(x => `<tr><td>${esc(x.label)}</td><td>${esc(x.type === 'date' ? formatDate((d.fields || {})[x.key]) : fmtN((d.fields || {})[x.key]))}</td></tr>`).join('')}</table>${tables}
            ${meta.summary(d).map(([l, v, w]) => `<p><b>${esc(l)}: ${esc(fmtN(v))}${w ? ' (' + esc(KF.rubles(v)) + ')' : ''}</b></p>`).join('')}
            ${meta.signs.map(x => `<p>${esc(x)}: ____________ / ____________</p>`).join('')}<p class="r">${esc(TEMPLATE_NOTE)}</p></body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
    }

    // ---- Demo ----------------------------------------------------------------------------------

    function demo(o, { works, signedIds }) {
        ensure(o);
        const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
        const item = (code, name, unit, qty, price, work) => { const i = { id: uid(), code, name, unit, qty, price, rate: '', workId: work.id }; o.estimate.push(i); return i; };
        const i1 = item('1', 'Устройство бетонной подготовки', 'м3', 120, 9800, works[1]);
        const i2 = item('2', 'Армирование фундаментов', 'т', 38, 92000, works[1]);
        const i3 = item('3', 'Бетонирование фундаментов', 'м3', 640, 14500, works[1]);
        const i4 = item('4', 'Гидроизоляция фундаментов', 'м2', 1450, 1100, works[1]);
        item('5', 'Монолитные колонны', 'м3', 210, 21000, works[2]);
        const vol = (i, qty, date, idRefs) => o.volumes.push({ id: uid(), itemId: i.id, date, qty, idRefs, author: 'Козлов Д.И.', note: '' });
        vol(i1, 120, day(-128), [signedIds[0]]);
        vol(i2, 20, day(-117), [signedIds[1]]);
        vol(i3, 300, day(-100), []);
        vol(i2, 12, day(-40), [signedIds[1]]);
        vol(i4, 900, day(-20), []);
        const line = (i, qty) => ({ itemId: i.id, qty, price: i.price });
        const contractId = o.ksSettings.contractId;
        o.ks2.push({ id: uid(), number: '1', date: day(-95), from: day(-150), to: day(-96), contractId, lines: [line(i1, 120), line(i2, 20), line(i3, 300)], status: 'signed', sentAt: day(-94), sendRef: 'письмо исх. № 41, нарочно', signedAt: day(-88), signRef: 'подписанный экземпляр, вх. № 118 (демо)', remarks: [], history: [], files: [] });
        o.ks2.push({ id: uid(), number: '2', date: day(-15), from: day(-95), to: day(-16), contractId, lines: [line(i2, 12), line(i4, 900)], status: 'remarks', sentAt: day(-14), sendRef: 'ЭДО', remarks: [{ id: uid(), text: 'Не приложен АОСР на гидроизоляцию фундаментов', at: day(-6), status: 'open' }], history: [], files: [] });
        o.ks3.push({ id: uid(), number: '1', date: day(-95), contractId, ks2Ids: [o.ks2[0].id], from: day(-150), to: day(-96), vatPct: '22', status: 'signed', sentAt: day(-94), signedAt: day(-88), signRef: 'подписанный экземпляр, вх. № 118 (демо)', remarks: [], history: [], files: [], cashflowOpId: '' });
        o.ksDocs.push({ id: uid(), form: 'КС-8', number: '1', date: day(-140), contractId, status: 'signed', signedAt: day(-139), signRef: 'подписан комиссией (демо)', remarks: [], history: [], files: [],
            fields: { organization: 'ООО «ГлавСтрой»', unit: 'Участок № 2', structure: 'Бытовой городок на 40 человек', contract: '', area: 180, volume: 540, cost: 1850000, dismantling: 120000, lifetime: 18, responsible: 'Сидоров С.С., начальник участка', keeper: 'Сидоров С.С.' },
            tables: { materials: [{ name: 'Брус 150×150', unit: 'м3', qty: 6.5, fit: 70, price: 9800, sum: 63700 }, { name: 'Плиты ОСП 12 мм', unit: 'шт', qty: 120, fit: 60, price: 650, sum: 78000 }] } });
        const general = o.id.find(d => d.type === 'journal' && d.title === 'Общий журнал работ');
        const concrete = o.id.find(d => d.type === 'journal' && d.title === 'Журнал бетонных работ');
        o.journals.push(
            { id: uid(), kind: 'general', title: 'Общий журнал работ', started: day(-150), responsible: 'Сидоров С.С.', idDocId: general ? general.id : '', entries: [
                { id: uid(), date: day(-130), workId: works[1].id, text: 'Выполнено устройство бетонной подготовки под фундаменты в осях 1–6', author: 'Сидоров С.С., начальник участка' },
                { id: uid(), date: day(-100), workId: works[1].id, text: 'Выполнено бетонирование фундаментов Фм-1…Фм-12', author: 'Сидоров С.С., начальник участка' }] },
            { id: uid(), kind: 'special', title: 'Журнал бетонных работ', started: day(-130), responsible: 'Козлов Д.И.', idDocId: concrete ? concrete.id : '', entries: [] });
    }

    return { renderTab, checks, overview, demo, ensure };
};
