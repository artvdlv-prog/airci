// Estimates (estimates.html): local estimates with sections, positions, resources and coefficients,
// import from Excel, checks, versions and comparison, price book and supplier offers, cost calculation
// of the contractor and export to Excel (with formulas), Word and PDF. Calculations: estimates-core.js.
// Data is kept in this browser (localStorage). A commercial calculation is not estimate documentation
// under Методика № 421/пр; normative methods need a verified normative data source.

document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('[data-estimates]');
    if (!root || !window.AirchitectEstimates) return;
    const E = window.AirchitectEstimates;
    const { money, num, toK, qtyText, METHODS, TYPES, KINDS, STATUS } = E;
    const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    const DOCX_URL = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';
    const COMMERCIAL_NOTE = 'Коммерческий расчёт. Не является сметной документацией, составленной по Методике определения сметной стоимости (приказ Минстроя России № 421/пр).';
    const VAT = [['22', '22%'], ['20', '20%'], ['10', '10%'], ['7', '7%'], ['5', '5%'], ['0', '0%'], ['none', 'Без НДС']];
    const BASES = { labor: 'от оплаты труда', direct: 'от прямых затрат', directOverhead: 'от прямых затрат и накладных', none: 'не начисляется' };

    let store = E.read();
    const save = () => { if (!E.write(store)) notify('Не удалось сохранить данные в браузере.'); };
    const readKey = (key, fallback) => {
        try {
            return JSON.parse(localStorage.getItem(key)) || fallback;
        } catch (e) {
            return fallback;
        }
    };
    const objects = () => readKey('airchitect-objects-v1', { objects: [] }).objects;
    const contracts = () => readKey('airchitect-contracts-v1', { contracts: [] }).contracts;
    const formatDate = d => (d ? d.split('-').reverse().join('.') : '');
    const formatStamp = ts => new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const inCabinet = document.documentElement.classList.contains('is-cabinet');
    const withCabinet = q => (inCabinet ? `${q}&cabinet=1` : q);

    let currentId = new URLSearchParams(location.search).get('id') || (store.estimates[0] && store.estimates[0].id);
    let tab = 'estimate';
    const current = () => store.estimates.find(e => e.id === currentId);
    const log = (e, text) => { e.log = e.log || []; e.log.unshift({ at: Date.now(), text }); };

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

    function notify(text) {
        const toast = h('div', { class: 'home-ct__toast', role: 'status' }, text);
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    const block = (title, tools, ...content) => h('section', { class: 'home-ct__block' },
        h('div', { class: 'home-ct__block-head' }, h('h3', { class: 'home-ct__block-title' }, title), tools ? h('div', { class: 'home-ct__filters' }, tools) : null), ...content);
    const small = (label, fn, primary) => h('button', { type: 'button', class: `home-btn home-btn--${primary ? 'primary' : 'secondary'} home-cab__small`, onclick: fn }, label);
    const linkBtn = (label, fn) => h('button', { type: 'button', class: 'home-ks__link', onclick: fn }, label);
    const table = (columns, body) => h('div', { class: 'home-cab__table-wrap' }, h('table', { class: 'home-cab__table home-es__table' },
        h('thead', {}, h('tr', {}, columns.map(c => h('th', {}, c)))), h('tbody', {}, body)));
    const note = text => h('p', { class: 'home-note' }, text);

    // ---- Dialog (same markup as Контракты) ------------------------------------------------------

    const dialog = document.querySelector('[data-ct-dialog]');
    const dialogTitle = dialog.querySelector('[data-ct-dialog-title]');
    const dialogBody = dialog.querySelector('[data-ct-dialog-body]');
    const dialogFoot = dialog.querySelector('[data-ct-dialog-foot]');
    const dialogError = dialog.querySelector('[data-ct-dialog-error]');
    dialog.querySelector('[data-ct-dialog-close]').addEventListener('click', () => dialog.close());

    function openDialog(title, fields, submitLabel, onSubmit, extra) {
        dialogTitle.textContent = title;
        dialogBody.textContent = '';
        dialogError.hidden = true;
        fields.forEach(f => {
            let input;
            if (f.type === 'select') {
                input = h('select', { name: f.name, required: f.required }, f.options.map(([v, l, disabled]) => h('option', { value: v, selected: String(v) === String(f.value ?? ''), disabled }, l)));
            } else if (f.type === 'textarea') {
                input = h('textarea', { name: f.name, rows: f.rows || 3, required: f.required });
                input.value = f.value ?? '';
            } else if (f.type === 'checkbox') {
                input = h('input', { type: 'checkbox', name: f.name, checked: !!f.value });
            } else {
                input = h('input', { type: f.type || 'text', name: f.name, required: f.required, step: f.step || (f.type === 'number' ? 'any' : null), accept: f.accept });
                if (f.type !== 'file') input.value = f.value ?? '';
            }
            if (f.onchange) input.addEventListener('change', f.onchange);
            dialogBody.appendChild(h('label', { class: 'home-dialog__field' + (f.type === 'checkbox' ? ' home-cf__check' : '') },
                f.type === 'checkbox' ? [input, h('span', { class: 'home-dialog__label' }, f.label)] : [h('span', { class: 'home-dialog__label' }, f.label + (f.required ? ' *' : '')), input],
                f.hint ? h('span', { class: 'home-dialog__hint' }, f.hint) : null));
        });
        if (extra) dialogBody.appendChild(extra);
        dialogFoot.textContent = '';
        dialogFoot.append(
            h('button', { type: 'button', class: 'home-btn home-btn--secondary', onclick: () => dialog.close() }, 'Отмена'),
            h('button', {
                type: 'submit', class: 'home-btn home-btn--primary', onclick: async e => {
                    e.preventDefault();
                    const form = dialog.querySelector('form');
                    if (!form.reportValidity()) return;
                    const values = {};
                    fields.forEach(f => {
                        const input = form.elements.namedItem(f.name);
                        values[f.name] = f.type === 'checkbox' ? input.checked : f.type === 'file' ? [...input.files] : input.value.trim();
                    });
                    const error = await onSubmit(values);
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

    // ---- List and card -------------------------------------------------------------------------

    const el = {
        list: root.querySelector('[data-es-list]'),
        empty: root.querySelector('[data-es-empty]'),
        card: root.querySelector('[data-es-card]'),
        title: root.querySelector('[data-es-title]'),
        meta: root.querySelector('[data-es-meta]'),
        tabs: root.querySelector('[data-es-tabs]'),
        panel: root.querySelector('[data-es-panel]')
    };
    const TABS = [['estimate', 'Смета'], ['cost', 'Себестоимость'], ['prices', 'Цены и КП'], ['check', 'Проверка'], ['versions', 'Редакции'], ['docs', 'Документы'], ['history', 'История']];
    const objectName = id => (objects().find(o => o.id === id) || {}).name || '';
    const contractName = c => (c ? `№ ${c.number || 'без номера'}${c.subject ? ' — ' + c.subject : ''}` : '');

    function render() {
        renderList();
        const e = current();
        el.empty.hidden = !!e;
        el.card.hidden = !e;
        if (!e) return;
        const r = E.calcEstimate(e.data);
        el.title.textContent = `${e.number ? 'Смета № ' + e.number + ' · ' : ''}${e.title}`;
        el.meta.textContent = [METHODS[e.method].title, objectName(e.objectId) && `Объект: ${objectName(e.objectId)}`, contractName(contracts().find(c => c.id === e.contractId)),
            `${STATUS[e.status]}`, `итого ${money(r.total)}`].filter(Boolean).join(' · ');
        document.title = `${el.title.textContent} — Сметы | AIRCHITECT`;
        el.tabs.textContent = '';
        TABS.forEach(([key, label]) => el.tabs.appendChild(h('button', { type: 'button', role: 'tab', class: 'home-tab', 'aria-selected': String(key === tab), onclick: () => { tab = key; render(); } }, label)));
        el.panel.textContent = '';
        ({ estimate: renderEstimate, cost: renderCost, prices: renderPrices, check: renderCheck, versions: renderVersions, docs: renderDocs, history: renderHistory })[tab](e, r);
    }

    function renderList() {
        el.list.textContent = '';
        store.estimates.forEach(e => {
            const r = E.calcEstimate(e.data);
            el.list.appendChild(h('li', {}, h('a', {
                href: withCabinet(`estimates.html?id=${e.id}`), class: 'home-staff__item' + (e.id === currentId ? ' is-active' : ''),
                onclick: ev => { ev.preventDefault(); currentId = e.id; tab = 'estimate'; window.history.replaceState(null, '', withCabinet(`?id=${e.id}`)); render(); }
            },
            h('span', { class: 'home-staff__item-title' }, `${e.number ? '№ ' + e.number + ' · ' : ''}${e.title}`),
            h('span', { class: 'home-staff__item-text' }, `${objectName(e.objectId) || 'без объекта'} · ${money(r.total)}`))));
        });
    }

    // ---- Estimate ---------------------------------------------------------------------------------

    function settingsLine(e) {
        const d = e.data;
        return [
            `Метод: ${METHODS[e.method].title}`, e.region && `регион: ${e.region}`, `дата цен: ${formatDate(e.priceDate)}`, e.base && `база: ${e.base}`, e.priceSource && `источник цен: ${e.priceSource}`,
            `накладные: ${num(d.overhead.pct) ? d.overhead.pct + '% ' + BASES[d.overhead.base] + (d.overhead.basis ? ' (' + d.overhead.basis + ')' : '') : 'нет'}`,
            `прибыль: ${num(d.profit.pct) ? d.profit.pct + '% ' + BASES[d.profit.base] + (d.profit.basis ? ' (' + d.profit.basis + ')' : '') : 'нет'}`,
            `НДС: ${d.vatPct === 'none' ? 'без НДС' : d.vatPct + '%'}`
        ].filter(Boolean).join(' · ');
    }

    function renderEstimate(e, r) {
        el.panel.appendChild(h('div', { class: 'home-ct__alert' }, COMMERCIAL_NOTE));
        el.panel.appendChild(block('Параметры расчёта', [small('Изменить', () => editSettings(e)), small('Удалить смету', () => { if (!confirm('Удалить смету со всеми редакциями из этого браузера?')) return; store.estimates = store.estimates.filter(x => x !== e); currentId = store.estimates[0] && store.estimates[0].id; save(); render(); })], h('p', { class: 'home-ct__row-meta home-cf__pad' }, settingsLine(e))));
        e.data.sections.forEach((s, si) => {
            const rs = r.sections[si];
            el.panel.appendChild(block(`${s.title} · ${money(rs.total)}`, [small('Позиция', () => editPosition(e, s), true), small('Переименовать', () => renameSection(e, s)), s.positions.length ? null : small('Удалить раздел', () => { e.data.sections = e.data.sections.filter(x => x !== s); save(); render(); })],
                s.positions.length ? table(['№', 'Обоснование', 'Наименование', 'Ед.', 'Кол-во', 'Цена, ₽', 'Коэф.', 'Стоимость, ₽', ''], s.positions.map((p, pi) => {
                    const c = rs.positions[pi];
                    const coef = (p.coefs || []).map(x => `${x.value}${x.applyTo !== 'all' ? ' (' + TYPES[x.applyTo].toLowerCase() + ')' : ''}`).join(', ');
                    return h('tr', {},
                        h('td', {}, p.code), h('td', {}, p.basis || p.priceSource), h('td', {}, p.name,
                            (p.resources || []).length ? h('span', { class: 'home-ks__sub' }, p.resources.map(x => `${TYPES[x.type]}: ${x.name} ${qtyText(x.norm)} ${x.unit} × ${num(x.price).toLocaleString('ru-RU')} ₽`).join('; ')) : h('span', { class: 'home-ks__sub' }, KINDS[p.kind])),
                        h('td', {}, p.unit), h('td', {}, qtyText(p.qty)), h('td', {}, (p.resources || []).length ? 'по ресурсам' : num(p.unitPrice).toLocaleString('ru-RU', { minimumFractionDigits: 2 })),
                        h('td', {}, coef || '—'), h('td', { class: 'home-es__num' }, money(c.total)),
                        h('td', { class: 'home-ks__cell-actions' }, linkBtn('Изменить', () => editPosition(e, s, p)), linkBtn('Удалить', () => { s.positions = s.positions.filter(x => x !== p); log(e, `Удалена позиция: ${p.name}`); save(); render(); })));
                })) : h('p', { class: 'home-staff__empty home-cf__pad' }, 'Позиций нет.')));
        });
        el.panel.appendChild(h('div', { class: 'home-ct__actions' }, small('Добавить раздел', () => addSection(e)), small('Импорт из Excel', () => importDialog(e))));
        el.panel.appendChild(totals(e, r));
    }

    function totals(e, r) {
        const rows = [
            ...Object.entries(TYPES).filter(([k]) => r.parts[k]).map(([k, l]) => [`в т. ч. ${l.toLowerCase()}`, r.parts[k], 'sub']),
            ['Прямые затраты', r.direct, 'strong'],
            [`Накладные расходы${num(e.data.overhead.pct) ? ' ' + e.data.overhead.pct + '%' : ''}`, r.overhead],
            [`Прибыль${num(e.data.profit.pct) ? ' ' + e.data.profit.pct + '%' : ''}`, r.profit],
            ['Итого без НДС', r.subtotal, 'strong'],
            [`НДС${e.data.vatPct === 'none' ? ' (не облагается)' : ' ' + e.data.vatPct + '%'}`, r.vat],
            ['Всего', r.total, 'strong']
        ];
        return block('Итоги расчёта', null, h('ul', { class: 'home-tn__sums' }, rows.map(([l, v, cls]) => h('li', { class: cls === 'strong' ? 'is-total' : cls === 'sub' ? 'home-es__subline' : '' }, h('span', {}, l), h('span', {}, money(v))))));
    }

    function editSettings(e) {
        const d = e.data;
        const os = objects();
        const cs = contracts();
        openDialog('Параметры расчёта', [
            { name: 'number', label: 'Номер сметы', value: e.number },
            { name: 'title', label: 'Наименование', value: e.title, required: true },
            { name: 'method', label: 'Метод расчёта', type: 'select', value: e.method, options: Object.entries(METHODS).map(([k, m]) => [k, m.available ? m.title : `${m.title} — нужна нормативная база`, !m.available]), hint: E.NORMATIVE_NOTE },
            { name: 'objectId', label: 'Объект', type: 'select', value: e.objectId, options: [['', '— без объекта —'], ...os.map(o => [o.id, o.name])] },
            { name: 'contractId', label: 'Договор', type: 'select', value: e.contractId, options: [['', '— без договора —'], ...cs.map(c => [c.id, contractName(c)])] },
            { name: 'region', label: 'Регион', value: e.region },
            { name: 'priceDate', label: 'Дата определения стоимости (уровень цен)', type: 'date', value: e.priceDate, required: true },
            { name: 'base', label: 'База расценок', value: e.base, hint: 'Например: справочник расценок компании, КП поставщиков' },
            { name: 'priceSource', label: 'Источник цен', value: e.priceSource },
            { name: 'ovPct', label: 'Накладные расходы, %', type: 'number', value: d.overhead.pct },
            { name: 'ovBase', label: 'База накладных расходов', type: 'select', value: d.overhead.base, options: Object.entries(BASES).filter(([k]) => k !== 'directOverhead') },
            { name: 'ovBasis', label: 'Основание норматива накладных расходов', value: d.overhead.basis, hint: 'Договор, учётная политика или методика с указанием пункта. Без основания проверка покажет нарушение.' },
            { name: 'prPct', label: 'Прибыль, %', type: 'number', value: d.profit.pct },
            { name: 'prBase', label: 'База прибыли', type: 'select', value: d.profit.base, options: Object.entries(BASES) },
            { name: 'prBasis', label: 'Основание норматива прибыли', value: d.profit.basis },
            { name: 'vat', label: 'НДС', type: 'select', value: d.vatPct, options: VAT, hint: 'С 01.01.2026 основная ставка — 22% (Федеральный закон № 425-ФЗ).' }
        ], 'Сохранить', v => {
            if (!METHODS[v.method].available) return E.NORMATIVE_NOTE;
            Object.assign(e, { number: v.number, title: v.title, method: v.method, objectId: v.objectId, contractId: v.contractId, region: v.region, priceDate: v.priceDate, base: v.base, priceSource: v.priceSource });
            d.overhead = { pct: num(v.ovPct), base: v.ovBase, basis: v.ovBasis };
            d.profit = { pct: num(v.prPct), base: v.prBase, basis: v.prBasis };
            d.vatPct = v.vat;
            if (e.status === 'checked') e.status = 'draft';
            log(e, 'Изменены параметры расчёта');
        });
    }

    function addSection(e) {
        openDialog('Новый раздел', [{ name: 'title', label: 'Наименование раздела', value: `Раздел ${e.data.sections.length + 1}`, required: true }], 'Добавить', v => {
            e.data.sections.push({ id: E.uid(), title: v.title, positions: [] });
            log(e, `Добавлен раздел: ${v.title}`);
        });
    }

    function renameSection(e, s) {
        openDialog('Раздел', [{ name: 'title', label: 'Наименование раздела', value: s.title, required: true }], 'Сохранить', v => { s.title = v.title; });
    }

    // Position with optional resources and coefficients (editable rows in the dialog)
    function editPosition(e, s, p) {
        const isNew = !p;
        const work = p ? E.clone(p) : E.blankPosition({ code: String(s.positions.length + 1) });
        const resBox = h('div', { class: 'home-es__rows' });
        const coefBox = h('div', { class: 'home-es__rows' });
        const resRow = (x = {}) => {
            const row = h('div', { class: 'home-es__row' },
                h('select', { 'data-f': 'type', 'aria-label': 'Тип ресурса' }, Object.entries(TYPES).filter(([k]) => k !== 'work').map(([k, l]) => h('option', { value: k, selected: x.type === k }, l))),
                h('input', { 'data-f': 'name', placeholder: 'Ресурс', value: x.name || '' }),
                h('input', { 'data-f': 'unit', placeholder: 'Ед.', value: x.unit || '', class: 'home-es__short' }),
                h('input', { 'data-f': 'norm', placeholder: 'Расход на ед.', type: 'number', step: 'any', value: x.norm ?? '', class: 'home-es__short' }),
                h('input', { 'data-f': 'price', placeholder: 'Цена', type: 'number', step: 'any', value: x.price ?? '', class: 'home-es__short' }),
                h('button', { type: 'button', class: 'home-ks__link', onclick: ev => ev.target.closest('.home-es__row').remove() }, 'Удалить'));
            row.dataset.id = x.id || E.uid();
            resBox.appendChild(row);
        };
        const coefRow = (x = {}) => {
            const row = h('div', { class: 'home-es__row' },
                h('input', { 'data-f': 'name', placeholder: 'Коэффициент', value: x.name || '' }),
                h('input', { 'data-f': 'value', placeholder: 'Значение', type: 'number', step: 'any', value: x.value ?? '', class: 'home-es__short' }),
                h('select', { 'data-f': 'applyTo', 'aria-label': 'К чему применяется' }, [['all', 'ко всему'], ...Object.entries(TYPES).filter(([k]) => k !== 'work').map(([k, l]) => [k, l.toLowerCase()])].map(([k, l]) => h('option', { value: k, selected: x.applyTo === k }, l))),
                h('input', { 'data-f': 'basis', placeholder: 'Основание (обязательно)', value: x.basis || '' }),
                h('button', { type: 'button', class: 'home-ks__link', onclick: ev => ev.target.closest('.home-es__row').remove() }, 'Удалить'));
            coefBox.appendChild(row);
        };
        (work.resources || []).forEach(resRow);
        (work.coefs || []).forEach(coefRow);
        const extra = h('div', { class: 'home-es__extra' },
            h('p', { class: 'home-dialog__label' }, 'Ресурсы на единицу (если заданы, цена позиции считается по ним)'), resBox, linkBtn('+ ресурс', () => resRow({ type: 'labor' })),
            h('p', { class: 'home-dialog__label' }, 'Коэффициенты'), coefBox, linkBtn('+ коэффициент', () => coefRow({ applyTo: 'all' })));
        const readRows = (box, fields) => [...box.querySelectorAll('.home-es__row')].map(row => {
            const o = { id: row.dataset.id || E.uid() };
            fields.forEach(f => { const inp = row.querySelector(`[data-f="${f}"]`); o[f] = inp.type === 'number' ? (inp.value === '' ? '' : Number(inp.value)) : inp.value.trim(); });
            return o;
        });
        openDialog(isNew ? 'Новая позиция' : 'Позиция сметы', [
            { name: 'code', label: '№ позиции', value: work.code },
            { name: 'basis', label: 'Обоснование', value: work.basis, hint: 'Код расценки компании, номер КП, прайс-лист' },
            { name: 'name', label: 'Наименование работ и затрат', value: work.name, required: true },
            { name: 'kind', label: 'Вид', type: 'select', value: work.kind, options: Object.entries(KINDS) },
            { name: 'unit', label: 'Единица измерения', value: work.unit, required: true },
            { name: 'qty', label: 'Количество', type: 'number', value: work.qty || '', required: true },
            { name: 'unitPrice', label: 'Цена за единицу без НДС, ₽', type: 'number', value: work.unitPrice || '', hint: 'Если ресурсы не заданы' },
            { name: 'priceSource', label: 'Источник цены', value: work.priceSource },
            { name: 'note', label: 'Примечание', type: 'textarea', rows: 2, value: work.note }
        ], 'Сохранить', v => {
            const resources = readRows(resBox, ['type', 'name', 'unit', 'norm', 'price']).filter(x => x.name);
            const coefs = readRows(coefBox, ['name', 'value', 'applyTo', 'basis']).filter(x => x.value !== '');
            if (!(num(v.qty) > 0)) return 'Количество должно быть больше нуля.';
            if (!resources.length && !(num(v.unitPrice) > 0)) return 'Укажите цену за единицу или ресурсы.';
            if (coefs.some(c => !c.basis)) return 'Для каждого коэффициента укажите основание.';
            Object.assign(work, { code: v.code, basis: v.basis, name: v.name, kind: v.kind, unit: v.unit, qty: num(v.qty), unitPrice: num(v.unitPrice), priceSource: v.priceSource, note: v.note, resources, coefs });
            if (isNew) s.positions.push(work);
            else Object.assign(p, work);
            if (e.status === 'checked') e.status = 'draft';
            log(e, `${isNew ? 'Добавлена' : 'Изменена'} позиция: ${v.name}`);
            return null;
        }, extra);
    }

    // ---- Import from Excel (estimate, new version, price book, offer) ---------------------------------

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${url}"]`)) return resolve();
            const script = h('script', { src: url });
            script.onload = resolve;
            script.onerror = () => reject(new Error('Не удалось загрузить модуль Excel. Проверьте подключение к интернету.'));
            document.head.appendChild(script);
        });
    }

    async function readWorkbook(file) {
        await loadScript(XLSX_URL);
        const buf = await file.arrayBuffer();
        return window.XLSX.read(buf, { type: 'array' });
    }
    const sheetRows = (wb, name) => window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });

    const FIELDS = { code: '№ позиции', basis: 'Обоснование', name: 'Наименование *', unit: 'Единица *', qty: 'Количество *', price: 'Цена за единицу', total: 'Стоимость (для проверки)' };

    // target: 'new' | 'version' (of e) | 'offer' | 'book'
    function importDialog(e, target) {
        let wb = null;
        let rows = [];
        const box = h('div', { class: 'home-es__extra' });
        const mapping = {};
        const preview = h('p', { class: 'home-dialog__hint' });
        const drawMapping = () => {
            box.textContent = '';
            if (!wb) return;
            const sheetSel = h('select', { 'data-sheet': '', onchange: () => { rows = sheetRows(wb, sheetSel.value); auto(); drawMapping(); } }, wb.SheetNames.map(n => h('option', { value: n, selected: n === mapping.sheet }, n)));
            box.append(h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, 'Лист'), sheetSel));
            const header = rows[mapping.headerRow] || [];
            const colOpts = [['', '— нет —'], ...(rows.reduce((m, r) => Math.max(m, r.length), 0) ? [...Array(rows.reduce((m, r) => Math.max(m, r.length), 0)).keys()].map(j => [String(j), `${String.fromCharCode(65 + (j % 26))}: ${String(header[j] || '').slice(0, 30)}`]) : [])];
            box.append(h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, 'Строка заголовков'),
                h('input', { type: 'number', min: '1', value: mapping.headerRow + 1, onchange: ev => { mapping.headerRow = Number(ev.target.value) - 1; drawMapping(); } })));
            const fields = target === 'offer' || target === 'book' ? ['name', 'unit', 'qty', 'price'] : Object.keys(FIELDS);
            fields.forEach(f => box.append(h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, FIELDS[f]),
                h('select', { 'data-map': f, onchange: ev => { mapping.map[f] = ev.target.value === '' ? undefined : Number(ev.target.value); updatePreview(); } }, colOpts.map(([v, l]) => h('option', { value: v, selected: v === String(mapping.map[f] ?? '') }, l))))));
            box.append(preview);
            updatePreview();
        };
        const auto = () => { const m = E.detectMapping(rows); mapping.headerRow = Math.max(0, m.headerRow); mapping.map = m.map; };
        const updatePreview = () => {
            const parsed = E.parseRows(rows, mapping);
            const count = parsed.sections.reduce((s, x) => s + x.positions.length, 0);
            preview.textContent = mapping.map.name === undefined || mapping.map.qty === undefined || mapping.map.unit === undefined
                ? 'Укажите столбцы наименования, единицы и количества.'
                : `Распознано: разделов ${parsed.sections.length}, позиций ${count}${parsed.grandTotal !== null ? `, итог в файле ${money(toK(parsed.grandTotal))}` : ''}${parsed.skipped.length ? `, пропущено строк: ${parsed.skipped.length}` : ''}.`;
        };
        const fields = [{ name: 'file', label: 'Файл Excel (.xlsx, .xls) или CSV', type: 'file', accept: '.xlsx,.xls,.csv', required: true, onchange: async ev => {
            try {
                wb = await readWorkbook(ev.target.files[0]);
                mapping.sheet = wb.SheetNames[0];
                rows = sheetRows(wb, mapping.sheet);
                auto();
                drawMapping();
            } catch (err) {
                notify(err.message || 'Не удалось прочитать файл.');
            }
        } }];
        if (target === 'offer') fields.push({ name: 'supplier', label: 'Поставщик / субподрядчик', required: true }, { name: 'number', label: 'Номер КП' }, { name: 'date', label: 'Дата КП', type: 'date', value: E.today() }, { name: 'until', label: 'Действительно до', type: 'date' });
        if (target === 'new') fields.push({ name: 'title', label: 'Наименование сметы', required: true }, { name: 'objectId', label: 'Объект', type: 'select', options: [['', '— без объекта —'], ...objects().map(o => [o.id, o.name])] });
        const title = { new: 'Импорт сметы из Excel', version: 'Новая редакция из Excel', offer: 'Коммерческое предложение из Excel', book: 'Справочник расценок из Excel' }[target || 'version'];
        openDialog(title, fields, 'Импортировать', v => {
            if (!wb) return 'Выберите файл.';
            if ([mapping.map.name, mapping.map.unit, mapping.map.qty].includes(undefined) && !['offer', 'book'].includes(target)) return 'Укажите столбцы наименования, единицы и количества.';
            if ((target === 'offer' || target === 'book') && (mapping.map.name === undefined || mapping.map.price === undefined)) return 'Укажите столбцы наименования и цены.';
            const parsed = E.parseRows(rows, mapping);
            const positions = parsed.sections.flatMap(s => s.positions);
            if (!positions.length) return 'Позиции не распознаны: проверьте строку заголовков и столбцы.';
            const fileName = v.file[0] ? v.file[0].name : 'файл';
            if (target === 'offer') {
                store.offers.push({ id: E.uid(), supplier: v.supplier, number: v.number, date: v.date, until: v.until, file: fileName, items: positions.map(p => ({ id: E.uid(), name: p.name, unit: p.unit, qty: p.qty, price: p.unitPrice })) });
                if (e) log(e, `Загружено КП ${v.supplier}: позиций ${positions.length}`);
                tab = 'prices';
                return null;
            }
            if (target === 'book') {
                positions.forEach(p => store.priceBook.push({ id: E.uid(), code: p.code, name: p.name, unit: p.unit, price: p.unitPrice, kind: 'work', source: fileName, date: E.today(), supplier: '' }));
                tab = 'prices';
                return null;
            }
            if (target === 'new' || !e) {
                const ne = E.blankEstimate({ title: v.title || fileName, objectId: v.objectId || '', importedTotal: parsed.grandTotal, base: 'Импорт из Excel', priceSource: fileName });
                ne.data.sections = parsed.sections;
                log(ne, `Импорт из «${fileName}»: позиций ${positions.length}${parsed.skipped.length ? ', пропущено строк ' + parsed.skipped.length : ''}`);
                E.snapshot(ne, `Импорт из «${fileName}»`);
                store.estimates.unshift(ne);
                currentId = ne.id;
                tab = 'check';
                return null;
            }
            if (!e.versions.length) E.snapshot(e, 'До импорта новой редакции');
            e.data.sections = parsed.sections;
            e.importedTotal = parsed.grandTotal;
            E.snapshot(e, `Импорт из «${fileName}»`);
            e.status = 'draft';
            log(e, `Новая редакция из «${fileName}»`);
            tab = 'versions';
            return null;
        }, box);
    }

    // ---- Cost calculation ---------------------------------------------------------------------------

    function renderCost(e) {
        const c = E.calcCost(e, store);
        const p = c.params;
        const contract = contracts().find(x => x.id === e.contractId);
        const field = (name, label, value, hint) => h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, label), h('input', { type: 'number', step: 'any', name, value }), hint ? h('span', { class: 'home-dialog__hint' }, hint) : null);
        const form = h('form', { class: 'home-ct__form' },
            field('contractPrice', 'Договорная цена, ₽', p.contractPrice, contract ? `Из «Контрактов»: ${contract.price || 'не указана'}` : 'Цена договора или предложения'),
            h('label', { class: 'home-dialog__field home-cf__check' }, h('input', { type: 'checkbox', name: 'contractVatIncluded', checked: p.contractVatIncluded }), h('span', { class: 'home-dialog__label' }, 'Цена включает НДС')),
            field('materialAdjPct', 'Корректировка цен материалов, %', p.materialAdjPct, 'К ценам сметы или привязанным ценам КП'),
            field('transportPct', 'Транспорт и логистика, % от материалов', p.transportPct),
            field('laborAdjPct', 'Корректировка оплаты труда, %', p.laborAdjPct, 'Фактические ставки компании относительно сметы'),
            field('payrollTaxPct', 'Страховые взносы, % от оплаты труда', p.payrollTaxPct),
            field('machineAdjPct', 'Корректировка стоимости техники, %', p.machineAdjPct),
            field('subcontractAdjPct', 'Корректировка субподряда, %', p.subcontractAdjPct),
            field('overheadPct', 'Накладные расходы компании, % от прямых затрат', p.overheadPct),
            field('otherTaxPct', 'Прочие налоги и сборы, % от договорной цены без НДС', p.otherTaxPct),
            field('riskPct', 'Резерв на риски, % от затрат', p.riskPct),
            field('profitPct', 'Планируемая прибыль, % к себестоимости', p.profitPct, 'Для расчёта цены предложения'),
            h('div', { class: 'home-ct__wide' }, h('button', { type: 'submit', class: 'home-btn home-btn--primary' }, 'Рассчитать')));
        form.addEventListener('submit', ev => {
            ev.preventDefault();
            const v = { contractVatIncluded: form.elements.contractVatIncluded.checked };
            Object.keys(E.COST_DEFAULTS).filter(k => k !== 'contractVatIncluded').forEach(k => { v[k] = k === 'contractPrice' ? form.elements[k].value : num(form.elements[k].value); });
            e.cost = v;
            log(e, 'Рассчитана себестоимость');
            save();
            render();
        });
        const group = (title, noteText, items) => h('section', { class: 'home-ct__block' }, h('div', { class: 'home-ct__block-head' }, h('h3', { class: 'home-ct__block-title' }, title)),
            h('p', { class: 'home-tn__group-note' }, noteText), h('ul', { class: 'home-tn__sums' }, items.filter(Boolean).map(([l, v, strong]) => h('li', { class: strong ? 'is-total' : '' }, h('span', {}, l), h('span', {}, v)))));
        el.panel.append(
            group('Сметная стоимость', 'Коммерческий расчёт по смете. Не является нормативной сметной стоимостью.', [['Итого без НДС', money(c.estimateNet)], ['С НДС', money(E.calcEstimate(e.data).total), true]]),
            group('Договорная цена', 'Из договора или предложения.', [c.contractNet === null ? ['Не указана', '—'] : ['Без НДС', money(c.contractNet), true]]),
            group('Прогнозная себестоимость', `Цены сметы${c.linked ? ` (привязанных цен справочника и КП: ${c.linked})` : ''} с параметрами компании.`, [
                ['Материалы и оборудование', money(c.lines.material)], ['Транспорт и логистика', money(c.lines.transport)], ['Оплата труда', money(c.lines.labor)], ['Страховые взносы', money(c.lines.payrollTax)],
                ['Техника', money(c.lines.machine)], ['Субподряд', money(c.lines.subcontract)], c.lines.work ? ['Работы без разложения на ресурсы', money(c.lines.work)] : null,
                ['Накладные расходы', money(c.overhead)], ['Прочие налоги', money(c.otherTax)], ['Резерв на риски', money(c.risk)], ['Себестоимость', money(c.cost), true]]),
            group('Финансовый результат (прогноз)', 'Договорная цена без НДС минус прогнозная себестоимость.', [
                c.result === null ? ['Укажите договорную цену', '—'] : ['Результат', money(c.result), true],
                c.margin === null ? null : ['Рентабельность', `${c.margin.toFixed(1)}%`],
                ['Цена предложения без НДС (себестоимость + прибыль)', money(c.offerNet)], ['Цена предложения с НДС', money(c.offer)]]));
        if (c.lines.work) el.panel.appendChild(h('div', { class: 'home-ct__alert' }, 'Часть позиций не разложена на ресурсы: оплата труда, взносы и транспорт по ним не выделяются. Для точной себестоимости разложите позиции или привяжите цены субподряда.'));
        el.panel.appendChild(block('Параметры себестоимости', null, h('div', { class: 'home-cf__pad' }, form)));
    }

    // ---- Prices: comparison, price book, offers --------------------------------------------------------

    function renderPrices(e) {
        const cmp = E.compare(e, store);
        const totalEconomy = cmp.reduce((s, c) => s + c.economy, 0);
        e.links = e.links || {};
        el.panel.appendChild(block(`Сравнительная ведомость цен${totalEconomy ? ' · потенциальная экономия ' + money(totalEconomy) : ''}`, [small('Excel', () => exportCompare(e))],
            table(['Позиция / ресурс', 'Ед.', 'Кол-во', 'Цена в смете', 'Справочник и КП', 'Лучшая', 'Экономия', 'В себестоимости'], cmp.map(c => {
                const all = E.candidates(store, c.line);
                const sel = h('select', { 'aria-label': 'Цена для себестоимости', onchange: ev => {
                    const v = ev.target.value;
                    if (!v) delete e.links[c.line.id]; else e.links[c.line.id] = JSON.parse(v);
                    log(e, `Цена для себестоимости: ${c.line.name}`);
                    save();
                    render();
                } }, h('option', { value: '' }, 'цена сметы'), c.cands.map(x => {
                    const link = x.source === 'book' ? { source: 'book', id: x.id } : { source: 'offer', offerId: x.offerId, itemId: x.itemId };
                    return h('option', { value: JSON.stringify(link), selected: JSON.stringify(e.links[c.line.id]) === JSON.stringify(link) }, `${x.label}: ${x.price.toLocaleString('ru-RU')} ₽`);
                }));
                return h('tr', {}, h('td', {}, c.line.name, h('span', { class: 'home-ks__sub' }, c.line.section.title)), h('td', {}, c.line.unit), h('td', {}, qtyText(c.line.qty)),
                    h('td', {}, c.line.price.toLocaleString('ru-RU', { minimumFractionDigits: 2 })),
                    h('td', {}, all.length ? all.map(x => `${x.label}: ${x.price.toLocaleString('ru-RU')} ₽${x.unitOk ? '' : ' (другая единица: ' + x.unit + ')'}`).join('; ') : '—'),
                    h('td', {}, c.best ? `${c.best.price.toLocaleString('ru-RU')} ₽` : '—'), h('td', { class: 'home-es__num' }, c.economy ? money(c.economy) : '—'), h('td', {}, c.cands.length ? sel : '—'));
            }))));
        el.panel.appendChild(note('Сопоставление — по совпадению наименования и единицы измерения. Экономия = (цена сметы − лучшая цена) × количество. Замену поставщика или материала проверяйте на соответствие проекту и договору.'));

        el.panel.appendChild(block('Коммерческие предложения', [small('Загрузить КП из Excel', () => importDialog(e, 'offer'), true)], store.offers.length
            ? table(['Поставщик', 'Номер', 'Дата', 'Действует до', 'Позиций', 'Файл', ''], store.offers.map(o => h('tr', {}, h('td', {}, o.supplier), h('td', {}, o.number || ''), h('td', {}, formatDate(o.date)),
                h('td', { class: o.until && o.until < E.today() ? 'home-tn__neg' : '' }, formatDate(o.until) || '—'), h('td', {}, String(o.items.length)), h('td', {}, o.file || ''),
                h('td', {}, linkBtn('Удалить', () => { store.offers = store.offers.filter(x => x !== o); save(); render(); })))))
            : h('p', { class: 'home-staff__empty home-cf__pad' }, 'КП не загружены. Загрузите КП поставщиков и субподрядчиков из Excel — цены сравнятся с позициями сметы.')));

        el.panel.appendChild(block('Справочник расценок компании', [small('Добавить', () => editBook()), small('Из Excel', () => importDialog(e, 'book'))], store.priceBook.length
            ? table(['Код', 'Наименование', 'Ед.', 'Цена, ₽', 'Источник', 'Дата', ''], store.priceBook.map(b => h('tr', {}, h('td', {}, b.code || ''), h('td', {}, b.name), h('td', {}, b.unit), h('td', {}, num(b.price).toLocaleString('ru-RU', { minimumFractionDigits: 2 })),
                h('td', {}, b.source || ''), h('td', {}, formatDate(b.date)), h('td', { class: 'home-ks__cell-actions' }, linkBtn('Изменить', () => editBook(b)), linkBtn('Удалить', () => { store.priceBook = store.priceBook.filter(x => x !== b); save(); render(); })))))
            : h('p', { class: 'home-staff__empty home-cf__pad' }, 'Справочник пуст. Добавьте собственные расценки компании.')));
    }

    function editBook(b) {
        openDialog(b ? 'Расценка' : 'Новая расценка', [
            { name: 'code', label: 'Код', value: b && b.code },
            { name: 'name', label: 'Наименование', value: b && b.name, required: true },
            { name: 'unit', label: 'Единица', value: b && b.unit, required: true },
            { name: 'price', label: 'Цена без НДС, ₽', type: 'number', value: b && b.price, required: true },
            { name: 'source', label: 'Источник', value: b ? b.source : 'Расценка компании', hint: 'Калькуляция, договор, прайс-лист' },
            { name: 'date', label: 'Дата цены', type: 'date', value: b ? b.date : E.today() }
        ], 'Сохранить', v => {
            if (!(num(v.price) > 0)) return 'Цена должна быть больше нуля.';
            const f = { code: v.code, name: v.name, unit: v.unit, price: num(v.price), source: v.source, date: v.date };
            if (b) Object.assign(b, f); else store.priceBook.push({ id: E.uid(), kind: 'work', supplier: '', ...f });
            return null;
        });
    }

    // ---- Checks --------------------------------------------------------------------------------------

    function checkContext(e) {
        const c = contracts().find(x => x.id === e.contractId);
        const price = c ? E.parseNumber(String(c.price || '').replace(/[^\d,.\s]/g, '')) : NaN;
        return { contractPrice: Number.isFinite(price) && price > 0 ? price : null };
    }

    function renderCheck(e) {
        const list = E.checks(e, store, checkContext(e));
        const errors = list.filter(c => c.level === 'error');
        el.panel.appendChild(h('div', { class: 'home-ct__alert' + (errors.length ? ' home-ct__alert--overdue' : '') },
            list.length ? `Нарушений: ${errors.length}, предупреждений: ${list.length - errors.length}.` : 'Ошибок не найдено.'));
        const actions = [small('Заключение — Word', () => exportConclusion(e, list)), small('Реестр замечаний — Excel', () => exportRemarks(e, list)), small('Сметчик', () => askEstimator(e, list))];
        if (!errors.length && e.status === 'draft') actions.unshift(small('Отметить «Проверен»', () => { e.status = 'checked'; log(e, 'Смета проверена: ошибок нет'); save(); render(); }, true));
        el.panel.appendChild(block('Реестр ошибок и замечаний', actions, h('ul', { class: 'home-ct__list' }, list.length ? list.map(c => h('li', { class: 'home-ct__row' },
            h('div', { class: 'home-ct__row-main' }, h('p', { class: 'home-ct__row-title' }, h('span', { class: `home-ct__badge home-ct__badge--${c.level === 'error' ? 'overdue' : 'soon'}` }, c.level === 'error' ? 'Ошибка' : 'Замечание'), c.text),
                h('p', { class: 'home-ct__row-meta' }, [c.area, c.effect ? `финансовый эффект: ${money(c.effect)}` : ''].filter(Boolean).join(' · '))))) : h('li', { class: 'home-ct__none' }, 'Всё в порядке.'))));
        el.panel.appendChild(note('Проверки выполняются программно: арифметика и итоги, обязательные реквизиты, единицы измерения, дублирование, коэффициенты и их основания, цены относительно справочника и КП, расхождение с договором. Статус «Проверен» означает отсутствие ошибок по этим проверкам, а не нормативную проверку сметы.'));
    }

    // ---- Versions -------------------------------------------------------------------------------------

    function renderVersions(e) {
        const vs = e.versions || [];
        el.panel.appendChild(h('div', { class: 'home-ct__actions' }, small('Сохранить редакцию', () => openDialog('Сохранить редакцию', [{ name: 'note', label: 'Что изменено', required: true }], 'Сохранить', v => { const n = E.snapshot(e, v.note); log(e, `Сохранена редакция ${n}: ${v.note}`); }), true),
            small('Новая редакция из Excel', () => importDialog(e, 'version'))));
        el.panel.appendChild(block('Редакции', null, h('ul', { class: 'home-ct__list' }, vs.length ? [...vs].reverse().map(v => h('li', { class: 'home-ct__row' },
            h('div', { class: 'home-ct__row-main' }, h('p', { class: 'home-ct__row-title' }, `Редакция ${v.n} · ${money(v.total)}`), h('p', { class: 'home-ct__row-meta' }, `${formatStamp(v.at)} · ${v.note}`)),
            h('div', { class: 'home-record__actions' }, h('button', { type: 'button', onclick: () => {
                if (!confirm(`Восстановить редакцию ${v.n}? Текущие данные будут сохранены отдельной редакцией.`)) return;
                E.snapshot(e, `Перед восстановлением редакции ${v.n}`);
                e.data = E.clone(v.data);
                e.status = 'draft';
                log(e, `Восстановлена редакция ${v.n}`);
                save();
                render();
            } }, 'Восстановить')))) : h('li', { class: 'home-ct__none' }, 'Редакций нет. Сохраните редакцию, чтобы сравнивать изменения.'))));
        if (!vs.length) return;
        const opts = [...vs.map(v => [String(v.n), `Редакция ${v.n}`]), ['current', 'Текущая']];
        const a = h('select', { 'aria-label': 'Исходная' }, opts.map(([v, l], i) => h('option', { value: v, selected: i === Math.max(0, opts.length - 2) }, l)));
        const b = h('select', { 'aria-label': 'Сравниваемая' }, opts.map(([v, l], i) => h('option', { value: v, selected: i === opts.length - 1 }, l)));
        const out = h('div');
        const dataOf = v => (v === 'current' ? e.data : vs.find(x => String(x.n) === v).data);
        const draw = () => {
            const d = E.diff(dataOf(a.value), dataOf(b.value));
            out.textContent = '';
            out.append(h('p', { class: 'home-ct__row-meta home-cf__pad' }, `Итог: ${money(d.totalBefore)} → ${money(d.totalAfter)} (${d.delta >= 0 ? '+' : ''}${money(d.delta)})`),
                d.rows.length ? table(['Изменение', 'Позиция', 'Что изменилось', 'Было', 'Стало', 'Разница'], d.rows.map(x => h('tr', {},
                    h('td', {}, { added: 'Добавлена', removed: 'Удалена', changed: 'Изменена' }[x.type]), h('td', {}, (x.after || x.before).p.name, h('span', { class: 'home-ks__sub' }, (x.after || x.before).s)),
                    h('td', {}, (x.changes || []).join('; ')), h('td', {}, x.before ? money(x.before.total) : '—'), h('td', {}, x.after ? money(x.after.total) : '—'),
                    h('td', { class: 'home-es__num' + (x.delta > 0 ? ' home-tn__neg' : '') }, `${x.delta >= 0 ? '+' : ''}${money(x.delta)}`)))) : h('p', { class: 'home-staff__empty home-cf__pad' }, 'Различий нет.'));
        };
        a.addEventListener('change', draw);
        b.addEventListener('change', draw);
        el.panel.appendChild(block('Сравнение редакций', [a, b], out));
        draw();
    }

    function renderHistory(e) {
        el.panel.appendChild(block('История', null, h('ul', { class: 'home-ct__history' }, (e.log || []).map(l => h('li', {}, h('span', { class: 'home-ct__history-date' }, formatStamp(l.at)), h('span', {}, l.text))))));
    }

    // ---- Documents and export ------------------------------------------------------------------------

    function renderDocs(e) {
        const same = e.objectId ? store.estimates.filter(x => x.objectId === e.objectId) : [e];
        const group = E.calcGroup(same);
        el.panel.appendChild(block('Документы по смете', null, h('ul', { class: 'home-ct__list' }, [
            ['Локальный сметный расчёт (коммерческий)', [['Excel с формулами', () => exportEstimateXlsx(e)], ['Word', () => exportDocx(e, 'estimate')], ['PDF', () => printEstimate(e)]]],
            ['Ведомость объёмов работ', [['Excel', () => exportVolumes(e)], ['Word', () => exportDocx(e, 'volumes')]]],
            ['Коммерческая калькуляция и прогноз себестоимости', [['Word', () => exportDocx(e, 'cost')], ['Excel', () => exportCostXlsx(e)]]],
            ['Сравнительная ведомость цен', [['Excel', () => exportCompare(e)]]],
            ['Заключение по проверке сметы', [['Word', () => exportConclusion(e, E.checks(e, store, checkContext(e)))]]],
            ['Реестр замечаний и расхождений', [['Excel', () => exportRemarks(e, E.checks(e, store, checkContext(e)))]]]
        ].map(([title, acts]) => h('li', { class: 'home-ct__row' }, h('div', { class: 'home-ct__row-main' }, h('p', { class: 'home-ct__row-title' }, title)),
            h('div', { class: 'home-record__actions' }, acts.map(([l, fn]) => h('button', { type: 'button', onclick: fn }, l))))))));
        el.panel.appendChild(block(e.objectId ? `Объектная смета: ${objectName(e.objectId)}` : 'Объектная смета', [small('Excel', () => exportGroupXlsx(e, same))],
            table(['Смета', 'Без НДС', 'НДС', 'Всего'], [...group.items.map(x => h('tr', {}, h('td', {}, `${x.e.number ? '№ ' + x.e.number + ' · ' : ''}${x.e.title}`), h('td', {}, money(x.r.subtotal)), h('td', {}, money(x.r.vat)), h('td', {}, money(x.r.total)))),
                h('tr', { class: 'home-es__total-row' }, h('td', {}, 'Итого по объекту'), h('td', {}, money(group.subtotal)), h('td', {}, money(group.vat)), h('td', {}, money(group.total)))])));
        el.panel.appendChild(note(`${COMMERCIAL_NOTE} В Excel суммы позиций, разделов и итогов рассчитываются формулами; значения совпадают с расчётом AIRCHITECT.`));
    }

    async function xlsxBook() {
        await loadScript(XLSX_URL);
        return window.XLSX;
    }
    const fileSafe = s => String(s).replace(/[\\/:*?"<>|]/g, ' ').slice(0, 120);
    const head = e => [[`${e.number ? 'Смета № ' + e.number + ' — ' : ''}${e.title}`], [COMMERCIAL_NOTE], [settingsLine(e)], [`Объект: ${objectName(e.objectId) || '—'}`], []];

    // Local estimate with formulas: position cost = ROUND(qty × price × coef; 2), resources as sub-rows
    async function exportEstimateXlsx(e) {
        try {
            const X = await xlsxBook();
            const aoa = head(e);
            const cells = [];
            const put = (r, c, v) => { cells.push([r, c, v]); };
            aoa.push(['№', 'Обоснование', 'Наименование работ и затрат', 'Ед. изм.', 'Количество', 'Цена за ед., руб.', 'Коэффициент', 'Стоимость, руб.', 'В т. ч. по ресурсам, руб.']);
            const sectionTotals = [];
            let laborRefs = [];
            e.data.sections.forEach(s => {
                aoa.push([s.title]);
                const posRows = [];
                s.positions.forEach(p => {
                    const rowIdx = aoa.length;
                    const xr = rowIdx + 1;
                    if ((p.resources || []).length) {
                        aoa.push([p.code, p.basis, p.name, p.unit, num(p.qty), '', '', null, '']);
                        const start = aoa.length + 1;
                        p.resources.forEach(r => {
                            const coef = (p.coefs || []).filter(c => c.applyTo === 'all' || c.applyTo === r.type).reduce((m, c) => m * num(c.value), 1);
                            const rr = aoa.length + 1;
                            aoa.push(['', '', `  ${TYPES[r.type]}: ${r.name}`, r.unit, null, num(r.price), coef, '', null]);
                            put(rr - 1, 4, { t: 'n', f: `E${xr}*${num(r.norm)}` });
                            put(rr - 1, 8, { t: 'n', f: `ROUND(E${rr}*F${rr}*G${rr},2)` });
                            if (r.type === 'labor') laborRefs.push(`I${rr}`);
                        });
                        put(rowIdx, 7, { t: 'n', f: `SUM(I${start}:I${aoa.length})` });
                    } else {
                        const coef = (p.coefs || []).filter(c => c.applyTo === 'all' || c.applyTo === ({ work: 'work', material: 'material', equipment: 'equipment', machine: 'machine', subcontract: 'subcontract' }[p.kind])).reduce((m, c) => m * num(c.value), 1);
                        aoa.push([p.code, p.basis, p.name, p.unit, num(p.qty), num(p.unitPrice), coef, null, '']);
                        put(rowIdx, 7, { t: 'n', f: `ROUND(E${xr}*F${xr}*G${xr},2)` });
                    }
                    posRows.push(xr);
                });
                const tr = aoa.length + 1;
                aoa.push(['', '', `Итого по разделу «${s.title}»`, '', '', '', '', null]);
                put(tr - 1, 7, { t: 'n', f: posRows.length ? posRows.map(r => `H${r}`).join('+') : '0' });
                sectionTotals.push(tr);
            });
            const d = e.data;
            const r = E.calcEstimate(d);
            const rowOf = () => aoa.length + 1;
            const direct = rowOf(); aoa.push(['', '', 'Прямые затраты', '', '', '', '', null]); put(direct - 1, 7, { t: 'n', f: sectionTotals.map(x => `H${x}`).join('+') || '0' });
            const labor = rowOf(); aoa.push(['', '', 'в т. ч. оплата труда', '', '', '', '', null]); put(labor - 1, 7, { t: 'n', f: laborRefs.length ? laborRefs.join('+') : '0' });
            const baseRef = kind => (kind === 'labor' ? `H${labor}` : kind === 'direct' ? `H${direct}` : kind === 'directOverhead' ? `(H${direct}+H${direct + 2})` : '0');
            const ov = rowOf(); aoa.push(['', '', `Накладные расходы ${d.overhead.pct}% ${BASES[d.overhead.base]}`, d.overhead.basis, '', '', num(d.overhead.pct), null]); put(ov - 1, 7, { t: 'n', f: `ROUND(${baseRef(d.overhead.base)}*G${ov}/100,2)` });
            const pr = rowOf(); aoa.push(['', '', `Прибыль ${d.profit.pct}% ${BASES[d.profit.base]}`, d.profit.basis, '', '', num(d.profit.pct), null]); put(pr - 1, 7, { t: 'n', f: `ROUND(${d.profit.base === 'directOverhead' ? `(H${direct}+H${ov})` : baseRef(d.profit.base)}*G${pr}/100,2)` });
            const sub = rowOf(); aoa.push(['', '', 'Итого без НДС', '', '', '', '', null]); put(sub - 1, 7, { t: 'n', f: `H${direct}+H${ov}+H${pr}` });
            const vat = rowOf(); aoa.push(['', '', `НДС ${d.vatPct === 'none' ? '—' : d.vatPct + '%'}`, '', '', '', d.vatPct === 'none' ? 0 : num(d.vatPct), null]); put(vat - 1, 7, { t: 'n', f: `ROUND(H${sub}*G${vat}/100,2)` });
            const tot = rowOf(); aoa.push(['', '', 'Всего по смете', '', '', '', '', null]); put(tot - 1, 7, { t: 'n', f: `H${sub}+H${vat}` });
            aoa.push([], ['', '', `Контрольная сумма AIRCHITECT: ${money(r.total)}`]);
            const sheet = X.utils.aoa_to_sheet(aoa);
            cells.forEach(([row, col, cell]) => { sheet[X.utils.encode_cell({ r: row, c: col })] = cell; });
            sheet['!cols'] = [6, 16, 60, 10, 12, 14, 10, 18, 18].map(w => ({ wch: w }));
            const book = X.utils.book_new();
            X.utils.book_append_sheet(book, sheet, 'Смета');
            X.writeFile(book, `${fileSafe(`Смета ${e.number || ''} ${e.title}`)}.xlsx`);
        } catch (err) {
            notify(err.message);
        }
    }

    async function simpleXlsx(name, sheets) {
        try {
            const X = await xlsxBook();
            const book = X.utils.book_new();
            sheets.forEach(([title, aoa, widths]) => {
                const sheet = X.utils.aoa_to_sheet(aoa);
                sheet['!cols'] = (widths || []).map(w => ({ wch: w }));
                X.utils.book_append_sheet(book, sheet, title);
            });
            X.writeFile(book, `${fileSafe(name)}.xlsx`);
        } catch (err) {
            notify(err.message);
        }
    }

    const exportVolumes = e => simpleXlsx(`Ведомость объёмов — ${e.title}`, [['Объёмы', [...head(e), ['№', 'Раздел', 'Наименование работ', 'Ед. изм.', 'Количество', 'Обоснование'],
        ...e.data.sections.flatMap(s => s.positions.map(p => [p.code, s.title, p.name, p.unit, num(p.qty), p.basis || p.priceSource]))], [6, 30, 60, 10, 12, 24]]]);
    const exportCompare = e => simpleXlsx(`Сравнение цен — ${e.title}`, [['Сравнение', [...head(e), ['Позиция / ресурс', 'Раздел', 'Ед.', 'Кол-во', 'Цена в смете', 'Справочник и КП', 'Лучшая цена', 'Источник лучшей', 'Экономия, руб.'],
        ...E.compare(e, store).map(c => [c.line.name, c.line.section.title, c.line.unit, c.line.qty, c.line.price, E.candidates(store, c.line).map(x => `${x.label}: ${x.price}${x.unitOk ? '' : ' (' + x.unit + ')'}`).join('; '), c.best ? c.best.price : '', c.best ? c.best.label : '', c.economy / 100])], [50, 26, 8, 10, 14, 60, 14, 30, 16]]]);
    const exportRemarks = (e, list) => simpleXlsx(`Реестр замечаний — ${e.title}`, [['Замечания', [...head(e), ['№', 'Вид', 'Где', 'Замечание', 'Финансовый эффект, руб.'],
        ...list.map((c, i) => [i + 1, c.level === 'error' ? 'Ошибка' : 'Замечание', c.area, c.text, c.effect ? c.effect / 100 : ''])], [6, 12, 30, 90, 18]]]);
    const exportGroupXlsx = (e, same) => {
        const g = E.calcGroup(same);
        return simpleXlsx(`Объектная смета — ${objectName(e.objectId) || e.title}`, [['Объектная смета', [[`Объектная смета: ${objectName(e.objectId) || '—'}`], [COMMERCIAL_NOTE], [], ['№', 'Локальная смета', 'Прямые затраты', 'Накладные', 'Прибыль', 'Без НДС', 'НДС', 'Всего'],
            ...g.items.map((x, i) => [i + 1, `${x.e.number ? '№ ' + x.e.number + ' ' : ''}${x.e.title}`, x.r.direct / 100, x.r.overhead / 100, x.r.profit / 100, x.r.subtotal / 100, x.r.vat / 100, x.r.total / 100]),
            ['', 'Итого', g.direct / 100, g.overhead / 100, g.profit / 100, g.subtotal / 100, g.vat / 100, g.total / 100]], [6, 50, 16, 14, 14, 16, 14, 16]]]);
    };
    const exportCostXlsx = e => {
        const c = E.calcCost(e, store);
        return simpleXlsx(`Калькуляция — ${e.title}`, [['Калькуляция', [...head(e), ['Показатель', 'Сумма, руб.', 'Вид показателя'],
            ['Сметная стоимость без НДС', c.estimateNet / 100, 'расчёт по смете'], ['Договорная цена без НДС', c.contractNet === null ? '' : c.contractNet / 100, 'договор'],
            ['Материалы и оборудование', c.lines.material / 100, 'прогноз'], ['Транспорт и логистика', c.lines.transport / 100, 'прогноз'], ['Оплата труда', c.lines.labor / 100, 'прогноз'], ['Страховые взносы', c.lines.payrollTax / 100, 'прогноз'],
            ['Техника', c.lines.machine / 100, 'прогноз'], ['Субподряд', c.lines.subcontract / 100, 'прогноз'], ['Работы без разложения', c.lines.work / 100, 'прогноз'], ['Накладные расходы', c.overhead / 100, 'прогноз'],
            ['Прочие налоги', c.otherTax / 100, 'прогноз'], ['Резерв на риски', c.risk / 100, 'прогноз'], ['Себестоимость', c.cost / 100, 'прогноз'], ['Финансовый результат', c.result === null ? '' : c.result / 100, 'прогноз'],
            ['Цена предложения без НДС', c.offerNet / 100, 'расчёт'], [], ['Параметры', ...[]], ...Object.entries(c.params).map(([k, v]) => [k, v])], [50, 18, 20]]]);
    };

    async function exportDocx(e, kind) {
        try {
            await loadScript(DOCX_URL);
            const D = window.docx;
            const p = (text, opts = {}) => new D.Paragraph({ alignment: opts.center ? D.AlignmentType.CENTER : opts.right ? D.AlignmentType.RIGHT : undefined, spacing: { after: 100 }, children: [new D.TextRun({ text, bold: opts.bold, size: opts.size || 20, font: 'Times New Roman' })] });
            const cell = (text, bold) => new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: String(text ?? ''), bold, size: 18, font: 'Times New Roman' })] })] });
            const tbl = (cols, rows) => new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [new D.TableRow({ tableHeader: true, children: cols.map(c => cell(c, true)) }), ...rows.map(r => new D.TableRow({ children: r.map(c => cell(c)) }))] });
            const r = E.calcEstimate(e.data);
            const top = [p(`${e.number ? 'Смета № ' + e.number + ' — ' : ''}${e.title}`, { bold: true, center: true, size: 24 }), p(settingsLine(e), { size: 16 }), p(`Объект: ${objectName(e.objectId) || '—'}`), p(COMMERCIAL_NOTE, { size: 16 })];
            let children;
            let name;
            if (kind === 'estimate') {
                name = `Смета — ${e.title}`;
                const rows = [];
                e.data.sections.forEach((s, si) => {
                    rows.push(['', '', s.title, '', '', '', '']);
                    s.positions.forEach((pos, pi) => rows.push([pos.code, pos.basis, pos.name, pos.unit, qtyText(pos.qty), (pos.resources || []).length ? 'по ресурсам' : num(pos.unitPrice).toLocaleString('ru-RU', { minimumFractionDigits: 2 }), money(r.sections[si].positions[pi].total)]));
                    rows.push(['', '', `Итого по разделу`, '', '', '', money(r.sections[si].total)]);
                });
                children = [...top, tbl(['№', 'Обоснование', 'Наименование', 'Ед.', 'Кол-во', 'Цена, руб.', 'Стоимость'], rows),
                    ...[['Прямые затраты', r.direct], ['Накладные расходы', r.overhead], ['Прибыль', r.profit], ['Итого без НДС', r.subtotal], ['НДС', r.vat], ['Всего', r.total]].map(([l, v]) => p(`${l}: ${money(v)}`, { right: true, bold: l === 'Всего' })),
                    p(''), p('Составил: ____________ (должность, ФИО, подпись)'), p('Проверил: ____________ (должность, ФИО, подпись)')];
            } else if (kind === 'volumes') {
                name = `Ведомость объёмов — ${e.title}`;
                children = [...top, p('ВЕДОМОСТЬ ОБЪЁМОВ РАБОТ', { bold: true, center: true }), tbl(['№', 'Раздел', 'Наименование работ', 'Ед.', 'Количество'], e.data.sections.flatMap(s => s.positions.map(pos => [pos.code, s.title, pos.name, pos.unit, qtyText(pos.qty)])))];
            } else {
                const c = E.calcCost(e, store);
                name = `Калькуляция и себестоимость — ${e.title}`;
                children = [...top, p('СПРАВКА О ПРОГНОЗНОЙ СЕБЕСТОИМОСТИ И РЕНТАБЕЛЬНОСТИ', { bold: true, center: true }),
                    tbl(['Показатель', 'Сумма', 'Вид'], [
                        ['Сметная стоимость без НДС', money(c.estimateNet), 'расчёт по смете'], ['Договорная цена без НДС', c.contractNet === null ? 'не указана' : money(c.contractNet), 'договор'],
                        ['Материалы и оборудование', money(c.lines.material), 'прогноз'], ['Транспорт и логистика', money(c.lines.transport), 'прогноз'], ['Оплата труда', money(c.lines.labor), 'прогноз'],
                        ['Страховые взносы', money(c.lines.payrollTax), 'прогноз'], ['Техника', money(c.lines.machine), 'прогноз'], ['Субподряд', money(c.lines.subcontract), 'прогноз'], ['Работы без разложения', money(c.lines.work), 'прогноз'],
                        ['Накладные расходы', money(c.overhead), 'прогноз'], ['Прочие налоги', money(c.otherTax), 'прогноз'], ['Резерв на риски', money(c.risk), 'прогноз'], ['Себестоимость', money(c.cost), 'прогноз'],
                        ['Финансовый результат', c.result === null ? '—' : money(c.result), 'прогноз'], ['Рентабельность', c.margin === null ? '—' : c.margin.toFixed(1) + '%', 'прогноз'], ['Цена предложения без НДС', money(c.offerNet), 'расчёт']]),
                    p('Прогноз рассчитан по ценам сметы, привязанным ценам справочника и КП и параметрам компании, указанным пользователем.', { size: 16 })];
            }
            const file = new D.Document({ sections: [{ properties: { page: { size: { orientation: kind === 'estimate' ? D.PageOrientation.LANDSCAPE : D.PageOrientation.PORTRAIT }, margin: { top: 851, bottom: 851, left: 1134, right: 851 } } }, children }] });
            download(await D.Packer.toBlob(file), `${fileSafe(name)}.docx`);
        } catch (err) {
            notify(err.message || 'Не удалось сформировать документ.');
        }
    }

    async function exportConclusion(e, list) {
        try {
            await loadScript(DOCX_URL);
            const D = window.docx;
            const p = (text, opts = {}) => new D.Paragraph({ alignment: opts.center ? D.AlignmentType.CENTER : undefined, spacing: { after: 100 }, children: [new D.TextRun({ text, bold: opts.bold, size: opts.size || 22, font: 'Times New Roman' })] });
            const errors = list.filter(c => c.level === 'error');
            const r = E.calcEstimate(e.data);
            const effect = list.reduce((s, c) => s + (c.effect > 0 ? c.effect : 0), 0);
            const children = [p('ЗАКЛЮЧЕНИЕ ПО ПРОВЕРКЕ СМЕТЫ', { bold: true, center: true, size: 24 }), p(`${e.number ? 'Смета № ' + e.number + ' — ' : ''}${e.title}`), p(`Объект: ${objectName(e.objectId) || '—'}. ${settingsLine(e)}`, { size: 18 }),
                p(`Итог по расчёту: ${money(r.total)}. Найдено ошибок: ${errors.length}, замечаний: ${list.length - errors.length}.${effect ? ` Суммарный выявленный эффект (завышение, расхождения): ${money(effect)}.` : ''}`),
                p('Выявленные отклонения', { bold: true }), ...list.map((c, i) => p(`${i + 1}. [${c.level === 'error' ? 'Ошибка' : 'Замечание'}] ${c.area}: ${c.text}${c.effect ? ` Эффект: ${money(c.effect)}.` : ''}`)),
                p('Рекомендации', { bold: true }),
                p(errors.length ? 'Устранить ошибки до передачи сметы заказчику или использования в расчёте цены; для позиций с завышенной ценой запросить обоснование или применить подтверждённые цены справочника и КП; дублирующиеся позиции исключить после сверки с проектом.' : 'Ошибок по программным проверкам не найдено. Сверьте объёмы с РД и спецификациями.'),
                p(COMMERCIAL_NOTE, { size: 16 }), p('Проверку выполнил: ____________ (должность, ФИО, подпись)')];
            const file = new D.Document({ sections: [{ properties: {}, children }] });
            download(await D.Packer.toBlob(file), `${fileSafe('Заключение по проверке — ' + e.title)}.docx`);
        } catch (err) {
            notify(err.message || 'Не удалось сформировать документ.');
        }
    }

    function printEstimate(e) {
        const r = E.calcEstimate(e.data);
        const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const rows = e.data.sections.map((s, si) => `<tr><th colspan="7" style="text-align:left">${esc(s.title)}</th></tr>` + s.positions.map((p, pi) => `<tr><td>${esc(p.code)}</td><td>${esc(p.basis)}</td><td>${esc(p.name)}</td><td>${esc(p.unit)}</td><td>${esc(qtyText(p.qty))}</td><td>${esc((p.resources || []).length ? 'по ресурсам' : num(p.unitPrice).toLocaleString('ru-RU', { minimumFractionDigits: 2 }))}</td><td>${esc(money(r.sections[si].positions[pi].total))}</td></tr>`).join('') + `<tr><td colspan="6" style="text-align:right">Итого по разделу</td><td>${esc(money(r.sections[si].total))}</td></tr>`).join('');
        const win = window.open('', '_blank');
        if (!win) return notify('Разрешите всплывающие окна, чтобы сохранить PDF.');
        win.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(e.title)}</title><style>@page{size:landscape}body{font-family:'Times New Roman',serif;font-size:10pt;margin:10mm}h1{font-size:13pt;text-align:center}table{width:100%;border-collapse:collapse}td,th{border:1px solid #000;padding:3px 5px;vertical-align:top}.n{font-size:8pt}</style></head><body>
            <h1>${esc(`${e.number ? 'Смета № ' + e.number + ' — ' : ''}${e.title}`)}</h1><p class="n">${esc(settingsLine(e))}</p><p class="n">${esc(COMMERCIAL_NOTE)}</p>
            <table><thead><tr><th>№</th><th>Обоснование</th><th>Наименование</th><th>Ед.</th><th>Кол-во</th><th>Цена, руб.</th><th>Стоимость</th></tr></thead><tbody>${rows}</tbody></table>
            ${[['Прямые затраты', r.direct], ['Накладные расходы', r.overhead], ['Прибыль', r.profit], ['Итого без НДС', r.subtotal], ['НДС', r.vat], ['Всего', r.total]].map(([l, v]) => `<p style="text-align:right">${esc(l)}: ${esc(money(v))}</p>`).join('')}</body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
    }

    function download(blob, name) {
        const link = h('a', { href: URL.createObjectURL(blob), download: name });
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    }

    // ---- Estimator in the chat: figures come from the engine, the model explains and recommends ----------

    function askEstimator(e, list) {
        if (typeof window.AirchitectOpenSpecialist !== 'function') return;
        const r = E.calcEstimate(e.data);
        const lines = [
            `Смета: ${e.title}${e.number ? ' № ' + e.number : ''}. ${settingsLine(e)}.`,
            `Итоги (расчёт AIRCHITECT): прямые затраты ${money(r.direct)}, накладные ${money(r.overhead)}, прибыль ${money(r.profit)}, без НДС ${money(r.subtotal)}, всего ${money(r.total)}.`,
            `Позиций: ${e.data.sections.reduce((s, x) => s + x.positions.length, 0)} в ${e.data.sections.length} разделах.`,
            list && list.length ? 'Результаты программной проверки:\n' + list.slice(0, 20).map(c => `— ${c.area}: ${c.text}`).join('\n') : '',
            'Цифры выше рассчитаны программно — не пересчитывай их, опирайся на них. Это коммерческий расчёт, не нормативная смета.',
            '\nВопрос: '
        ].filter(Boolean);
        window.AirchitectOpenSpecialist('estimator', lines.join('\n'));
    }

    // ---- Demo: invented values for presentation ------------------------------------------------------

    function demo() {
        const pos = (code, name, unit, qty, unitPrice, extra = {}) => E.blankPosition({ code, name, unit, qty, unitPrice, basis: extra.basis || 'Расценка компании', priceSource: extra.priceSource || 'Справочник расценок (демо)', kind: extra.kind || 'work', resources: extra.resources || [], coefs: extra.coefs || [] });
        const e = E.blankEstimate({ number: 'Д-1', title: 'Демо: кровля складского корпуса', method: 'commercial', region: 'Московская область', base: 'Справочник расценок компании (демо)', priceSource: 'КП поставщиков (демо)' });
        e.data.sections = [
            { id: E.uid(), title: 'Раздел 1. Подготовительные работы', positions: [pos('1', 'Демонтаж старого покрытия', 'м2', 1250, 185), pos('2', 'Вывоз строительного мусора', 'т', 18.5, 1400)] },
            { id: E.uid(), title: 'Раздел 2. Кровельные работы', positions: [
                pos('3', 'Устройство пароизоляции', 'м2', 1250, 0, { resources: [{ id: E.uid(), type: 'labor', name: 'Кровельщик', unit: 'чел.-ч', norm: 0.12, price: 650 }, { id: E.uid(), type: 'material', name: 'Пароизоляционная плёнка', unit: 'м2', norm: 1.15, price: 38 }] }),
                pos('4', 'Утепление минераловатными плитами 150 мм', 'м2', 1250, 0, { resources: [{ id: E.uid(), type: 'labor', name: 'Кровельщик', unit: 'чел.-ч', norm: 0.35, price: 650 }, { id: E.uid(), type: 'material', name: 'Плиты минераловатные 150 мм', unit: 'м3', norm: 0.153, price: 6200 }, { id: E.uid(), type: 'machine', name: 'Подъёмник', unit: 'маш.-ч', norm: 0.02, price: 2800 }] }),
                pos('5', 'Устройство кровли из ПВХ-мембраны', 'м2', 1250, 980, { kind: 'subcontract', basis: 'КП субподрядчика (демо)', coefs: [{ name: 'Работы на высоте', value: 1.1, applyTo: 'all', basis: 'п. 3.4 договора субподряда (демо)' }] }),
                pos('6', 'Устройство пароизоляции', 'м2', 120, 240)] }
        ];
        e.data.overhead = { pct: 12, base: 'direct', basis: 'Учётная политика компании (демо)' };
        e.data.profit = { pct: 8, base: 'directOverhead', basis: 'Решение руководителя (демо)' };
        e.cost = { ...E.COST_DEFAULTS, payrollTaxPct: 30.2, transportPct: 4, overheadPct: 9, riskPct: 3, profitPct: 10, contractPrice: 5200000, contractVatIncluded: true };
        E.snapshot(e, 'Первая редакция (демо)');
        e.data.sections[0].positions[0].qty = 1320;
        log(e, 'Создана демо-смета');
        store.estimates.unshift(e);
        if (!store.offers.some(o => o.demo)) store.offers.push({ id: E.uid(), demo: true, supplier: 'ТехноСнаб (демо)', number: '118', date: E.today(), until: '', file: 'демо', items: [
            { id: E.uid(), name: 'Плиты минераловатные 150 мм', unit: 'м3', qty: 192, price: 5650 }, { id: E.uid(), name: 'Пароизоляционная плёнка', unit: 'м2', qty: 1450, price: 34 }, { id: E.uid(), name: 'Демонтаж старого покрытия', unit: 'м2', qty: 1250, price: 160 }] });
        if (!store.priceBook.some(b => b.demo)) store.priceBook.push({ id: E.uid(), demo: true, code: 'Р-07', name: 'Вывоз строительного мусора', unit: 'м3', price: 650, source: 'Расценка компании (демо)', date: E.today(), kind: 'work', supplier: '' });
        currentId = e.id;
        tab = 'estimate';
        save();
        render();
    }

    // ---- Wiring --------------------------------------------------------------------------------------

    root.querySelector('[data-es-add]').addEventListener('click', () => {
        const e = E.blankEstimate({ title: 'Новая смета' });
        store.estimates.unshift(e);
        currentId = e.id;
        tab = 'estimate';
        save();
        render();
        editSettings(e);
    });
    root.querySelector('[data-es-import]').addEventListener('click', () => importDialog(null, 'new'));
    root.querySelector('[data-es-demo]').addEventListener('click', demo);
    window.addEventListener('storage', ev => {
        if (ev.key !== E.STORE_KEY) return;
        store = E.read();
        if (!dialog.open) render();
    });

    render();
});
