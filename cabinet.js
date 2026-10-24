// Personal cabinet (cabinet.html): product-based workspace.
// OFFICE: Штат (specialists) and Контракты; DOCS: Документы with approval routes;
// all products: Обзор (dashboard), Реестры, Настройки.
// Open access for now: all data is kept in this browser (localStorage + IndexedDB for files).
// Штат and Контракты are the existing pages, shown inside the cabinet (?cabinet=1).

document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('[data-cabinet]');
    if (!root) return;

    const KEYS = {
        cabinet: 'airchitect-cabinet-v1',
        contracts: 'airchitect-contracts-v1',
        staff: 'airchitect-staff-v1',
        docs: 'airchitect-docs-v1'
    };

    const PRODUCTS = {
        office: { code: 'AIRCHITECT OFFICE', title: 'Цифровой проектный офис', text: 'Специалисты и исполнение договоров.' },
        docs: { code: 'AIRCHITECT DOCS', title: 'Электронный документооборот', text: 'Документы, согласования и контроль исполнения.' },
        complex: { code: 'AIRCHITECT COMPLEX', title: 'Комплексное решение', text: 'Специалисты, договоры и документооборот в одной системе.' }
    };

    const ICONS = {
        overview: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
        staff: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.5a3.5 3.5 0 010 7M18.5 20a6.5 6.5 0 00-3-5.5"/>',
        contracts: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 11h7M9 14h7M9 17h4"/>',
        documents: '<rect x="8" y="3" width="12" height="15" rx="1"/><path d="M5 6v15h12"/><path d="M11 8h6M11 11h6M11 14h4"/>',
        registries: '<path d="M4 5h16M4 10h16M4 15h16M4 20h10"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'
    };

    const SECTIONS = [
        { id: 'overview', title: 'Обзор', products: ['office', 'docs', 'complex'] },
        { id: 'staff', title: 'Штат', products: ['office', 'complex'], frame: 'staff.html' },
        { id: 'contracts', title: 'Контракты', products: ['office', 'complex'], frame: 'contracts.html' },
        { id: 'documents', title: 'Документы', products: ['docs', 'complex'] },
        { id: 'registries', title: 'Реестры', products: ['office', 'docs', 'complex'] },
        { id: 'settings', title: 'Настройки', products: ['office', 'docs', 'complex'] }
    ];

    const DOC_TYPES = ['Договор', 'Дополнительное соглашение', 'Письмо', 'Уведомление', 'Акт', 'Приказ', 'Служебная записка', 'Исполнительная документация', 'Прочее'];
    const DOC_STATUS = { draft: 'Черновик', approval: 'На согласовании', approved: 'Согласован', rejected: 'Отклонён', done: 'Исполнен' };
    const SOON_DAYS = 7;

    // ---- Storage --------------------------------------------------------------

    const read = (key, fallback) => {
        try {
            return JSON.parse(localStorage.getItem(key)) || fallback;
        } catch (e) {
            return fallback;
        }
    };
    const write = (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            notify('Не удалось сохранить данные в браузере: хранилище заполнено или недоступно.');
        }
    };

    let settings = read(KEYS.cabinet, {});
    let docsStore = read(KEYS.docs, { docs: [] });
    const saveSettings = () => write(KEYS.cabinet, settings);
    const saveDocs = () => write(KEYS.docs, docsStore);
    const contracts = () => read(KEYS.contracts, { contracts: [] }).contracts;
    const staff = () => read(KEYS.staff, {});

    // Contracts and Штат write to localStorage from their frames: refresh the dashboard when they do
    window.addEventListener('storage', () => {
        docsStore = read(KEYS.docs, { docs: [] });
        if (['overview', 'registries', 'documents'].includes(currentSection())) renderSection();
    });

    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const today = () => new Date().toISOString().slice(0, 10);

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

    // ---- Helpers --------------------------------------------------------------

    function h(tag, attrs = {}, ...children) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([key, value]) => {
            if (value === undefined || value === null || value === false) return;
            if (key === 'class') node.className = value;
            else if (key === 'html') node.innerHTML = value;
            else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
            else node.setAttribute(key, value === true ? '' : value);
        });
        children.flat().forEach(child => {
            if (child === null || child === undefined || child === false) return;
            node.append(child instanceof Node ? child : document.createTextNode(child));
        });
        return node;
    }

    const icon = name => h('span', { class: 'home-cab__icon', 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>` });

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

    function daysUntil(date) {
        if (!date) return null;
        return Math.round((new Date(date + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
    }

    // Same rules as contracts.js
    function obligationStatus(o) {
        if (o.status === 'done') return 'done';
        if (!o.confirmed) return 'review';
        const days = daysUntil(o.due);
        if (days !== null && days < 0) return 'overdue';
        if (days !== null && days <= SOON_DAYS) return 'soon';
        return 'active';
    }
    const OBLIGATION_LABEL = { review: 'Требует подтверждения', active: 'В работе', soon: 'Скоро срок', overdue: 'Просрочено', done: 'Исполнено' };
    const PARTIES = { customer: 'Заказчик', contractor: 'Подрядчик', both: 'Обе стороны' };
    const NOTICE_LABEL = { draft: 'Проект', sent: 'Отправлено', received: 'Получено адресатом' };

    const contractName = c => `№ ${c.number || 'без номера'}${c.date ? ' от ' + formatDate(c.date) : ''}`;

    const hasProduct = (...list) => list.includes(settings.product);

    // ---- Dialog ---------------------------------------------------------------

    const dialog = document.querySelector('[data-ct-dialog]');
    const dialogTitle = document.querySelector('[data-ct-dialog-title]');
    const dialogBody = document.querySelector('[data-ct-dialog-body]');
    const dialogFoot = document.querySelector('[data-ct-dialog-foot]');
    const dialogError = document.querySelector('[data-ct-dialog-error]');
    document.querySelector('[data-ct-dialog-close]').addEventListener('click', () => dialog.close());

    function openDialog(title, fields, submitLabel, onSubmit, extra) {
        dialogTitle.textContent = title;
        dialogBody.textContent = '';
        dialogError.hidden = true;
        fields.forEach(f => {
            let input;
            if (f.type === 'select') {
                input = h('select', { name: f.name, required: f.required },
                    f.options.map(([value, label]) => h('option', { value, selected: String(value) === String(f.value || '') }, label)));
            } else if (f.type === 'textarea') {
                input = h('textarea', { name: f.name, rows: f.rows || 4, required: f.required });
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
                        values[f.name] = f.type === 'file' ? [...input.files] : input.value.trim();
                    });
                    const error = await onSubmit(values);
                    if (error) {
                        dialogError.textContent = error;
                        dialogError.hidden = false;
                        return;
                    }
                    dialog.close();
                    renderSection();
                }
            }, submitLabel) : null);
        dialog.showModal();
    }

    // ---- Layout: side menu and sections -----------------------------------------

    const side = root.querySelector('[data-cab-side]');
    const nav = root.querySelector('[data-cab-nav]');
    const main = root.querySelector('[data-cab-main]');
    const frameWrap = root.querySelector('[data-cab-frame-wrap]');
    const frame = root.querySelector('[data-cab-frame]');
    const panel = root.querySelector('[data-cab-panel]');

    const sections = () => SECTIONS.filter(s => s.products.includes(settings.product));

    function currentSection() {
        const [id] = location.hash.slice(1).split('/');
        return sections().some(s => s.id === id) ? id : 'overview';
    }

    // #contracts/<id> or #staff/<slug> opens an item inside the section
    const currentItem = () => decodeURIComponent(location.hash.slice(1).split('/')[1] || '');

    function go(section, item) {
        location.hash = item ? `${section}/${encodeURIComponent(item)}` : section;
    }

    const topbar = document.querySelector('[data-cab-top]');

    function renderTop() {
        const signed = !!(settings.product && settings.signedIn);
        topbar.querySelector('[data-cab-account]').hidden = !signed;
        if (!signed) return;
        topbar.querySelector('[data-cab-company]').textContent = settings.company || 'Компания';
        topbar.querySelector('[data-cab-product]').textContent = PRODUCTS[settings.product].code;
        topbar.querySelector('[data-cab-user]').textContent = settings.user || '';
    }

    topbar.querySelector('[data-cab-logout]').addEventListener('click', () => {
        settings.signedIn = false;
        saveSettings();
        location.hash = '';
        renderSection();
    });

    function renderSide() {
        nav.textContent = '';
        const active = currentSection();
        sections().forEach(s => {
            nav.appendChild(h('li', {},
                h('a', {
                    href: `#${s.id}`,
                    class: 'home-cab__link' + (s.id === active ? ' is-active' : ''),
                    'aria-current': s.id === active ? 'page' : null
                }, icon(s.id), h('span', {}, s.title), badge(s.id))));
        });
    }

    // Counters next to menu items: what needs attention
    function badge(section) {
        let count = 0;
        if (section === 'contracts') {
            count = contracts().reduce((n, c) => n + c.obligations.filter(o => ['overdue', 'soon'].includes(obligationStatus(o))).length, 0);
        } else if (section === 'documents') {
            count = docsStore.docs.filter(d => d.status === 'approval').length;
        }
        return count ? h('span', { class: 'home-cab__badge' }, String(count)) : null;
    }

    function renderSection() {
        renderTop();
        if (!settings.product || !settings.signedIn) return renderOnboarding();
        side.hidden = false;
        renderSide();
        const id = currentSection();
        const section = SECTIONS.find(s => s.id === id);
        document.title = `${section.title} — Личный кабинет | AIRCHITECT`;

        if (section.frame) {
            panel.hidden = true;
            frameWrap.hidden = false;
            const item = currentItem();
            const src = `${section.frame}?cabinet=1${item ? '&id=' + encodeURIComponent(item) : ''}`;
            if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
            frame.title = section.title;
            return;
        }
        frameWrap.hidden = true;
        panel.hidden = false;
        panel.textContent = '';
        ({ overview: renderOverview, documents: renderDocuments, registries: renderRegistries, settings: renderSettings })[id]();
        main.scrollTop = 0;
    }

    window.addEventListener('hashchange', renderSection);

    // ---- Sign-in: company, user and product --------------------------------------------

    function renderOnboarding() {
        side.hidden = true;
        frameWrap.hidden = true;
        panel.hidden = false;
        panel.textContent = '';
        document.title = 'Вход — Личный кабинет | AIRCHITECT';
        let choice = settings.product || 'complex';

        const company = h('input', { type: 'text', required: true, autocomplete: 'organization', placeholder: 'ООО «ГлавСтрой»' });
        company.value = settings.company || '';
        const user = h('input', { type: 'text', autocomplete: 'name', placeholder: 'Фамилия И.О.' });
        user.value = settings.user || '';
        const pills = h('div', { class: 'home-cab__pills', role: 'radiogroup', 'aria-label': 'Решение' },
            Object.entries(PRODUCTS).map(([key, p]) => h('button', {
                type: 'button', role: 'radio', class: 'home-cab__pill' + (key === choice ? ' is-active' : ''),
                'aria-checked': String(key === choice), title: p.title,
                onclick: e => {
                    choice = key;
                    pills.querySelectorAll('.home-cab__pill').forEach(b => {
                        b.classList.toggle('is-active', b === e.currentTarget);
                        b.setAttribute('aria-checked', String(b === e.currentTarget));
                    });
                    hint.textContent = PRODUCTS[key].text;
                }
            }, p.code.replace('AIRCHITECT ', ''))));
        const hint = h('p', { class: 'home-dialog__hint' }, PRODUCTS[choice].text);

        const form = h('form', {
            class: 'home-cab__login', onsubmit: e => {
                e.preventDefault();
                if (!company.value.trim()) return company.focus();
                settings = { ...settings, product: choice, company: company.value.trim(), user: user.value.trim(), signedIn: true };
                saveSettings();
                go('overview');
                renderSection();
            }
        },
        h('h1', { class: 'home-cab__login-title' }, 'Вход в личный кабинет'),
        h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, 'Компания'), company),
        h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, 'Ваше имя'), user),
        h('div', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, 'Решение'), pills, hint),
        h('button', { type: 'submit', class: 'home-btn home-btn--primary home-cab__login-btn' }, h('span', {}, 'Войти')),
        h('p', { class: 'home-dialog__hint' }, 'Открытый доступ: данные хранятся только в этом браузере.'));
        panel.appendChild(h('div', { class: 'home-cab__login-wrap' }, form));
        setTimeout(() => (company.value ? user : company).focus(), 0);
    }

    // ---- Overview (dashboard) -----------------------------------------------------

    function stat(label, value, tone, onclick) {
        // warning colours only when there is something to act on
        return h(onclick ? 'button' : 'div', { type: onclick ? 'button' : null, class: 'home-cab__stat' + (tone && value > 0 ? ` home-cab__stat--${tone}` : ''), onclick },
            h('span', { class: 'home-ct__stat-value' }, String(value)),
            h('span', { class: 'home-ct__stat-label' }, label));
    }

    function block(title, ...content) {
        return h('section', { class: 'home-ct__block' },
            h('div', { class: 'home-ct__block-head' }, h('h2', { class: 'home-ct__block-title' }, title)),
            ...content);
    }

    function renderOverview() {
        const list = contracts();
        const obligations = list.flatMap(c => c.obligations.map(o => ({ ...o, contract: c, s: obligationStatus(o) })));
        const notices = list.flatMap(c => c.notices.map(n => ({ ...n, contract: c })));
        const docs = docsStore.docs;
        const office = hasProduct('office', 'complex');
        const docsOn = hasProduct('docs', 'complex');

        panel.append(h('h1', { class: 'home-cab__title' }, 'Обзор'));

        // Nothing yet: first steps instead of empty tables
        if (!list.length && !docs.length) {
            const steps = [];
            if (office) {
                steps.push(['contracts', 'Добавьте договор', 'Контрольные точки найдутся в файле автоматически.', () => go('contracts')]);
                steps.push(['staff', 'Задайте вопрос специалисту', 'Юрист, финансист, сметчик и другие.', () => go('staff')]);
            }
            if (docsOn) steps.push(['documents', 'Добавьте документ', 'И направьте его на согласование.', () => go('documents')]);
            panel.appendChild(h('div', { class: 'home-cab__start' }, steps.map(([ic, title, text, fn]) =>
                h('button', { type: 'button', class: 'home-cab__start-item', onclick: fn },
                    icon(ic), h('span', { class: 'home-cab__start-title' }, title), h('span', { class: 'home-cab__start-text' }, text)))));
            return;
        }

        const stats = [];
        if (office) {
            stats.push(
                stat('Просрочено', obligations.filter(o => o.s === 'overdue').length, 'overdue', () => go('registries', 'obligations')),
                stat(`Срок в ${SOON_DAYS} дней`, obligations.filter(o => o.s === 'soon').length, 'soon', () => go('registries', 'obligations')));
        }
        if (docsOn) stats.push(stat('На согласовании', docs.filter(d => d.status === 'approval').length, 'soon', () => go('documents')));
        if (office) stats.push(stat('Уведомления к отправке', notices.filter(n => n.status === 'draft').length, '', () => go('registries', 'notices')));
        if (!docsOn) stats.push(stat('Требуют подтверждения', obligations.filter(o => o.s === 'review').length, '', () => go('registries', 'obligations')));
        panel.appendChild(h('div', { class: 'home-cab__stats' }, stats));

        const columns = h('div', { class: 'home-cab__columns' });
        panel.appendChild(columns);

        const deadlines = [
            ...(office ? obligations.filter(o => o.s !== 'done' && o.due && daysUntil(o.due) <= 14).map(o => ({
                date: o.due, title: o.text, meta: `${contractName(o.contract)} · п. ${o.clause || '—'}`,
                tone: o.s, open: () => go('contracts', o.contract.id)
            })) : []),
            ...(docsOn ? docs.filter(d => d.status !== 'done' && d.due && daysUntil(d.due) <= 14).map(d => ({
                date: d.due, title: d.title, meta: d.type,
                tone: daysUntil(d.due) < 0 ? 'overdue' : 'soon', open: () => showDocument(d)
            })) : [])
        ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);

        columns.appendChild(block('Ближайшие сроки',
            h('ul', { class: 'home-ct__list' }, deadlines.length ? deadlines.map(d => {
                const days = daysUntil(d.date);
                return h('li', { class: 'home-ct__row home-cab__clickable', onclick: d.open },
                    h('div', { class: 'home-ct__row-main' },
                        h('p', { class: 'home-ct__row-title' },
                            h('span', { class: `home-ct__badge home-ct__badge--${d.tone === 'overdue' ? 'overdue' : 'soon'}` },
                                days < 0 ? `просрочено ${-days} дн.` : days === 0 ? 'сегодня' : `через ${days} дн.`),
                            d.title),
                        h('p', { class: 'home-ct__row-meta' }, `${formatDate(d.date)} · ${d.meta}`)));
            }) : h('li', { class: 'home-ct__none' }, 'На две недели вперёд сроков нет.'))));

        const attention = [];
        if (office) {
            const review = obligations.filter(o => o.s === 'review');
            if (review.length) attention.push([`Подтвердите обязательства: ${review.length}`, 'Найдены в договорах автоматически', () => go('contracts', review[0].contract.id)]);
            notices.filter(n => n.status === 'draft').slice(0, 3).forEach(n => attention.push(['Уведомление не отправлено', `${contractName(n.contract)} · ${n.addressee || '—'}`, () => go('contracts', n.contract.id)]));
        }
        if (docsOn) {
            docs.filter(d => d.status === 'approval').slice(0, 3).forEach(d => {
                const step = (d.route || []).find(r => r.decision === 'pending');
                attention.push(['Ожидает решения', `${d.title}${step ? ' · ' + step.name : ''}`, () => showDocument(d)]);
            });
            docs.filter(d => d.status === 'rejected').slice(0, 2).forEach(d => attention.push(['Документ отклонён', d.title, () => showDocument(d)]));
        }
        columns.appendChild(block('Требует внимания',
            h('ul', { class: 'home-ct__list' }, attention.length ? attention.map(([title, text, open]) =>
                h('li', { class: 'home-ct__row home-cab__clickable', onclick: open },
                    h('div', { class: 'home-ct__row-main' }, h('p', { class: 'home-ct__row-title' }, title), h('p', { class: 'home-ct__row-meta' }, text)))) :
                h('li', { class: 'home-ct__none' }, 'Всё в порядке.'))));
    }

    // ---- DOCS: documents with approval routes ------------------------------------------

    function docStatus(d) {
        if (d.status === 'done') return 'done';
        const route = d.route || [];
        if (!route.length) return 'draft';
        if (route.some(r => r.decision === 'rejected')) return 'rejected';
        if (route.every(r => r.decision === 'approved')) return 'approved';
        return 'approval';
    }

    function docLog(d, text) {
        d.history = d.history || [];
        d.history.unshift({ at: Date.now(), text: settings.user ? `${text} (${settings.user})` : text });
    }

    function syncStatus(d) {
        const before = d.status;
        d.status = docStatus(d);
        if (before !== d.status && d.status === 'approved') docLog(d, 'Документ согласован всеми участниками');
        if (before !== d.status && d.status === 'rejected') docLog(d, 'Документ отклонён');
    }

    const contractOptions = () => [['', '— без договора —'], ...contracts().map(c => [c.id, contractName(c) + (c.subject ? ' · ' + c.subject : '')])];

    function addDocument() {
        openDialog('Новый документ', [
            { name: 'title', label: 'Название', required: true },
            { name: 'type', label: 'Вид документа', type: 'select', value: 'Письмо', options: DOC_TYPES.map(t => [t, t]) },
            { name: 'contract', label: 'Договор', type: 'select', options: contractOptions() },
            { name: 'responsible', label: 'Ответственный', value: settings.user },
            { name: 'due', label: 'Срок исполнения', type: 'date' },
            { name: 'text', label: 'Краткое содержание', type: 'textarea', rows: 3 },
            { name: 'files', label: 'Файлы', type: 'file' }
        ], 'Добавить', async v => {
            const d = {
                id: uid(), title: v.title, type: v.type, contractId: v.contract, responsible: v.responsible, due: v.due,
                text: v.text, files: await storeFiles(v.files), route: [], status: 'draft', created: Date.now(), history: []
            };
            docLog(d, 'Документ создан');
            docsStore.docs.unshift(d);
            saveDocs();
        });
    }

    function startApproval(d) {
        openDialog('Направить на согласование', [
            { name: 'route', label: 'Маршрут согласования', type: 'textarea', rows: 5, required: true, value: (d.route || []).map(r => r.name).join('\n'), hint: 'По одному участнику в строке, в порядке согласования. Например: Главный инженер — Петров П.П.' },
            { name: 'deadline', label: 'Согласовать до', type: 'date' }
        ], 'Направить', v => {
            const names = v.route.split('\n').map(s => s.trim()).filter(Boolean);
            if (!names.length) return 'Укажите хотя бы одного участника.';
            d.route = names.map(name => ({ name, decision: 'pending', comment: '', at: null }));
            d.approveBy = v.deadline;
            syncStatus(d);
            docLog(d, `Направлен на согласование: ${names.join(' → ')}`);
            saveDocs();
        });
    }

    function decide(d) {
        const pending = d.route.filter(r => r.decision === 'pending');
        if (!pending.length) return notify('Все участники уже приняли решение.');
        openDialog('Решение по документу', [
            { name: 'step', label: 'Участник', type: 'select', options: pending.map(r => [d.route.indexOf(r), r.name]) },
            { name: 'decision', label: 'Решение', type: 'select', options: [['approved', 'Согласовано'], ['rejected', 'Отклонено']] },
            { name: 'comment', label: 'Комментарий', type: 'textarea', rows: 3 }
        ], 'Сохранить', v => {
            if (v.decision === 'rejected' && !v.comment) return 'Укажите причину отклонения.';
            const step = d.route[Number(v.step)];
            Object.assign(step, { decision: v.decision, comment: v.comment, at: Date.now() });
            docLog(d, `${step.name}: ${v.decision === 'approved' ? 'согласовано' : 'отклонено'}${v.comment ? ' — ' + v.comment : ''}`);
            syncStatus(d);
            saveDocs();
        }, h('p', { class: 'home-dialog__hint' }, 'Решение фиксируется от имени выбранного участника. В открытом доступе отметку ставит пользователь этого браузера.'));
    }

    function markDocDone(d) {
        openDialog('Отметить исполнение', [
            { name: 'note', label: 'Результат исполнения', type: 'textarea', rows: 3 },
            { name: 'files', label: 'Подтверждающие документы', type: 'file' }
        ], 'Отметить', async v => {
            d.files = [...(d.files || []), ...(await storeFiles(v.files))];
            d.status = 'done';
            d.doneAt = today();
            docLog(d, `Исполнен${v.note ? ': ' + v.note : ''}`);
            saveDocs();
        });
    }

    function showDocument(d) {
        const contract = contracts().find(c => c.id === d.contractId);
        const body = h('div', { class: 'home-cab__doc' },
            h('p', { class: 'home-ct__row-meta' }, [d.type, DOC_STATUS[docStatus(d)], contract ? contractName(contract) : '', d.responsible ? `Ответственный: ${d.responsible}` : '', d.due ? `Срок исполнения: ${formatDate(d.due)}` : ''].filter(Boolean).join(' · ')),
            d.text ? h('pre', { class: 'home-cab__doc-text' }, d.text) : null,
            (d.files || []).length ? h('span', { class: 'home-ct__files' }, d.files.map(f => h('button', { type: 'button', class: 'home-ct__file', onclick: () => openFile(f) }, f.name))) : null,
            d.route && d.route.length ? h('div', {},
                h('p', { class: 'home-dialog__label' }, 'Маршрут согласования'),
                h('ol', { class: 'home-cab__route' }, d.route.map(r => h('li', { class: `is-${r.decision}` },
                    h('span', {}, r.name),
                    h('span', { class: 'home-ct__row-meta' }, r.decision === 'pending' ? 'ожидает решения' : `${r.decision === 'approved' ? 'согласовано' : 'отклонено'} ${formatStamp(r.at)}${r.comment ? ' — ' + r.comment : ''}`))))) : null,
            h('p', { class: 'home-dialog__label' }, 'История'),
            h('ul', { class: 'home-ct__history' }, (d.history || []).map(l => h('li', {}, h('span', { class: 'home-ct__history-date' }, formatStamp(l.at)), h('span', {}, l.text)))));
        openDialog(d.title, [], null, null, body);
    }

    function renderDocuments() {
        const status = h('select', { 'aria-label': 'Статус' }, [['all', 'Все статусы'], ...Object.entries(DOC_STATUS)].map(([v, l]) => h('option', { value: v }, l)));
        const search = h('input', { type: 'search', placeholder: 'Поиск по названию', class: 'home-cab__search' });
        const list = h('ul', { class: 'home-ct__list' });

        const draw = () => {
            const q = search.value.trim().toLowerCase();
            const items = docsStore.docs
                .filter(d => status.value === 'all' || docStatus(d) === status.value)
                .filter(d => !q || `${d.title} ${d.type} ${d.text || ''}`.toLowerCase().includes(q));
            list.textContent = '';
            if (!items.length) {
                list.appendChild(h('li', { class: 'home-ct__none' }, docsStore.docs.length ? 'Нет документов по выбранным условиям.' : 'Документов пока нет. Нажмите «Добавить документ».'));
                return;
            }
            items.forEach(d => {
                const s = docStatus(d);
                const approved = (d.route || []).filter(r => r.decision === 'approved').length;
                const contract = contracts().find(c => c.id === d.contractId);
                const days = daysUntil(d.due);
                const actions = [['Открыть', () => showDocument(d)]];
                if (s === 'draft' || s === 'rejected') actions.push([s === 'rejected' ? 'Повторно на согласование' : 'На согласование', () => startApproval(d)]);
                if (s === 'approval') actions.push(['Решение', () => decide(d)]);
                if (s !== 'done') actions.push(['Исполнено', () => markDocDone(d)]);
                actions.push(['Удалить', () => {
                    if (!confirm(`Удалить документ «${d.title}»?`)) return;
                    docsStore.docs = docsStore.docs.filter(x => x !== d);
                    saveDocs();
                    renderSection();
                }]);
                list.appendChild(h('li', { class: 'home-ct__row' },
                    h('div', { class: 'home-ct__row-main' },
                        h('p', { class: 'home-ct__row-title' }, h('span', { class: `home-ct__badge home-cab__doc--${s}` }, DOC_STATUS[s]), d.title),
                        h('p', { class: 'home-ct__row-meta' }, [
                            d.type, contract ? contractName(contract) : '',
                            d.route && d.route.length ? `согласовали ${approved} из ${d.route.length}` : '',
                            d.due ? `срок исполнения ${formatDate(d.due)}${s !== 'done' && days < 0 ? ' — просрочено' : ''}` : '',
                            d.responsible ? `ответственный: ${d.responsible}` : ''
                        ].filter(Boolean).join(' · '))),
                    h('div', { class: 'home-record__actions' }, actions.map(([label, fn]) => h('button', { type: 'button', onclick: fn }, label)))));
            });
        };
        status.addEventListener('change', draw);
        search.addEventListener('input', draw);

        panel.append(
            h('p', { class: 'home-eyebrow' }, 'AIRCHITECT DOCS'),
            h('h1', { class: 'home-cab__title' }, 'Документы'),
            h('p', { class: 'home-chat__text' }, 'Документы компании, маршруты согласования и контроль исполнения.'),
            h('div', { class: 'home-ct__actions' },
                h('button', { type: 'button', class: 'home-btn home-btn--primary', onclick: addDocument }, h('span', {}, 'Добавить документ'))),
            h('section', { class: 'home-ct__block' },
                h('div', { class: 'home-ct__block-head' }, h('h2', { class: 'home-ct__block-title' }, 'Реестр документов'), h('div', { class: 'home-ct__filters' }, search, status)),
                list));
        draw();
    }

    // ---- Registries ---------------------------------------------------------------

    const REGISTRIES = [
        {
            id: 'contracts', title: 'Договоры', products: ['office', 'complex'],
            columns: ['Договор', 'Предмет', 'Заказчик', 'Подрядчик', 'Цена', 'Сроки работ', 'Обязательств', 'Просрочено'],
            rows: () => contracts().map(c => ({
                cells: [contractName(c), c.subject, c.customer, c.contractor, c.price, `${formatDate(c.start) || '—'} — ${formatDate(c.end) || '—'}`, c.obligations.length, c.obligations.filter(o => obligationStatus(o) === 'overdue').length],
                open: () => go('contracts', c.id)
            }))
        },
        {
            id: 'obligations', title: 'Обязательства', products: ['office', 'complex'],
            columns: ['Договор', 'Пункт', 'Сторона', 'Обязательство', 'Срок', 'Статус', 'Ответственный'],
            rows: () => contracts().flatMap(c => c.obligations.map(o => ({
                cells: [contractName(c), o.clause, PARTIES[o.party], o.text, o.due ? formatDate(o.due) : o.condition, OBLIGATION_LABEL[obligationStatus(o)], o.responsible],
                open: () => go('contracts', c.id)
            })))
        },
        {
            id: 'notices', title: 'Уведомления', products: ['office', 'complex'],
            columns: ['Договор', 'Основание', 'Адресат', 'Статус', 'Отправлено', 'Способ', 'Подтверждение', 'Получено'],
            rows: () => contracts().flatMap(c => c.notices.map(n => ({
                cells: [contractName(c), n.clause ? `п. ${n.clause}` : '', n.addressee, NOTICE_LABEL[n.status], formatDate(n.sentAt), n.method, n.sentRef, formatDate(n.receivedAt)],
                open: () => go('contracts', c.id)
            })))
        },
        {
            id: 'documents', title: 'Документы DOCS', products: ['docs', 'complex'],
            columns: ['Документ', 'Вид', 'Договор', 'Статус', 'Согласование', 'Срок исполнения', 'Ответственный'],
            rows: () => docsStore.docs.map(d => {
                const contract = contracts().find(c => c.id === d.contractId);
                return {
                    cells: [d.title, d.type, contract ? contractName(contract) : '', DOC_STATUS[docStatus(d)], d.route && d.route.length ? `${d.route.filter(r => r.decision === 'approved').length} из ${d.route.length}` : '', formatDate(d.due), d.responsible],
                    open: () => showDocument(d)
                };
            })
        },
        {
            id: 'files', title: 'Файлы специалистов', products: ['office', 'complex'],
            columns: ['Специалист', 'Реестр', 'Файл', 'Тип', 'Дата'],
            rows: () => {
                const data = staff();
                const specialists = typeof HOME_SPECIALISTS !== 'undefined' ? HOME_SPECIALISTS : [];
                return specialists.flatMap(s => ((data[s.slug] || {}).registry || []).map(f => ({
                    cells: [s.title.ru || s.title, (s.registry && s.registry.ru) || 'Реестр', f.name, f.type || '', formatStamp(f.date)],
                    open: () => go('staff', s.slug)
                })));
            }
        }
    ];

    function renderRegistries() {
        const available = REGISTRIES.filter(r => r.products.includes(settings.product));
        const active = available.find(r => r.id === currentItem()) || available[0];
        const search = h('input', { type: 'search', placeholder: 'Поиск по реестру', class: 'home-cab__search' });
        const tableWrap = h('div', { class: 'home-cab__table-wrap' });

        const draw = () => {
            const q = search.value.trim().toLowerCase();
            const rows = active.rows().filter(r => !q || r.cells.join(' ').toLowerCase().includes(q));
            tableWrap.textContent = '';
            if (!rows.length) {
                tableWrap.appendChild(h('p', { class: 'home-ct__none' }, 'Записей нет.'));
                return;
            }
            tableWrap.appendChild(h('table', { class: 'home-cab__table' },
                h('thead', {}, h('tr', {}, active.columns.map(c => h('th', {}, c)))),
                h('tbody', {}, rows.map(r => h('tr', { class: 'home-cab__clickable', onclick: r.open }, r.cells.map(c => h('td', {}, c === undefined || c === null ? '' : String(c))))))));
        };

        const exportCsv = () => {
            const rows = [active.columns, ...active.rows().map(r => r.cells.map(c => c === undefined || c === null ? '' : String(c)))];
            const csv = '﻿' + rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(';')).join('\r\n');
            const link = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: `AIRCHITECT — ${active.title} ${today()}.csv` });
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 10000);
        };

        search.addEventListener('input', draw);
        panel.append(
            h('p', { class: 'home-eyebrow' }, 'Реестры'),
            h('h1', { class: 'home-cab__title' }, active.title),
            h('div', { class: 'home-tabs', role: 'tablist' }, available.map(r =>
                h('a', { href: `#registries/${r.id}`, role: 'tab', class: 'home-tab', 'aria-selected': String(r === active) }, r.title))),
            h('section', { class: 'home-ct__block' },
                h('div', { class: 'home-ct__block-head' },
                    h('h2', { class: 'home-ct__block-title' }, `${active.rows().length} записей`),
                    h('div', { class: 'home-ct__filters' }, search,
                        h('button', { type: 'button', class: 'home-btn home-btn--secondary home-cab__small', onclick: exportCsv }, 'Выгрузить CSV'))),
                tableWrap));
        draw();
    }

    // ---- Settings --------------------------------------------------------------

    function renderSettings() {
        const company = h('input', { type: 'text', value: settings.company || '' });
        const user = h('input', { type: 'text', value: settings.user || '', placeholder: 'Фамилия И.О.' });
        const product = h('select', {}, Object.entries(PRODUCTS).map(([k, p]) => h('option', { value: k, selected: k === settings.product }, `${p.title} — ${p.code}`)));
        const importInput = h('input', { type: 'file', accept: '.json', hidden: true });

        importInput.addEventListener('change', async () => {
            const file = importInput.files[0];
            if (!file) return;
            try {
                const backup = JSON.parse(await file.text());
                if (backup.format !== 'airchitect-cabinet-backup') throw new Error();
                if (!confirm('Заменить данные кабинета в этом браузере данными из резервной копии?')) return;
                Object.entries(KEYS).forEach(([name, key]) => {
                    if (backup.data[name] !== undefined) localStorage.setItem(key, JSON.stringify(backup.data[name]));
                });
                settings = read(KEYS.cabinet, {});
                docsStore = read(KEYS.docs, { docs: [] });
                notify('Данные восстановлены. Файлы, приложенные к записям, в резервную копию не входят.');
                renderSection();
            } catch (e) {
                notify('Файл не похож на резервную копию кабинета AIRCHITECT.');
            }
        });

        panel.append(
            h('p', { class: 'home-eyebrow' }, 'Настройки'),
            h('h1', { class: 'home-cab__title' }, 'Кабинет'),
            h('form', {
                class: 'home-ct__form', onsubmit: e => {
                    e.preventDefault();
                    settings = { ...settings, company: company.value.trim(), user: user.value.trim(), product: product.value };
                    saveSettings();
                    notify('Настройки сохранены.');
                    renderSection();
                }
            },
            h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, 'Компания'), company),
            h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, 'Пользователь'), user, h('span', { class: 'home-dialog__hint' }, 'Подставляется ответственным и в историю действий')),
            h('label', { class: 'home-dialog__field home-ct__wide' }, h('span', { class: 'home-dialog__label' }, 'Решение'), product,
                h('span', { class: 'home-dialog__hint' }, 'OFFICE работает самостоятельно. В COMPLEX проекты уведомлений из «Контрактов» можно передавать на согласование в «Документы».')),
            h('div', { class: 'home-ct__wide home-ct__info-actions' }, h('button', { type: 'submit', class: 'home-btn home-btn--primary' }, 'Сохранить'))),
            block('Данные',
                h('div', { class: 'home-cab__data' },
                    h('p', { class: 'home-chat__text' }, 'Кабинет работает в открытом доступе: договоры, документы, диалоги и реестры хранятся только в этом браузере. Сохраняйте резервную копию, чтобы перенести данные на другое устройство.'),
                    h('div', { class: 'home-ct__actions' },
                        h('button', {
                            type: 'button', class: 'home-btn home-btn--secondary', onclick: () => {
                                const backup = { format: 'airchitect-cabinet-backup', created: new Date().toISOString(), data: {} };
                                Object.entries(KEYS).forEach(([name, key]) => { backup.data[name] = read(key, null); });
                                const link = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })), download: `AIRCHITECT кабинет ${today()}.json` });
                                link.click();
                                setTimeout(() => URL.revokeObjectURL(link.href), 10000);
                            }
                        }, 'Сохранить резервную копию'),
                        h('button', { type: 'button', class: 'home-btn home-btn--secondary', onclick: () => importInput.click() }, 'Восстановить из копии'),
                        h('button', {
                            type: 'button', class: 'home-btn home-btn--secondary', onclick: () => {
                                if (!confirm('Удалить все данные кабинета из этого браузера? Действие необратимо.')) return;
                                Object.values(KEYS).forEach(key => localStorage.removeItem(key));
                                indexedDB.deleteDatabase('airchitect-contract-files');
                                settings = {};
                                docsStore = { docs: [] };
                                location.hash = '';
                                renderSection();
                            }
                        }, 'Удалить все данные'),
                        importInput),
                    h('p', { class: 'home-dialog__hint' }, 'Резервная копия содержит записи кабинета. Файлы, приложенные к договорам и документам, в неё не входят.'))));
    }

    renderSection();
});
