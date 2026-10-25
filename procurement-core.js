// Purchases of materials and equipment (procurement and supply specialist, Штат): one store, the
// comparison of supplier offers and the content of the procurement documents.
// Full cost = price with VAT + delivery + unloading. A cost missing from an offer is not zero: it is listed
// as unknown. The required date (from the purchase) and the date confirmed by the supplier are kept apart.
// A technical analog is not treated as equal: it waits for the approval of the responsible employee.
// The choice of the supplier is recorded only by the employee.

(function () {
    const STORE_KEY = 'airchitect-procurement-v1';
    const STATUS = { draft: 'Потребность', rfq: 'Запрос КП', comparison: 'Сравнение', decision: 'Поставщик выбран', closed: 'Закрыта' };
    const VAT = [['20', 'НДС 20 %'], ['10', 'НДС 10 %'], ['0', 'НДС 0 %'], ['none', 'Без НДС (не облагается)'], ['', 'Не указан']];

    function read() {
        try {
            return JSON.parse(localStorage.getItem(STORE_KEY)) || { purchases: [] };
        } catch (e) {
            return { purchases: [] };
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
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const today = () => new Date().toISOString().slice(0, 10);
    const formatDate = d => (d ? d.split('-').reverse().join('.') : '');
    const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
    const money = n => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
    const num = s => { const m = String(s ?? '').replace(/[\s ]/g, '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };

    // Cost line of an offer: "" — not stated, "включено"/"входит" — included, a number — amount with VAT
    function costOf(value) {
        const v = String(value ?? '').trim();
        if (!v) return { known: false };
        if (/включ|входит|бесплат|за счёт поставщика|за счет поставщика/i.test(v)) return { known: true, amount: 0, included: true };
        const n = num(v);
        return n === null ? { known: false, note: v } : { known: true, amount: n };
    }

    function ensure(p) {
        p.items = p.items || [];
        p.offers = p.offers || [];
        p.log = p.log || [];
        return p;
    }

    // One offer against the purchase: known full cost, unknown costs, date check, warnings
    function evaluate(p, o) {
        const unknown = [];
        const warnings = [];
        const price = num(o.price);
        let net = null;
        let gross = null;
        if (price === null) unknown.push('цена');
        else if (o.vat === 'none' || o.vat === '0') { net = price; gross = price; }
        else if (o.vat === '') {
            unknown.push('НДС: ставка не указана');
            if (o.priceWithVat) gross = price; else net = price;
        } else {
            const rate = Number(o.vat) / 100;
            if (o.priceWithVat) { gross = price; net = price / (1 + rate); } else { net = price; gross = price * (1 + rate); }
        }
        const delivery = costOf(o.delivery);
        const unloading = costOf(o.unloading);
        if (!delivery.known) unknown.push('доставка');
        if (!unloading.known) unknown.push('разгрузка');
        (o.extra || '').split('\n').map(x => x.trim()).filter(Boolean).forEach(x => { if (costOf(x.split(':').pop()).known === false) unknown.push(x); });
        const extraKnown = (o.extra || '').split('\n').map(x => x.trim()).filter(Boolean).map(x => costOf(x.split(':').pop())).filter(c => c.known).reduce((s, c) => s + c.amount, 0);
        const base = gross !== null ? gross : net;
        const total = base === null ? null : base + (delivery.known ? delivery.amount : 0) + (unloading.known ? unloading.amount : 0) + extraKnown;

        if (o.completeness === 'partial') warnings.push(`Неполная комплектность${o.missing ? ': ' + o.missing : ''}`);
        if (o.completeness === 'unknown' || !o.completeness) unknown.push('комплектность не подтверждена');
        if (o.advancePct === '' || o.advancePct === undefined || o.advancePct === null) unknown.push('аванс и условия оплаты');
        if (o.warranty === '' || o.warranty === undefined || o.warranty === null) unknown.push('гарантия');

        let date = { status: 'unconfirmed', text: 'Срок не подтверждён поставщиком' };
        if (o.confirmedDate) {
            if (p.requiredDate) {
                const late = daysBetween(p.requiredDate, o.confirmedDate);
                date = late > 0 ? { status: 'late', text: `Подтверждён ${formatDate(o.confirmedDate)} — позже требуемого на ${late} дн.` } : { status: 'ok', text: `Подтверждён ${formatDate(o.confirmedDate)} — в требуемый срок` };
            } else date = { status: 'ok', text: `Подтверждён ${formatDate(o.confirmedDate)}` };
        } else if (o.statedTerm) date = { status: 'unconfirmed', text: `Указан срок «${o.statedTerm}» без даты — требует подтверждения` };
        if (date.status === 'late') warnings.push(date.text);
        if (o.analog) warnings.push(o.analogStatus === 'approved' ? `Аналог согласован: ${o.analogBy || '—'}` : o.analogStatus === 'rejected' ? `Аналог отклонён: ${o.analogBy || '—'}` : 'Технический аналог — нужно согласование профильного сотрудника');
        return { net, gross, delivery, unloading, extraKnown, total, unknown, warnings, date };
    }

    // Offers ordered by the known full cost; offers without a price go last
    function compare(p) {
        ensure(p);
        const rows = p.offers.map(o => ({ o, e: evaluate(p, o) }));
        // Comparable offers first; offers with an analog that is not approved and offers without a price go last
        const pendingAnalog = r => (r.o.analog && r.o.analogStatus !== 'approved' ? 1 : 0);
        rows.sort((a, b) => pendingAnalog(a) - pendingAnalog(b) || (a.e.total === null) - (b.e.total === null) || (a.e.total || 0) - (b.e.total || 0));
        const priced = rows.filter(r => r.e.total !== null && !(r.o.analog && r.o.analogStatus !== 'approved'));
        const lowest = priced.length ? priced[0] : null;
        return { rows, lowest };
    }

    const title = p => `Закупка № ${p.number || 'без номера'}${p.title ? ' — ' + p.title : ''}`;
    const requisites = p => [`Закупка № ${p.number || '—'} от ${formatDate(p.date) || '—'}`, p.object ? `Объект: ${p.object}` : '', p.contractName ? `Договор: ${p.contractName}` : '', p.address ? `Адрес поставки: ${p.address}` : '', p.requiredDate ? `Требуемый срок поставки: ${formatDate(p.requiredDate)}` : 'Требуемый срок поставки: не указан'].filter(Boolean);
    const itemsTable = p => [['№', 'Наименование и характеристики', 'Ед.', 'Количество'], ...p.items.map((i, n) => [n + 1, [i.name, i.spec].filter(Boolean).join(', '), i.unit || '', i.qty || ''])];
    const demoMark = p => (p.demo ? [{ text: 'ДЕМОНСТРАЦИОННЫЙ ПРИМЕР: данные условные, не относятся к реальным поставщикам.', bold: true }] : []);
    const priceText = (o, e) => (e.gross !== null ? money(e.gross) + (o.vat === '' ? ' (НДС не указан)' : '') : e.net !== null ? money(e.net) + ' без НДС' : '—');
    const offerCells = (p, o, e) => [o.supplier, priceText(o, e), e.delivery.known ? (e.delivery.included ? 'включена' : money(e.delivery.amount)) : 'не указана', e.unloading.known ? (e.unloading.included ? 'включена' : money(e.unloading.amount)) : 'не указана',
        e.total !== null ? money(e.total) : '—', e.date.text, o.advancePct !== '' && o.advancePct !== undefined ? `${o.advancePct} %${o.payment ? ', ' + o.payment : ''}` : 'не указано', o.warranty || 'не указана', e.unknown.join(', ') || '—'];

    // Documents with the same requisites: request for quotations, comparison table, note, selection protocol
    const documents = {
        rfq: p => ({ name: `Запрос коммерческого предложения — ${title(p)}`, blocks: [...demoMark(p),
            { text: 'ЗАПРОС КОММЕРЧЕСКОГО ПРЕДЛОЖЕНИЯ', bold: true, center: true, size: 24 }, ...requisites(p).map(text => ({ text })),
            { text: 'Просим направить коммерческое предложение на поставку:' }, { table: itemsTable(p) },
            { text: 'В предложении просим указать: цену за единицу и общую стоимость без НДС и с НДС; стоимость доставки и разгрузки или их включение в цену; комплектность; срок поставки, который вы подтверждаете (дата); условия оплаты и размер аванса; гарантийный срок; документы о качестве (паспорта, сертификаты, декларации); срок действия предложения.' },
            p.requirements ? { text: `Дополнительные требования: ${p.requirements}` } : null,
            { text: `Срок направления предложения: ${p.rfqDeadline ? formatDate(p.rfqDeadline) : '________'}` },
            { text: 'Контактное лицо: ____________________' },
            { text: 'Проект подготовлен в AIRCHITECT. Проверьте реквизиты перед отправкой; отправку выполняет сотрудник.', size: 16 }].filter(Boolean) }),
        table: p => { const { rows } = compare(p); return { name: `Сравнительная таблица — ${title(p)}`, blocks: [...demoMark(p),
            { text: 'СРАВНИТЕЛЬНАЯ ТАБЛИЦА КОММЕРЧЕСКИХ ПРЕДЛОЖЕНИЙ', bold: true, center: true, size: 24 }, ...requisites(p).map(text => ({ text })),
            { table: [['Поставщик', 'Цена с НДС', 'Доставка', 'Разгрузка', 'Известная полная стоимость', 'Срок поставки', 'Оплата', 'Гарантия', 'Неизвестные расходы и сведения'], ...rows.map(r => offerCells(p, r.o, r.e))] },
            ...rows.filter(r => r.e.warnings.length).map(r => ({ text: `${r.o.supplier}: ${r.e.warnings.join('; ')}.` })),
            { text: 'Известная полная стоимость не включает расходы, не указанные в предложении. Сроки «не подтверждён» требуют письменного подтверждения поставщика.', size: 18 }] }; },
        note: p => { const { rows, lowest } = compare(p); return { name: `Закупочная справка — ${title(p)}`, blocks: [...demoMark(p),
            { text: 'ЗАКУПОЧНАЯ СПРАВКА', bold: true, center: true, size: 24 }, ...requisites(p).map(text => ({ text })),
            { text: 'Потребность:', bold: true }, { table: itemsTable(p) },
            { text: `Рассмотрено предложений: ${rows.length}.`, bold: true },
            ...rows.map(r => ({ text: `${r.o.supplier}: известная полная стоимость ${r.e.total !== null ? money(r.e.total) : 'не определена'}; ${r.e.date.text.toLowerCase()}${r.e.unknown.length ? '; неизвестно: ' + r.e.unknown.join(', ') : ''}${r.e.warnings.length ? '; ' + r.e.warnings.join('; ') : ''}.` })),
            { text: lowest ? `Наименьшая известная полная стоимость — ${lowest.o.supplier} (${money(lowest.e.total)})${lowest.e.unknown.length ? ', при этом не указаны: ' + lowest.e.unknown.join(', ') : ''}.` : 'Наименьшую стоимость определить нельзя: в предложениях нет цен.' },
            { text: 'Вопросы на решение: выбор поставщика; согласование технических аналогов (если есть); запрос недостающих сведений у поставщиков.' },
            { text: p.decision ? `Решение: выбран ${p.decision.supplier} (${p.decision.by}, ${formatDate(p.decision.date)}). Основание: ${p.decision.reason}.` : 'Решение: ________ (принимает руководитель).' },
            { text: 'Справка подготовлена в AIRCHITECT по данным предложений; выбор поставщика подтверждает сотрудник.', size: 16 }] }; },
        protocol: p => { const { rows } = compare(p); const d = p.decision; return { name: `Протокол выбора поставщика (проект) — ${title(p)}`, blocks: [...demoMark(p),
            { text: 'ПРОТОКОЛ ВЫБОРА ПОСТАВЩИКА (ПРОЕКТ)', bold: true, center: true, size: 24 }, ...requisites(p).map(text => ({ text })),
            { text: 'Состав комиссии: ____________________' },
            { text: 'Рассмотрены предложения:' },
            { table: [['№', 'Поставщик', 'Известная полная стоимость', 'Срок поставки', 'Неизвестные расходы и сведения'], ...rows.map((r, n) => [n + 1, r.o.supplier, r.e.total !== null ? money(r.e.total) : '—', r.e.date.text, r.e.unknown.join(', ') || '—'])] },
            { text: d ? `Решили: выбрать поставщика ${d.supplier}. Основание: ${d.reason}.` : 'Решили: выбрать поставщика ________. Основание: ________.' },
            { text: 'Подписи членов комиссии: ____________________' },
            { text: 'Проект подготовлен в AIRCHITECT. Протокол утверждает и подписывает сотрудник компании.', size: 16 }] }; },
        letter: (p, kind, o) => { const KIND = { delay: ['О НАРУШЕНИИ СРОКА ПОСТАВКИ', `Требуемый срок поставки — ${formatDate(p.requiredDate) || '________'}, подтверждённый вами — ${formatDate(o && o.confirmedDate) || '________'}. На дату письма поставка не выполнена.`, 'Просим сообщить срок поставки в течение ___ рабочих дней и обеспечить поставку; оставляем за собой право требовать неустойку и возмещения убытков по условиям договора.'],
            short: ['О НЕДОПОСТАВКЕ', 'При приёмке поставки выявлена недопоставка: ________ (позиции, количество, документ приёмки).', 'Просим допоставить недостающий товар в срок до ________ либо согласовать иной порядок; до допоставки оплата недопоставленной части не производится.'],
            mismatch: ['О НЕСООТВЕТСТВИИ ТОВАРА', 'При приёмке выявлено несоответствие товара условиям договора и спецификации: ________ (позиции, характер несоответствия, акт).', 'Просим заменить товар на соответствующий требованиям в срок до ________ и направить представителя для составления акта.'] }[kind];
            return { name: `Письмо поставщику: ${KIND[0].toLowerCase()} — ${title(p)}`, blocks: [...demoMark(p),
                { text: `${o ? o.supplier : '________'}`, right: true }, { text: KIND[0], bold: true, center: true, size: 24 }, ...requisites(p).map(text => ({ text })),
                { text: KIND[1] }, { text: KIND[2] }, { text: 'Должность, подпись, расшифровка: ____________________' },
                { text: 'Проект подготовлен в AIRCHITECT. Проверьте факты и условия договора поставки; отправку выполняет сотрудник.', size: 16 }] }; }
    };

    // Text for the specialist's dialog: the purchase and its comparison
    function context(p) {
        if (!p) return '';
        const { rows, lowest } = compare(p);
        return [title(p) + (p.demo ? ' (демонстрационный пример, данные условные)' : ''), ...requisites(p),
            `Статус: ${STATUS[p.status] || p.status}`,
            'Позиции: ' + (p.items.map(i => `${i.name}${i.spec ? ' (' + i.spec + ')' : ''} — ${i.qty || '?'} ${i.unit || ''}`).join('; ') || 'не указаны'),
            ...rows.map(r => `Предложение ${r.o.supplier}${r.o.number ? ' № ' + r.o.number : ''}: цена ${r.o.price || '—'} (${(VAT.find(v => v[0] === (r.o.vat ?? '')) || VAT[4])[1]}, ${r.o.priceWithVat ? 'с НДС' : 'без НДС'}); доставка ${r.o.delivery || 'не указана'}; разгрузка ${r.o.unloading || 'не указана'}; комплектность ${r.o.completeness === 'full' ? 'полная' : r.o.completeness === 'partial' ? 'неполная' + (r.o.missing ? ' (' + r.o.missing + ')' : '') : 'не подтверждена'}; аванс ${r.o.advancePct !== '' && r.o.advancePct !== undefined ? r.o.advancePct + ' %' : 'не указан'}; гарантия ${r.o.warranty || 'не указана'}; ${r.e.date.text}${r.o.analog ? '; технический аналог: ' + (r.o.analogNote || '') : ''}. Известная полная стоимость: ${r.e.total !== null ? money(r.e.total) : 'не определена'}; неизвестно: ${r.e.unknown.join(', ') || '—'}.`),
            lowest ? `Наименьшая известная полная стоимость: ${lowest.o.supplier}.` : '',
            p.decision ? `Решение сотрудника: ${p.decision.supplier} (${p.decision.by}, ${formatDate(p.decision.date)}).` : 'Решение о выборе поставщика не принято.'].filter(Boolean).join('\n');
    }

    // Labelled demonstration example: conditional figures, no real suppliers
    function demo() {
        const req = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
        const plus = d => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
        return ensure({ id: uid(), demo: true, number: 'ДЕМО-1', date: today(), title: 'Арматура и бетон для фундаментов (пример)', object: 'Демо-объект', address: 'Демо-адрес объекта', requiredDate: req, status: 'comparison',
            items: [{ name: 'Арматура А500С', spec: 'Ø12, прутки 11,7 м', unit: 'т', qty: '18' }, { name: 'Бетонная смесь', spec: 'В25 W6 F150', unit: 'м³', qty: '120' }],
            offers: [
                { id: uid(), supplier: 'Поставщик А (пример)', number: '15', price: '2950000', vat: '20', priceWithVat: true, delivery: 'включено', unloading: '', completeness: 'full', advancePct: '30', payment: 'остаток после поставки', warranty: '12 мес.', confirmedDate: plus(18) },
                { id: uid(), supplier: 'Поставщик Б (пример)', number: '7', price: '2380000', vat: '20', priceWithVat: false, delivery: '85000', unloading: '24000', completeness: 'partial', missing: 'арматура Ø12 — 12 т из 18', advancePct: '100', payment: 'предоплата', warranty: '', confirmedDate: plus(26) },
                { id: uid(), supplier: 'Поставщик В (пример)', number: '3', price: '2810000', vat: '', priceWithVat: true, delivery: '', unloading: '', completeness: 'unknown', advancePct: '', warranty: '12 мес.', statedTerm: '2–3 недели', analog: true, analogNote: 'бетон В25 W4 вместо W6', analogStatus: '' }
            ],
            log: [{ at: Date.now(), text: 'Загружен демонстрационный пример' }] });
    }

    window.AirchitectProcurement = { STORE_KEY, STATUS, VAT, read, write, uid, today, formatDate, money, ensure, evaluate, compare, priceText, title, documents, context, demo };
})();
