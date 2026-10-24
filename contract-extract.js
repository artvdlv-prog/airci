// Local extraction of control points from a contract file (no server needed).
// Reads text from PDF (pdf.js), DOCX (mammoth) or TXT, splits it into numbered clauses
// and picks sentences with deadlines: explicit dates and relative terms ("в течение 10 рабочих дней").
// Results are drafts: every item is added as "Требует подтверждения".
// Used by contracts.js: window.AirchitectContractExtract.extract(blob, fileName)

(function () {
    const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    const MAMMOTH = 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js';
    const MAX_ITEMS = 80;

    const MONTHS = {
        января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
        июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12
    };

    const loaded = {};
    function loadScript(url) {
        loaded[url] = loaded[url] || new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Не удалось загрузить модуль чтения документа. Проверьте подключение к интернету.'));
            document.head.appendChild(script);
        });
        return loaded[url];
    }

    async function readText(blob, fileName) {
        const name = (fileName || '').toLowerCase();
        if (blob.type === 'application/pdf' || name.endsWith('.pdf')) {
            await loadScript(PDFJS);
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
            const pdf = await window.pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
            const pages = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const content = await (await pdf.getPage(i)).getTextContent();
                pages.push(content.items.map(item => item.str + (item.hasEOL ? '\n' : '')).join(''));
            }
            return pages.join('\n');
        }
        if (name.endsWith('.docx') || blob.type.includes('wordprocessingml')) {
            await loadScript(MAMMOTH);
            const result = await window.mammoth.extractRawText({ arrayBuffer: await blob.arrayBuffer() });
            return result.value;
        }
        if (name.endsWith('.doc')) {
            throw new Error('Формат .doc не поддерживается. Сохраните договор в DOCX или PDF.');
        }
        return blob.text();
    }

    const pad = n => String(n).padStart(2, '0');

    // All explicit dates in a fragment, as YYYY-MM-DD
    function findDates(text) {
        const dates = [];
        const numeric = /(\d{1,2})\.(\d{1,2})\.(\d{4})/g;
        let m;
        while ((m = numeric.exec(text))) dates.push({ at: m.index, value: `${m[3]}-${pad(m[2])}-${pad(m[1])}` });
        const verbal = /«?\s*(\d{1,2})\s*»?\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/gi;
        while ((m = verbal.exec(text))) dates.push({ at: m.index, value: `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}` });
        return dates.filter(d => !Number.isNaN(Date.parse(d.value))).sort((a, b) => a.at - b.at);
    }

    // Cyrillic letters: \w in JavaScript covers Latin only
    const L = '[а-яё]';
    const RELATIVE = new RegExp(`((?:в течение|не позднее|не позже|не ранее|в срок не (?:более|позднее)|в срок до|составляет|за)\\s+[^.;:]{0,90}?(?:дн(?:я|ей|и)|недел${L}*|месяц${L}*|час${L}*|лет|год${L}*|числа${L}*\\s+${L}+\\s+месяца)|немедленно|незамедлительно)`, 'i');
    const DEADLINE_HINT = /(срок|не позднее|в течение|до\s+«?\d|до\s+\d{1,2}\.\d{1,2}\.\d{4}|ежемесячно|еженедельно|до начала|после подписания)/i;
    const PARTY = /(Заказчик|Генеральный заказчик|Подрядчик|Генподрядчик|Генеральный подрядчик|Субподрядчик|Исполнитель)[а-яё]*[^.;]{0,60}?(обязан|обязуется|должен|производит|осуществляет|оплачивает|перечисляет|передает|передаёт|направляет|выполняет|предоставляет|уведомляет|обеспечивает|возвращает|удерживает)/i;

    function partyOf(text) {
        const m = text.match(PARTY);
        if (m) return /заказчик/i.test(m[1]) ? 'customer' : 'contractor';
        // "производится Заказчиком": the only party named in the sentence
        const customer = /заказчик/i.test(text);
        const contractor = /(подрядчик|исполнител)/i.test(text);
        if (customer && !contractor) return 'customer';
        if (contractor && !customer) return 'contractor';
        return 'both';
    }

    // Splits into numbered clauses: "4.2.", "4.2.1" at the start of a line or after a space
    function clauses(text) {
        const flat = text.replace(/\r/g, '').replace(/[ \t ]+/g, ' ');
        // Section headings ("4. Обязанности сторон") also end the previous clause but are not clauses themselves
        // multi-level numbers may omit the final dot; a single number needs it ("10 (десяти)" is not a heading)
        const marker = /(?:^|\n|\s)(\d{1,2}(?:\.\d{1,2}){1,3}\.?|\d{1,2}\.)\s+(?=[А-ЯЁA-Z«"(])/g;
        const starts = [];
        let m;
        while ((m = marker.exec(flat))) starts.push({ at: m.index + m[0].indexOf(m[1]), num: m[1].replace(/\.$/, ''), body: m.index + m[0].length });
        return starts.map((s, i) => ({
            num: s.num,
            text: flat.slice(s.body, i + 1 < starts.length ? starts[i + 1].at : flat.length).replace(/\s*\n\s*/g, ' ').trim()
        })).filter(c => c.num.includes('.') && c.text.length > 15);
    }

    function sentences(text) {
        return text.split(/(?<=[.;])\s+(?=[А-ЯЁA-Z«"])/).map(s => s.trim()).filter(Boolean);
    }

    function trimText(text) {
        // drop a section number glued to the end: "...не позднее 15.06.2026. 4."
        const clean = text.replace(/\s+/g, ' ').trim().replace(/\s\d{1,2}\.$/, '');
        return clean.length > 280 ? clean.slice(0, 277).replace(/\s+\S*$/, '') + '…' : clean;
    }

    function requisites(text) {
        const head = text.slice(0, 2500);
        const result = {};
        const number = head.match(/Договор[а-яё]*[^\n№]{0,60}№\s*([\wА-Яа-яЁё\-\/.]+)/i);
        if (number) result.number = number[1].replace(/[.,]$/, '');
        const dates = findDates(head);
        if (dates.length) result.date = dates[0].value;
        const party = /((?:ООО|АО|ПАО|ЗАО|ОАО|НАО|ИП|ФГУП|ГУП|МУП|ГБУ|ГКУ|МКУ|МБУ|ФКУ)\s*[«"][^»"]{1,120}[»"])[^«»]{0,120}?именуем[а-яё]*\s+в\s+дальнейшем\s*[«"]?\s*(Генеральный заказчик|Заказчик|Генеральный подрядчик|Генподрядчик|Подрядчик|Исполнитель)/gi;
        let m;
        while ((m = party.exec(head))) {
            const role = /заказчик/i.test(m[2]) ? 'customer' : 'contractor';
            if (!result[role]) result[role] = m[1].replace(/\s+/g, ' ');
        }
        // Subject: "выполнить работы по строительству складского комплекса" from clause 1.1
        const subject = text.match(/обязуется\s+(?:выполнить|осуществить|произвести)\s+(работы\s+по\s+)?([^,;]{10,140}?)(?:\s+по\s+адресу|,|;|\s+в\s+соответствии)/i);
        if (subject) result.subject = ((subject[1] ? 'Работы по ' : '') + subject[2]).replace(/\s+/g, ' ').replace(/^[а-яё]/, c => c.toUpperCase());
        const price = text.match(/Цена договора[^.]{0,40}?составляет\s+([\d\s]{3,}(?:[.,]\d+)?)\s*(?:\([^)]*\)\s*)?(руб[а-яё]*)/i);
        if (price) result.price = price[1].replace(/\s+/g, ' ').trim() + ' руб.';
        return result;
    }

    function controlPoints(text) {
        const items = [];
        const seen = new Set();
        for (const clause of clauses(text)) {
            for (const sentence of sentences(clause.text)) {
                const dates = findDates(sentence);
                const relative = sentence.match(RELATIVE);
                if (!dates.length && !relative && !DEADLINE_HINT.test(sentence)) continue;
                if (!dates.length && !relative) continue;
                const key = clause.num + '|' + sentence.slice(0, 80);
                if (seen.has(key)) continue;
                seen.add(key);
                items.push({
                    party: partyOf(sentence) !== 'both' ? partyOf(sentence) : partyOf(clause.text),
                    text: trimText(sentence),
                    clause: clause.num,
                    // the last date in the sentence is usually the deadline ("с 01.03 по 30.09")
                    due: dates.length ? dates[dates.length - 1].value : '',
                    condition: relative ? relative[1].replace(/\s+/g, ' ').replace(/^составляет\s+/i, '') : ''
                });
                if (items.length >= MAX_ITEMS) return items;
            }
        }
        return items;
    }

    async function extract(blob, fileName) {
        const text = await readText(blob, fileName);
        if (!text || text.replace(/\s/g, '').length < 200) {
            throw new Error('В файле не найден текст. Если это скан, нужен файл с текстовым слоем (PDF из Word) или DOCX.');
        }
        const contract = requisites(text);
        const points = controlPoints(text);
        const start = points.find(p => /начал[а-яё]*\s+(выполнения\s+)?работ/i.test(p.text) && p.due);
        const end = points.find(p => /(окончани|завершени)[а-яё]*\s+(выполнения\s+)?работ/i.test(p.text) && p.due);
        if (start) contract.start = start.due;
        if (end) contract.end = end.due;
        return { text, contract, obligations: points };
    }

    window.AirchitectContractExtract = { extract, readText };
})();
