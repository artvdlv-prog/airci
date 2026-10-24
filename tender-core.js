// Tenders: shared store, financial calculation, export and the chat extension
// for the tender specialist. Loaded on tenders.html and staff.html (before script.js
// uses window.AirchitectChatExtensions). Data is kept in this browser.

(function () {
    const STORE_KEY = 'airchitect-tenders-v1';
    const DOCX_URL = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';
    const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

    const LAWS = { '44': '44-ФЗ', '223': '223-ФЗ', commercial: 'Коммерческая закупка' };
    const STATUSES = {
        analysis: 'Анализ', preparing: 'Подготовка заявки', submitted: 'Заявка подана',
        won: 'Победа', lost: 'Не выиграли', declined: 'Отказ от участия'
    };

    // ---- Store ----------------------------------------------------------------

    const read = () => {
        try {
            return JSON.parse(localStorage.getItem(STORE_KEY)) || { tenders: [] };
        } catch (e) {
            return { tenders: [] };
        }
    };
    const write = data => {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            return false;
        }
    };
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    function blankTender(fields = {}) {
        return {
            id: uid(), law: '44', status: 'analysis', title: '', number: '', customer: '', nmck: '', links: [],
            deadlines: { submission: '', review: '', results: '' }, requirements: '', bidSecurity: '', contractSecurity: '',
            warrantySecurity: '', advance: '', payment: '', terms: '', files: [], reports: [], checklist: [], calc: null,
            result: '', log: [{ at: Date.now(), text: 'Закупка добавлена' }], created: Date.now(), ...fields
        };
    }

    // ---- Financial calculation ----------------------------------------------------
    // Three separate groups: amounts of security (blocked or guaranteed, not spent),
    // actual costs (commissions, interest, fees) and forecasts (based on the inputs).

    const DEFAULT_INPUT = {
        nmck: 0, dropPct: 5, costPct: 85, durationMonths: 6,
        bidSecPct: 1, bidSecMethod: 'money', bidSecMonths: 1,
        perfSecPct: 5, perfSecBase: 'price', perfSecMethod: 'guarantee', antiDump: true, antiDumpFactor: 1.5,
        warrantySecPct: 0, warrantyMonths: 12,
        bgRatePct: 3, creditRatePct: 18, advancePct: 0, paymentDelayDays: 30, otherCosts: 0, law: '44'
    };

    function calculate(raw) {
        const i = { ...DEFAULT_INPUT, ...raw };
        const n = x => Number(x) || 0;
        const nmck = n(i.nmck);
        const price = nmck * (1 - n(i.dropPct) / 100);
        const months = Math.max(1, Math.round(n(i.durationMonths)));
        const notes = [];

        // Security amounts
        const bidSec = nmck * n(i.bidSecPct) / 100;
        let perfSec = (i.perfSecBase === 'nmck' ? nmck : price) * n(i.perfSecPct) / 100;
        const dumping = i.law === '44' && n(i.dropPct) >= 25;
        if (dumping && i.antiDump) {
            perfSec *= n(i.antiDumpFactor) || 1;
            notes.push(`Снижение цены на ${n(i.dropPct)}%: применены антидемпинговые меры (ст. 37 44-ФЗ) — обеспечение исполнения × ${n(i.antiDumpFactor)}. Проверьте условия в документации.`);
        }
        const warrantySec = price * n(i.warrantySecPct) / 100;

        // Actual costs: bank guarantee commissions and fixed costs
        const rate = n(i.bgRatePct) / 100;
        const bidCost = i.bidSecMethod === 'guarantee' ? bidSec * rate * n(i.bidSecMonths) / 12 : 0;
        const perfCost = i.perfSecMethod === 'guarantee' ? perfSec * rate * (months + 1) / 12 : 0;
        const warrantyCost = warrantySec * rate * n(i.warrantyMonths) / 12;
        const otherCosts = n(i.otherCosts);

        // Forecast: monthly cash flow (works and costs spread evenly, acts paid after the delay)
        const cost = price * n(i.costPct) / 100;
        const advance = price * n(i.advancePct) / 100;
        const delay = Math.ceil(n(i.paymentDelayDays) / 30);
        const flow = [];
        let balance = 0;
        let minBalance = 0;
        let financing = 0;
        const horizon = months + delay + 1;
        for (let m = 0; m <= horizon; m++) {
            let inflow = 0;
            let outflow = 0;
            const items = [];
            if (m === 0) {
                if (i.bidSecMethod === 'money' && bidSec) { outflow += bidSec; items.push('блокировка обеспечения заявки'); }
                if (i.perfSecMethod === 'money' && perfSec) { outflow += perfSec; items.push('внесение обеспечения исполнения'); }
                if (advance) { inflow += advance; items.push('аванс'); }
                outflow += otherCosts + bidCost + perfCost + warrantyCost;
            }
            if (m === n(i.bidSecMonths) && i.bidSecMethod === 'money' && bidSec) { inflow += bidSec; items.push('возврат обеспечения заявки'); }
            if (m >= 1 && m <= months) { outflow += cost / months; items.push('затраты на работы'); }
            const actMonth = m - delay;
            if (actMonth >= 1 && actMonth <= months) { inflow += (price - advance) / months; items.push('оплата выполненных работ'); }
            if (m === months + delay + 1 && i.perfSecMethod === 'money' && perfSec) { inflow += perfSec; items.push('возврат обеспечения исполнения'); }
            balance += inflow - outflow;
            if (balance < 0) financing += -balance * n(i.creditRatePct) / 100 / 12;
            minBalance = Math.min(minBalance, balance);
            flow.push({ month: m, inflow, outflow, balance, items });
        }
        const actual = bidCost + perfCost + warrantyCost + otherCosts;
        const profit = price - cost - actual - financing;
        if (n(i.advancePct) === 0 && delay > 0) notes.push('Аванс не предусмотрен: работы финансируются за счёт собственных или заёмных средств до первой оплаты.');
        if (minBalance < 0) notes.push(`Максимальный кассовый разрыв ${money(-minBalance)} — потребность в оборотных средствах.`);
        return {
            input: i, price, months, dumping,
            security: { bid: bidSec, performance: perfSec, warranty: warrantySec },
            costs: { bidGuarantee: bidCost, performanceGuarantee: perfCost, warrantyGuarantee: warrantyCost, other: otherCosts, financing, total: actual + financing },
            forecast: { revenue: price, cost, profit, margin: price ? profit / price * 100 : 0, workingCapital: -minBalance, flow },
            notes
        };
    }

    function money(x) {
        return (Math.round(x) || 0).toLocaleString('ru-RU') + ' ₽';
    }

    // ---- Export helpers -------------------------------------------------------------

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${url}"]`)) return resolve();
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Не удалось загрузить модуль экспорта. Проверьте подключение к интернету.'));
            document.head.appendChild(script);
        });
    }

    function download(blob, name) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    }

    // Report text without the machine-readable block
    const cleanReport = text => text.replace(/```airchitect-data[\s\S]*?(```|$)/g, '').trim();

    // Markdown (headings, lists, tables, bold) -> Word document
    async function reportToDocx(title, markdown) {
        await loadScript(DOCX_URL);
        const D = window.docx;
        const runs = (text, bold) => text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(part =>
            new D.TextRun({ text: part.replace(/^\*\*|\*\*$/g, ''), bold: bold || /^\*\*/.test(part), size: 22, font: 'Times New Roman' }));
        const children = [new D.Paragraph({ heading: D.HeadingLevel.TITLE, children: [new D.TextRun({ text: title, bold: true, size: 28, font: 'Times New Roman' })] })];
        const lines = cleanReport(markdown).split('\n');
        for (let k = 0; k < lines.length; k++) {
            const line = lines[k];
            if (/^\|/.test(line)) {
                const block = [];
                while (k < lines.length && /^\|/.test(lines[k])) block.push(lines[k++]);
                k--;
                const cells = block.filter(r => !/^\|\s*:?-{2,}/.test(r)).map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
                children.push(new D.Table({
                    width: { size: 100, type: D.WidthType.PERCENTAGE },
                    rows: cells.map((r, ri) => new D.TableRow({ children: r.map(c => new D.TableCell({ children: [new D.Paragraph({ children: runs(c, ri === 0) })] })) }))
                }));
                continue;
            }
            const heading = line.match(/^(#{1,4})\s+(.*)/);
            if (heading) {
                children.push(new D.Paragraph({ heading: heading[1].length <= 2 ? D.HeadingLevel.HEADING_1 : D.HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 }, children: runs(heading[2], true) }));
            } else if (/^\s*[-*•]\s+/.test(line)) {
                children.push(new D.Paragraph({ bullet: { level: 0 }, children: runs(line.replace(/^\s*[-*•]\s+/, '')) }));
            } else if (line.trim()) {
                children.push(new D.Paragraph({ spacing: { after: 100 }, children: runs(line) }));
            }
        }
        const doc = new D.Document({ sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1418, right: 850 } } }, children }] });
        download(await D.Packer.toBlob(doc), `${title}.docx`);
    }

    // PDF through the browser print dialog
    function reportToPdf(title, html) {
        const win = window.open('', '_blank');
        if (!win) throw new Error('Разрешите всплывающие окна, чтобы сохранить PDF.');
        win.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title>
            <style>body{font-family:'Times New Roman',serif;font-size:12pt;margin:18mm;line-height:1.45}h1{font-size:16pt}h2,h3,h4{font-size:13pt;margin:14pt 0 4pt}table{width:100%;border-collapse:collapse;margin:6pt 0}td,th{border:1px solid #000;padding:3px 6px;vertical-align:top}</style></head>
            <body><h1>${title}</h1>${html}</body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
    }

    async function calcToXlsx(title, result) {
        await loadScript(XLSX_URL);
        const X = window.XLSX;
        const r = result;
        const i = r.input;
        const rows = [
            [title], [],
            ['ИСХОДНЫЕ ДАННЫЕ'], ['НМЦК', i.nmck], ['Снижение цены, %', i.dropPct], ['Цена контракта (прогноз)', Math.round(r.price)],
            ['Себестоимость, % от цены', i.costPct], ['Срок выполнения, мес.', i.durationMonths], ['Аванс, %', i.advancePct], ['Отсрочка оплаты, дней', i.paymentDelayDays],
            ['Ставка банковской гарантии, % годовых', i.bgRatePct], ['Ставка кредита, % годовых', i.creditRatePct], [],
            ['СУММЫ ОБЕСПЕЧЕНИЯ (блокируются или обеспечиваются гарантией, не являются расходом)'],
            ['Обеспечение заявки', Math.round(r.security.bid), i.bidSecMethod === 'money' ? 'деньгами' : 'банковской гарантией'],
            ['Обеспечение исполнения', Math.round(r.security.performance), i.perfSecMethod === 'money' ? 'деньгами' : 'банковской гарантией'],
            ['Обеспечение гарантийных обязательств', Math.round(r.security.warranty)], [],
            ['ФАКТИЧЕСКИЕ РАСХОДЫ'],
            ['Комиссия БГ на обеспечение заявки', Math.round(r.costs.bidGuarantee)], ['Комиссия БГ на обеспечение исполнения', Math.round(r.costs.performanceGuarantee)],
            ['Комиссия БГ на гарантийные обязательства', Math.round(r.costs.warrantyGuarantee)], ['Прочие расходы (площадка, ЭП и др.)', Math.round(r.costs.other)],
            ['Проценты за кассовый разрыв (прогноз)', Math.round(r.costs.financing)], ['Итого расходов', Math.round(r.costs.total)], [],
            ['ПРОГНОЗ'], ['Выручка', Math.round(r.forecast.revenue)], ['Себестоимость', Math.round(r.forecast.cost)], ['Прибыль', Math.round(r.forecast.profit)],
            ['Рентабельность, %', Math.round(r.forecast.margin * 10) / 10], ['Потребность в оборотных средствах', Math.round(r.forecast.workingCapital)], [],
            ['ДВИЖЕНИЕ ДЕНЕЖНЫХ СРЕДСТВ (прогноз)'], ['Месяц', 'Поступления', 'Платежи', 'Остаток нарастающим итогом', 'Операции'],
            ...r.forecast.flow.map(f => [f.month, Math.round(f.inflow), Math.round(f.outflow), Math.round(f.balance), f.items.join(', ')]),
            [], ...r.notes.map(n => [n])
        ];
        const sheet = X.utils.aoa_to_sheet(rows);
        sheet['!cols'] = [{ wch: 52 }, { wch: 18 }, { wch: 18 }, { wch: 26 }, { wch: 60 }];
        const book = X.utils.book_new();
        X.utils.book_append_sheet(book, sheet, 'Расчёт');
        X.writeFile(book, `${title}.xlsx`);
    }

    // ---- Chat extension for the tender specialist ---------------------------------------------
    // Finds links in the message, lets the user pick tenders and the kind of report,
    // sends them to the server (Claude opens the pages with its web fetch tool),
    // and offers to save the report to the registry or export it.

    const URL_RE = /https?:\/\/[^\s<>"')]+/g;

    function chatExtension() {
        let panel = null;
        let input = null;
        let selected = new Set();
        let mode = 'each';
        let urls = [];

        function renderPanel() {
            urls = [...new Set((input.value.match(URL_RE) || []).map(u => u.replace(/[.,;]+$/, '')))];
            selected = new Set([...selected].filter(u => urls.includes(u)));
            urls.forEach(u => { if (!panel.dataset.seen || !panel.dataset.seen.includes(u)) selected.add(u); });
            panel.dataset.seen = urls.join(' ');
            panel.hidden = !urls.length;
            panel.textContent = '';
            if (!urls.length) return;
            const title = document.createElement('p');
            title.className = 'home-tn__panel-title';
            title.textContent = `Найдено ссылок на закупки: ${urls.length}. Выберите, что анализировать:`;
            panel.appendChild(title);
            urls.forEach(u => {
                const label = document.createElement('label');
                label.className = 'home-tn__url';
                const box = document.createElement('input');
                box.type = 'checkbox';
                box.checked = selected.has(u);
                box.addEventListener('change', () => { box.checked ? selected.add(u) : selected.delete(u); });
                const text = document.createElement('span');
                text.textContent = u;
                label.append(box, text);
                panel.appendChild(label);
            });
            if (urls.length > 1) {
                const modes = document.createElement('div');
                modes.className = 'home-tn__modes';
                [['each', 'Справка по каждой'], ['compare', 'Сводное сравнение']].forEach(([value, label]) => {
                    const l = document.createElement('label');
                    const r = document.createElement('input');
                    r.type = 'radio';
                    r.name = 'tn-mode';
                    r.value = value;
                    r.checked = mode === value;
                    r.addEventListener('change', () => { mode = value; });
                    l.append(r, ` ${label}`);
                    modes.appendChild(l);
                });
                panel.appendChild(modes);
            }
        }

        return {
            attach({ form, input: field }) {
                input = field;
                panel = document.createElement('div');
                panel.className = 'home-tn__panel';
                panel.hidden = true;
                form.prepend(panel);
                input.addEventListener('input', renderPanel);
            },
            // Extra request fields for the proxy: which links to open and the kind of report
            payload() {
                const chosen = urls.filter(u => selected.has(u));
                return chosen.length ? { type: 'tenders', urls: chosen, mode: chosen.length > 1 ? mode : 'each' } : null;
            },
            reset() {
                urls = [];
                selected = new Set();
                if (panel) { panel.hidden = true; panel.textContent = ''; panel.dataset.seen = ''; }
            },
            // Actions under the answer: save to the registry, Word, PDF
            afterAnswer(message, answerText, request) {
                const data = parseData(answerText);
                if (!data.length && !(request && request.urls)) return;
                const bar = document.createElement('div');
                bar.className = 'home-tn__answer-actions';
                const add = (label, fn) => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.textContent = label;
                    b.addEventListener('click', fn);
                    bar.appendChild(b);
                };
                const title = `Аналитическая справка по закупкам ${new Date().toLocaleDateString('ru-RU')}`;
                add('Сохранить в реестр тендеров', () => {
                    const n = saveReport(answerText, data, request && request.urls);
                    notifyChat(message, n ? `Сохранено в реестр тендеров: ${n}.` : 'Не удалось сохранить: хранилище браузера недоступно.');
                });
                add('Word', () => reportToDocx(title, answerText).catch(e => notifyChat(message, e.message)));
                add('PDF', () => {
                    try {
                        reportToPdf(title, message.querySelector('.home-chat__body').innerHTML);
                    } catch (e) {
                        notifyChat(message, e.message);
                    }
                });
                message.appendChild(bar);
            }
        };
    }

    function notifyChat(message, text) {
        const p = document.createElement('p');
        p.className = 'home-chat__note';
        p.textContent = text;
        message.appendChild(p);
    }

    // Machine-readable block at the end of the answer: ```airchitect-data {"tenders":[...]}```
    function parseData(text) {
        const m = text.match(/```airchitect-data\s*([\s\S]*?)```/);
        if (!m) return [];
        try {
            const json = JSON.parse(m[1]);
            return Array.isArray(json.tenders) ? json.tenders : [];
        } catch (e) {
            return [];
        }
    }

    const value = v => (v === null || v === undefined ? '' : String(v));

    // Saves the report: updates tenders with the same link or number, otherwise adds new ones
    function saveReport(text, items, urls) {
        const data = read();
        const report = { id: uid(), at: Date.now(), text: cleanReport(text), sources: urls || [] };
        const list = items.length ? items : (urls || []).map(u => ({ url: u }));
        let count = 0;
        list.forEach(t => {
            const url = value(t.url);
            let tender = data.tenders.find(x => (url && x.links.includes(url)) || (t.number && x.number === value(t.number)));
            if (!tender) {
                tender = blankTender();
                data.tenders.unshift(tender);
            }
            const set = (key, v) => { if (v !== null && v !== undefined && v !== '' && !tender[key]) tender[key] = value(v); };
            set('title', t.title);
            set('number', t.number);
            set('customer', t.customer);
            set('nmck', t.nmck);
            set('requirements', t.requirements);
            set('bidSecurity', t.bid_security);
            set('contractSecurity', t.contract_security);
            set('warrantySecurity', t.warranty_security);
            set('advance', t.advance);
            set('payment', t.payment_terms);
            set('terms', t.contract_terms);
            if (t.law && LAWS[String(t.law).replace('-ФЗ', '')]) tender.law = String(t.law).replace('-ФЗ', '');
            if (t.submission_deadline && !tender.deadlines.submission) tender.deadlines.submission = value(t.submission_deadline).slice(0, 10);
            if (t.results_date && !tender.deadlines.results) tender.deadlines.results = value(t.results_date).slice(0, 10);
            if (url && !tender.links.includes(url)) tender.links.push(url);
            tender.reports.unshift(report);
            tender.log.unshift({ at: Date.now(), text: 'Добавлена аналитическая справка из чата' });
            count++;
        });
        return write(data) ? count : 0;
    }

    window.AirchitectTenders = { STORE_KEY, LAWS, STATUSES, read, write, uid, blankTender, calculate, money, DEFAULT_INPUT, reportToDocx, reportToPdf, calcToXlsx, cleanReport, loadScript };
    window.AirchitectChatExtensions = window.AirchitectChatExtensions || {};
    window.AirchitectChatExtensions.tenders = chatExtension;
})();
