// Objects (objects.html): construction objects with working documentation (РД)
// and as-built documentation (ИД): registries, materials and tests, completeness
// control, remarks, handover to the customer and export to Word / Excel / PDF.
// Data is kept in this browser (localStorage, files in IndexedDB), like Договоры.
// Loaded after script.js (uses window.AirchitectOpenSpecialist).

document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('[data-objects]');
    if (!root) return;

    const STORE_KEY = 'airchitect-objects-v1';
    const CONTRACTS_KEY = 'airchitect-contracts-v1';
    const SOON_DAYS = 7;
    const DOCX_URL = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';
    const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

    // Norms used by the completeness control (links from the AirCodex registry)
    const NORMS = {
        p344: { title: 'Приказ Минстроя № 344/пр', url: 'http://publication.pravo.gov.ru/document/0001202306010019' },
        p1026: { title: 'Приказ Минстроя № 1026/пр', url: 'http://publication.pravo.gov.ru/Document/View/0001202212300009' },
        g21101: { title: 'ГОСТ Р 21.101-2026', url: 'https://protect.gost.ru/gost/details/17bc12e8-6579-4145-b141-56855e772e7f' },
        g51872: { title: 'ГОСТ Р 51872-2024', url: 'https://protect.gost.ru/gost/details/201cb77e-3cec-42a6-a47e-bad3caac224b' },
        g70108: { title: 'ГОСТ Р 70108-2025', url: 'https://protect.gost.ru/gost/details/23f0a882-4624-475d-86c0-e4ae8f262177' },
        sp543: { title: 'СП 543.1325800.2024', url: 'https://www.minstroyrf.gov.ru/docs/419099/' },
        l402: { title: 'Федеральный закон № 402-ФЗ, ст. 9', url: 'http://www.kremlin.ru/acts/bank/34440' },
        l44: { title: 'Федеральный закон № 44-ФЗ, ст. 94', url: 'http://www.kremlin.ru/acts/bank/37056' }
    };

    // Kinds of ИД documents
    const ID_TYPES = {
        grbo: 'Акт освидетельствования геодезической разбивочной основы',
        axes: 'Акт разбивки осей объекта на местности',
        aosr: 'Акт освидетельствования скрытых работ (АОСР)',
        aook: 'Акт освидетельствования ответственных конструкций',
        aosito: 'Акт освидетельствования участков сетей инженерно-технического обеспечения',
        scheme: 'Исполнительная геодезическая схема',
        tests: 'Акт испытаний и опробования',
        journal: 'Журнал работ',
        other: 'Иной документ'
    };

    // Typical composition of ИД by work type: a starting point based on the minimum
    // composition of приказ № 344/пр; the actual list is defined by the project and the contract
    const WORK_TEMPLATES = {
        geodesy: { title: 'Геодезические работы', items: [['grbo', 'Акт освидетельствования геодезической разбивочной основы'], ['axes', 'Акт разбивки осей объекта на местности']] },
        earth: { title: 'Земляные работы', items: [['aosr', 'АОСР: разработка котлована'], ['aosr', 'АОСР: обратная засыпка с уплотнением'], ['scheme', 'Исполнительная схема котлована'], ['tests', 'Протокол испытаний уплотнения грунта']] },
        foundation: { title: 'Фундаменты', items: [['aosr', 'АОСР: устройство основания (подготовки)'], ['aosr', 'АОСР: армирование'], ['aosr', 'АОСР: гидроизоляция'], ['aook', 'Акт освидетельствования ответственных конструкций: фундаменты'], ['scheme', 'Исполнительная схема фундаментов'], ['tests', 'Протоколы испытаний бетона']] },
        concrete: { title: 'Монолитные ж/б конструкции', items: [['aosr', 'АОСР: армирование'], ['aosr', 'АОСР: установка закладных деталей'], ['aook', 'Акт освидетельствования ответственных конструкций'], ['scheme', 'Исполнительная схема конструкций'], ['tests', 'Протоколы испытаний бетона'], ['journal', 'Журнал бетонных работ']] },
        steel: { title: 'Металлоконструкции', items: [['aosr', 'АОСР: антикоррозионная защита'], ['aook', 'Акт освидетельствования ответственных конструкций: каркас'], ['scheme', 'Исполнительная схема монтажа'], ['tests', 'Протокол контроля сварных соединений'], ['journal', 'Журнал монтажа строительных конструкций']] },
        roof: { title: 'Кровля', items: [['aosr', 'АОСР: пароизоляция'], ['aosr', 'АОСР: утеплитель'], ['aosr', 'АОСР: гидроизоляционный ковёр'], ['tests', 'Акт испытания кровли на протечки']] },
        networks: { title: 'Наружные инженерные сети', items: [['aosr', 'АОСР: укладка трубопровода'], ['aosito', 'Акт освидетельствования участков сетей'], ['scheme', 'Исполнительная схема сетей'], ['tests', 'Акт гидравлического испытания']] },
        systems: { title: 'Внутренние инженерные системы', items: [['aosr', 'АОСР: скрытые прокладки'], ['tests', 'Акт гидростатического испытания'], ['tests', 'Акт индивидуального испытания оборудования'], ['scheme', 'Исполнительные схемы систем']] },
        electro: { title: 'Электромонтажные работы', items: [['aosr', 'АОСР: скрытая прокладка кабелей'], ['tests', 'Протокол измерения сопротивления изоляции'], ['tests', 'Протокол проверки заземляющих устройств'], ['scheme', 'Исполнительные схемы электроснабжения']] },
        custom: { title: 'Иной вид работ', items: [] }
    };

    const RD_STATUS = { received: 'Получена', production: 'В производстве работ', remarks: 'Есть замечания', replaced: 'Заменена новой версией' };
    const ID_STATUS = { todo: 'Не начат', draft: 'Готовится', review: 'На проверке', signed: 'Подписан', remarks: 'Замечания' };
    const REMARK_STATUS = { open: 'Открыто', fixed: 'Устранено', closed: 'Снято' };
    const HANDOVER_STATUS = { forming: 'Формируется', sent: 'Передан', remarks: 'Замечания заказчика', accepted: 'Принят' };
    const MATERIAL_DOCS = ['Паспорт качества', 'Сертификат соответствия', 'Декларация о соответствии', 'Протокол испытаний', 'Заключение лаборатории', 'Акт входного контроля'];
    const REMARK_SOURCES = ['Строительный контроль заказчика', 'Заказчик', 'Технический надзор', 'Авторский надзор', 'Госстройнадзор', 'Инженер ПТО'];

    // ---- Storage -------------------------------------------------------------------

    let data = { objects: [] };
    try {
        data = JSON.parse(localStorage.getItem(STORE_KEY)) || data;
    } catch (e) {
        data = { objects: [] };
    }
    const save = () => {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(data));
        } catch (e) {
            notify('Не удалось сохранить данные в браузере: хранилище заполнено или недоступно.');
        }
    };
    const contracts = () => {
        try {
            return (JSON.parse(localStorage.getItem(CONTRACTS_KEY)) || { contracts: [] }).contracts;
        } catch (e) {
            return [];
        }
    };

    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    // Objects saved before o.key existed get one (their o.id is the ИД registry)
    if (data.objects.some(o => !o.key)) {
        data.objects.forEach(o => { if (!o.key) o.key = uid(); if (!Array.isArray(o.id)) o.id = []; });
        save();
    }
    const today = () => new Date().toISOString().slice(0, 10);
    const inCabinet = document.documentElement.classList.contains('is-cabinet');
    const withCabinet = query => (inCabinet ? `${query}&cabinet=1` : query);

    const filesDb = new Promise(resolve => {
        if (!('indexedDB' in window)) return resolve(null);
        const request = indexedDB.open('airchitect-contract-files', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });

    async function storeFiles(fileList) {
        const db = await filesDb;
        const saved = [];
        for (const file of fileList) {
            const meta = { id: uid(), name: file.name, type: file.type, size: file.size };
            if (db) {
                await new Promise((resolve, reject) => {
                    const tx = db.transaction('files', 'readwrite');
                    tx.objectStore('files').put({ ...meta, blob: file });
                    tx.oncomplete = resolve;
                    tx.onerror = () => reject(tx.error);
                }).catch(() => notify(`Файл «${file.name}» не сохранён: недостаточно места в браузере.`));
            }
            saved.push(meta);
        }
        return saved;
    }

    async function openFile(meta) {
        const db = await filesDb;
        if (!db) return notify('Хранилище файлов недоступно в этом браузере.');
        const request = db.transaction('files', 'readonly').objectStore('files').get(meta.id);
        request.onsuccess = () => {
            if (!request.result) return notify('Файл не найден: возможно, данные браузера были очищены.');
            const url = URL.createObjectURL(request.result.blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = meta.name;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        };
    }

    // ---- Helpers ---------------------------------------------------------------------

    function h(tag, attrs = {}, ...children) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([key, value]) => {
            if (value === undefined || value === null || value === false) return;
            if (key === 'class') node.className = value;
            else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
            else node.setAttribute(key, value === true ? '' : value);
        });
        children.flat().forEach(child => {
            if (child === null || child === undefined || child === false) return;
            node.append(child instanceof Node ? child : document.createTextNode(child));
        });
        return node;
    }

    function notify(text) {
        const toast = h('div', { class: 'home-ct__toast', role: 'status' }, text);
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    function formatDate(date) {
        if (!date) return '';
        const [y, m, d] = date.split('-');
        return `${d}.${m}.${y}`;
    }

    const formatStamp = ts => new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const daysUntil = date => (date ? Math.round((new Date(date + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000) : null);

    function log(object, text) {
        object.log = object.log || [];
        object.log.unshift({ at: Date.now(), text });
    }

    const fileLinks = files => (files && files.length ? h('span', { class: 'home-ct__files' },
        files.map(f => h('button', { type: 'button', class: 'home-ct__file', onclick: () => openFile(f) }, f.name))) : null);

    const normLink = key => h('a', { href: NORMS[key].url, target: '_blank', rel: 'noopener', class: 'home-ob__norm' }, NORMS[key].title);

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

    // ---- Dialog (same markup as Договоры) -------------------------------------------------

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
                input = h('select', { name: f.name, required: f.required },
                    f.options.map(([value, label]) => h('option', { value, selected: String(value) === String(f.value ?? '') }, label)));
            } else if (f.type === 'multi') {
                input = h('select', { name: f.name, multiple: true, size: Math.min(8, Math.max(3, f.options.length)) },
                    f.options.map(([value, label]) => h('option', { value, selected: (f.value || []).includes(value) }, label)));
            } else if (f.type === 'textarea') {
                input = h('textarea', { name: f.name, rows: f.rows || 3, required: f.required });
                input.value = f.value || '';
            } else if (f.type === 'file') {
                input = h('input', { type: 'file', name: f.name, multiple: true });
            } else {
                input = h('input', { type: f.type || 'text', name: f.name, required: f.required });
                input.value = f.value || '';
            }
            dialogBody.appendChild(h('label', { class: 'home-dialog__field' },
                h('span', { class: 'home-dialog__label' }, f.label + (f.required ? ' *' : '')),
                input,
                f.hint ? h('span', { class: 'home-dialog__hint' }, f.hint) : null));
        });
        if (extra) dialogBody.appendChild(extra);
        dialogFoot.textContent = '';
        dialogFoot.append(
            h('button', { type: 'button', class: 'home-btn home-btn--secondary', onclick: () => dialog.close() }, submitLabel ? 'Отмена' : 'Закрыть'),
            submitLabel ? h('button', {
                type: 'submit', class: 'home-btn home-btn--primary', onclick: async e => {
                    e.preventDefault();
                    const form = dialog.querySelector('form');
                    if (!form.reportValidity()) return;
                    const values = {};
                    fields.forEach(f => {
                        const input = form.elements[f.name];
                        if (f.type === 'file') values[f.name] = [...input.files];
                        else if (f.type === 'multi') values[f.name] = [...input.selectedOptions].map(o => o.value);
                        else values[f.name] = input.value.trim();
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
            }, submitLabel) : null);
        dialog.showModal();
    }

    // ---- State ---------------------------------------------------------------------

    let currentId = new URLSearchParams(location.search).get('id') || (data.objects[0] && data.objects[0].key);
    let tab = 'overview';
    // Object identity is o.key: o.id holds the ИД registry (kept for compatibility)
    const current = () => data.objects.find(o => o.key === currentId);

    const el = {
        list: root.querySelector('[data-ob-list]'),
        empty: root.querySelector('[data-ob-empty]'),
        card: root.querySelector('[data-ob-card]'),
        title: root.querySelector('[data-ob-title]'),
        meta: root.querySelector('[data-ob-meta]'),
        tabs: root.querySelector('[data-ob-tabs]'),
        panel: root.querySelector('[data-ob-panel]')
    };

    const TABS = [
        ['overview', 'Контроль'], ['info', 'Сведения'], ['rd', 'РД'], ['id', 'ИД'], ['ks', 'Формы КС'],
        ['materials', 'Материалы и испытания'], ['check', 'Нормативный контроль'], ['remarks', 'Замечания'], ['handover', 'Сдача']
    ];

    const workName = (o, id) => (o.works.find(w => w.id === id) || {}).name || '—';

    function idOverdue(d) {
        return d.status !== 'signed' && d.due && daysUntil(d.due) < 0;
    }

    function stats(o) {
        const signed = o.id.filter(d => d.status === 'signed').length;
        return {
            rdTotal: o.rd.filter(r => r.status !== 'replaced').length,
            rdProduction: o.rd.filter(r => r.status === 'production').length,
            idTotal: o.id.length,
            idSigned: signed,
            readiness: o.id.length ? Math.round(signed / o.id.length * 100) : 0,
            idOverdue: o.id.filter(idOverdue).length,
            idSoon: o.id.filter(d => d.status !== 'signed' && d.due && daysUntil(d.due) >= 0 && daysUntil(d.due) <= SOON_DAYS).length,
            remarksOpen: o.remarks.filter(r => r.status === 'open').length,
            issues: checks(o).filter(c => c.level === 'error').length
        };
    }

    // ---- Render --------------------------------------------------------------------

    function render() {
        renderList();
        const o = current();
        el.empty.hidden = !!o;
        el.card.hidden = !o;
        if (!o) return;
        el.title.textContent = o.name;
        el.meta.textContent = [o.code && `Шифр объекта: ${o.code}`, o.address, o.stage].filter(Boolean).join(' · ');
        document.title = `${o.name} — Объекты | AIRCHITECT`;

        el.tabs.textContent = '';
        TABS.forEach(([key, label]) => el.tabs.appendChild(h('button', {
            type: 'button', role: 'tab', class: 'home-tab', 'aria-selected': String(key === tab),
            onclick: () => { tab = key; render(); }
        }, label)));
        el.panel.textContent = '';
        ({ overview: renderOverview, info: renderInfo, rd: renderRd, id: renderId, ks: KS.renderTab, materials: renderMaterials, check: renderCheck, remarks: renderRemarks, handover: renderHandover })[tab](o);
    }

    function renderList() {
        el.list.textContent = '';
        data.objects.forEach(o => {
            const s = stats(o);
            el.list.appendChild(h('li', {},
                h('a', {
                    href: withCabinet(`objects.html?id=${o.key}`),
                    class: 'home-staff__item' + (o.key === currentId ? ' is-active' : ''),
                    'aria-current': o.key === currentId ? 'page' : null,
                    onclick: e => {
                        e.preventDefault();
                        currentId = o.key;
                        tab = 'overview';
                        window.history.replaceState(null, '', withCabinet(`?id=${o.key}`));
                        render();
                    }
                },
                h('span', { class: 'home-staff__item-title' }, o.name,
                    s.idOverdue ? h('span', { class: 'home-ct__dot home-ct__dot--overdue', title: 'Есть просроченная ИД' }) :
                        s.remarksOpen ? h('span', { class: 'home-ct__dot', title: 'Есть открытые замечания' }) : null),
                h('span', { class: 'home-staff__item-text' }, `ИД готова на ${s.readiness}%`))));
        });
    }

    function block(title, actions, ...content) {
        return h('section', { class: 'home-ct__block' },
            h('div', { class: 'home-ct__block-head' }, h('h3', { class: 'home-ct__block-title' }, title),
                actions && actions.length ? h('div', { class: 'home-ct__filters' }, actions) : null),
            ...content);
    }

    const small = (label, fn, primary) => h('button', { type: 'button', class: `home-btn home-btn--${primary ? 'primary' : 'secondary'} home-cab__small`, onclick: fn }, label);

    function rows(items, empty, map) {
        return h('ul', { class: 'home-ct__list' }, items.length ? items.map(map) : h('li', { class: 'home-ct__none' }, empty));
    }

    function row(badge, badgeTone, title, metaLines, actions, extra) {
        return h('li', { class: 'home-ct__row' },
            h('div', { class: 'home-ct__row-main' },
                h('p', { class: 'home-ct__row-title' }, badge ? h('span', { class: `home-ct__badge home-ct__badge--${badgeTone}` }, badge) : null, title),
                metaLines.filter(Boolean).map(m => h('p', { class: 'home-ct__row-meta' }, m)),
                extra),
            actions && actions.length ? h('div', { class: 'home-record__actions' }, actions.map(([label, fn]) => h('button', { type: 'button', onclick: fn }, label))) : null);
    }

    // Overview: readiness, deadlines and what to do next
    function renderOverview(o) {
        const s = stats(o);
        el.panel.append(
            h('ul', { class: 'home-ct__stats' }, [
                ['ИД готова', `${s.readiness}%`],
                ['Документов ИД', `${s.idSigned} / ${s.idTotal}`],
                ['РД в производстве', `${s.rdProduction} / ${s.rdTotal}`],
                ['Просрочено ИД', s.idOverdue],
                ['Открытых замечаний', s.remarksOpen],
                ['Нарушений комплектности', s.issues]
            ].map(([label, value]) => h('li', {}, h('span', { class: 'home-ct__stat-value' }, String(value)), h('span', { class: 'home-ct__stat-label' }, label)))),
            h('div', { class: 'home-ct__actions' },
                h('button', { type: 'button', class: 'home-btn home-btn--primary', onclick: () => addId(o) }, h('span', {}, 'Добавить документ ИД')),
                small('Сформировать состав ИД', () => composeId(o)),
                small('Получена РД', () => addRd(o)),
                small('Замечание', () => addRemark(o)),
                small('Инженер ПТО', () => askPto(o))));

        const deadlines = o.id.filter(d => d.status !== 'signed' && d.due && daysUntil(d.due) <= 14)
            .sort((a, b) => a.due.localeCompare(b.due));
        el.panel.appendChild(block('Сроки подготовки ИД', null, rows(deadlines, 'На две недели вперёд сроков нет.', d => {
            const days = daysUntil(d.due);
            return row(days < 0 ? `просрочено ${-days} дн.` : days === 0 ? 'сегодня' : `через ${days} дн.`, days < 0 ? 'overdue' : 'soon',
                d.title, [`${workName(o, d.workId)} · ${ID_STATUS[d.status]} · ${d.responsible || 'ответственный не назначен'}`],
                [['Открыть', () => { tab = 'id'; render(); }]]);
        })));

        const ks = KS.overview(o);
        if (ks) el.panel.appendChild(ks);

        const open = o.remarks.filter(r => r.status === 'open');
        el.panel.appendChild(block('Открытые замечания', null, rows(open.slice(0, 6), 'Открытых замечаний нет.', r =>
            row(r.source, 'review', r.text, [r.due ? `Устранить до ${formatDate(r.due)}` : '', r.target === 'rd' ? 'по РД' : r.target === 'handover' ? 'по сдаче' : 'по ИД'],
                [['Устранено', () => closeRemark(o, r, 'fixed')]]))));

        const linked = contracts().filter(c => (o.contractIds || []).includes(c.id));
        if (linked.length) {
            el.panel.appendChild(block('Договоры', null, rows(linked, '', c => {
                const transfer = c.obligations.filter(ob => /(исполнительн|рабоч\w* документац|\bИД\b|\bРД\b)/i.test(ob.text));
                return row(null, '', `Договор № ${c.number || 'без номера'}${c.subject ? ' · ' + c.subject : ''}`,
                    [transfer.length ? `Обязательств по РД/ИД: ${transfer.length}` : 'Обязательств по передаче РД/ИД в договоре не отмечено',
                        s.readiness < 100 ? `ИД готова на ${s.readiness}%: приёмка работ и оплата (КС-2) могут быть задержаны.` : 'ИД готова полностью.'],
                    [['Договор', () => openContract(c.id)]]);
            })));
        }

        el.panel.appendChild(block('История действий', null,
            h('ul', { class: 'home-ct__history' }, (o.log || []).slice(0, 15).map(l => h('li', {}, h('span', { class: 'home-ct__history-date' }, formatStamp(l.at)), h('span', {}, l.text))))));
    }

    function renderInfo(o) {
        const form = h('form', { class: 'home-ct__form' });
        [['name', 'Наименование объекта'], ['code', 'Шифр объекта'], ['address', 'Адрес'], ['stage', 'Стадия / этап'],
            ['permit', 'Разрешение на строительство'], ['start', 'Начало работ', 'date'], ['end', 'Окончание работ', 'date']]
            .forEach(([name, label, type]) => {
                const input = h('input', { type: type || 'text', name });
                input.value = o[name] || '';
                form.appendChild(h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, label), input));
            });
        const contractSelect = h('select', { name: 'contracts', multiple: true, size: 4 },
            contracts().map(c => h('option', { value: c.id, selected: (o.contractIds || []).includes(c.id) }, `№ ${c.number || 'без номера'} ${c.subject || ''}`)));
        form.appendChild(h('label', { class: 'home-dialog__field home-ct__wide' }, h('span', { class: 'home-dialog__label' }, 'Договоры (из раздела «Договоры»)'),
            contracts().length ? contractSelect : h('span', { class: 'home-dialog__hint' }, 'Договоров пока нет — добавьте их в разделе «Договоры».')));
        form.appendChild(h('div', { class: 'home-ct__wide home-ct__info-actions' },
            h('button', { type: 'submit', class: 'home-btn home-btn--primary' }, 'Сохранить'),
            h('button', {
                type: 'button', class: 'home-btn home-btn--secondary', onclick: () => {
                    if (!confirm('Удалить объект со всей РД и ИД из этого браузера?')) return;
                    data.objects = data.objects.filter(x => x !== o);
                    currentId = data.objects[0] && data.objects[0].id;
                    save();
                    render();
                }
            }, 'Удалить объект')));
        form.addEventListener('submit', e => {
            e.preventDefault();
            ['name', 'code', 'address', 'stage', 'permit', 'start', 'end'].forEach(n => { o[n] = form.elements[n].value.trim(); });
            if (form.elements.contracts) o.contractIds = [...form.elements.contracts.selectedOptions].map(x => x.value);
            log(o, 'Изменены сведения об объекте');
            save();
            render();
            notify('Сведения сохранены.');
        });
        el.panel.appendChild(form);

        el.panel.appendChild(block('Участники строительства', [small('Добавить', () => editParticipant(o))], rows(o.participants, 'Участники не указаны.', p =>
            row(null, '', p.role, [p.org, p.person && `Представитель: ${p.person}`, p.basis && `Основание: ${p.basis}`],
                [['Изменить', () => editParticipant(o, p)], ['Удалить', () => { o.participants = o.participants.filter(x => x !== p); save(); render(); }]]))));

        el.panel.appendChild(block('Виды работ и ответственные', [small('Добавить', () => editWork(o))], rows(o.works, 'Виды работ не указаны.', w =>
            row(null, '', w.name, [w.responsible && `Ответственный: ${w.responsible}`, `Документов ИД: ${o.id.filter(d => d.workId === w.id).length}`],
                [['Изменить', () => editWork(o, w)], ['Состав ИД', () => composeId(o, w)]]))));
    }

    function renderRd(o) {
        const items = [...o.rd].sort((a, b) => (a.code + a.mark).localeCompare(b.code + b.mark));
        el.panel.appendChild(block('Реестр рабочей документации', [small('Получена РД', () => addRd(o), true), small('Excel', () => exportXlsx(o, 'rd'))], rows(items, 'Комплектов РД пока нет.', r => {
            const open = o.remarks.filter(x => x.target === 'rd' && x.refId === r.id && x.status === 'open').length;
            const status = open ? 'remarks' : r.status;
            const actions = [];
            if (r.status === 'received') actions.push(['В производство работ', () => { r.status = 'production'; r.productionAt = today(); log(o, `РД ${r.code}-${r.mark} выдана в производство работ`); save(); render(); }]);
            if (r.status !== 'replaced') actions.push(['Новая версия', () => newVersion(o, r)]);
            actions.push(['Замечание', () => addRemark(o, 'rd', r.id)], ['Изменить', () => addRd(o, r)]);
            return row(RD_STATUS[status], status === 'production' ? 'done' : status === 'remarks' ? 'overdue' : status === 'replaced' ? '' : 'review',
                `${r.code}${r.mark ? '-' + r.mark : ''} · ${r.title}`,
                [`Версия ${r.version || '—'}${r.receivedAt ? ' · получена ' + formatDate(r.receivedAt) : ''}${r.productionAt ? ' · в производстве с ' + formatDate(r.productionAt) : ''}`,
                    (r.changes || []).length ? `Изменения: ${r.changes.map(c => `№ ${c.n} от ${formatDate(c.date)}${c.note ? ' — ' + c.note : ''}`).join('; ')}` : '',
                    open ? `Открытых замечаний: ${open}` : ''],
                actions, fileLinks(r.files));
        })));
        el.panel.appendChild(h('p', { class: 'home-note' }, 'Требования к оформлению РД: ', normLink('g21101'), '. В производство работ выдаётся только актуальная версия комплекта со штампом «В производство работ».'));
    }

    function renderId(o) {
        const works = o.works;
        el.panel.appendChild(h('div', { class: 'home-ct__actions' },
            h('button', { type: 'button', class: 'home-btn home-btn--primary', onclick: () => addId(o) }, h('span', {}, 'Добавить документ ИД')),
            small('Сформировать состав ИД', () => composeId(o)),
            small('Реестр ИД — Word', () => exportDocx(o, 'idRegistry')),
            small('Реестр ИД — Excel', () => exportXlsx(o, 'id')),
            small('PDF', () => printRegistry(o, 'id'))));
        const groups = [...works.map(w => ({ w, items: o.id.filter(d => d.workId === w.id) })), { w: { id: '', name: 'Без вида работ' }, items: o.id.filter(d => !works.some(w => w.id === d.workId)) }]
            .filter(g => g.items.length || g.w.id);
        groups.forEach(g => el.panel.appendChild(block(`${g.w.name}${g.w.responsible ? ' · ' + g.w.responsible : ''}`, null, rows(g.items, 'Документов нет. Нажмите «Сформировать состав ИД».', d => {
            const remarks = o.remarks.filter(x => x.target === 'id' && x.refId === d.id && x.status === 'open').length;
            const status = remarks ? 'remarks' : d.status;
            const mats = o.materials.filter(m => (m.idRefs || []).includes(d.id)).length;
            const actions = [['Изменить', () => addId(o, d)]];
            if (d.status !== 'signed') actions.push(['Подписан', () => signId(o, d)]);
            if (d.type === 'aosr' || d.type === 'aook' || d.type === 'aosito') actions.push(['Акт — Word', () => exportDocx(o, 'act', d)]);
            actions.push(['Замечание', () => addRemark(o, 'id', d.id)], ['ПТО', () => askPto(o, d)]);
            return row(ID_STATUS[status], status === 'signed' ? 'done' : status === 'remarks' || idOverdue(d) ? 'overdue' : status === 'todo' ? '' : 'soon',
                `${d.number ? '№ ' + d.number + ' · ' : ''}${d.title}`,
                [`${ID_TYPES[d.type]}${d.date ? ' · от ' + formatDate(d.date) : ''}${d.due ? ' · срок ' + formatDate(d.due) : ''}${d.responsible ? ' · ' + d.responsible : ''}`,
                    d.rdRef ? `РД: ${d.rdRef}` : '',
                    d.type === 'aosr' ? `Документов о качестве материалов: ${mats}` : '',
                    remarks ? `Открытых замечаний: ${remarks}` : ''],
                actions, fileLinks(d.files));
        }))));
        el.panel.appendChild(h('p', { class: 'home-note' }, 'Состав и порядок ведения ИД: ', normLink('p344'), ', общий журнал работ: ', normLink('p1026'), ', исполнительные схемы: ', normLink('g51872'), ', электронная форма: ', normLink('g70108'), '.'));
    }

    function renderMaterials(o) {
        el.panel.appendChild(block('Материалы, изделия и испытания', [small('Добавить документ', () => addMaterial(o), true), small('Excel', () => exportXlsx(o, 'materials'))], rows(o.materials, 'Документов о качестве пока нет.', m =>
            row(m.docType, 'review', `${m.name}${m.number ? ' · № ' + m.number : ''}`,
                [`${workName(o, m.workId)}${m.date ? ' · от ' + formatDate(m.date) : ''}${m.until ? ' · действует до ' + formatDate(m.until) : ''}`,
                    (m.idRefs || []).length ? `Привязан к актам: ${m.idRefs.map(id => (o.id.find(d => d.id === id) || {}).number || '—').join(', ')}` : 'Не привязан к актам ИД',
                    m.until && daysUntil(m.until) < 0 ? 'Срок действия документа истёк' : ''],
                [['Изменить', () => addMaterial(o, m)], ['Удалить', () => { o.materials = o.materials.filter(x => x !== m); save(); render(); }]], fileLinks(m.files)))));
    }

    // ---- Normative control -------------------------------------------------------------

    // Rule-based checks of completeness and formatting; each issue refers to the norm behind it
    function checks(o) {
        const result = [];
        const add = (level, area, text, norm, fix) => result.push({ level, area, text, norm, fix });

        o.works.forEach(w => {
            const template = WORK_TEMPLATES[w.template];
            if (!template) return;
            const have = o.id.filter(d => d.workId === w.id);
            template.items.forEach(([type, title]) => {
                if (!have.some(d => d.title === title || (d.type === type && d.templateTitle === title))) {
                    add('error', w.name, `Нет документа: ${title}`, 'p344', () => composeId(o, w));
                }
            });
        });

        o.id.forEach(d => {
            const where = `${d.number ? '№ ' + d.number + ' ' : ''}${d.title}`;
            if (d.status === 'signed' && !d.number) add('error', where, 'Подписанный документ без номера', 'p344');
            if (d.status === 'signed' && !d.date) add('error', where, 'Подписанный документ без даты', 'p344');
            if (d.status === 'signed' && !(d.files || []).length) add('warning', where, 'Нет скан-копии или файла подписанного документа', 'g70108');
            if (['aosr', 'aook', 'aosito'].includes(d.type) && !d.rdRef) add('warning', where, 'Не указан шифр РД, по которой выполнены работы', 'p344');
            if (d.type === 'aosr' && !o.materials.some(m => (m.idRefs || []).includes(d.id))) add('warning', where, 'К АОСР не приложены документы о качестве материалов', 'p344');
            if (d.type === 'scheme' && !(d.files || []).length) add('warning', where, 'Нет файла исполнительной схемы', 'g51872');
            if (idOverdue(d)) add('error', where, `Срок подготовки прошёл ${formatDate(d.due)}`, 'sp543');
            if (d.rdRef && o.rd.some(r => `${r.code}-${r.mark}` === d.rdRef && r.status === 'replaced')) add('error', where, `Работы выполнены по заменённой версии РД ${d.rdRef}`, 'g21101');
        });

        o.rd.forEach(r => {
            const where = `${r.code}-${r.mark}`;
            if (!r.code) add('error', where, 'Не указан шифр комплекта РД', 'g21101');
            if (!r.version) add('warning', where, 'Не указана версия (номер изменения) комплекта', 'g21101');
            if (r.status === 'received' && o.id.some(d => d.rdRef === where)) add('error', where, 'По комплекту выполняются работы, но он не выдан в производство работ', 'g21101');
        });

        o.materials.forEach(m => {
            if (m.until && daysUntil(m.until) < 0) add('warning', m.name, `Срок действия документа «${m.docType}» истёк ${formatDate(m.until)}`, 'p344');
        });

        if (!o.id.some(d => d.type === 'journal')) add('warning', 'Журналы', 'Не ведётся общий журнал работ', 'p1026');
        return result;
    }

    function renderCheck(o) {
        const list = checks(o);
        const errors = list.filter(c => c.level === 'error').length;
        el.panel.appendChild(h('div', { class: 'home-ct__alert' + (errors ? ' home-ct__alert--overdue' : '') },
            list.length ? `Найдено нарушений: ${errors}, предупреждений: ${list.length - errors}.` : 'Нарушений комплектности и оформления не найдено.'));
        el.panel.appendChild(block('Проверка комплектности и оформления', [small('Инженер ПТО', () => askPto(o, null, list))], rows(list, 'Всё в порядке.', c =>
            row(c.level === 'error' ? 'Нарушение' : 'Предупреждение', c.level === 'error' ? 'overdue' : 'soon', c.text, [c.area],
                c.fix ? [['Исправить', c.fix]] : [], h('p', { class: 'home-ct__row-meta' }, 'Основание: ', normLink(c.norm))))));
        el.panel.appendChild(h('p', { class: 'home-note' }, 'Проверка выполняется по правилам и типовому составу ИД. Окончательный состав ИД определяется проектной документацией, договором и требованиями заказчика. Разбор содержания документов — у инженера ПТО.'));
    }

    function renderRemarks(o) {
        const items = [...o.remarks].sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || (a.due || '9').localeCompare(b.due || '9'));
        el.panel.appendChild(block('Замечания строительного контроля и заказчика', [small('Добавить', () => addRemark(o), true), small('Word', () => exportDocx(o, 'remarks'))], rows(items, 'Замечаний нет.', r => {
            const ref = r.target === 'rd' ? o.rd.find(x => x.id === r.refId) : r.target === 'id' ? o.id.find(x => x.id === r.refId) : o.handovers.find(x => x.id === r.refId);
            return row(REMARK_STATUS[r.status], r.status === 'open' ? (r.due && daysUntil(r.due) < 0 ? 'overdue' : 'soon') : 'done', r.text,
                [`${r.source} · ${formatDate(r.created)}${r.due ? ' · устранить до ' + formatDate(r.due) : ''}`,
                    ref ? `К: ${ref.title || `${ref.code}-${ref.mark}`}` : '',
                    r.answer ? `Устранение: ${r.answer}` : ''],
                r.status === 'open' ? [['Устранено', () => closeRemark(o, r, 'fixed')], ['Снято', () => closeRemark(o, r, 'closed')]] : []);
        })));
    }

    function renderHandover(o) {
        el.panel.appendChild(block('Комплекты передачи ИД заказчику', [small('Сформировать комплект', () => addHandover(o), true)], rows(o.handovers, 'Комплектов передачи пока нет.', t => {
            const docs = o.id.filter(d => t.items.includes(d.id));
            const notReady = docs.filter(d => d.status !== 'signed');
            const remarks = o.remarks.filter(r => r.target === 'handover' && r.refId === t.id && r.status === 'open');
            const actions = [['Реестр — Word', () => exportDocx(o, 'handover', t)], ['Письмо — Word', () => exportDocx(o, 'letter', t)], ['Excel', () => exportXlsx(o, 'handover', t)]];
            if (t.status === 'forming') actions.unshift(['Передан', () => sendHandover(o, t, notReady)]);
            if (t.status === 'sent' || t.status === 'remarks') actions.unshift(['Принят', () => acceptHandover(o, t, remarks)], ['Замечания заказчика', () => addRemark(o, 'handover', t.id, true)]);
            if (t.status === 'remarks' && !remarks.length) actions.unshift(['Повторная сдача', () => { t.status = 'sent'; t.resentAt = today(); log(o, `Комплект «${t.title}» передан повторно`); save(); render(); }]);
            return row(HANDOVER_STATUS[t.status], t.status === 'accepted' ? 'done' : t.status === 'remarks' ? 'overdue' : 'soon', t.title,
                [`Документов: ${docs.length}${notReady.length ? ` · не подписано: ${notReady.length}` : ' · все подписаны'}`,
                    t.sentAt ? `Передан ${formatDate(t.sentAt)}${t.letterNo ? ', письмо № ' + t.letterNo : ''}${t.method ? ', ' + t.method : ''}` : '',
                    t.resentAt ? `Повторно передан ${formatDate(t.resentAt)}` : '',
                    remarks.length ? `Открытых замечаний заказчика: ${remarks.length}` : '',
                    t.acceptedAt ? `Принят ${formatDate(t.acceptedAt)}${t.acceptRef ? ' · ' + t.acceptRef : ''}` : ''],
                actions, fileLinks(t.files));
        })));
    }

    // ---- Actions ---------------------------------------------------------------------

    function newObject() {
        openDialog('Новый объект', [
            { name: 'name', label: 'Наименование объекта', required: true },
            { name: 'code', label: 'Шифр объекта' },
            { name: 'address', label: 'Адрес' }
        ], 'Добавить', v => {
            const o = { key: uid(), ...v, stage: '', participants: [], contractIds: [], works: [], rd: [], id: [], materials: [], remarks: [], handovers: [], log: [] };
            log(o, 'Объект добавлен');
            data.objects.unshift(o);
            currentId = o.key;
            tab = 'info';
        });
    }

    function editParticipant(o, p) {
        openDialog(p ? 'Участник строительства' : 'Новый участник', [
            { name: 'role', label: 'Роль', type: 'select', value: p && p.role, options: ['Застройщик', 'Технический заказчик', 'Генеральный подрядчик', 'Подрядчик', 'Субподрядчик', 'Проектировщик', 'Строительный контроль', 'Авторский надзор'].map(x => [x, x]) },
            { name: 'org', label: 'Организация', value: p && p.org, required: true },
            { name: 'person', label: 'Представитель (ФИО, должность)', value: p && p.person },
            { name: 'basis', label: 'Основание полномочий', value: p && p.basis, hint: 'Приказ, доверенность' }
        ], 'Сохранить', v => {
            if (p) Object.assign(p, v);
            else o.participants.push({ id: uid(), ...v });
            log(o, `Участник: ${v.role} — ${v.org}`);
        });
    }

    function editWork(o, w) {
        openDialog(w ? 'Вид работ' : 'Новый вид работ', [
            { name: 'template', label: 'Тип работ', type: 'select', value: w && w.template, options: Object.entries(WORK_TEMPLATES).map(([k, t]) => [k, t.title]) },
            { name: 'name', label: 'Наименование', value: w && w.name, hint: 'Например: Фундаменты корпуса 1' },
            { name: 'responsible', label: 'Ответственный за ИД', value: w && w.responsible }
        ], 'Сохранить', v => {
            v.name = v.name || WORK_TEMPLATES[v.template].title;
            if (w) Object.assign(w, v);
            else o.works.push({ id: uid(), ...v });
            log(o, `Вид работ: ${v.name}`);
        });
    }

    // Creates the expected ИД documents for a work type that are not in the registry yet
    function composeId(o, w) {
        if (!o.works.length) return notify('Сначала добавьте виды работ во вкладке «Сведения».');
        openDialog('Сформировать состав ИД', [
            { name: 'work', label: 'Вид работ', type: 'select', value: w && w.id, options: o.works.map(x => [x.id, x.name]) },
            { name: 'due', label: 'Срок подготовки', type: 'date' }
        ], 'Сформировать', v => {
            const work = o.works.find(x => x.id === v.work);
            const template = WORK_TEMPLATES[work.template] || WORK_TEMPLATES.custom;
            let added = 0;
            template.items.forEach(([type, title]) => {
                if (o.id.some(d => d.workId === work.id && (d.title === title || d.templateTitle === title))) return;
                o.id.push({ id: uid(), workId: work.id, type, title, templateTitle: title, number: '', date: '', due: v.due, responsible: work.responsible || '', status: 'todo', rdRef: '', files: [] });
                added++;
            });
            if (!added) return template.items.length ? 'Типовой состав для этого вида работ уже сформирован.' : 'Для этого типа работ нет типового состава — добавьте документы вручную.';
            log(o, `Сформирован состав ИД: ${work.name} — ${added} док.`);
            tab = 'id';
            return null;
        }, h('p', { class: 'home-dialog__hint' }, 'Типовой состав по виду работ на основе минимального состава ИД (приказ Минстроя № 344/пр). Дополните его по проекту и договору.'));
    }

    function rdOptions(o) {
        return [['', '— не указано —'], ...o.rd.filter(r => r.status !== 'replaced').map(r => [`${r.code}-${r.mark}`, `${r.code}-${r.mark} · ${r.title}`])];
    }

    function addId(o, d) {
        openDialog(d ? 'Документ ИД' : 'Новый документ ИД', [
            { name: 'type', label: 'Вид документа', type: 'select', value: d ? d.type : 'aosr', options: Object.entries(ID_TYPES) },
            { name: 'title', label: 'Наименование', value: d && d.title, required: true },
            { name: 'work', label: 'Вид работ', type: 'select', value: d && d.workId, options: [['', '— не указан —'], ...o.works.map(w => [w.id, w.name])] },
            { name: 'number', label: 'Номер', value: d && d.number },
            { name: 'date', label: 'Дата', type: 'date', value: d && d.date },
            { name: 'due', label: 'Срок подготовки', type: 'date', value: d && d.due },
            { name: 'responsible', label: 'Ответственный', value: d && d.responsible },
            { name: 'rdRef', label: 'Рабочая документация', type: 'select', value: d && d.rdRef, options: rdOptions(o) },
            { name: 'status', label: 'Статус', type: 'select', value: d ? d.status : 'draft', options: Object.entries(ID_STATUS).filter(([k]) => k !== 'remarks') },
            { name: 'files', label: 'Файлы', type: 'file' }
        ], 'Сохранить', async v => {
            const files = await storeFiles(v.files);
            const fields = { type: v.type, title: v.title, workId: v.work, number: v.number, date: v.date, due: v.due, responsible: v.responsible, rdRef: v.rdRef, status: v.status };
            if (d) {
                Object.assign(d, fields);
                d.files = [...(d.files || []), ...files];
            } else {
                o.id.push({ id: uid(), ...fields, files });
            }
            log(o, `ИД: ${v.title} — ${ID_STATUS[v.status]}`);
        });
    }

    function signId(o, d) {
        openDialog('Документ подписан', [
            { name: 'number', label: 'Номер', value: d.number, required: true },
            { name: 'date', label: 'Дата', type: 'date', value: d.date || today(), required: true },
            { name: 'files', label: 'Скан подписанного документа', type: 'file' }
        ], 'Отметить', async v => {
            d.number = v.number;
            d.date = v.date;
            d.status = 'signed';
            d.files = [...(d.files || []), ...(await storeFiles(v.files))];
            log(o, `Подписан: № ${v.number} ${d.title}`);
        });
    }

    function addRd(o, r) {
        openDialog(r ? 'Комплект РД' : 'Получена рабочая документация', [
            { name: 'code', label: 'Шифр', value: r && r.code, required: true, hint: 'Например: 24-2026' },
            { name: 'mark', label: 'Марка', value: r && r.mark, hint: 'АР, КЖ, КМ, ОВ, ВК, ЭОМ…' },
            { name: 'title', label: 'Наименование комплекта', value: r && r.title, required: true },
            { name: 'version', label: 'Версия / изменение', value: r ? r.version : '0' },
            { name: 'receivedAt', label: 'Дата получения', type: 'date', value: r ? r.receivedAt : today() },
            { name: 'files', label: 'Файлы комплекта', type: 'file' }
        ], 'Сохранить', async v => {
            const files = await storeFiles(v.files);
            if (r) {
                Object.assign(r, { code: v.code, mark: v.mark, title: v.title, version: v.version, receivedAt: v.receivedAt });
                r.files = [...(r.files || []), ...files];
            } else {
                o.rd.push({ id: uid(), code: v.code, mark: v.mark, title: v.title, version: v.version, receivedAt: v.receivedAt, status: 'received', changes: [], files });
            }
            log(o, `РД ${v.code}-${v.mark}: ${v.title}, версия ${v.version}`);
        });
    }

    function newVersion(o, r) {
        openDialog('Новая версия комплекта РД', [
            { name: 'version', label: 'Номер изменения', required: true, value: String((parseInt(r.version, 10) || 0) + 1) },
            { name: 'date', label: 'Дата', type: 'date', value: today() },
            { name: 'note', label: 'Содержание изменения', type: 'textarea' },
            { name: 'files', label: 'Файлы новой версии', type: 'file' }
        ], 'Зарегистрировать', async v => {
            r.status = 'replaced';
            const next = { id: uid(), code: r.code, mark: r.mark, title: r.title, version: v.version, receivedAt: v.date, status: 'received', changes: [...(r.changes || []), { n: v.version, date: v.date, note: v.note }], files: await storeFiles(v.files) };
            o.rd.push(next);
            const affected = o.id.filter(d => d.rdRef === `${r.code}-${r.mark}` && d.status !== 'signed').length;
            log(o, `РД ${r.code}-${r.mark}: изменение № ${v.version}; предыдущая версия заменена${affected ? `, затронуто документов ИД: ${affected}` : ''}`);
        });
    }

    function addMaterial(o, m) {
        openDialog(m ? 'Документ о качестве' : 'Новый документ о качестве', [
            { name: 'name', label: 'Материал, изделие или испытание', value: m && m.name, required: true },
            { name: 'docType', label: 'Документ', type: 'select', value: m && m.docType, options: MATERIAL_DOCS.map(x => [x, x]) },
            { name: 'number', label: 'Номер', value: m && m.number },
            { name: 'date', label: 'Дата', type: 'date', value: m && m.date },
            { name: 'until', label: 'Действует до', type: 'date', value: m && m.until },
            { name: 'work', label: 'Вид работ', type: 'select', value: m && m.workId, options: [['', '— не указан —'], ...o.works.map(w => [w.id, w.name])] },
            { name: 'idRefs', label: 'Акты ИД, к которым относится', type: 'multi', value: m && m.idRefs, options: o.id.filter(d => ['aosr', 'aook', 'aosito', 'tests'].includes(d.type)).map(d => [d.id, `${d.number ? '№ ' + d.number + ' ' : ''}${d.title}`]) },
            { name: 'files', label: 'Файлы', type: 'file' }
        ], 'Сохранить', async v => {
            const files = await storeFiles(v.files);
            const fields = { name: v.name, docType: v.docType, number: v.number, date: v.date, until: v.until, workId: v.work, idRefs: v.idRefs };
            if (m) {
                Object.assign(m, fields);
                m.files = [...(m.files || []), ...files];
            } else {
                o.materials.push({ id: uid(), ...fields, files });
            }
            log(o, `Документ о качестве: ${v.docType} — ${v.name}`);
        });
    }

    function addRemark(o, target = 'id', refId = '', fromCustomer = false) {
        const refOptions = target === 'rd' ? o.rd.map(r => [r.id, `${r.code}-${r.mark} ${r.title}`])
            : target === 'handover' ? o.handovers.map(t => [t.id, t.title])
                : o.id.map(d => [d.id, `${d.number ? '№ ' + d.number + ' ' : ''}${d.title}`]);
        openDialog('Замечание', [
            { name: 'source', label: 'Кто выдал', type: 'select', value: fromCustomer ? 'Заказчик' : '', options: REMARK_SOURCES.map(x => [x, x]) },
            { name: 'target', label: 'К чему', type: 'select', value: target, options: [['id', 'Исполнительная документация'], ['rd', 'Рабочая документация'], ['handover', 'Сдача ИД']] },
            { name: 'ref', label: 'Документ', type: 'select', value: refId, options: [['', '— объект в целом —'], ...refOptions] },
            { name: 'text', label: 'Замечание', type: 'textarea', required: true },
            { name: 'due', label: 'Устранить до', type: 'date' }
        ], 'Добавить', v => {
            o.remarks.push({ id: uid(), source: v.source, target: v.target, refId: v.ref, text: v.text, due: v.due, status: 'open', created: today() });
            if (v.target === 'handover') {
                const t = o.handovers.find(x => x.id === v.ref);
                if (t) t.status = 'remarks';
            }
            log(o, `Замечание (${v.source}): ${v.text.slice(0, 80)}`);
        });
    }

    function closeRemark(o, r, status) {
        openDialog(status === 'fixed' ? 'Замечание устранено' : 'Замечание снято', [
            { name: 'answer', label: status === 'fixed' ? 'Как устранено' : 'Основание', type: 'textarea', required: true }
        ], 'Сохранить', v => {
            r.status = status;
            r.answer = v.answer;
            r.closedAt = today();
            log(o, `Замечание ${status === 'fixed' ? 'устранено' : 'снято'}: ${r.text.slice(0, 60)}`);
        });
    }

    function addHandover(o) {
        const signed = o.id.filter(d => d.status === 'signed');
        openDialog('Комплект передачи ИД', [
            { name: 'title', label: 'Название комплекта', required: true, value: `Комплект ИД № ${o.handovers.length + 1}` },
            { name: 'items', label: 'Документы', type: 'multi', value: signed.map(d => d.id), options: o.id.map(d => [d.id, `${d.status === 'signed' ? '' : '[не подписан] '}${d.number ? '№ ' + d.number + ' ' : ''}${d.title}`]) }
        ], 'Сформировать', v => {
            if (!v.items.length) return 'Выберите документы для передачи.';
            o.handovers.push({ id: uid(), title: v.title, items: v.items, status: 'forming', created: today(), files: [] });
            log(o, `Сформирован комплект передачи «${v.title}»: ${v.items.length} док.`);
        }, h('p', { class: 'home-dialog__hint' }, 'Для выбора нескольких документов удерживайте Cmd или Ctrl.'));
    }

    // A set counts as handed over only with the letter number or a document confirming it
    function sendHandover(o, t, notReady) {
        openDialog('Передача комплекта заказчику', [
            { name: 'sentAt', label: 'Дата передачи', type: 'date', value: today(), required: true },
            { name: 'letterNo', label: 'Сопроводительное письмо, №' },
            { name: 'method', label: 'Способ передачи', type: 'select', options: ['Нарочно под подпись', 'Почта России', 'Электронный документооборот', 'Курьерская служба'].map(x => [x, x]) },
            { name: 'files', label: 'Подтверждение передачи', type: 'file', hint: 'Сопроводительное письмо с отметкой о получении, накладная' }
        ], 'Передан', async v => {
            if (!v.letterNo && !v.files.length) return 'Укажите номер сопроводительного письма или приложите подтверждение передачи.';
            Object.assign(t, { status: 'sent', sentAt: v.sentAt, letterNo: v.letterNo, method: v.method });
            t.files = [...(t.files || []), ...(await storeFiles(v.files))];
            log(o, `Комплект «${t.title}» передан заказчику${v.letterNo ? ', письмо № ' + v.letterNo : ''}`);
        }, notReady.length ? h('p', { class: 'home-dialog__error' }, `В комплекте ${notReady.length} неподписанных документов.`) : null);
    }

    function acceptHandover(o, t, remarks) {
        if (remarks.length) return notify('Сначала устраните замечания заказчика по комплекту.');
        openDialog('Приёмка комплекта заказчиком', [
            { name: 'acceptedAt', label: 'Дата приёмки', type: 'date', value: today(), required: true },
            { name: 'acceptRef', label: 'Подтверждение', hint: 'Реестр с отметкой заказчика, входящий номер' },
            { name: 'files', label: 'Документ о приёмке', type: 'file' }
        ], 'Принят', async v => {
            if (!v.acceptRef && !v.files.length) return 'Укажите подтверждение приёмки или приложите документ.';
            Object.assign(t, { status: 'accepted', acceptedAt: v.acceptedAt, acceptRef: v.acceptRef });
            t.files = [...(t.files || []), ...(await storeFiles(v.files))];
            log(o, `Комплект «${t.title}» принят заказчиком`);
        });
    }

    function openContract(id) {
        if (inCabinet && window.parent !== window) window.parent.location.hash = `contracts/${encodeURIComponent(id)}`;
        else location.href = `contracts.html?id=${encodeURIComponent(id)}`;
    }

    // ---- Digital PTO engineer: chat with the object context -------------------------------

    function askPto(o, d, issues) {
        if (typeof window.AirchitectOpenSpecialist !== 'function') return;
        const s = stats(o);
        const lines = [
            `Объект: ${o.name}${o.code ? ' (шифр ' + o.code + ')' : ''}${o.address ? ', ' + o.address : ''}.`,
            `Виды работ: ${o.works.map(w => w.name).join('; ') || 'не указаны'}.`,
            `ИД готова на ${s.readiness}% (${s.idSigned} из ${s.idTotal}), просрочено ${s.idOverdue}, открытых замечаний ${s.remarksOpen}.`
        ];
        if (d) lines.push(`Документ: ${ID_TYPES[d.type]} «${d.title}»${d.number ? ' № ' + d.number : ''}${d.rdRef ? ', РД ' + d.rdRef : ''}, статус: ${ID_STATUS[d.status]}. Если нужно проверить сам документ, приложите его файл.`);
        if (issues && issues.length) lines.push('Результаты нормативного контроля:\n' + issues.slice(0, 15).map(c => `— ${c.area}: ${c.text} (${NORMS[c.norm].title})`).join('\n'));
        lines.push('\nВопрос: ');
        window.AirchitectOpenSpecialist('pto-engineer', lines.join('\n'));
    }

    // ---- Export: Word, Excel, PDF ---------------------------------------------------------

    function registry(o, kind, t) {
        if (kind === 'rd') {
            return { title: 'Реестр рабочей документации', columns: ['№', 'Шифр', 'Марка', 'Наименование', 'Версия', 'Получена', 'Статус'],
                rows: o.rd.map((r, i) => [i + 1, r.code, r.mark, r.title, r.version, formatDate(r.receivedAt), RD_STATUS[r.status]]) };
        }
        if (kind === 'materials') {
            return { title: 'Реестр документов о качестве материалов и испытаний', columns: ['№', 'Материал / испытание', 'Документ', 'Номер', 'Дата', 'Действует до', 'Вид работ'],
                rows: o.materials.map((m, i) => [i + 1, m.name, m.docType, m.number, formatDate(m.date), formatDate(m.until), workName(o, m.workId)]) };
        }
        const docs = kind === 'handover' ? o.id.filter(d => t.items.includes(d.id)) : o.id;
        return {
            title: kind === 'handover' ? `Реестр исполнительной документации — ${t.title}` : 'Реестр исполнительной документации',
            columns: ['№ п/п', 'Наименование документа', 'Номер', 'Дата', 'Вид работ', 'Листов', 'Статус'],
            rows: docs.map((d, i) => [i + 1, d.title, d.number, formatDate(d.date), workName(o, d.workId), '', ID_STATUS[d.status]])
        };
    }

    async function exportXlsx(o, kind, t) {
        try {
            await loadScript(XLSX_URL);
            const reg = registry(o, kind, t);
            const sheet = window.XLSX.utils.aoa_to_sheet([[reg.title], [`Объект: ${o.name}${o.code ? ', шифр ' + o.code : ''}`], [], reg.columns, ...reg.rows]);
            sheet['!cols'] = reg.columns.map((c, i) => ({ wch: i === 1 || i === 3 ? 50 : 16 }));
            const book = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(book, sheet, 'Реестр');
            window.XLSX.writeFile(book, `${reg.title} — ${o.name}.xlsx`);
        } catch (e) {
            notify(e.message);
        }
    }

    async function exportDocx(o, kind, item) {
        try {
            await loadScript(DOCX_URL);
            const D = window.docx;
            const p = (text, opts = {}) => new D.Paragraph({ alignment: opts.center ? D.AlignmentType.CENTER : opts.right ? D.AlignmentType.RIGHT : undefined, spacing: { after: 120 }, children: [new D.TextRun({ text, bold: opts.bold, size: opts.size || 22, font: 'Times New Roman' })] });
            const cell = (text, bold) => new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: String(text ?? ''), bold, size: 20, font: 'Times New Roman' })] })] });
            const table = (columns, rowsData) => new D.Table({
                width: { size: 100, type: D.WidthType.PERCENTAGE },
                rows: [new D.TableRow({ tableHeader: true, children: columns.map(c => cell(c, true)) }), ...rowsData.map(r => new D.TableRow({ children: r.map(c => cell(c)) }))]
            });
            const party = role => o.participants.find(x => x.role === role) || {};
            const customer = party('Технический заказчик').org ? party('Технический заказчик') : party('Застройщик');
            const contractor = party('Генеральный подрядчик').org ? party('Генеральный подрядчик') : party('Подрядчик');
            let children = [];
            let name = '';

            if (kind === 'act') {
                const d = item;
                const mats = o.materials.filter(m => (m.idRefs || []).includes(d.id));
                name = `Акт № ${d.number || '___'} — ${d.title}`;
                children = [
                    p(`Объект капитального строительства: ${o.name}${o.address ? ', ' + o.address : ''}`),
                    p(ID_TYPES[d.type].toUpperCase(), { bold: true, center: true, size: 24 }),
                    p(`№ ${d.number || '____'}`, { center: true }),
                    p(`Дата: ${formatDate(d.date) || '«__» ________ 20__ г.'}`, { right: true }),
                    ...o.participants.map(x => p(`${x.role}: ${x.org}${x.person ? ', представитель ' + x.person : ''}${x.basis ? ' (' + x.basis + ')' : ''}`)),
                    p('произвели осмотр работ и составили настоящий акт о нижеследующем:'),
                    p(`1. К освидетельствованию предъявлены следующие работы: ${d.title}`),
                    p(`2. Работы выполнены по проектной (рабочей) документации: ${d.rdRef || '________'}`),
                    p(`3. При выполнении работ применены: ${mats.length ? mats.map(m => `${m.name} (${m.docType}${m.number ? ' № ' + m.number : ''}${m.date ? ' от ' + formatDate(m.date) : ''})`).join('; ') : '________'}`),
                    p('4. Предъявлены документы, подтверждающие соответствие работ предъявляемым к ним требованиям: ________'),
                    p('5. Даты: начала работ ________ окончания работ ________'),
                    p('6. Работы выполнены в соответствии с ________'),
                    p('7. Разрешается производство последующих работ: ________'),
                    p('Дополнительные сведения: ________'),
                    p('Акт составлен в ___ экземплярах. Приложения: ________'),
                    ...o.participants.map(x => p(`${x.role}: ____________ / ${x.person || '____________'}`)),
                    p('Шаблон подготовлен в AIRCHITECT по составу сведений РД-11-02-2006 и приказа Минстроя № 344/пр. Перед подписанием проверьте применимую форму акта.', { size: 16 })
                ];
            } else if (kind === 'letter') {
                const t = item;
                const docs = o.id.filter(d => t.items.includes(d.id));
                name = `Сопроводительное письмо — ${t.title}`;
                children = [
                    p(`${contractor.org || '________'}`, { bold: true }),
                    p(`Исх. № ${t.letterNo || '____'} от ${formatDate(t.sentAt || today())}`),
                    p(`${customer.org || '________'}`, { right: true }),
                    p(customer.person ? `${customer.person}` : '', { right: true }),
                    p('О передаче исполнительной документации', { bold: true, center: true }),
                    p(`Направляем исполнительную документацию по объекту «${o.name}»${o.code ? ' (шифр ' + o.code + ')' : ''}${(o.contractIds || []).length ? ' в рамках договора ' + contracts().filter(c => o.contractIds.includes(c.id)).map(c => '№ ' + c.number).join(', ') : ''} согласно прилагаемому реестру: ${t.title}, ${docs.length} документов.`),
                    p('Просим принять документацию и подтвердить получение подписью на экземпляре реестра.'),
                    p('Приложение: реестр исполнительной документации.'),
                    p(`${contractor.person || 'Должность ________'} ____________`)
                ];
            } else {
                const reg = kind === 'remarks'
                    ? { title: 'Реестр замечаний по РД и ИД', columns: ['№', 'Замечание', 'Кто выдал', 'Дата', 'Срок', 'Статус', 'Устранение'], rows: o.remarks.map((r, i) => [i + 1, r.text, r.source, formatDate(r.created), formatDate(r.due), REMARK_STATUS[r.status], r.answer || '']) }
                    : registry(o, kind === 'handover' ? 'handover' : 'id', item);
                name = `${reg.title} — ${o.name}`;
                children = [
                    p(reg.title.toUpperCase(), { bold: true, center: true, size: 24 }),
                    p(`Объект: ${o.name}${o.code ? ', шифр ' + o.code : ''}${o.address ? ', ' + o.address : ''}`),
                    table(reg.columns, reg.rows),
                    p(''),
                    p(`Передал: ${contractor.org || '________'} ____________`),
                    p(`Принял: ${customer.org || '________'} ____________   «__» ________ 20__ г.`)
                ];
            }
            const doc = new D.Document({ sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1701, right: 850 } } }, children }] });
            download(await D.Packer.toBlob(doc), `${name}.docx`);
        } catch (e) {
            notify(e.message || 'Не удалось сформировать документ.');
        }
    }

    // PDF through the browser print dialog ("Сохранить как PDF")
    function printRegistry(o, kind) {
        const reg = registry(o, kind);
        const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const win = window.open('', '_blank');
        if (!win) return notify('Разрешите всплывающие окна, чтобы сохранить PDF.');
        win.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(reg.title)}</title>
            <style>body{font-family:'Times New Roman',serif;font-size:12pt;margin:20mm}h1{font-size:14pt;text-align:center}table{width:100%;border-collapse:collapse}td,th{border:1px solid #000;padding:4px 6px;vertical-align:top}th{background:#eee}</style></head>
            <body><h1>${esc(reg.title)}</h1><p>Объект: ${esc(o.name)}${o.code ? ', шифр ' + esc(o.code) : ''}</p>
            <table><thead><tr>${reg.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${reg.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
            <p style="margin-top:24px">Передал: ____________ &nbsp;&nbsp;&nbsp; Принял: ____________</p></body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
    }

    // ---- Demo object for presentations -------------------------------------------------------

    function demo() {
        const w = (template, name, responsible) => ({ id: uid(), template, name, responsible });
        const works = [w('geodesy', 'Геодезические работы', 'Смирнов А.В.'), w('foundation', 'Фундаменты корпуса 1', 'Козлов Д.И.'), w('concrete', 'Монолитный каркас', 'Козлов Д.И.'), w('roof', 'Кровля', 'Орлова Е.С.')];
        const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
        const o = {
            key: uid(), name: 'Складской комплекс (демо)', code: '24-2026', address: 'Московская обл., г. Подольск, ул. Индустриальная, д. 5', stage: 'Строительство, корпус 1',
            permit: 'RU50-27-1234-2026', start: day(-150), end: day(120),
            participants: [
                { id: uid(), role: 'Застройщик', org: 'ООО «СтройИнвест»', person: 'Петров П.П., главный инженер проекта', basis: 'приказ № 12 от 10.03.2026' },
                { id: uid(), role: 'Генеральный подрядчик', org: 'ООО «ГлавСтрой»', person: 'Сидоров С.С., начальник участка', basis: 'приказ № 7 от 15.03.2026' },
                { id: uid(), role: 'Проектировщик', org: 'ООО «ПроектБюро»', person: 'Иванова А.А., ГИП', basis: 'доверенность № 3' },
                { id: uid(), role: 'Строительный контроль', org: 'ООО «ТехНадзор»', person: 'Кузнецов В.В.', basis: 'договор № 5-СК' }
            ],
            contractIds: contracts().slice(0, 1).map(c => c.id),
            works, rd: [], id: [], materials: [], remarks: [], handovers: [], log: []
        };
        o.rd.push(
            { id: uid(), code: '24-2026', mark: 'КЖ0', title: 'Фундаменты', version: '1', receivedAt: day(-140), status: 'production', productionAt: day(-138), changes: [{ n: '1', date: day(-120), note: 'Изменено армирование ростверка Р-3' }], files: [] },
            { id: uid(), code: '24-2026', mark: 'КЖ1', title: 'Монолитный каркас', version: '0', receivedAt: day(-100), status: 'production', productionAt: day(-98), changes: [], files: [] },
            { id: uid(), code: '24-2026', mark: 'АР', title: 'Архитектурные решения', version: '0', receivedAt: day(-90), status: 'received', changes: [], files: [] }
        );
        const add = (work, type, title, extra) => {
            const d = { id: uid(), workId: work.id, type, title, templateTitle: title, number: '', date: '', due: '', responsible: work.responsible, status: 'todo', rdRef: '', files: [], ...extra };
            o.id.push(d);
            return d;
        };
        add(works[0], 'grbo', 'Акт освидетельствования геодезической разбивочной основы', { number: '1', date: day(-145), status: 'signed' });
        add(works[0], 'axes', 'Акт разбивки осей объекта на местности', { number: '2', date: day(-144), status: 'signed' });
        const a1 = add(works[1], 'aosr', 'АОСР: устройство основания (подготовки)', { number: '3', date: day(-130), status: 'signed', rdRef: '24-2026-КЖ0' });
        const a2 = add(works[1], 'aosr', 'АОСР: армирование', { number: '4', date: day(-118), status: 'signed', rdRef: '24-2026-КЖ0' });
        add(works[1], 'aosr', 'АОСР: гидроизоляция', { status: 'review', rdRef: '24-2026-КЖ0', due: day(-3) });
        add(works[1], 'aook', 'Акт освидетельствования ответственных конструкций: фундаменты', { status: 'draft', due: day(4), rdRef: '24-2026-КЖ0' });
        add(works[1], 'tests', 'Протоколы испытаний бетона', { status: 'signed', number: 'Л-15', date: day(-110) });
        add(works[2], 'aosr', 'АОСР: армирование', { status: 'draft', due: day(10), rdRef: '24-2026-КЖ1' });
        add(works[2], 'journal', 'Журнал бетонных работ', { status: 'draft' });
        add({ id: '', responsible: 'Сидоров С.С.' }, 'journal', 'Общий журнал работ', { workId: '', status: 'draft' });
        o.materials.push(
            { id: uid(), name: 'Бетон B25 W8 F150', docType: 'Паспорт качества', number: '1187', date: day(-131), until: '', workId: works[1].id, idRefs: [a1.id], files: [] },
            { id: uid(), name: 'Арматура А500С Ø16', docType: 'Сертификат соответствия', number: 'РОСС RU.12345', date: day(-200), until: day(-5), workId: works[1].id, idRefs: [a2.id], files: [] }
        );
        o.remarks.push(
            { id: uid(), source: 'Строительный контроль заказчика', target: 'id', refId: o.id[4].id, text: 'В АОСР на гидроизоляцию не указан документ о качестве материала', due: day(2), status: 'open', created: day(-4) },
            { id: uid(), source: 'Заказчик', target: 'rd', refId: o.rd[2].id, text: 'Комплект АР не согласован заказчиком для производства работ', due: day(7), status: 'open', created: day(-2) }
        );
        o.handovers.push({ id: uid(), title: 'Комплект ИД № 1 — геодезия и основание фундаментов', items: o.id.slice(0, 3).map(d => d.id), status: 'accepted', created: day(-125), sentAt: day(-124), letterNo: '45', method: 'Нарочно под подпись', acceptedAt: day(-120), acceptRef: 'реестр с отметкой заказчика, вх. № 112', files: [] });
        KS.demo(o, { works, signedIds: [a1.id, a2.id] });
        log(o, 'Создан демонстрационный объект');
        data.objects.unshift(o);
        currentId = o.key;
        tab = 'overview';
        save();
        render();
        notify('Демонстрационный объект создан.');
    }

    // ---- Construction forms (objects-ks.js): КС-2, КС-3, КС-6а, journals, other forms ---------------

    const KS = window.AirchitectObjectsKs({
        h, block, row, rows, small, save, render, log, openDialog, notify, formatDate, today, uid, daysUntil, contracts, storeFiles, fileLinks, normLink, workName,
        ID_STATUS, askPto, el, setTab: key => { tab = key; }
    });

    // ---- Wiring ----------------------------------------------------------------------

    root.querySelector('[data-ob-add]').addEventListener('click', newObject);
    root.querySelector('[data-ob-demo]').addEventListener('click', demo);
    window.addEventListener('storage', e => {
        if (e.key !== STORE_KEY) return;
        try {
            data = JSON.parse(localStorage.getItem(STORE_KEY)) || { objects: [] };
        } catch (err) {
            data = { objects: [] };
        }
        if (!dialog.open) render();
    });

    render();
});
