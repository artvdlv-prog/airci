// Counterparties (counterparties.html): one card per organization with registry checks (server /registry),
// facts from official sources entered by the user, financial analysis, construction requirements,
// corporate links, transparent risk matrix, decision with measures, monitoring of changes,
// documents and export to Word / Excel / PDF. Analysis: counterparty-core.js.

document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('[data-counterparties]');
    if (!root || !window.AirchitectCounterparties) return;
    const C = window.AirchitectCounterparties;
    const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    const DOCX_URL = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';
    const API = typeof HOME_ASSISTANT_API !== 'undefined' && HOME_ASSISTANT_API ? HOME_ASSISTANT_API.replace(/\/chat$/, '') : null;
    const LEVEL_TONE = ['done', 'soon', 'overdue', 'overdue'];

    let store = C.read();
    const save = () => { if (!C.write(store)) notify('Не удалось сохранить данные в браузере.'); };
    const readKey = (key, fallback) => {
        try {
            return JSON.parse(localStorage.getItem(key)) || fallback;
        } catch (e) {
            return fallback;
        }
    };
    const contracts = () => readKey('airchitect-contracts-v1', { contracts: [] }).contracts;
    const objects = () => readKey('airchitect-objects-v1', { objects: [] }).objects;
    const tenders = () => readKey('airchitect-tenders-v1', { tenders: [] }).tenders;
    const formatDate = d => (d ? d.slice(0, 10).split('-').reverse().join('.') : '');
    const formatStamp = ts => new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const inCabinet = document.documentElement.classList.contains('is-cabinet');
    const withCabinet = q => (inCabinet ? `${q}&cabinet=1` : q);
    const params = new URLSearchParams(location.search);

    let currentId = (params.get('id') && !params.get('id').startsWith('inn:') ? params.get('id') : null) || (store.items[0] && store.items[0].id);
    let tab = 'summary';
    const current = () => store.items.find(c => c.id === currentId);
    const log = (c, text) => { c.log = c.log || []; c.log.unshift({ at: Date.now(), text }); };
    const titleOf = c => c.name || (C.lastCheck(c) && C.lastCheck(c).data.egrul && C.lastCheck(c).data.egrul.shortName) || `ИНН ${c.inn}`;

    function h(tag, attrs = {}, ...children) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (v === undefined || v === null || v === false) return;
            if (k === 'class') node.className = v;
            else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
            else node.setAttribute(k, v === true ? '' : v);
        });
        children.flat().forEach(ch => { if (ch !== null && ch !== undefined && ch !== false) node.append(ch instanceof Node ? ch : document.createTextNode(ch)); });
        return node;
    }
    const svgEl = (tag, attrs = {}) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };

    function notify(text) {
        const toast = h('div', { class: 'home-ct__toast', role: 'status' }, text);
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4500);
    }

    const block = (title, tools, ...content) => h('section', { class: 'home-ct__block' },
        h('div', { class: 'home-ct__block-head' }, h('h3', { class: 'home-ct__block-title' }, title), tools ? h('div', { class: 'home-ct__filters' }, tools) : null), ...content);
    const small = (label, fn, primary) => h('button', { type: 'button', class: `home-btn home-btn--${primary ? 'primary' : 'secondary'} home-cab__small`, onclick: fn }, label);
    const table = (columns, body) => h('div', { class: 'home-cab__table-wrap' }, h('table', { class: 'home-cab__table home-es__table' }, h('thead', {}, h('tr', {}, columns.map(x => h('th', {}, x)))), h('tbody', {}, body)));
    const note = text => h('p', { class: 'home-note' }, text);
    const badge = (text, tone) => h('span', { class: `home-ct__badge home-ct__badge--${tone}` }, text);
    const pad = (...content) => h('div', { class: 'home-cf__pad' }, ...content);

    // ---- Files (same browser storage as contracts and objects) ----------------------------------------

    const filesDb = new Promise(resolve => {
        if (!('indexedDB' in window)) return resolve(null);
        const request = indexedDB.open('airchitect-contract-files', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });
    async function storeBlob(blob, name, type) {
        const db = await filesDb;
        const meta = { id: C.uid(), name, type: type || blob.type, size: blob.size };
        if (db) await new Promise((resolve, reject) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put({ ...meta, blob }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }).catch(() => notify(`Файл «${name}» не сохранён: недостаточно места.`));
        return meta;
    }
    async function openFile(meta) {
        const db = await filesDb;
        if (!db) return notify('Хранилище файлов недоступно.');
        const req = db.transaction('files', 'readonly').objectStore('files').get(meta.id);
        req.onsuccess = () => { if (!req.result) return notify('Файл не найден.'); download(req.result.blob, meta.name); };
    }
    function download(blob, name) {
        const link = h('a', { href: URL.createObjectURL(blob), download: name });
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    }

    // ---- Dialog -------------------------------------------------------------------------------------

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
            if (f.type === 'select') input = h('select', { name: f.name }, f.options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(f.value ?? '') }, l)));
            else if (f.type === 'multi') input = h('select', { name: f.name, multiple: true, size: Math.min(6, Math.max(3, f.options.length)) }, f.options.map(([v, l]) => h('option', { value: v, selected: (f.value || []).includes(v) }, l)));
            else if (f.type === 'textarea') { input = h('textarea', { name: f.name, rows: f.rows || 3, required: f.required }); input.value = f.value ?? ''; }
            else if (f.type === 'checkbox') input = h('input', { type: 'checkbox', name: f.name, checked: !!f.value });
            else { input = h('input', { type: f.type || 'text', name: f.name, required: f.required, step: f.type === 'number' ? 'any' : null, multiple: f.type === 'file' ? true : null }); if (f.type !== 'file') input.value = f.value ?? ''; }
            dialogBody.appendChild(h('label', { class: 'home-dialog__field' + (f.type === 'checkbox' ? ' home-cf__check' : '') },
                f.type === 'checkbox' ? [input, h('span', { class: 'home-dialog__label' }, f.label)] : [h('span', { class: 'home-dialog__label' }, f.label + (f.required ? ' *' : '')), input],
                f.hint ? h('span', { class: 'home-dialog__hint' }, f.hint) : null));
        });
        dialogFoot.textContent = '';
        dialogFoot.append(h('button', { type: 'button', class: 'home-btn home-btn--secondary', onclick: () => dialog.close() }, 'Отмена'),
            h('button', { type: 'submit', class: 'home-btn home-btn--primary', onclick: async ev => {
                ev.preventDefault();
                const formEl = dialog.querySelector('form');
                if (!formEl.reportValidity()) return;
                const values = {};
                fields.forEach(f => {
                    const input = formEl.elements.namedItem(f.name);
                    values[f.name] = f.type === 'checkbox' ? input.checked : f.type === 'file' ? [...input.files] : f.type === 'multi' ? [...input.selectedOptions].map(o => o.value) : input.value.trim();
                });
                const error = await onSubmit(values);
                if (error) { dialogError.textContent = error; dialogError.hidden = false; return; }
                dialog.close();
                save();
                render();
            } }, submitLabel));
        dialog.showModal();
    }

    // ---- Registry check (server) ----------------------------------------------------------------------

    async function runCheck(c, silent) {
        if (c.demo) {
            if (!silent) notify('Демо-пример: вымышленная организация, проверка по реестрам не выполняется.');
            return false;
        }
        if (API === null) {
            if (!silent) notify('Сервер проверки по реестрам не подключён. Загрузите выписку ЕГРЮЛ и отчётность в «Документы» и внесите сведения вручную.');
            return false;
        }
        try {
            const res = await fetch(`${API}/registry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inn: c.inn }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
            const prev = C.lastCheck(c);
            const check = { id: C.uid(), at: Date.now(), data };
            const diff = C.changes(prev, check);
            c.checks.unshift(check);
            c.checks = c.checks.slice(0, 10);
            if (data.egrul && !c.name) c.name = data.egrul.shortName || data.egrul.name;
            if (diff.length) c.changes.unshift({ at: Date.now(), items: diff });
            c.monitoring.next = addDays(C.today(), Number(c.monitoring.everyDays) || 30);
            const failed = data.sources.filter(s => s.status === 'error' || s.status === 'captcha');
            log(c, `Проверка по реестрам: ${data.sources.map(s => `${s.title} — ${{ ok: 'получено', empty: 'сведений нет', error: 'недоступен', captcha: 'требует ручной проверки' }[s.status]}`).join('; ')}${diff.length ? `; изменений: ${diff.length}` : ''}`);
            save();
            if (!silent) notify(failed.length ? `Проверка выполнена частично: ${failed.map(s => s.title).join(', ')} — недоступно.` : 'Проверка по реестрам выполнена.');
            return true;
        } catch (err) {
            if (!silent) notify(`Не удалось выполнить проверку: ${err.message}`);
            return false;
        }
    }
    const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);

    async function egrulExtract(c) {
        const ch = C.lastCheck(c);
        const token = ch && ch.data.egrul && ch.data.egrul.token;
        if (API === null || !token) return notify('Сначала выполните проверку по реестрам.');
        try {
            const res = await fetch(`${API}/egrul-pdf`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Ошибка ${res.status}`);
            const blob = await res.blob();
            const meta = await storeBlob(blob, `Выписка ЕГРЮЛ ${c.inn} от ${C.today()}.pdf`, 'application/pdf');
            c.files.unshift({ ...meta, kind: 'Выписка ЕГРЮЛ/ЕГРИП (ФНС)', source: 'https://egrul.nalog.ru/', date: C.today() });
            log(c, 'Получена выписка ЕГРЮЛ/ЕГРИП (ФНС)');
            save();
            render();
            notify('Выписка ФНС сохранена в «Документы».');
        } catch (err) {
            notify(`Выписка не получена: ${err.message}`);
        }
    }

    // ---- List and card ------------------------------------------------------------------------------

    const el = {
        list: root.querySelector('[data-cp-list]'), empty: root.querySelector('[data-cp-empty]'), card: root.querySelector('[data-cp-card]'),
        title: root.querySelector('[data-cp-title]'), meta: root.querySelector('[data-cp-meta]'), tabs: root.querySelector('[data-cp-tabs]'), panel: root.querySelector('[data-cp-panel]')
    };
    const TABS = [['summary', 'Сводка'], ['registry', 'Реестры'], ['finance', 'Финансы'], ['courts', 'Суды и долги'], ['construction', 'Строительство'], ['links', 'Связи'], ['docs', 'Документы'], ['monitoring', 'Мониторинг'], ['history', 'История']];

    function render() {
        renderList();
        const c = current();
        el.empty.hidden = !!c;
        el.card.hidden = !c;
        if (!c) return;
        const a = C.assess(c, store);
        el.title.textContent = titleOf(c);
        el.meta.textContent = [`ИНН ${c.inn}`, c.roles.map(r => C.ROLES[r]).join(', '), C.lastCheck(c) ? `проверено ${formatStamp(C.lastCheck(c).at)}` : 'не проверялся по реестрам', C.DECISIONS[a.decision]].filter(Boolean).join(' · ');
        document.title = `${el.title.textContent} — Контрагенты | AIRCHITECT`;
        el.tabs.textContent = '';
        TABS.forEach(([key, label]) => el.tabs.appendChild(h('button', { type: 'button', role: 'tab', class: 'home-tab', 'aria-selected': String(key === tab), onclick: () => { tab = key; render(); } }, label)));
        el.panel.textContent = '';
        if (c.demo) el.panel.appendChild(h('div', { class: 'home-ct__alert' }, 'Демо-пример: вымышленная организация и вымышленные сведения для знакомства с разделом. Это не результат проверки по реестрам.'));
        ({ summary: renderSummary, registry: renderRegistry, finance: renderFinance, courts: renderCourts, construction: renderConstruction, links: renderLinks, docs: renderDocs, monitoring: renderMonitoring, history: renderHistory })[tab](c, a);
    }

    function renderList() {
        el.list.textContent = '';
        store.items.forEach(c => {
            const a = C.assess(c, store);
            el.list.appendChild(h('li', {}, h('a', {
                href: withCabinet(`counterparties.html?id=${c.id}`), class: 'home-staff__item' + (c.id === currentId ? ' is-active' : ''),
                onclick: ev => { ev.preventDefault(); currentId = c.id; tab = 'summary'; window.history.replaceState(null, '', withCabinet(`?id=${c.id}`)); render(); }
            }, h('span', { class: 'home-staff__item-title' }, titleOf(c), C.due(c) ? h('span', { class: 'home-ct__dot', title: 'Пора повторить проверку' }) : null),
            h('span', { class: 'home-staff__item-text' }, `ИНН ${c.inn} · ${a.overall === null ? 'нет данных' : C.LEVELS[a.overall].toLowerCase() + ' риск'}`))));
        });
    }

    // ---- Summary: decision, matrix, measures, sources -------------------------------------------------

    function renderSummary(c, a) {
        const tone = { recommended: 'done', conditional: 'soon', more_check: 'review', not_recommended: 'overdue' }[a.decision];
        el.panel.appendChild(h('div', { class: 'home-cp__decision home-cp__decision--' + tone }, h('p', { class: 'home-cp__decision-title' }, C.DECISIONS[a.decision]),
            h('p', { class: 'home-cp__decision-text' }, decisionText(a))));
        el.panel.appendChild(h('div', { class: 'home-ct__actions' },
            small('Проверить по реестрам', async () => { if (await runCheck(c)) render(); }, true), small('Предполагаемый договор', () => editDeal(c)),
            small('Специалист по безопасности', () => askSecurity(c, a)), small('Юрист', () => askExpert(c, a, 'construction-lawyer')), small('Финансист', () => askExpert(c, a, 'financier'))));
        el.panel.appendChild(block('Матрица рисков', [small('Excel', () => exportMatrix([c]))], table(['Категория', 'Оценка', 'Факторы', 'Источник'], Object.entries(C.CATEGORIES).map(([k, title]) => {
            const p = a.perCat[k];
            return h('tr', {}, h('td', {}, title), h('td', {}, p.level === null ? badge('Нет данных', 'review') : badge(C.LEVELS[p.level], LEVEL_TONE[p.level]), p.nodata && p.level !== null ? h('span', { class: 'home-ks__sub' }, 'часть сведений отсутствует') : null),
                h('td', {}, p.factors.length ? p.factors.map(f => h('span', { class: 'home-cp__factor' }, `${f.level ? '▲ ' : ''}${f.text}`)) : p.nodata || '—'),
                h('td', {}, [...new Set(p.factors.map(f => f.source))].join('; ')));
        }))));
        if (a.measures.length) el.panel.appendChild(block('Меры снижения рисков', null, h('ul', { class: 'home-cf__advice' }, a.measures.map(m => h('li', {}, m)))));
        const nd = Object.values(a.nodata).filter(Boolean);
        if (nd.length) el.panel.appendChild(block('Недостаточно данных', null, h('ul', { class: 'home-cf__advice' }, nd.map(t => h('li', {}, t)))));
        el.panel.appendChild(note('Оценка формируется по прозрачным правилам из сведений с указанными источниками. Наличие судебного дела не означает доказанного нарушения; косвенные признаки связи не являются доказательством аффилированности. Недостаточность данных показывается отдельно и не считается низким риском.'));
    }

    function decisionText(a) {
        const high = a.factors.filter(f => f.level >= 2);
        if (a.decision === 'not_recommended') return `Выявлены существенные подтверждённые риски: ${a.factors.filter(f => f.level === 3).map(f => f.text).join(' ')}`;
        if (a.decision === 'more_check') return `Для обоснованного решения недостаточно сведений: ${Object.values(a.nodata).filter(Boolean).join(' ')}`;
        if (a.decision === 'conditional') return `Сотрудничество возможно при мерах защиты: ${(high.length ? high : a.factors.filter(f => f.level === 1)).map(f => f.text).join(' ')}`;
        return 'Существенные риски не выявлены в пределах доступных сведений.';
    }

    function editDeal(c) {
        const d = c.deal || {};
        openDialog('Предполагаемый договор', [
            { name: 'amount', label: 'Сумма договора, ₽', type: 'number', value: d.amount },
            { name: 'advancePct', label: 'Аванс, %', type: 'number', value: d.advancePct },
            { name: 'workType', label: 'Вид работ', value: d.workType },
            { name: 'needSro', label: 'Работы требуют членства в СРО строителей (ст. 55.8 ГрК РФ)', type: 'checkbox', value: d.needSro },
            { name: 'needExperience', label: 'Требуется подтверждённый опыт аналогичных работ', type: 'checkbox', value: d.needExperience },
            { name: 'roles', label: 'Роль контрагента', type: 'multi', value: c.roles, options: Object.entries(C.ROLES) },
            { name: 'contractIds', label: 'Договоры', type: 'multi', value: c.contractIds, options: contracts().map(x => [x.id, `№ ${x.number || 'без номера'} ${x.subject || ''}`]) },
            { name: 'objectKeys', label: 'Объекты', type: 'multi', value: c.objectKeys, options: objects().map(o => [o.key, o.name]) },
            { name: 'tenderIds', label: 'Закупки', type: 'multi', value: c.tenderIds, options: tenders().map(t => [t.id, t.title || t.number]) }
        ], 'Сохранить', v => {
            c.deal = { amount: v.amount, advancePct: v.advancePct, workType: v.workType, needSro: v.needSro, needExperience: v.needExperience };
            Object.assign(c, { roles: v.roles, contractIds: v.contractIds, objectKeys: v.objectKeys, tenderIds: v.tenderIds });
            log(c, 'Изменены условия предполагаемого договора');
        });
    }

    // ---- Registry data --------------------------------------------------------------------------------

    function renderRegistry(c) {
        const ch = C.lastCheck(c);
        el.panel.appendChild(h('div', { class: 'home-ct__actions' }, small('Проверить по реестрам', async () => { if (await runCheck(c)) render(); }, true), ch && ch.data.egrul ? small('Выписка ЕГРЮЛ (PDF ФНС)', () => egrulExtract(c)) : null));
        if (API === null) el.panel.appendChild(h('div', { class: 'home-ct__alert' }, 'Сервер проверки не подключён: автоматический запрос к реестрам ФНС и НОСТРОЙ недоступен. Загрузите официальную выписку в «Документы» и внесите сведения по ссылкам ниже.'));
        if (ch) {
            const d = ch.data;
            el.panel.appendChild(block(`Источники проверки от ${formatStamp(ch.at)}`, null, table(['Источник', 'Результат', 'Получено'], d.sources.map(s => h('tr', {}, h('td', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener', class: 'home-ob__norm' }, s.title)),
                h('td', {}, { ok: badge('Получено', 'done'), empty: badge('Сведений нет', 'review'), error: badge('Недоступен', 'overdue'), captcha: badge('Требует ручной проверки', 'soon') }[s.status], s.message ? h('span', { class: 'home-ks__sub' }, s.message) : null), h('td', {}, formatStamp(new Date(s.fetchedAt).getTime())))))));
            if (d.egrul) el.panel.appendChild(block('ЕГРЮЛ / ЕГРИП', null, table(['Сведение', 'Значение'], [
                ['Полное наименование', d.egrul.name], ['ИНН / КПП', `${d.egrul.inn}${d.egrul.kpp ? ' / ' + d.egrul.kpp : ''}`], ['ОГРН', d.egrul.ogrn], ['Дата регистрации', d.egrul.registered],
                ['Руководитель', d.egrul.head], ['Регион', d.egrul.region], d.egrul.liquidated ? ['Прекращение деятельности', d.egrul.liquidated] : null,
                d.pb ? ['Статус («Прозрачный бизнес»)', d.pb.status] : null, d.pb ? ['Недостоверность сведений', d.pb.unreliable ? 'есть отметка' : 'отметок нет'] : null,
                d.pb ? ['Основной вид деятельности', `${d.pb.okved} ${d.pb.okvedName}`] : null
            ].filter(Boolean).map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v || '—')))), h('p', { class: 'home-tn__group-note home-cf__chart-note' }, d.demo ? 'Демонстрационные данные вымышленной организации — не сведения ФНС.' : `Источник: ФНС России, ${formatDate(d.fetchedAt)}. Учредители и история изменений — в официальной выписке.`)));
        }
        el.panel.appendChild(block('Ручная проверка по официальным источникам', null, h('ul', { class: 'home-ct__list' }, (ch ? ch.data.links : linksFor(c.inn)).map(l => h('li', { class: 'home-ct__row' },
            h('div', { class: 'home-ct__row-main' }, h('p', { class: 'home-ct__row-title' }, h('a', { href: l.url, target: '_blank', rel: 'noopener', class: 'home-ob__norm' }, l.title)), h('p', { class: 'home-ct__row-meta' }, l.note)))))));
        el.panel.appendChild(note('Эти сервисы не предоставляют открытого API или защищены от автоматических запросов: AIRCHITECT не обходит такую защиту. Результат проверки внесите во вкладке «Суды и долги» со ссылкой на источник.'));
    }

    // Same links as the server when no check was made yet
    function linksFor(inn) {
        const q = encodeURIComponent(inn);
        return [
            { title: 'ЕГРЮЛ / ЕГРИП (ФНС)', url: 'https://egrul.nalog.ru/', note: 'Выписка по ИНН.' },
            { title: '«Прозрачный бизнес» ФНС', url: 'https://pb.nalog.ru/', note: 'Статус, недостоверность, задолженность, массовый адрес.' },
            { title: 'ГИР БО (ФНС)', url: `https://bo.nalog.gov.ru/search?query=${q}`, note: 'Бухгалтерская отчётность.' },
            { title: 'Реестр членов СРО (НОСТРОЙ)', url: 'https://reestr.nostroy.ru/', note: 'Членство, уровни ответственности.' },
            { title: 'Картотека арбитражных дел', url: 'https://kad.arbitr.ru/', note: 'Поиск по ИНН или наименованию.' },
            { title: 'Банк данных исполнительных производств ФССП', url: 'https://fssp.gov.ru/iss/ip', note: 'Поиск юридического лица.' },
            { title: 'ЕФРСБ (Федресурс)', url: `https://bankrot.fedresurs.ru/bankrupts?searchString=${q}`, note: 'Банкротство.' },
            { title: 'Реестр недобросовестных поставщиков (ЕИС)', url: `https://zakupki.gov.ru/epz/dishonestsupplier/search/results.html?searchString=${q}`, note: '44-ФЗ и 223-ФЗ.' }
        ];
    }

    // ---- Finance --------------------------------------------------------------------------------------

    const LINE_NAMES = [['2110', 'Выручка'], ['2200', 'Прибыль от продаж'], ['2400', 'Чистая прибыль'], ['1600', 'Активы'], ['1300', 'Собственный капитал'], ['1200', 'Оборотные активы'], ['1250', 'Денежные средства'], ['1400', 'Долгосрочные обязательства'], ['1500', 'Краткосрочные обязательства']];

    function renderFinance(c, a) {
        const years = a.years;
        el.panel.appendChild(h('div', { class: 'home-ct__actions' }, small('Внести отчётность вручную', () => editFinance(c), true), years.length ? small('Заключение — Word', () => exportDocx(c, 'finance')) : null));
        if (!years.length) { el.panel.appendChild(h('p', { class: 'home-staff__empty' }, 'Отчётности нет. Выполните проверку по реестрам (ГИР БО ФНС) или внесите показатели из отчётности вручную с указанием источника.')); return; }
        const rows = LINE_NAMES.map(([k, l]) => h('tr', {}, h('td', {}, `${l} (стр. ${k})`), ...years.map(y => h('td', { class: 'home-es__num' }, y.lines[k] === undefined ? '—' : Number(y.lines[k]).toLocaleString('ru-RU')))));
        const rs = years.map(y => C.ratios(y.lines));
        const ratioRow = (label, key, fmt) => h('tr', {}, h('td', {}, label), ...rs.map(r => h('td', { class: 'home-es__num' }, r[key] === null ? '—' : fmt(r[key]))));
        el.panel.appendChild(block('Показатели отчётности, тыс. ₽', null, table(['Показатель', ...years.map(y => `${y.year}`)], [...rows,
            ratioRow('Текущая ликвидность', 'currentRatio', v => v.toFixed(2)), ratioRow('Быстрая ликвидность', 'quickRatio', v => v.toFixed(2)), ratioRow('Абсолютная ликвидность', 'cashRatio', v => v.toFixed(2)),
            ratioRow('Автономия (капитал / активы)', 'autonomy', v => v.toFixed(2)), ratioRow('Обязательства / активы', 'debtToAssets', v => v.toFixed(2)), ratioRow('Рентабельность по чистой прибыли', 'margin', v => `${(v * 100).toFixed(1)}%`)]),
            h('p', { class: 'home-tn__group-note home-cf__chart-note' }, `Источники: ${[...new Set(years.map(y => `${y.source}${y.manual ? ' (внесено пользователем)' : ''}`))].join('; ')}.`)));
        const amount = Number((c.deal || {}).amount) || 0;
        const r = a.ratios;
        if (amount && r && r.revenue) el.panel.appendChild(block('Сопоставление с предполагаемым договором', null, pad(h('p', { class: 'home-ct__row-meta' },
            `Договор ${C.fmtR(amount)} — ${(amount / (r.revenue * 1000) * 100).toFixed(0)}% годовой выручки ${C.fmtR(r.revenue * 1000)}; собственный капитал ${r.equity === null ? '—' : C.fmtR(r.equity * 1000)}. Превышение договора над выручкой говорит о недостаточности подтверждённых ресурсов, но не о недобросовестности.`))));
    }

    function editFinance(c) {
        openDialog('Отчётность (вручную)', [
            { name: 'year', label: 'Год', type: 'number', value: new Date().getFullYear() - 1, required: true },
            ...LINE_NAMES.map(([k, l]) => ({ name: 'l' + k, label: `${l}, стр. ${k}, тыс. ₽`, type: 'number' })),
            { name: 'source', label: 'Источник', required: true, hint: 'Например: бухгалтерская отчётность, предоставленная контрагентом, с отметкой ФНС' }
        ], 'Сохранить', v => {
            const lines = {};
            LINE_NAMES.forEach(([k]) => { if (v['l' + k] !== '') lines[k] = Number(v['l' + k]); });
            if (!Object.keys(lines).length) return 'Укажите хотя бы один показатель.';
            c.finance = (c.finance || []).filter(y => y.year !== Number(v.year));
            c.finance.push({ year: Number(v.year), lines, source: v.source, date: C.today() });
            log(c, `Внесена отчётность за ${v.year} г. (${v.source})`);
        });
    }

    // ---- Facts: courts, enforcement, bankruptcy, РНП, reputation -----------------------------------------

    function renderCourts(c) {
        el.panel.appendChild(h('div', { class: 'home-ct__actions' }, small('Арбитражное дело', () => editFact(c, 'court'), true), small('Исполнительное производство', () => editFact(c, 'enforcement')),
            small('Банкротство', () => editFact(c, 'bankruptcy')), small('РНП', () => editFact(c, 'rnp')), small('Репутация', () => editFact(c, 'reputation')), small('Проверено: сведений нет', () => markChecked(c))));
        const group = (kinds, title) => {
            const list = c.facts.filter(f => kinds.includes(f.kind));
            el.panel.appendChild(block(title, null, h('ul', { class: 'home-ct__list' }, list.length ? list.map(f => factRow(c, f)) : h('li', { class: 'home-ct__none' }, 'Сведений не внесено.'))));
        };
        group(['court'], 'Арбитражные дела');
        group(['enforcement', 'bankruptcy', 'rnp'], 'Исполнительные производства, банкротство, РНП');
        group(['reputation'], 'Деловая репутация');
        group(['checked'], 'Проверки без выявленных сведений');
        el.panel.appendChild(note('Указывайте, что установлено: заявленные требования (иск подан), установленные судом обстоятельства (решение вступило в силу) или предположение. Для каждого сведения — источник, ссылка и дата.'));
    }

    function factRow(c, f) {
        const meta = [];
        if (f.kind === 'court') meta.push(`${f.role === 'defendant' ? 'ответчик' : f.role === 'plaintiff' ? 'истец' : 'третье лицо'} · ${C.COURT_TYPES[f.claimType] || ''} · ${C.COURT_STATUS[f.status] || ''}${f.amount ? ' · ' + C.fmtR(Number(f.amount)) : ''}${f.caseNo ? ' · дело ' + f.caseNo : ''}`);
        if (f.kind === 'enforcement') meta.push(`${f.status === 'ended' ? 'окончено' : 'действует'}${f.amount ? ' · ' + C.fmtR(Number(f.amount)) : ''}`);
        if (f.kind === 'reputation') meta.push(f.confirmed ? 'подтверждено' : 'не подтверждено — в оценке не учитывается');
        if (f.kind === 'checked') meta.push(`Область: ${{ court: 'арбитражные дела', enforcement: 'ФССП', bankruptcy: 'ЕФРСБ', rnp: 'РНП', reputation: 'репутация' }[f.area]}`);
        meta.push(`Источник: ${f.source || '—'}${f.date ? ', ' + formatDate(f.date) : ''}`);
        return h('li', { class: 'home-ct__row' }, h('div', { class: 'home-ct__row-main' }, h('p', { class: 'home-ct__row-title' }, badge(C.FACT_KINDS[f.kind], f.kind === 'checked' ? 'done' : 'review'), f.text || ''),
            ...meta.map(m => h('p', { class: 'home-ct__row-meta' }, m)), f.url ? h('a', { href: f.url, target: '_blank', rel: 'noopener', class: 'home-ob__norm' }, f.url) : null),
            h('div', { class: 'home-record__actions' }, h('button', { type: 'button', onclick: () => editFact(c, f.kind, f) }, 'Изменить'), h('button', { type: 'button', onclick: () => { c.facts = c.facts.filter(x => x !== f); log(c, `Удалено сведение: ${C.FACT_KINDS[f.kind]}`); save(); render(); } }, 'Удалить')));
    }

    const SOURCE = [{ name: 'source', label: 'Источник', required: true, hint: 'Например: Картотека арбитражных дел' }, { name: 'url', label: 'Ссылка на подтверждающий документ' }, { name: 'date', label: 'Дата получения сведений', type: 'date', required: true }];

    function editFact(c, kind, f) {
        const v0 = f || {};
        const specific = {
            court: [{ name: 'caseNo', label: 'Номер дела', value: v0.caseNo }, { name: 'role', label: 'Роль контрагента', type: 'select', value: v0.role || 'defendant', options: [['defendant', 'Ответчик'], ['plaintiff', 'Истец'], ['third', 'Третье лицо']] },
                { name: 'claimType', label: 'Категория спора', type: 'select', value: v0.claimType || 'payment', options: Object.entries(C.COURT_TYPES) }, { name: 'amount', label: 'Сумма требований, ₽', type: 'number', value: v0.amount },
                { name: 'status', label: 'Результат', type: 'select', value: v0.status || 'pending', options: Object.entries(C.COURT_STATUS) }, { name: 'text', label: 'Суть спора', type: 'textarea', rows: 2, value: v0.text }],
            enforcement: [{ name: 'text', label: 'Характер требований', value: v0.text, required: true }, { name: 'amount', label: 'Сумма задолженности, ₽', type: 'number', value: v0.amount }, { name: 'status', label: 'Статус', type: 'select', value: v0.status || 'active', options: [['active', 'Действует'], ['ended', 'Окончено']] }],
            bankruptcy: [{ name: 'text', label: 'Сообщение', value: v0.text, required: true }, { name: 'stage', label: 'Вид', type: 'select', value: v0.stage || 'intent', options: [['intent', 'Намерение обратиться с заявлением о банкротстве'], ['procedure', 'Введена процедура банкротства']] }],
            rnp: [{ name: 'text', label: 'Основание включения', value: v0.text, required: true }, { name: 'law', label: 'Закон', type: 'select', value: v0.law || '44-ФЗ', options: [['44-ФЗ', '44-ФЗ'], ['223-ФЗ', '223-ФЗ']] }, { name: 'status', label: 'Статус', type: 'select', value: v0.status || 'active', options: [['active', 'Включён'], ['excluded', 'Исключён из реестра']] }],
            reputation: [{ name: 'text', label: 'Обстоятельство', type: 'textarea', rows: 2, value: v0.text, required: true }, { name: 'confirmed', label: 'Подтверждено документами или официальными источниками', type: 'checkbox', value: v0.confirmed }, { name: 'severity', label: 'Значимость', type: 'select', value: v0.severity || '1', options: [['1', 'Умеренная'], ['2', 'Высокая']] }],
            license: [{ name: 'text', label: 'Лицензия / разрешение', value: v0.text, required: true }, { name: 'number', label: 'Номер', value: v0.number }, { name: 'until', label: 'Действует до', type: 'date', value: v0.until }],
            experience: [{ name: 'text', label: 'Договор / объект', value: v0.text, required: true }, { name: 'amount', label: 'Сумма, ₽', type: 'number', value: v0.amount }],
            relation: [{ name: 'withInn', label: 'ИНН связанной организации', value: v0.withInn, required: true }, { name: 'withName', label: 'Наименование', value: v0.withName }, { name: 'text', label: 'Вид связи', value: v0.text, required: true, hint: 'Общий учредитель, руководитель, адрес' },
                { name: 'confirmed', label: 'Связь подтверждена сведениями ЕГРЮЛ или документами', type: 'checkbox', value: v0.confirmed }, { name: 'conflict', label: 'Конфликт интересов', type: 'checkbox', value: v0.conflict }]
        }[kind];
        openDialog(`${C.FACT_KINDS[kind]}${f ? '' : ': новое сведение'}`, [...specific, ...SOURCE.map(s => ({ ...s, value: v0[s.name] || (s.name === 'date' ? C.today() : '') }))], 'Сохранить', v => {
            if (kind === 'relation' && !C.validInn(v.withInn)) return 'Некорректный ИНН связанной организации.';
            const fields = { kind, ...v };
            if (f) Object.assign(f, fields); else c.facts.push({ id: C.uid(), addedAt: Date.now(), ...fields });
            log(c, `${f ? 'Изменено' : 'Внесено'} сведение: ${C.FACT_KINDS[kind]} (${v.source})`);
        });
    }

    function markChecked(c) {
        openDialog('Проверено: сведений нет', [{ name: 'area', label: 'Что проверено', type: 'select', options: [['court', 'Картотека арбитражных дел'], ['enforcement', 'ФССП'], ['bankruptcy', 'ЕФРСБ'], ['rnp', 'Реестр недобросовестных поставщиков'], ['reputation', 'Деловая репутация']] }, ...SOURCE.map(s => ({ ...s, value: s.name === 'date' ? C.today() : '' }))], 'Сохранить', v => {
            c.facts = c.facts.filter(x => !(x.kind === 'checked' && x.area === v.area));
            c.facts.push({ id: C.uid(), kind: 'checked', addedAt: Date.now(), text: 'Сведений не выявлено', ...v });
            log(c, `Проверено без выявленных сведений: ${v.source}`);
        });
    }

    // ---- Construction ---------------------------------------------------------------------------------

    function renderConstruction(c, a) {
        const ch = C.lastCheck(c);
        const sro = (ch && ch.data.sro) || [];
        el.panel.appendChild(h('div', { class: 'home-ct__actions' }, small('Требования договора', () => editDeal(c), true), small('Лицензия', () => editFact(c, 'license')), small('Опыт', () => editFact(c, 'experience')), small('Заключение — Word', () => exportDocx(c, 'construction'))));
        el.panel.appendChild(block('Членство в СРО (НОСТРОЙ)', null, sro.length ? table(['СРО', 'Статус', 'Право', 'Уровень ОДО', 'Уровень ВВ', 'Совокупные обязательства'], sro.map(s => h('tr', {},
            h('td', {}, s.sro || '—', h('span', { class: 'home-ks__sub' }, `${s.sroNumber} · в реестре с ${s.since}`)), h('td', {}, s.status), h('td', {}, s.right || '—'),
            h('td', {}, s.levelOdo || '—', s.levelOdoCost ? h('span', { class: 'home-ks__sub' }, s.levelOdoCost) : null), h('td', {}, s.levelVv || '—', s.levelVvCost ? h('span', { class: 'home-ks__sub' }, s.levelVvCost) : null),
            h('td', {}, s.totalLiability ? `${C.fmtR(Number(s.totalLiability))}${s.liabilityDate ? ' на ' + s.liabilityDate : ''}` : '—'))))
            : pad(h('p', { class: 'home-ct__row-meta' }, ch ? 'В реестре НОСТРОЙ сведений о членстве нет (проверьте и реестры НОПРИЗ при проектных и изыскательских работах).' : 'Выполните проверку по реестрам.'))));
        const p = a.perCat.construction;
        el.panel.appendChild(block('Соответствие требованиям договора', null, h('ul', { class: 'home-ct__list' }, p.factors.map(f => h('li', { class: 'home-ct__row' }, h('div', { class: 'home-ct__row-main' }, h('p', { class: 'home-ct__row-title' }, badge(C.LEVELS[f.level], LEVEL_TONE[f.level]), f.text), f.measure ? h('p', { class: 'home-ct__row-meta' }, `Мера: ${f.measure}`) : null))))));
        const lic = c.facts.filter(f => ['license', 'experience'].includes(f.kind));
        el.panel.appendChild(block('Лицензии и опыт', null, h('ul', { class: 'home-ct__list' }, lic.length ? lic.map(f => factRow(c, f)) : h('li', { class: 'home-ct__none' }, 'Не внесены.'))));
        el.panel.appendChild(note('Необходимость членства в СРО определяется видом работ и ценой договора (ст. 55.8 ГрК РФ, исключения — ч. 2.1–2.2), лицензии — видом деятельности. Отметьте требования в «Требования договора».'));
    }

    // ---- Corporate links (scheme) ------------------------------------------------------------------------

    function renderLinks(c) {
        const rel = C.relations(store, c);
        el.panel.appendChild(h('div', { class: 'home-ct__actions' }, small('Добавить связь', () => editFact(c, 'relation'), true)));
        const box = h('div', { class: 'home-cp__graph' });
        el.panel.appendChild(block('Схема связей', [legendItem('Подтверждённая связь', 'solid'), legendItem('Косвенный признак', 'dash')], box));
        drawGraph(box, c, rel);
        el.panel.appendChild(block('Связи', null, h('ul', { class: 'home-ct__list' }, rel.length ? rel.map(x => h('li', { class: 'home-ct__row' }, h('div', { class: 'home-ct__row-main' },
            h('p', { class: 'home-ct__row-title' }, badge(x.confirmed ? 'Подтверждено' : 'Косвенный признак', x.confirmed ? (x.conflict ? 'overdue' : 'done') : 'review'), `${x.with.name || x.with.inn} — ${x.type}`),
            h('p', { class: 'home-ct__row-meta' }, `Источник: ${x.source || '—'}${x.conflict ? ' · конфликт интересов' : ''}`)), x.fact ? h('div', { class: 'home-record__actions' }, h('button', { type: 'button', onclick: () => editFact(c, 'relation', x.fact) }, 'Изменить')) : null)) : h('li', { class: 'home-ct__none' }, 'Связей не выявлено.'))));
        el.panel.appendChild(note('Косвенные признаки (совпадение ФИО руководителя по ЕГРЮЛ) показывают направление проверки, но не доказывают аффилированность. Подтверждённые связи вносятся по сведениям ЕГРЮЛ об учредителях и руководителях или по документам.'));
    }
    const legendItem = (label, kind) => h('span', { class: 'home-cp__legend' }, h('i', { class: 'home-cp__line home-cp__line--' + kind }), label);

    function drawGraph(box, c, rel) {
        const w = Math.max(300, box.clientWidth || el.panel.clientWidth || 600);
        const H = rel.length ? 300 : 140;
        const s = svgEl('svg', { width: w, height: H, viewBox: `0 0 ${w} ${H}`, role: 'img', 'aria-label': 'Схема связей' });
        const cx = w / 2;
        const cy = H / 2;
        const R = Math.min(w / 2 - 90, H / 2 - 40);
        rel.forEach((x, i) => {
            const ang = (i / rel.length) * Math.PI * 2 - Math.PI / 2;
            const nx = cx + R * Math.cos(ang);
            const ny = cy + R * Math.sin(ang);
            s.appendChild(svgEl('line', { x1: cx, y1: cy, x2: nx, y2: ny, class: 'home-cp__edge' + (x.confirmed ? '' : ' is-indirect') + (x.conflict ? ' is-conflict' : '') }));
            s.appendChild(svgEl('circle', { cx: nx, cy: ny, r: 7, class: 'home-cp__node' }));
            const t = svgEl('text', { x: nx, y: ny + 22, 'text-anchor': 'middle', class: 'home-cp__label' });
            t.textContent = String(x.with.name || x.with.inn).slice(0, 28);
            s.appendChild(t);
        });
        s.appendChild(svgEl('circle', { cx, cy, r: 10, class: 'home-cp__node is-main' }));
        const t = svgEl('text', { x: cx, y: cy + 26, 'text-anchor': 'middle', class: 'home-cp__label is-main' });
        t.textContent = titleOf(c).slice(0, 32);
        s.appendChild(t);
        box.appendChild(s);
    }

    // ---- Documents, monitoring, history -------------------------------------------------------------

    function renderDocs(c) {
        const input = h('input', { type: 'file', multiple: true, hidden: true, onchange: async ev => {
            for (const f of ev.target.files) { const meta = await storeBlob(f, f.name, f.type); c.files.unshift({ ...meta, kind: 'Загружен пользователем', date: C.today() }); }
            log(c, `Загружены документы: ${[...ev.target.files].map(f => f.name).join(', ')}`);
            save();
            render();
        } });
        el.panel.appendChild(h('div', { class: 'home-ct__actions' }, small('Загрузить документ', () => input.click(), true), input, C.lastCheck(c) && C.lastCheck(c).data.egrul ? small('Выписка ЕГРЮЛ (PDF ФНС)', () => egrulExtract(c)) : null));
        el.panel.appendChild(block('Документы контрагента', null, h('ul', { class: 'home-ct__list' }, c.files.length ? c.files.map(f => h('li', { class: 'home-ct__row' }, h('div', { class: 'home-ct__row-main' },
            h('p', { class: 'home-ct__row-title' }, h('button', { type: 'button', class: 'home-cab__reset-link home-cf__inline', onclick: () => openFile(f) }, f.name)), h('p', { class: 'home-ct__row-meta' }, `${f.kind}${f.source ? ' · ' + f.source : ''} · ${formatDate(f.date)}`)))) : h('li', { class: 'home-ct__none' }, 'Документов нет. Загрузите карточку контрагента, выписку, отчётность, выписки из картотеки дел.'))));
        const docs = [['Комплексная справка о контрагенте', 'full'], ['Заключение о финансовой устойчивости', 'finance'], ['Справка о судебных и исполнительных рисках', 'courts'], ['Заключение о соответствии требованиям строительного контракта', 'construction'],
            ['Схема корпоративных связей', 'links'], ['Рекомендации по обеспечению обязательств', 'measures'], ['Заключение о целесообразности сотрудничества', 'decision'], ['Отчёт об изменениях по результатам мониторинга', 'changes']];
        el.panel.appendChild(block('Аналитические документы', [small('Матрица рисков — Excel', () => exportMatrix([c])), small('Справка — PDF', () => printReport(c))], h('ul', { class: 'home-ct__list' }, docs.map(([title, kind]) => h('li', { class: 'home-ct__row' },
            h('div', { class: 'home-ct__row-main' }, h('p', { class: 'home-ct__row-title' }, title)), h('div', { class: 'home-record__actions' }, h('button', { type: 'button', onclick: () => exportDocx(c, kind) }, 'Word')))))));
    }

    function renderMonitoring(c) {
        const m = c.monitoring;
        el.panel.appendChild(h('div', { class: 'home-ct__alert' + (C.due(c) ? ' home-ct__alert--overdue' : '') }, C.due(c) ? `Пора повторить проверку (срок ${formatDate(m.next)}).` : m.next ? `Следующая проверка — ${formatDate(m.next)}.` : 'Повторная проверка не запланирована.'));
        el.panel.appendChild(h('div', { class: 'home-ct__actions' }, small('Повторить проверку', async () => { if (await runCheck(c)) { tab = 'monitoring'; render(); } }, true),
            small('Периодичность', () => openDialog('Повторные проверки', [{ name: 'every', label: 'Повторять каждые, дней', type: 'number', value: m.everyDays, required: true }], 'Сохранить', v => { m.everyDays = Number(v.every) || 30; m.next = addDays(C.today(), m.everyDays); })),
            small('Отчёт — Word', () => exportDocx(c, 'changes'))));
        el.panel.appendChild(block('Подтверждённые изменения', null, h('ul', { class: 'home-ct__list' }, c.changes.length ? c.changes.flatMap(x => x.items.map(i => h('li', { class: 'home-ct__row' }, h('div', { class: 'home-ct__row-main' },
            h('p', { class: 'home-ct__row-title' }, i.text), h('p', { class: 'home-ct__row-meta' }, `Выявлено ${formatStamp(x.at)} · источник: ${i.source}`))))) : h('li', { class: 'home-ct__none' }, 'Изменений по повторным проверкам не выявлено.'))));
        el.panel.appendChild(note('Повторная проверка выполняется по кнопке или при открытии раздела, когда наступил срок: AIRCHITECT сравнивает новые сведения реестров с предыдущими и сообщает только об изменениях с указанием источника. Фонового непрерывного мониторинга нет.'));
    }

    function renderHistory(c) {
        el.panel.appendChild(block('История проверок и действий', null, h('ul', { class: 'home-ct__history' }, (c.log || []).map(l => h('li', {}, h('span', { class: 'home-ct__history-date' }, formatStamp(l.at)), h('span', {}, l.text))))));
    }

    // ---- Comparison of several counterparties ----------------------------------------------------------

    function renderCompare() {
        el.empty.hidden = true;
        el.card.hidden = false;
        el.title.textContent = 'Сравнение контрагентов';
        el.meta.textContent = `Карточек: ${store.items.length}`;
        el.tabs.textContent = '';
        el.panel.textContent = '';
        const rows = store.items.map(c => ({ c, a: C.assess(c, store) }));
        el.panel.appendChild(h('div', { class: 'home-ct__actions' }, small('Excel', () => exportMatrix(store.items), true), small('Вернуться к карточке', () => render())));
        el.panel.appendChild(table(['Показатель', ...rows.map(x => titleOf(x.c))], [
            ['ИНН', x => x.c.inn], ['Решение', x => C.DECISIONS[x.a.decision]], ['Итоговый риск', x => (x.a.overall === null ? 'нет данных' : C.LEVELS[x.a.overall])],
            ...Object.entries(C.CATEGORIES).map(([k, l]) => [l, x => (x.a.perCat[k].level === null ? 'нет данных' : C.LEVELS[x.a.perCat[k].level])]),
            ['Выручка, тыс. ₽', x => (x.a.ratios && x.a.ratios.revenue !== null ? x.a.ratios.revenue.toLocaleString('ru-RU') : '—')],
            ['Чистая прибыль, тыс. ₽', x => (x.a.ratios && x.a.ratios.profit !== null ? x.a.ratios.profit.toLocaleString('ru-RU') : '—')],
            ['Текущая ликвидность', x => (x.a.ratios && x.a.ratios.currentRatio !== null ? x.a.ratios.currentRatio.toFixed(2) : '—')],
            ['СРО', x => { const ch = C.lastCheck(x.c); const s = ch && (ch.data.sro || [])[0]; return s ? `${s.status}${s.levelOdo ? ', ОДО: ' + s.levelOdo : ''}` : '—'; }],
            ['Дата проверки', x => (C.lastCheck(x.c) ? formatStamp(C.lastCheck(x.c).at) : '—')]
        ].map(([label, fn]) => h('tr', {}, h('td', {}, label), ...rows.map(x => h('td', {}, fn(x)))))));
    }

    // ---- Specialists --------------------------------------------------------------------------------

    function context(c, a) {
        const ch = C.lastCheck(c);
        const d = ch && ch.data;
        return [
            `Контрагент: ${titleOf(c)}, ИНН ${c.inn}. Роль: ${c.roles.map(r => C.ROLES[r]).join(', ') || 'не указана'}.`,
            d && d.egrul ? `ЕГРЮЛ (ФНС, ${formatDate(d.fetchedAt)}): ОГРН ${d.egrul.ogrn}, зарегистрирован ${d.egrul.registered}, ${d.egrul.head}.${d.pb ? ` Статус: ${d.pb.status}; недостоверность: ${d.pb.unreliable ? 'есть' : 'нет'}.` : ''}` : 'Сведения ЕГРЮЛ не получены.',
            a.years.length ? 'Отчётность (тыс. ₽): ' + a.years.slice(-3).map(y => `${y.year}: выручка ${y.lines['2110'] ?? '—'}, чистая прибыль ${y.lines['2400'] ?? '—'}, капитал ${y.lines['1300'] ?? '—'}, активы ${y.lines['1600'] ?? '—'}`).join('; ') + '.' : 'Отчётность не получена.',
            c.deal && c.deal.amount ? `Предполагаемый договор: ${C.fmtR(Number(c.deal.amount))}${c.deal.advancePct ? ', аванс ' + c.deal.advancePct + '%' : ''}${c.deal.workType ? ', ' + c.deal.workType : ''}.` : '',
            'Матрица рисков (по правилам AIRCHITECT): ' + Object.entries(C.CATEGORIES).map(([k, l]) => `${l} — ${a.perCat[k].level === null ? 'нет данных' : C.LEVELS[a.perCat[k].level].toLowerCase()}`).join('; ') + '.',
            'Факторы: ' + a.factors.filter(f => f.level > 0).map(f => `${f.text} [${f.source}]`).join(' ') ,
            c.facts.length ? 'Внесённые сведения: ' + c.facts.map(f => `${C.FACT_KINDS[f.kind]}: ${f.text || ''}${f.amount ? ' ' + C.fmtR(Number(f.amount)) : ''}${f.status ? ' (' + (C.COURT_STATUS[f.status] || f.status) + ')' : ''} [${f.source}]`).join('; ') + '.' : '',
            `Предварительное решение: ${C.DECISIONS[a.decision]}.`,
            'Опирайся только на эти сведения; не придумывай факты. Разделяй заявленные требования, установленные обстоятельства и предположения.'
        ].filter(Boolean).join('\n');
    }

    function askSecurity(c, a) {
        if (typeof window.AirchitectOpenSpecialist !== 'function') return;
        window.AirchitectOpenSpecialist('security-specialist', `${context(c, a)}\n\nПодготовь заключение о целесообразности сотрудничества и меры защиты в договоре.\n\nВопрос: `);
    }

    function askExpert(c, a, slug) {
        if (typeof window.AirchitectOpenSpecialist !== 'function') return;
        const task = slug === 'financier' ? 'Оцени риски авансирования и неплатежей, предложи условия оплаты и обеспечения.' : 'Оцени правовые риски по судебным спорам, корпоративным связям и ограничениям; предложи условия договора.';
        window.AirchitectOpenSpecialist(slug, `${context(c, a)}\n\n${task}\n\nВопрос: `);
    }

    // ---- Export ------------------------------------------------------------------------------------

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${url}"]`)) return resolve();
            const s = h('script', { src: url });
            s.onload = resolve;
            s.onerror = () => reject(new Error('Не удалось загрузить модуль экспорта. Проверьте подключение к интернету.'));
            document.head.appendChild(s);
        });
    }
    const fileSafe = s => String(s).replace(/[\\/:*?"<>|]/g, ' ').slice(0, 120);

    async function exportMatrix(items) {
        try {
            await loadScript(XLSX_URL);
            const X = window.XLSX;
            const book = X.utils.book_new();
            const aoa = [['Матрица рисков контрагентов'], [`Сформировано ${formatStamp(Date.now())}. Оценка по правилам AIRCHITECT; «нет данных» — сведения не получены.`], [], ['Контрагент', 'ИНН', 'Решение', 'Итог', ...Object.values(C.CATEGORIES), 'Дата проверки']];
            items.forEach(c => { const a = C.assess(c, store); aoa.push([titleOf(c), c.inn, C.DECISIONS[a.decision], a.overall === null ? 'нет данных' : C.LEVELS[a.overall], ...Object.keys(C.CATEGORIES).map(k => (a.perCat[k].level === null ? 'нет данных' : C.LEVELS[a.perCat[k].level])), C.lastCheck(c) ? formatStamp(C.lastCheck(c).at) : '']); });
            const sheet = X.utils.aoa_to_sheet(aoa);
            sheet['!cols'] = [36, 14, 34, 14, 18, 18, 18, 18, 18, 18, 18, 18, 18].map(w => ({ wch: w }));
            X.utils.book_append_sheet(book, sheet, 'Матрица');
            const f = [['Контрагент', 'Категория', 'Оценка', 'Фактор', 'Источник', 'Мера']];
            items.forEach(c => C.assess(c, store).factors.forEach(x => f.push([titleOf(c), C.CATEGORIES[x.cat], C.LEVELS[x.level], x.text, x.source, x.measure || ''])));
            const fs = X.utils.aoa_to_sheet(f);
            fs['!cols'] = [30, 24, 12, 80, 30, 50].map(w => ({ wch: w }));
            X.utils.book_append_sheet(book, fs, 'Факторы');
            const fin = [['Контрагент', 'Год', ...LINE_NAMES.map(([k, l]) => `${l} (${k}), тыс. ₽`), 'Источник']];
            items.forEach(c => C.financeYears(c).forEach(y => fin.push([titleOf(c), y.year, ...LINE_NAMES.map(([k]) => y.lines[k] ?? ''), y.source])));
            X.utils.book_append_sheet(book, X.utils.aoa_to_sheet(fin), 'Отчётность');
            X.writeFile(book, `${fileSafe(items.length > 1 ? 'Сравнение контрагентов' : 'Матрица рисков — ' + titleOf(items[0]))}.xlsx`);
        } catch (err) {
            notify(err.message);
        }
    }

    // Sections of the documents; every document states the date and sources
    function sections(c, kind) {
        const a = C.assess(c, store);
        const ch = C.lastCheck(c);
        const d = ch && ch.data;
        const out = [];
        const H = t => out.push(['h', t]);
        const P = t => out.push(['p', t]);
        const T = (cols, rows) => out.push(['t', cols, rows]);
        const reqs = () => { H('Регистрационные сведения'); if (d && d.egrul) T(['Сведение', 'Значение'], [['Наименование', d.egrul.name], ['ИНН / КПП', `${d.egrul.inn} / ${d.egrul.kpp}`], ['ОГРН', d.egrul.ogrn], ['Регистрация', d.egrul.registered], ['Руководитель', d.egrul.head], ['Статус', d.pb ? d.pb.status : '—'], ['Недостоверность', d.pb ? (d.pb.unreliable ? 'есть отметка' : 'нет') : '—']]); else P('Сведения ЕГРЮЛ не получены.'); };
        const fin = () => { H('Финансовое состояние'); if (a.years.length) { T(['Показатель, тыс. ₽', ...a.years.map(y => String(y.year))], LINE_NAMES.map(([k, l]) => [l, ...a.years.map(y => (y.lines[k] === undefined ? '—' : Number(y.lines[k]).toLocaleString('ru-RU')))])); const r = a.ratios; P(`Текущая ликвидность ${r.currentRatio === null ? '—' : r.currentRatio.toFixed(2)}, автономия ${r.autonomy === null ? '—' : r.autonomy.toFixed(2)}, обязательства/активы ${r.debtToAssets === null ? '—' : r.debtToAssets.toFixed(2)}, рентабельность ${r.margin === null ? '—' : (r.margin * 100).toFixed(1) + '%'} (${a.years[a.years.length - 1].year} г.).`); } else P('Отчётность не получена.'); a.perCat.financial.factors.concat(a.perCat.contract.factors).forEach(f => P(`• ${f.text} (${f.source})`)); };
        const courts = () => { H('Судебные и исполнительные риски'); const fl = c.facts.filter(f => ['court', 'enforcement', 'bankruptcy', 'rnp', 'checked'].includes(f.kind)); if (fl.length) T(['Вид', 'Сведение', 'Статус', 'Сумма', 'Источник'], fl.map(f => [C.FACT_KINDS[f.kind], `${f.caseNo ? 'дело ' + f.caseNo + '. ' : ''}${f.text || ''}`, C.COURT_STATUS[f.status] || f.status || '', f.amount ? C.fmtR(Number(f.amount)) : '', `${f.source}${f.date ? ', ' + formatDate(f.date) : ''}${f.url ? ', ' + f.url : ''}`])); else P('Сведения не внесены.'); a.perCat.court.factors.concat(a.perCat.enforcement.factors).forEach(f => P(`• ${f.text}`)); P('Наличие судебного дела не означает доказанного нарушения: учитываются заявленные требования и установленные судом обстоятельства раздельно.'); };
        const constr = () => { H('Соответствие требованиям строительного контракта'); (d && d.sro || []).forEach(s => P(`СРО: ${s.sro} (${s.sroNumber}), ${s.status}, право ${s.right || '—'}, ОДО: ${s.levelOdo || '—'} ${s.levelOdoCost || ''}, ВВ: ${s.levelVv || '—'}.`)); a.perCat.construction.factors.forEach(f => P(`• ${f.text}${f.measure ? ' Мера: ' + f.measure : ''}`)); };
        const links = () => { H('Корпоративные связи'); const rel = C.relations(store, c); if (rel.length) T(['Организация', 'Связь', 'Характер', 'Источник'], rel.map(x => [x.with.name || x.with.inn, x.type, x.confirmed ? 'подтверждена' : 'косвенный признак', x.source || ''])); else P('Связей не выявлено.'); P('Косвенные признаки не являются доказательством аффилированности.'); };
        const matrix = () => { H('Матрица рисков'); T(['Категория', 'Оценка', 'Факторы'], Object.entries(C.CATEGORIES).map(([k, l]) => [l, a.perCat[k].level === null ? 'нет данных' : C.LEVELS[a.perCat[k].level], a.perCat[k].factors.map(f => f.text).join(' ') || a.perCat[k].nodata || '—'])); };
        const measures = () => { H('Рекомендации по обеспечению обязательств'); (a.measures.length ? a.measures : ['Существенных мер не требуется в пределах доступных сведений.']).forEach(m => P(`• ${m}`)); };
        const decision = () => { H('Вывод'); P(`${C.DECISIONS[a.decision]}. ${decisionText(a)}`); };
        const changesSec = () => { H('Изменения по результатам повторных проверок'); if (c.changes.length) c.changes.forEach(x => x.items.forEach(i => P(`• ${formatStamp(x.at)}: ${i.text} (${i.source})`))); else P('Изменений не выявлено.'); };
        const sources = () => { H('Источники'); (d ? d.sources : []).forEach(s => P(`${s.title}: ${s.url} — ${{ ok: 'получено', empty: 'сведений нет', error: 'недоступен', captcha: 'требует ручной проверки' }[s.status]}, ${formatStamp(new Date(s.fetchedAt).getTime())}`)); c.facts.forEach(f => P(`${C.FACT_KINDS[f.kind]}: ${f.source}${f.url ? ', ' + f.url : ''}${f.date ? ', ' + formatDate(f.date) : ''}`)); };
        const map = { full: [reqs, fin, courts, constr, links, matrix, measures, decision, sources], finance: [reqs, fin, sources], courts: [courts, sources], construction: [constr, sources], links: [links, sources], measures: [matrix, measures, sources], decision: [matrix, measures, decision, sources], changes: [changesSec, sources] };
        (map[kind] || map.full).forEach(fn => fn());
        return { out, a };
    }
    const DOC_TITLES = { full: 'Комплексная справка о контрагенте', finance: 'Заключение о финансовой устойчивости', courts: 'Справка о судебных и исполнительных рисках', construction: 'Заключение о соответствии требованиям строительного контракта', links: 'Схема корпоративных связей', measures: 'Рекомендации по обеспечению обязательств', decision: 'Заключение о целесообразности сотрудничества', changes: 'Отчёт об изменениях по результатам мониторинга' };

    async function exportDocx(c, kind) {
        try {
            await loadScript(DOCX_URL);
            const D = window.docx;
            const p = (text, opts = {}) => new D.Paragraph({ alignment: opts.center ? D.AlignmentType.CENTER : undefined, spacing: { after: 100 }, children: [new D.TextRun({ text, bold: opts.bold, size: opts.size || 21, font: 'Times New Roman' })] });
            const cell = (text, bold) => new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: String(text ?? ''), bold, size: 18, font: 'Times New Roman' })] })] });
            const { out } = sections(c, kind);
            const children = [p(DOC_TITLES[kind].toUpperCase(), { bold: true, center: true, size: 24 }), p(`${titleOf(c)}, ИНН ${c.inn}`, { center: true }), p(`Дата: ${formatStamp(Date.now())}. Последняя проверка по реестрам: ${C.lastCheck(c) ? formatStamp(C.lastCheck(c).at) : 'не выполнялась'}.`, { size: 18 })];
            out.forEach(x => {
                if (x[0] === 'h') children.push(p(x[1], { bold: true, size: 22 }));
                else if (x[0] === 'p') children.push(p(x[1]));
                else children.push(new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [new D.TableRow({ tableHeader: true, children: x[1].map(t => cell(t, true)) }), ...x[2].map(r => new D.TableRow({ children: r.map(t => cell(t)) }))] }));
            });
            children.push(p('Заключение подготовлено по сведениям из указанных источников на дату проверки. Оценка выполнена по прозрачным правилам и не является утверждением о недобросовестности контрагента.', { size: 16 }), p('Подготовил: ____________ (должность, ФИО, подпись)'));
            download(await D.Packer.toBlob(new D.Document({ sections: [{ properties: {}, children }] })), `${fileSafe(DOC_TITLES[kind] + ' — ' + titleOf(c))}.docx`);
            log(c, `Сформирован документ: ${DOC_TITLES[kind]}`);
            save();
        } catch (err) {
            notify(err.message || 'Не удалось сформировать документ.');
        }
    }

    function printReport(c) {
        const { out } = sections(c, 'full');
        const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
        const body = out.map(x => x[0] === 'h' ? `<h2>${esc(x[1])}</h2>` : x[0] === 'p' ? `<p>${esc(x[1])}</p>` : `<table><tr>${x[1].map(t => `<th>${esc(t)}</th>`).join('')}</tr>${x[2].map(r => `<tr>${r.map(t => `<td>${esc(t)}</td>`).join('')}</tr>`).join('')}</table>`).join('');
        const win = window.open('', '_blank');
        if (!win) return notify('Разрешите всплывающие окна, чтобы сохранить PDF.');
        win.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(titleOf(c))}</title><style>body{font-family:'Times New Roman',serif;font-size:11pt;margin:15mm}h1{font-size:14pt;text-align:center}h2{font-size:12pt;margin-top:14px}table{width:100%;border-collapse:collapse;margin:6px 0}td,th{border:1px solid #000;padding:3px 5px;vertical-align:top}</style></head><body><h1>${esc(DOC_TITLES.full)}</h1><p style="text-align:center">${esc(titleOf(c))}, ИНН ${esc(c.inn)} · ${esc(formatStamp(Date.now()))}</p>${body}</body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
    }

    // ---- Wiring --------------------------------------------------------------------------------------

    function addCounterparty(inn) {
        openDialog('Новый контрагент', [
            { name: 'inn', label: 'ИНН', value: inn || '', required: true, hint: '10 цифр для организации, 12 — для ИП' },
            { name: 'name', label: 'Наименование (если нет проверки по реестрам)' },
            { name: 'roles', label: 'Роль', type: 'multi', options: Object.entries(C.ROLES) }
        ], 'Добавить и проверить', async v => {
            if (!C.validInn(v.inn)) return 'Некорректный ИНН: проверьте количество цифр и контрольное число.';
            const existing = store.items.find(x => x.inn === v.inn);
            if (existing) { currentId = existing.id; return null; }
            const c = C.blank({ inn: v.inn, name: v.name, roles: v.roles });
            store.items.unshift(c);
            currentId = c.id;
            tab = 'summary';
            save();
            await runCheck(c);
            return null;
        });
    }

    root.querySelector('[data-cp-add]').addEventListener('click', () => addCounterparty());
    root.querySelector('[data-cp-demo]').addEventListener('click', () => {
        if (store.items.some(x => x.demo)) { currentId = store.items.find(x => x.demo).id; tab = 'summary'; render(); return; }
        const cards = C.demoCards();
        store.items.unshift(...cards);
        currentId = cards[0].id;
        tab = 'summary';
        save();
        render();
    });
    root.querySelector('[data-cp-compare]').addEventListener('click', () => { if (store.items.length < 2) return notify('Для сравнения добавьте хотя бы два контрагента.'); renderCompare(); });
    window.addEventListener('storage', ev => { if (ev.key === C.STORE_KEY) { store = C.read(); if (!dialog.open) render(); } });

    render();
    // ?inn=... from other sections (Договоры, Тендеры, Объекты) opens or creates the card
    const innParam = params.get('inn') || ((params.get('id') || '').startsWith('inn:') ? params.get('id').slice(4) : null);
    if (innParam) {
        const ex = store.items.find(x => x.inn === innParam);
        if (ex) { currentId = ex.id; render(); } else addCounterparty(innParam);
    }
    // Scheduled re-checks that are due: run when the section is opened (no background monitoring)
    store.items.filter(x => C.due(x) && !x.demo).slice(0, 3).forEach(c => runCheck(c, true).then(ok => { if (ok) render(); }));
});
