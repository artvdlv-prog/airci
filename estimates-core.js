// Estimates (Сметы и расчёты): store and calculation engine shared by estimates.html, Объекты and the cabinet.
// All amounts are integer kopecks; every line is rounded once (to the kopeck) and sums are exact.
// Figures of different nature are never mixed: the estimate (commercial calculation of the price),
// the contract price, the forecast cost (калькуляция себестоимости) and actual results.
// Normative methods (ФСНБ-2022, ГЭСН, ФЕР, НЦС, РИМ, БИМ) require a verified normative data source;
// until one is connected the status «Нормативно проверен» is not available.

(function () {
    const STORE_KEY = 'airchitect-estimates-v1';

    const METHODS = {
        commercial: { title: 'Коммерческая смета', text: 'Расценки компании, коммерческие предложения, рыночные цены', available: true },
        resource: { title: 'Ресурсный расчёт', text: 'Материалы, трудозатраты, машины и оборудование по ресурсам и текущим ценам', available: true },
        mixed: { title: 'Смешанный расчёт', text: 'Объёмы ресурсов по нормам с коммерческими ценами — для внутренней оценки себестоимости', available: true },
        enlarged: { title: 'Укрупнённый расчёт', text: 'Предварительный бюджет по объекту-аналогу, площади, объёму и стоимости единицы', available: true },
        rim: { title: 'Ресурсно-индексный метод (РИМ)', text: 'По нормативам ГЭСН, текущим ценам и индексам ФГИС ЦС', available: false },
        bim: { title: 'Базисно-индексный метод (БИМ)', text: 'По базисным расценкам и индексам — в случаях, когда метод допустим', available: false },
        ncs: { title: 'Укрупнённый расчёт по НЦС', text: 'По нормативам цены строительства', available: false }
    };
    const NORMATIVE_NOTE = 'Нормативные методы доступны после подключения подтверждённой нормативной базы (ФСНБ-2022 и изменения, цены и индексы ФГИС ЦС) с указанием редакции, региона и периода.';

    const TYPES = { labor: 'Оплата труда', machine: 'Машины и механизмы', material: 'Материалы', equipment: 'Оборудование', subcontract: 'Субподряд', work: 'Работы (без разложения)' };
    const KINDS = { work: 'Работа', material: 'Материал', equipment: 'Оборудование', machine: 'Машины', subcontract: 'Субподряд' };
    const KIND_TYPE = { work: 'work', material: 'material', equipment: 'equipment', machine: 'machine', subcontract: 'subcontract' };
    const STATUS = { draft: 'Черновик', checked: 'Проверен', contract: 'Договорная смета' };

    // ---- Store ------------------------------------------------------------------------------

    function read() {
        try {
            const d = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
            return { estimates: d.estimates || [], priceBook: d.priceBook || [], offers: d.offers || [], reports: d.reports || [] };
        } catch (e) {
            return { estimates: [], priceBook: [], offers: [], reports: [] };
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

    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const today = () => new Date().toISOString().slice(0, 10);
    const clone = v => JSON.parse(JSON.stringify(v));

    // ---- Numbers ----------------------------------------------------------------------------

    // "1 234,56", "1234.5", 1234 -> number; empty or invalid -> NaN
    function parseNumber(v) {
        if (typeof v === 'number') return v;
        const s = String(v ?? '').replace(/[\s ]/g, '').replace(/₽|руб\.?/gi, '').replace(',', '.');
        if (!s || !/^-?\d*\.?\d+(e-?\d+)?$/i.test(s)) return NaN;
        return Number(s);
    }
    const num = v => { const n = parseNumber(v); return Number.isFinite(n) ? n : 0; };
    // rubles (possibly fractional) -> integer kopecks, half away from zero
    const toK = rub => { const x = num(rub) * 100; return Math.sign(x) * Math.round(Math.abs(x) + 1e-7); };
    const fromK = k => k / 100;
    // amount in kopecks of qty × price × factor, rounded once
    const lineK = (qty, price, factor = 1) => { const x = num(qty) * num(price) * factor * 100; return Math.sign(x) * Math.round(Math.abs(x) + 1e-6); };
    const pctK = (baseK, pct) => { const x = baseK * num(pct) / 100; return Math.sign(x) * Math.round(Math.abs(x) + 1e-6); };
    const money = k => `${(k / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
    const qtyText = v => num(v).toLocaleString('ru-RU', { maximumFractionDigits: 4 });

    // ---- Model ------------------------------------------------------------------------------

    function blankData() {
        return {
            sections: [{ id: uid(), title: 'Раздел 1', positions: [] }],
            overhead: { pct: 0, base: 'labor', basis: '' },
            profit: { pct: 0, base: 'labor', basis: '' },
            vatPct: '22'
        };
    }

    function blankEstimate(fields = {}) {
        return {
            id: uid(), kind: 'local', number: '', title: 'Новая смета', objectId: '', contractId: '', method: 'commercial',
            region: '', priceDate: today(), base: 'Справочник расценок компании', priceSource: '', status: 'draft',
            data: blankData(), versions: [], cost: null, links: {}, reports: [], log: [{ at: Date.now(), text: 'Смета создана' }], created: Date.now(), ...fields
        };
    }

    function blankPosition(fields = {}) {
        return { id: uid(), code: '', basis: '', name: '', unit: '', qty: 0, kind: 'work', unitPrice: 0, priceSource: '', resources: [], coefs: [], note: '', importedTotal: null, ...fields };
    }

    // ---- Calculation --------------------------------------------------------------------------

    const coefFor = (coefs, type) => (coefs || []).filter(c => c.applyTo === 'all' || c.applyTo === type).reduce((m, c) => m * num(c.value), 1);

    // Cost of a position by types, kopecks. With resources: qty × norm × price × coefficients per resource line;
    // without: qty × unit price × coefficients, by the kind of the position.
    // prices: optional { [positionId or resourceId]: price } overrides (cost calculation with other prices)
    function calcPosition(p, prices) {
        const parts = { labor: 0, machine: 0, material: 0, equipment: 0, subcontract: 0, work: 0 };
        const lines = [];
        if ((p.resources || []).length) {
            p.resources.forEach(r => {
                const price = prices && prices[r.id] !== undefined ? prices[r.id] : r.price;
                const amount = lineK(num(p.qty) * num(r.norm), price, coefFor(p.coefs, r.type));
                parts[r.type] = (parts[r.type] || 0) + amount;
                lines.push({ id: r.id, type: r.type, qty: num(p.qty) * num(r.norm), price: num(price), amount });
            });
        } else {
            const type = KIND_TYPE[p.kind] || 'work';
            const price = prices && prices[p.id] !== undefined ? prices[p.id] : p.unitPrice;
            const amount = lineK(p.qty, price, coefFor(p.coefs, type));
            parts[type] += amount;
            lines.push({ id: p.id, type, qty: num(p.qty), price: num(price), amount });
        }
        const total = Object.values(parts).reduce((s, v) => s + v, 0);
        return { parts, total, lines };
    }

    const sumParts = list => list.reduce((acc, x) => { Object.keys(x).forEach(k => { acc[k] = (acc[k] || 0) + x[k]; }); return acc; }, {});

    function baseFor(kind, parts, direct, overhead) {
        if (kind === 'labor') return parts.labor || 0;
        if (kind === 'direct') return direct;
        if (kind === 'directOverhead') return direct + overhead;
        return 0;
    }

    function calcEstimate(data, prices) {
        const sections = data.sections.map(s => {
            const positions = s.positions.map(p => ({ id: p.id, ...calcPosition(p, prices) }));
            const parts = sumParts(positions.map(p => p.parts));
            return { id: s.id, title: s.title, positions, parts, total: positions.reduce((t, p) => t + p.total, 0) };
        });
        const parts = sumParts(sections.map(s => s.parts));
        const direct = sections.reduce((t, s) => t + s.total, 0);
        const overhead = pctK(baseFor(data.overhead.base, parts, direct, 0), data.overhead.pct);
        const profit = pctK(baseFor(data.profit.base, parts, direct, overhead), data.profit.pct);
        const subtotal = direct + overhead + profit;
        const vat = data.vatPct === 'none' ? 0 : pctK(subtotal, data.vatPct);
        return { sections, parts, direct, overhead, profit, subtotal, vat, total: subtotal + vat };
    }

    // Object estimate / summary: sums of local estimates (each already calculated), no recalculation of positions
    function calcGroup(estimates) {
        const items = estimates.map(e => ({ e, r: calcEstimate(e.data) }));
        const field = f => items.reduce((s, x) => s + x.r[f], 0);
        return { items, direct: field('direct'), overhead: field('overhead'), profit: field('profit'), subtotal: field('subtotal'), vat: field('vat'), total: field('total') };
    }

    // ---- Cost calculation (себестоимость подрядчика) -----------------------------------------------
    // Separate from the estimate: own prices (price book, supplier offers) and company parameters.

    const COST_DEFAULTS = { payrollTaxPct: 0, laborAdjPct: 0, materialAdjPct: 0, transportPct: 0, machineAdjPct: 0, subcontractAdjPct: 0, overheadPct: 0, otherTaxPct: 0, riskPct: 0, profitPct: 0, contractPrice: '', contractVatIncluded: true };

    // Cost prices: linked price book item or supplier offer item replaces the estimate price
    function costPrices(e, store) {
        const prices = {};
        Object.entries(e.links || {}).forEach(([lineId, link]) => {
            const price = linkPrice(store, link);
            if (price !== null) prices[lineId] = price;
        });
        return prices;
    }

    function linkPrice(store, link) {
        if (!link) return null;
        if (link.source === 'book') { const b = store.priceBook.find(x => x.id === link.id); return b ? num(b.price) : null; }
        if (link.source === 'offer') {
            const o = store.offers.find(x => x.id === link.offerId);
            const it = o && o.items.find(x => x.id === link.itemId);
            return it ? num(it.price) : null;
        }
        return null;
    }

    function calcCost(e, store) {
        const p = { ...COST_DEFAULTS, ...(e.cost || {}) };
        const r = calcEstimate(e.data, costPrices(e, store));
        const parts = r.parts;
        const adj = (k, pct) => k + pctK(k, pct);
        const lines = {
            material: adj(parts.material + parts.equipment, p.materialAdjPct),
            labor: adj(parts.labor, p.laborAdjPct),
            machine: adj(parts.machine, p.machineAdjPct),
            subcontract: adj(parts.subcontract, p.subcontractAdjPct),
            work: parts.work
        };
        lines.payrollTax = pctK(lines.labor, p.payrollTaxPct);
        lines.transport = pctK(lines.material, p.transportPct);
        const direct = Object.values(lines).reduce((s, v) => s + v, 0);
        const overhead = pctK(direct, p.overheadPct);
        const risk = pctK(direct + overhead, p.riskPct);
        const vatPct = e.data.vatPct === 'none' ? 0 : num(e.data.vatPct);
        const contractK = toK(p.contractPrice);
        const contractNet = p.contractPrice === '' ? null : (p.contractVatIncluded && vatPct ? Math.round(contractK * 100 / (100 + vatPct)) : contractK);
        const otherTax = contractNet === null ? 0 : pctK(contractNet, p.otherTaxPct);
        const cost = direct + overhead + risk + otherTax;
        const offerNet = cost + pctK(cost, p.profitPct);
        const estimateNet = calcEstimate(e.data).subtotal;
        return {
            params: p, lines, direct, overhead, risk, otherTax, cost,
            offerNet, offer: offerNet + (vatPct ? pctK(offerNet, vatPct) : 0),
            estimateNet, contractNet,
            result: contractNet === null ? null : contractNet - cost,
            margin: contractNet ? (contractNet - cost) / contractNet * 100 : null,
            linked: Object.keys(costPrices(e, store)).length
        };
    }

    // ---- Price comparison ------------------------------------------------------------------------

    const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'().,;:]/g, ' ').replace(/\s+/g, ' ').trim();
    const normUnit = s => norm(s).replace(/\s/g, '').replace(/^м\^?2$|^кв\.?м$/, 'м2').replace(/^м\^?3$|^куб\.?м$/, 'м3');

    // Lines priced in the estimate: positions without resources and resources of positions
    function priceLines(e) {
        const out = [];
        e.data.sections.forEach(s => s.positions.forEach(p => {
            if ((p.resources || []).length) p.resources.forEach(r => out.push({ id: r.id, name: r.name, unit: r.unit, qty: num(p.qty) * num(r.norm), price: num(r.price), position: p, resource: r, section: s }));
            else out.push({ id: p.id, name: p.name, unit: p.unit, qty: num(p.qty), price: num(p.unitPrice), position: p, section: s });
        }));
        return out;
    }

    // Candidates for a line: price book and offers with the same normalized name (and unit)
    function candidates(store, line) {
        const n = norm(line.name);
        const u = normUnit(line.unit);
        const out = [];
        store.priceBook.forEach(b => { if (norm(b.name) === n) out.push({ source: 'book', id: b.id, label: `Справочник: ${b.name}`, unit: b.unit, price: num(b.price), unitOk: normUnit(b.unit) === u, date: b.date, supplier: b.supplier || '' }); });
        store.offers.forEach(o => o.items.forEach(it => { if (norm(it.name) === n) out.push({ source: 'offer', offerId: o.id, itemId: it.id, label: `КП ${o.supplier}${o.number ? ' № ' + o.number : ''}`, unit: it.unit, price: num(it.price), unitOk: normUnit(it.unit) === u, date: o.date, until: o.until, supplier: o.supplier }); }));
        return out;
    }

    function compare(e, store) {
        return priceLines(e).map(line => {
            const cands = candidates(store, line).filter(c => c.unitOk);
            const best = cands.reduce((m, c) => (!m || c.price < m.price ? c : m), null);
            const economy = best && best.price < line.price ? lineK(line.qty, line.price - best.price) : 0;
            return { line, cands, best, economy, linked: e.links && e.links[line.id] };
        });
    }

    // ---- Checks ------------------------------------------------------------------------------------

    function checks(e, store, ctx = {}) {
        const list = [];
        const add = (level, area, text, positionId, effect) => list.push({ level, area, text, positionId, effect: effect || 0 });
        const d = e.data;
        const r = calcEstimate(d);
        const seen = {};
        d.sections.forEach((s, si) => {
            if (!s.positions.length) add('warning', s.title, 'Раздел без позиций.');
            s.positions.forEach((p, pi) => {
                const where = `${s.title}, поз. ${p.code || pi + 1}`;
                const res = r.sections[si].positions[pi];
                if (!p.name) add('error', where, 'Не указано наименование.', p.id);
                if (!p.unit) add('error', where, `«${p.name}»: не указана единица измерения.`, p.id);
                if (!(num(p.qty) > 0)) add('error', where, `«${p.name}»: объём не указан или равен нулю.`, p.id);
                if (!(p.resources || []).length && !(num(p.unitPrice) > 0)) add('error', where, `«${p.name}»: не указана цена за единицу.`, p.id);
                (p.resources || []).forEach(x => {
                    if (!(num(x.norm) > 0)) add('error', where, `Ресурс «${x.name}»: не указан расход на единицу.`, p.id);
                    if (!(num(x.price) > 0)) add('error', where, `Ресурс «${x.name}»: не указана цена.`, p.id);
                });
                (p.coefs || []).forEach(c => {
                    if (!c.basis) add('error', where, `Коэффициент «${c.name || c.value}» применён без основания.`, p.id);
                    if (num(c.value) <= 0 || num(c.value) > 3) add('warning', where, `Коэффициент ${c.value} вне обычного диапазона — проверьте.`, p.id);
                });
                if (p.importedTotal !== null && p.importedTotal !== undefined && p.importedTotal !== '') {
                    const diff = res.total - toK(p.importedTotal);
                    if (Math.abs(diff) > 1) add('error', where, `Арифметика: в исходной смете ${money(toK(p.importedTotal))}, по расчёту ${money(res.total)} (разница ${money(diff)}).`, p.id, diff);
                }
                if (!p.priceSource && !(p.resources || []).length) add('warning', where, `«${p.name}»: не указан источник цены.`, p.id);
                const key = `${norm(p.name)}|${normUnit(p.unit)}`;
                if (p.name && seen[key]) add('warning', where, `Возможное дублирование: «${p.name}» уже есть в ${seen[key]}.`, p.id, res.total);
                else seen[key] = where;
            });
        });
        if (num(d.overhead.pct) && !d.overhead.basis) add('error', 'Накладные расходы', 'Норматив накладных расходов применён без основания.');
        if (num(d.profit.pct) && !d.profit.basis) add('error', 'Сметная прибыль', 'Норматив прибыли применён без основания.');
        if ((num(d.overhead.pct) && d.overhead.base === 'labor' || num(d.profit.pct) && d.profit.base === 'labor') && !r.parts.labor) add('error', 'Накладные расходы и прибыль', 'База «оплата труда» равна нулю: позиции не разложены на ресурсы. Выберите другую базу или разложите позиции.');
        if (!d.vatPct) add('error', 'НДС', 'Не указана ставка НДС.');
        // The file total may be stated before or after overheads and VAT: compare with the closest level
        if (e.importedTotal) {
            const target = toK(e.importedTotal);
            const levels = [['прямые затраты', r.direct], ['итог без НДС', r.subtotal], ['всего с НДС', r.total]];
            const [label, value] = levels.reduce((m, x) => (Math.abs(x[1] - target) < Math.abs(m[1] - target) ? x : m));
            const diff = value - target;
            if (Math.abs(diff) > 1) add('error', 'Итог сметы', `Итог исходной сметы ${money(target)}, по расчёту (${label}) ${money(value)} — разница ${money(diff)}.`, null, diff);
        }
        // Prices against the price book and offers (same name and unit)
        compare(e, store).forEach(c => {
            const where = `${c.line.section.title}, поз. ${c.line.position.code || ''}`.trim();
            const all = candidates(store, c.line);
            const wrongUnit = all.filter(x => !x.unitOk);
            if (wrongUnit.length && !c.cands.length) add('error', where, `«${c.line.name}»: единица в смете «${c.line.unit}», в справочнике или КП — «${wrongUnit[0].unit}». Проверьте объём и единицу.`, c.line.position.id);
            if (c.best) {
                const dev = (c.line.price - c.best.price) / c.best.price * 100;
                if (dev > (ctx.threshold || 15)) add('warning', where, `«${c.line.name}»: цена ${c.line.price.toLocaleString('ru-RU')} ₽ выше лучшей (${c.best.label}: ${c.best.price.toLocaleString('ru-RU')} ₽) на ${dev.toFixed(1)}%.`, c.line.position.id, c.economy);
                if (dev < -(ctx.threshold || 15)) add('warning', where, `«${c.line.name}»: цена ${c.line.price.toLocaleString('ru-RU')} ₽ ниже рыночной (${c.best.label}: ${c.best.price.toLocaleString('ru-RU')} ₽) на ${Math.abs(dev).toFixed(1)}% — риск недооценки.`, c.line.position.id, -lineK(c.line.qty, c.best.price - c.line.price));
            }
        });
        const offersExpired = store.offers.filter(o => o.until && o.until < today());
        offersExpired.forEach(o => add('warning', 'Коммерческие предложения', `КП ${o.supplier}${o.number ? ' № ' + o.number : ''} истекло ${o.until.split('-').reverse().join('.')}.`));
        if (ctx.contractPrice) {
            const diff = r.total - toK(ctx.contractPrice);
            if (Math.abs(diff) > 100) add('warning', 'Договор', `Итог сметы ${money(r.total)} отличается от цены договора ${money(toK(ctx.contractPrice))} на ${money(diff)}.`, null, diff);
        }
        if (ctx.executed) ctx.executed.forEach(x => add(x.level, x.area, x.text, x.positionId, x.effect));
        return list;
    }

    // ---- Versions ------------------------------------------------------------------------------------

    function snapshot(e, note) {
        e.versions = e.versions || [];
        const n = e.versions.length + 1;
        e.versions.push({ id: uid(), n, at: Date.now(), note: note || '', data: clone(e.data), total: calcEstimate(e.data).total });
        return n;
    }

    // Positions are matched by id (kept across versions), then by code + name
    function diff(a, b) {
        const flat = data => data.sections.flatMap(s => s.positions.map(p => ({ p, s: s.title, total: calcPosition(p).total })));
        const A = flat(a);
        const B = flat(b);
        const keyOf = x => `${x.p.code}|${norm(x.p.name)}`;
        const used = new Set();
        const rows = [];
        A.forEach(x => {
            const y = B.find(z => !used.has(z) && z.p.id === x.p.id) || B.find(z => !used.has(z) && keyOf(z) === keyOf(x));
            if (!y) { rows.push({ type: 'removed', before: x, after: null, delta: -x.total }); return; }
            used.add(y);
            const changes = [];
            if (num(x.p.qty) !== num(y.p.qty)) changes.push(`объём ${qtyText(x.p.qty)} → ${qtyText(y.p.qty)} ${y.p.unit}`);
            if (num(x.p.unitPrice) !== num(y.p.unitPrice)) changes.push(`цена ${num(x.p.unitPrice).toLocaleString('ru-RU')} → ${num(y.p.unitPrice).toLocaleString('ru-RU')} ₽`);
            if (x.p.unit !== y.p.unit) changes.push(`единица ${x.p.unit} → ${y.p.unit}`);
            if (x.p.name !== y.p.name) changes.push('наименование');
            if (JSON.stringify(x.p.resources || []) !== JSON.stringify(y.p.resources || [])) changes.push('ресурсы');
            if (JSON.stringify(x.p.coefs || []) !== JSON.stringify(y.p.coefs || [])) changes.push('коэффициенты');
            if (changes.length || x.total !== y.total) rows.push({ type: 'changed', before: x, after: y, changes, delta: y.total - x.total });
        });
        B.filter(z => !used.has(z)).forEach(y => rows.push({ type: 'added', before: null, after: y, delta: y.total }));
        const ra = calcEstimate(a);
        const rb = calcEstimate(b);
        return { rows, totalBefore: ra.total, totalAfter: rb.total, delta: rb.total - ra.total };
    }

    // ---- Import from a sheet (rows as arrays) ----------------------------------------------------------

    const HEADERS = {
        code: /^(№|n|#)\s*(п\/?п|пп|поз)?\.?$|^№\s*п\.?п\.?|^номер|позици/i,
        basis: /обоснован|шифр|расцен|код/i,
        name: /наименован/i,
        unit: /^ед|единиц|ед\.\s*изм/i,
        qty: /кол-?во|количеств|объ[её]м/i,
        price: /цена|стоимость единицы|на единицу|за ед/i,
        total: /всего|сумма|стоимость(?!\s*единиц)|итого/i
    };

    // Finds the header row and columns; the user can correct the mapping
    function detectMapping(rows) {
        let best = { row: -1, map: {}, score: 0 };
        rows.slice(0, 40).forEach((r, i) => {
            const map = {};
            r.forEach((cell, j) => {
                const t = String(cell ?? '').trim();
                if (!t) return;
                Object.entries(HEADERS).forEach(([field, re]) => {
                    if (map[field] === undefined && re.test(t) && !(field === 'total' && map.price === j) && !(field === 'price' && /всего/i.test(t))) map[field] = j;
                });
            });
            const score = Object.keys(map).length + (map.name !== undefined ? 2 : 0) + (map.qty !== undefined ? 1 : 0);
            if (score > best.score) best = { row: i, map, score };
        });
        return { headerRow: best.row, map: best.map };
    }

    // Rows -> sections and positions. Rows with a name but without quantity and unit open a section;
    // «Итого…» / «Всего…» rows are not positions (the grand total is kept for the arithmetic check).
    function parseRows(rows, { headerRow, map }) {
        const sections = [];
        let section = null;
        let grandTotal = null;
        const skipped = [];
        const cell = (r, f) => (map[f] === undefined ? '' : r[map[f]]);
        rows.slice(headerRow + 1).forEach((r, i) => {
            const name = String(cell(r, 'name') ?? '').trim();
            if (!name || /^\d+$/.test(name)) return; // empty or column numbering row
            const qty = parseNumber(cell(r, 'qty'));
            const unit = String(cell(r, 'unit') ?? '').trim();
            if (/^(итого|всего)/i.test(name)) {
                const t = parseNumber(cell(r, 'total'));
                if (/^(всего|итого)\s+(по\s+)?смет/i.test(name) && Number.isFinite(t)) grandTotal = t;
                return;
            }
            if (!Number.isFinite(qty) && !unit) {
                section = { id: uid(), title: name, positions: [] };
                sections.push(section);
                return;
            }
            if (!Number.isFinite(qty)) { skipped.push({ row: headerRow + 2 + i, name, reason: 'не распознан объём' }); return; }
            if (!section) { section = { id: uid(), title: 'Раздел 1', positions: [] }; sections.push(section); }
            const price = parseNumber(cell(r, 'price'));
            const total = parseNumber(cell(r, 'total'));
            section.positions.push(blankPosition({
                code: String(cell(r, 'code') ?? '').trim(), basis: String(cell(r, 'basis') ?? '').trim(), name, unit, qty,
                unitPrice: Number.isFinite(price) ? price : (Number.isFinite(total) && qty ? total / qty : 0),
                importedTotal: Number.isFinite(total) ? total : null, priceSource: 'импорт из Excel'
            }));
        });
        return { sections: sections.filter(s => s.positions.length || sections.length === 1), grandTotal, skipped };
    }

    window.AirchitectEstimates = {
        STORE_KEY, METHODS, NORMATIVE_NOTE, TYPES, KINDS, STATUS, COST_DEFAULTS,
        read, write, uid, today, clone, parseNumber, num, toK, fromK, lineK, pctK, money, qtyText, norm, normUnit,
        blankEstimate, blankData, blankPosition, calcPosition, calcEstimate, calcGroup, calcCost, costPrices, linkPrice,
        priceLines, candidates, compare, checks, snapshot, diff, detectMapping, parseRows
    };
})();
