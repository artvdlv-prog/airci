// Contracts (contracts.html): contract cards with the "Исполнение договора" tab.
// Obligations, deadlines, notices, notice journal, execution marks, events and history.
// Data is kept in this browser: records in localStorage, attached files in IndexedDB.
// Loaded after script.js (uses HOME_ROUTES, HOME_ASSISTANT_API, HOME_DOCS_CONNECTED, window.AirchitectOpenSpecialist).

document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('[data-contracts]');
    if (!root) return;

    const STORE_KEY = 'airchitect-contracts-v1';
    const SOON_DAYS = 7;
    // DOCS is connected when the cabinet runs AIRCHITECT DOCS or COMPLEX (or by the site setting)
    const cabinetProduct = (() => {
        try {
            return (JSON.parse(localStorage.getItem('airchitect-cabinet-v1')) || {}).product;
        } catch (e) {
            return null;
        }
    })();
    const DOCS_CONNECTED = cabinetProduct === 'complex' || cabinetProduct === 'docs' || (typeof HOME_DOCS_CONNECTED !== 'undefined' && HOME_DOCS_CONNECTED);
    const DOCS_KEY = 'airchitect-docs-v1';
    const readDocs = () => {
        try {
            return JSON.parse(localStorage.getItem(DOCS_KEY)) || { docs: [] };
        } catch (e) {
            return { docs: [] };
        }
    };
    const DOCS_LABEL = { draft: 'передано в DOCS', approval: 'на согласовании в DOCS', approved: 'согласовано в DOCS', rejected: 'отклонено в DOCS', done: 'исполнено в DOCS' };
    const withCabinet = query => (document.documentElement.classList.contains('is-cabinet') ? `${query}&cabinet=1` : query);
    const CHAT_API = typeof HOME_ASSISTANT_API !== 'undefined' ? HOME_ASSISTANT_API : null;
    const EXTRACT_API = CHAT_API ? CHAT_API.replace(/\/chat$/, '/extract') : null;

    const PARTIES = { customer: 'Заказчик', contractor: 'Подрядчик', both: 'Обе стороны' };
    const METHODS = ['Почта России, заказное письмо с уведомлением', 'Курьерская служба', 'Нарочно под подпись', 'Электронный документооборот', 'Электронная почта', 'Иной способ'];

    // Notice drafts are templates; legal references only where the basis is certain
    const NOTICE_TYPES = {
        start: {
            title: 'Уведомление о начале работ',
            body: 'уведомляем о начале выполнения работ по договору',
            request: 'обеспечить доступ на объект и передачу необходимой документации'
        },
        obstacle: {
            title: 'Предупреждение об обстоятельствах, препятствующих выполнению работ',
            body: 'в порядке статьи 716 Гражданского кодекса РФ предупреждаем о выявленных обстоятельствах, которые грозят годности или прочности результата работ либо создают невозможность их завершения в срок',
            request: 'дать указания о дальнейших действиях'
        },
        extra: {
            title: 'Уведомление о необходимости выполнения дополнительных работ',
            body: 'в порядке пункта 3 статьи 743 Гражданского кодекса РФ сообщаем о необходимости выполнения дополнительных работ, не учтённых в технической документации, и связанном с этим увеличении сметной стоимости',
            request: 'сообщить о согласии на выполнение дополнительных работ'
        },
        delay: {
            title: 'Уведомление о переносе сроков выполнения работ',
            body: 'сообщаем о необходимости переноса сроков выполнения работ по причинам, указанным ниже',
            request: 'согласовать новые сроки выполнения работ'
        },
        breach: {
            title: 'Уведомление о нарушении обязательств по договору',
            body: 'сообщаем о нарушении обязательств по договору, указанных ниже',
            request: 'устранить нарушение'
        },
        suspend: {
            title: 'Уведомление о приостановке работ',
            body: 'в связи с неисполнением встречных обязательств, указанных ниже, и в порядке статьи 719 Гражданского кодекса РФ уведомляем о приостановке выполнения работ',
            request: 'исполнить встречные обязательства'
        },
        payment: {
            title: 'Уведомление о необходимости оплаты',
            body: 'сообщаем, что оплата по договору, указанная ниже, не поступила в установленный срок',
            request: 'произвести оплату либо сообщить о причинах задержки'
        },
        claim: {
            title: 'Претензия',
            body: 'в порядке досудебного урегулирования направляем претензию в связи с неисполнением (ненадлежащим исполнением) обязательств по договору, указанных ниже',
            request: 'исполнить обязательства (уплатить задолженность, неустойку) либо дать мотивированный ответ'
        },
        other: {
            title: 'Уведомление по договору',
            body: 'сообщаем следующее',
            request: 'рассмотреть настоящее уведомление'
        }
    };
    const NOTICE_STATUS = { draft: 'Проект', sent: 'Отправлено', received: 'Получено адресатом' };

    const el = {
        list: root.querySelector('[data-ct-list]'),
        empty: root.querySelector('[data-ct-empty]'),
        card: root.querySelector('[data-ct-card]'),
        title: root.querySelector('[data-ct-title]'),
        meta: root.querySelector('[data-ct-meta]'),
        alert: root.querySelector('[data-ct-alert]'),
        stats: root.querySelector('[data-ct-stats]'),
        obligations: root.querySelector('[data-ct-obligations]'),
        notices: root.querySelector('[data-ct-notices]'),
        history: root.querySelector('[data-ct-history]'),
        info: root.querySelector('[data-ct-info]'),
        terms: root.querySelector('[data-ct-terms]'),
        filterStatus: root.querySelector('[data-ct-filter-status]'),
        filterPeriod: root.querySelector('[data-ct-filter-period]'),
        dialog: document.querySelector('[data-ct-dialog]'),
        dialogTitle: document.querySelector('[data-ct-dialog-title]'),
        dialogBody: document.querySelector('[data-ct-dialog-body]'),
        dialogFoot: document.querySelector('[data-ct-dialog-foot]'),
        dialogError: document.querySelector('[data-ct-dialog-error]')
    };

    // ---- Storage ----------------------------------------------------------

    // Shared rules of contracts (contract-core.js): statuses, warnings, readiness to close
    const CC = window.AirchitectContracts;
    let data = CC.read();
    data.contracts.forEach(CC.ensure);
    const save = () => {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(data));
        } catch (e) {
            notify('Не удалось сохранить данные в браузере: хранилище заполнено или недоступно.');
        }
        // The contract specialist's workspace on this page redraws from the same store
        document.dispatchEvent(new CustomEvent('contractschange', { detail: { source: 'card' } }));
    };

    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const today = () => new Date().toISOString().slice(0, 10);

    // Attached files live in IndexedDB (localStorage is too small for documents)
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
        const tx = db.transaction('files', 'readonly');
        const request = tx.objectStore('files').get(meta.id);
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

    async function readFileBlob(meta) {
        const db = await filesDb;
        if (!db || !meta) return null;
        return new Promise(resolve => {
            const request = db.transaction('files', 'readonly').objectStore('files').get(meta.id);
            request.onsuccess = () => resolve(request.result ? request.result.blob : null);
            request.onerror = () => resolve(null);
        });
    }

    // ---- State ------------------------------------------------------------

    let currentId = (new URLSearchParams(location.search).get('id') || '').split('~')[0] || (data.contracts[0] && data.contracts[0].id);
    const current = () => data.contracts.find(c => c.id === currentId);

    function log(contract, text) {
        contract.log = contract.log || [];
        contract.log.unshift({ at: Date.now(), text });
    }

    // ---- Dates and statuses -------------------------------------------------

    function daysUntil(date) {
        if (!date) return null;
        const ms = new Date(date + 'T00:00:00') - new Date(today() + 'T00:00:00');
        return Math.round(ms / 86400000);
    }

    // A passed deadline without a mark of execution needs confirmation; a breach is recorded by the user
    const obligationStatus = CC.obligationStatus;
    const STATUS_LABEL = CC.STATUS_LABEL;

    function formatDate(date) {
        if (!date) return '';
        const [y, m, d] = date.split('-');
        return `${d}.${m}.${y}`;
    }

    function formatStamp(ts) {
        return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function dueText(o) {
        if (!o.due) return o.condition ? `Срок: ${o.condition}` : 'Срок не указан';
        const days = daysUntil(o.due);
        const when = formatDate(o.due);
        if (o.status === 'done') return `Срок: ${when}`;
        if (days < 0) return o.status === 'breached' ? `Срок: ${when} · не исполнено (${formatDate(o.breachAt)})` : `Срок: ${when} · прошёл ${-days} дн. назад, нет сведений об исполнении`;
        if (days === 0) return `Срок: сегодня, ${when}`;
        return `Срок: ${when} · через ${days} дн.`;
    }

    // ---- Small DOM helpers ------------------------------------------------

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

    function fileLinks(files) {
        if (!files || !files.length) return null;
        return h('span', { class: 'home-ct__files' },
            files.map(f => h('button', { type: 'button', class: 'home-ct__file', onclick: () => openFile(f) }, f.name)));
    }

    // ---- Dialog -----------------------------------------------------------

    // fields: [{ name, label, type, value, options, required, hint }]
    function openDialog(title, fields, submitLabel, onSubmit, extra) {
        el.dialogTitle.textContent = title;
        el.dialogBody.textContent = '';
        el.dialogError.hidden = true;
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
            } else if (f.type === 'checkbox') {
                input = h('input', { type: 'checkbox', name: f.name, checked: !!f.value });
                el.dialogBody.appendChild(h('label', { class: 'home-dialog__check' }, input, f.label));
                return;
            } else {
                input = h('input', { type: f.type || 'text', name: f.name, required: f.required });
                input.value = f.value || '';
            }
            el.dialogBody.appendChild(h('label', { class: 'home-dialog__field' },
                h('span', { class: 'home-dialog__label' }, f.label + (f.required ? ' *' : '')),
                input,
                f.hint ? h('span', { class: 'home-dialog__hint' }, f.hint) : null));
        });
        if (extra) el.dialogBody.appendChild(extra);

        el.dialogFoot.textContent = '';
        el.dialogFoot.append(
            h('button', { type: 'button', class: 'home-btn home-btn--secondary', onclick: () => el.dialog.close() }, 'Отмена'),
            h('button', {
                type: 'submit', class: 'home-btn home-btn--primary', onclick: async e => {
                    e.preventDefault();
                    const form = el.dialog.querySelector('form');
                    if (!form.reportValidity()) return;
                    const values = {};
                    fields.forEach(f => {
                        const input = form.elements[f.name];
                        if (!input) return;
                        values[f.name] = f.type === 'file' ? [...input.files] : f.type === 'checkbox' ? input.checked : input.value.trim();
                    });
                    const error = await onSubmit(values);
                    if (error) {
                        el.dialogError.textContent = error;
                        el.dialogError.hidden = false;
                        return;
                    }
                    el.dialog.close();
                    render();
                }
            }, submitLabel)
        );
        el.dialog.showModal();
    }

    document.querySelector('[data-ct-dialog-close]').addEventListener('click', () => el.dialog.close());

    const obligationOptions = (contract, withEmpty = true) => [
        ...(withEmpty ? [['', '— не выбрано —']] : []),
        ...contract.obligations.map(o => [o.id, `${o.clause ? 'п. ' + o.clause + ' — ' : ''}${o.text.slice(0, 80)}`])
    ];

    // ---- Contract list and card -------------------------------------------

    function render() {
        renderList();
        const contract = current();
        el.empty.hidden = !!contract;
        el.card.hidden = !contract;
        if (!contract) return;

        if (CC.selected() !== contract.id) {
            CC.select(contract.id);
            document.dispatchEvent(new Event('contractselect'));
        }
        el.title.textContent = `Договор${contract.number ? ' № ' + contract.number : ''}${contract.date ? ' от ' + formatDate(contract.date) : ''}`;
        el.meta.textContent = [contract.subject, contract.customer && `Заказчик: ${contract.customer}`, contract.contractor && `Подрядчик: ${contract.contractor}`]
            .filter(Boolean).join(' · ') || 'Заполните сведения о договоре';
        document.title = `${el.title.textContent} — Договоры | AIRCHITECT`;

        // Objects linked to this contract (Объекты): readiness of ИД affects acceptance and payment
        let linked = [];
        try {
            linked = ((JSON.parse(localStorage.getItem('airchitect-objects-v1')) || {}).objects || []).filter(ob => (ob.contractIds || []).includes(contract.id));
        } catch (e) {
            linked = [];
        }
        if (linked.length) {
            el.meta.textContent += ' · ' + linked.map(ob => {
                const signed = ob.id.filter(d => d.status === 'signed').length;
                return `ИД «${ob.name}»: ${ob.id.length ? Math.round(signed / ob.id.length * 100) : 0}%`;
            }).join(', ');
            // Acts КС-2 of this contract (Объекты → Формы КС): signed and awaiting the customer
            const acts = linked.flatMap(ob => (ob.ks2 || []).filter(a => a.contractId === contract.id));
            if (acts.length) {
                const pending = acts.filter(a => ['sent', 'resent', 'remarks'].includes(a.status)).length;
                el.meta.textContent += ` · КС-2: подписано ${acts.filter(a => a.status === 'signed').length} из ${acts.length}${pending ? `, на подписании ${pending}` : ''}`;
            }
        }

        renderExecution(contract);
        renderInfo(contract);
        renderTerms(contract);
    }

    function renderList() {
        el.list.textContent = '';
        data.contracts.forEach(c => {
            const overdue = c.obligations.some(o => obligationStatus(o) === 'overdue');
            const soon = c.obligations.some(o => obligationStatus(o) === 'soon');
            el.list.appendChild(h('li', {},
                h('a', {
                    href: withCabinet(`contracts.html?id=${c.id}`),
                    class: 'home-staff__item' + (c.id === currentId ? ' is-active' : ''),
                    'aria-current': c.id === currentId ? 'page' : null,
                    onclick: e => {
                        e.preventDefault();
                        currentId = c.id;
                        window.history.replaceState(null, '', withCabinet(`?id=${c.id}`));
                        render();
                    }
                },
                h('span', { class: 'home-staff__item-title' }, `№ ${c.number || 'без номера'}`,
                    overdue ? h('span', { class: 'home-ct__dot home-ct__dot--overdue', title: 'Есть просроченные обязательства' }) :
                        soon ? h('span', { class: 'home-ct__dot', title: 'Скоро срок' }) : null),
                h('span', { class: 'home-staff__item-text' }, c.subject || c.contractor || 'Договор'))));
        });
    }

    function renderExecution(contract) {
        const statuses = contract.obligations.map(obligationStatus);
        const count = s => statuses.filter(x => x === s).length;
        const waitingProof = contract.notices.filter(n => n.status === 'draft').length;

        // Deadline control: breaches, passed deadlines awaiting confirmation and upcoming obligations
        const overdue = count('overdue');
        const pastdue = count('pastdue');
        const soon = count('soon');
        el.alert.hidden = !(overdue || pastdue || soon);
        el.alert.className = 'home-ct__alert' + (overdue ? ' home-ct__alert--overdue' : '');
        el.alert.textContent = [
            overdue ? `Не исполнено обязательств: ${overdue}. Проверьте необходимость уведомления или претензии.` : '',
            pastdue ? `Срок прошёл, сведений об исполнении нет: ${pastdue} — подтвердите исполнение или отметьте неисполнение.` : '',
            soon ? `Срок в ближайшие ${SOON_DAYS} дней: ${soon}.` : ''
        ].filter(Boolean).join(' ');

        el.stats.textContent = '';
        [
            ['Обязательств', contract.obligations.length],
            ['Не подтверждены', count('review')],
            ['Скоро срок', soon],
            ['Срок прошёл, требуют подтверждения', pastdue],
            ['Не исполнено', overdue],
            ['Исполнено', count('done')],
            ['Уведомлений в проекте', waitingProof]
        ].forEach(([label, value]) => el.stats.appendChild(h('li', {}, h('span', { class: 'home-ct__stat-value' }, String(value)), h('span', { class: 'home-ct__stat-label' }, label))));

        renderObligations(contract);
        renderNotices(contract);
        renderHistory(contract);
    }

    function renderObligations(contract) {
        const status = el.filterStatus.value;
        const period = el.filterPeriod.value;
        const items = contract.obligations
            .filter(o => status === 'all' || obligationStatus(o) === status)
            .filter(o => {
                const days = daysUntil(o.due);
                if (period === 'all') return true;
                if (period === 'none') return !o.due;
                if (period === 'past') return days !== null && days < 0;
                return days !== null && days >= 0 && days <= Number(period);
            })
            .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));

        el.obligations.textContent = '';
        if (!items.length) {
            el.obligations.appendChild(h('li', { class: 'home-ct__none' },
                contract.obligations.length ? 'Нет обязательств по выбранным фильтрам.' : 'Обязательств пока нет. Добавьте их вручную или извлеките из файла договора.'));
            return;
        }
        items.forEach(o => {
            const s = obligationStatus(o);
            const actions = [];
            if (!o.confirmed) actions.push(['Подтвердить', () => confirmObligation(contract, o)]);
            if (o.status !== 'done') actions.push(['Отметить исполнение', () => markDone(contract, o)]);
            if (o.status !== 'done' && o.status !== 'breached' && o.confirmed) actions.push(['Не исполнено', () => markBreached(contract, o)]);
            actions.push(['Уведомление', () => prepareNotice(contract, o)]);
            actions.push(['Изменить', () => editObligation(contract, o)]);
            actions.push(['Юрист', () => askExpert('construction-lawyer', contract, o)]);

            el.obligations.appendChild(h('li', { class: 'home-ct__row' },
                h('div', { class: 'home-ct__row-main' },
                    h('p', { class: 'home-ct__row-title' },
                        h('span', { class: `home-ct__badge home-ct__badge--${s}` }, STATUS_LABEL[s]),
                        o.text),
                    h('p', { class: 'home-ct__row-meta' }, [
                        PARTIES[o.party] || '',
                        o.clause ? `п. ${o.clause}` : 'пункт не указан',
                        dueText(o),
                        o.responsible ? `Ответственный: ${o.responsible}` : '',
                        o.source === 'ai' ? 'извлечено специалистом' : o.source === 'auto' ? 'найдено автоматически' : ''
                    ].filter(Boolean).join(' · ')),
                    o.condition && o.due ? h('p', { class: 'home-ct__row-meta' }, `Условие: ${o.condition}`) : null,
                    o.status === 'done' ? h('p', { class: 'home-ct__row-meta' },
                        `Исполнено ${formatDate(o.doneAt)}${o.doneBy ? ', ' + o.doneBy : ''}${o.doneNote ? ' — ' + o.doneNote : ''}`) : null,
                    fileLinks(o.files)),
                h('div', { class: 'home-record__actions' },
                    actions.map(([label, fn]) => h('button', { type: 'button', onclick: fn }, label)))));
        });
    }

    function renderNotices(contract) {
        el.notices.textContent = '';
        if (!contract.notices.length) {
            el.notices.appendChild(h('li', { class: 'home-ct__none' }, 'Уведомлений пока нет. Нажмите «Подготовить уведомление».'));
            return;
        }
        contract.notices.forEach(n => {
            const obligation = contract.obligations.find(o => o.id === n.obligationId);
            const actions = [['Текст', () => showNotice(contract, n)]];
            if (n.status === 'draft') actions.push(['Отметить отправку', () => markSent(contract, n)]);
            if (n.status === 'sent') actions.push(['Отметить получение', () => markReceived(contract, n)]);
            // AIRCHITECT DOCS: the notice draft goes to the document registry for approval
            const docsEntry = DOCS_CONNECTED ? readDocs().docs.find(d => d.noticeId === n.id) : null;
            if (n.status === 'draft' && DOCS_CONNECTED && !docsEntry) actions.push(['Согласовать в DOCS', () => sendToDocs(contract, n)]);
            actions.push(['Юрист', () => askExpert('construction-lawyer', contract, obligation, n)]);

            el.notices.appendChild(h('li', { class: 'home-ct__row' },
                h('div', { class: 'home-ct__row-main' },
                    h('p', { class: 'home-ct__row-title' },
                        h('span', { class: `home-ct__badge home-ct__badge--notice-${n.status}` }, NOTICE_STATUS[n.status]),
                        NOTICE_TYPES[n.type].title),
                    h('p', { class: 'home-ct__row-meta' }, [
                        n.clause ? `Основание: п. ${n.clause}` : (obligation ? 'Основание: обязательство без пункта' : 'Основание: договор'),
                        n.addressee ? `Адресат: ${n.addressee}` : '',
                        n.due ? `Срок направления: ${formatDate(n.due)}` : ''
                    ].filter(Boolean).join(' · ')),
                    n.status !== 'draft' ? h('p', { class: 'home-ct__row-meta' },
                        `Отправлено ${formatDate(n.sentAt)} · ${n.method} · подтверждение: ${n.sentRef || 'документ'}`) : null,
                    n.status === 'received' ? h('p', { class: 'home-ct__row-meta' },
                        `Получено ${formatDate(n.receivedAt)}${n.receivedRef ? ' · ' + n.receivedRef : ''}`) : null,
                    fileLinks([...(n.sentFiles || []), ...(n.receivedFiles || [])]),
                    docsEntry ? h('p', { class: 'home-ct__row-meta' }, `DOCS: ${DOCS_LABEL[docsEntry.status] || docsEntry.status}`) : null,
                    n.status === 'draft' && !DOCS_CONNECTED ? h('p', { class: 'home-ct__row-meta home-ct__muted' },
                        'Согласование и отправка через AIRCHITECT DOCS станут доступны после подключения электронного документооборота.') : null),
                h('div', { class: 'home-record__actions' },
                    actions.map(([label, fn]) => h('button', { type: 'button', onclick: fn }, label)))));
        });
    }

    function renderHistory(contract) {
        el.history.textContent = '';
        const entries = [
            ...(contract.events || []).map(e => ({ at: new Date(e.date + 'T12:00:00').getTime(), event: e })),
            ...(contract.log || []).map(l => ({ at: l.at, log: l }))
        ].sort((a, b) => b.at - a.at);
        if (!entries.length) {
            el.history.appendChild(h('li', { class: 'home-ct__none' }, 'История пока пуста.'));
            return;
        }
        entries.slice(0, 60).forEach(entry => {
            if (entry.event) {
                const e = entry.event;
                el.history.appendChild(h('li', { class: 'home-ct__event' },
                    h('span', { class: 'home-ct__history-date' }, formatDate(e.date)),
                    h('span', {}, h('strong', {}, e.title), e.text ? ` — ${e.text}` : '', fileLinks(e.files))));
            } else {
                el.history.appendChild(h('li', {},
                    h('span', { class: 'home-ct__history-date' }, formatStamp(entry.log.at)),
                    h('span', {}, entry.log.text)));
            }
        });
    }

    function renderInfo(contract) {
        el.info.textContent = '';
        const fields = [
            ['number', 'Номер договора'], ['date', 'Дата договора', 'date'], ['subject', 'Предмет договора'],
            ['customer', 'Заказчик'], ['contractor', 'Подрядчик'], ['price', 'Цена договора'],
            ['start', 'Начало работ', 'date'], ['end', 'Окончание работ', 'date']
        ];
        fields.forEach(([name, label, type]) => {
            const input = h('input', { type: type || 'text', name });
            input.value = contract[name] || '';
            el.info.appendChild(h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, label), input));
        });
        const fileInput = h('input', { type: 'file', name: 'file', accept: '.pdf,.docx,.txt' });
        el.info.appendChild(h('label', { class: 'home-dialog__field home-ct__wide' },
            h('span', { class: 'home-dialog__label' }, 'Файл договора (PDF, DOCX или TXT)'),
            contract.file ? h('span', {}, fileLinks([contract.file])) : null,
            fileInput));
        el.info.appendChild(h('div', { class: 'home-ct__wide home-ct__info-actions' },
            h('button', { type: 'submit', class: 'home-btn home-btn--primary' }, 'Сохранить'),
            h('button', { type: 'button', class: 'home-btn home-btn--secondary', onclick: () => openCounterparty('стороны договора') }, 'Проверить контрагента'),
            h('button', {
                type: 'button', class: 'home-btn home-btn--secondary', onclick: () => {
                    if (!confirm('Удалить договор со всеми обязательствами и уведомлениями из этого браузера?')) return;
                    data.contracts = data.contracts.filter(c => c.id !== contract.id);
                    currentId = data.contracts[0] && data.contracts[0].id;
                    save();
                    render();
                }
            }, 'Удалить договор')));
    }

    el.info.addEventListener('submit', async e => {
        e.preventDefault();
        const contract = current();
        const form = el.info;
        ['number', 'date', 'subject', 'customer', 'contractor', 'price', 'start', 'end'].forEach(name => {
            contract[name] = form.elements[name].value.trim();
        });
        const file = form.elements.file.files[0];
        if (file) {
            [contract.file] = await storeFiles([file]);
            log(contract, `Приложен файл договора «${file.name}»`);
        }
        log(contract, 'Изменены сведения о договоре');
        save();
        render();
        notify('Сведения о договоре сохранены.');
        if (file) extractObligations(contract, true);
    });

    // ---- Actions ------------------------------------------------------------

    function addContract() {
        openDialog('Новый договор', [
            { name: 'number', label: 'Номер договора', required: true },
            { name: 'date', label: 'Дата договора', type: 'date' },
            { name: 'subject', label: 'Предмет договора', hint: 'Например: строительство жилого дома по адресу…' },
            { name: 'customer', label: 'Заказчик' },
            { name: 'contractor', label: 'Подрядчик' },
            { name: 'file', label: 'Файл договора (PDF, DOCX или TXT)', type: 'file', hint: 'Контрольные точки будут найдены автоматически' }
        ], 'Добавить', async v => {
            const contract = {
                id: uid(), number: v.number, date: v.date, subject: v.subject, customer: v.customer, contractor: v.contractor,
                price: '', start: '', end: '', file: null, obligations: [], notices: [], events: [], log: []
            };
            if (v.file.length) [contract.file] = await storeFiles(v.file.slice(0, 1));
            log(contract, 'Договор добавлен');
            data.contracts.unshift(contract);
            currentId = contract.id;
            window.history.replaceState(null, '', withCabinet(`?id=${contract.id}`));
            save();
            if (contract.file) setTimeout(() => extractObligations(contract, true), 0);
        });
    }

    function obligationFields(o = {}) {
        return [
            { name: 'text', label: 'Обязательство', type: 'textarea', rows: 3, value: o.text, required: true },
            { name: 'party', label: 'Сторона', type: 'select', value: o.party || 'contractor', options: Object.entries(PARTIES) },
            { name: 'clause', label: 'Пункт договора', value: o.clause, hint: 'Например: 4.2 или 5.1.3', required: true },
            { name: 'due', label: 'Контрольная дата', type: 'date', value: o.due },
            { name: 'condition', label: 'Условие или порядок исполнения', type: 'textarea', rows: 2, value: o.condition, hint: 'Например: в течение 5 рабочих дней после подписания акта' },
            { name: 'responsible', label: 'Ответственный', value: o.responsible }
        ];
    }

    function addObligation(contract) {
        openDialog('Новое обязательство', obligationFields(), 'Добавить', v => {
            contract.obligations.push({ id: uid(), ...v, status: 'active', confirmed: true, source: 'manual', files: [] });
            log(contract, `Добавлено обязательство (п. ${v.clause}): ${v.text.slice(0, 80)}`);
            save();
        });
    }

    function editObligation(contract, o) {
        openDialog('Изменить обязательство', obligationFields(o), 'Сохранить', v => {
            Object.assign(o, v, { confirmed: true });
            log(contract, `Изменено и подтверждено обязательство (п. ${v.clause})`);
            save();
        });
    }

    function confirmObligation(contract, o) {
        openDialog('Подтвердить обязательство', obligationFields(o), 'Подтвердить', v => {
            Object.assign(o, v, { confirmed: true });
            log(contract, `Подтверждено обязательство (п. ${v.clause}): ${v.text.slice(0, 80)}`);
            save();
        });
    }

    // Breach is recorded only on confirmed facts, with the basis
    function markBreached(contract, o) {
        openDialog('Обязательство не исполнено', [
            { name: 'date', label: 'Дата фиксации', type: 'date', value: today(), required: true },
            { name: 'basis', label: 'Чем подтверждается неисполнение', type: 'textarea', rows: 2, required: true, hint: 'Письмо, акт, переписка, отсутствие документа на дату' },
            { name: 'files', label: 'Подтверждающие документы', type: 'file' }
        ], 'Отметить', async v => {
            o.status = 'breached';
            o.breachAt = v.date;
            o.breachBasis = v.basis;
            o.files = [...(o.files || []), ...(await storeFiles(v.files))];
            log(contract, `Отмечено неисполнение (п. ${o.clause || '—'}): ${o.text.slice(0, 80)} — ${v.basis}`);
            save();
        });
    }

    function markDone(contract, o) {
        const fields = [
            ...(o ? [] : [{ name: 'obligation', label: 'Обязательство', type: 'select', required: true, options: obligationOptions(contract, false).filter(([id]) => contract.obligations.find(x => x.id === id).status !== 'done') }]),
            { name: 'doneAt', label: 'Дата исполнения', type: 'date', value: today(), required: true },
            { name: 'doneBy', label: 'Ответственный', value: o && o.responsible },
            { name: 'doneNote', label: 'Комментарий', type: 'textarea', rows: 2 },
            { name: 'files', label: 'Подтверждающие документы', type: 'file', hint: 'Акт, письмо, фото, накладная' }
        ];
        if (!o && !contract.obligations.some(x => x.status !== 'done')) return notify('Нет неисполненных обязательств.');
        openDialog('Отметить исполнение', fields, 'Отметить', async v => {
            const target = o || contract.obligations.find(x => x.id === v.obligation);
            target.status = 'done';
            target.doneAt = v.doneAt;
            target.doneBy = v.doneBy;
            target.doneNote = v.doneNote;
            target.files = [...(target.files || []), ...(await storeFiles(v.files))];
            log(contract, `Отмечено исполнение (п. ${target.clause || '—'}) ${formatDate(v.doneAt)}${v.doneBy ? ', ' + v.doneBy : ''}; документов: ${v.files.length}`);
            save();
        });
    }

    function addEvent(contract) {
        openDialog('Добавить событие', [
            { name: 'date', label: 'Дата', type: 'date', value: today(), required: true },
            { name: 'title', label: 'Событие', required: true, hint: 'Например: получено письмо заказчика, подписан акт КС-2' },
            { name: 'obligation', label: 'Связанное обязательство', type: 'select', options: obligationOptions(contract) },
            { name: 'text', label: 'Описание', type: 'textarea', rows: 3 },
            { name: 'files', label: 'Документы', type: 'file' }
        ], 'Добавить', async v => {
            contract.events = contract.events || [];
            contract.events.push({ id: uid(), date: v.date, title: v.title, text: v.text, obligationId: v.obligation, files: await storeFiles(v.files) });
            log(contract, `Добавлено событие: ${v.title}`);
            save();
        });
    }

    function draftText(contract, type, obligation, values) {
        const t = NOTICE_TYPES[type];
        const clause = values.clause || (obligation && obligation.clause);
        const sender = values.sender || '________';
        return [
            `Кому: ${values.addressee || '________'}`,
            `От: ${sender}`,
            `Исх. № ____ от ${formatDate(today())}`,
            '',
            t.title.toUpperCase(),
            '',
            `В рамках договора${contract.number ? ' № ' + contract.number : ''}${contract.date ? ' от ' + formatDate(contract.date) : ''}${contract.subject ? ' (' + contract.subject + ')' : ''}${clause ? ', руководствуясь пунктом ' + clause + ' договора,' : ''} ${t.body}.`,
            '',
            obligation ? `Обязательство: ${obligation.text}${obligation.due ? ' (срок: ' + formatDate(obligation.due) + ')' : ''}.` : '',
            values.details ? values.details : 'Обстоятельства: ________',
            '',
            `Просим ${t.request}${values.answerBy ? ' в срок до ' + formatDate(values.answerBy) : ''}.`,
            '',
            'Приложения: ________',
            '',
            'Должность ________ / ФИО ________ / подпись'
        ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n');
    }

    // Counterparty card (counterparties.html) by ИНН: the shared card of the organization
    function openCounterparty(label) {
        const inn = (prompt(`ИНН ${label} (10 цифр — организация, 12 — ИП)`) || '').trim();
        if (!inn) return;
        if (!/^\d{10}$|^\d{12}$/.test(inn)) return notify('ИНН должен содержать 10 или 12 цифр.');
        if (document.documentElement.classList.contains('is-cabinet') && window.parent !== window) window.parent.location.hash = `counterparties/inn:${inn}`;
        else location.href = `counterparties.html?inn=${inn}`;
    }

    // ---- Условия и документы: financial terms, supplementary agreements, risks, documents, closing -----------

    const tblock = (title, tools, ...content) => h('section', { class: 'home-ct__block' },
        h('div', { class: 'home-ct__block-head' }, h('h3', { class: 'home-ct__block-title' }, title), tools ? h('div', { class: 'home-ct__filters' }, tools) : null), ...content);
    const tbtn = (label, fn, primary) => h('button', { type: 'button', class: `home-btn home-btn--${primary ? 'primary' : 'secondary'} home-cab__small`, onclick: fn }, label);
    const LEVELS = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };

    function renderTerms(contract) {
        if (!el.terms) return;
        CC.ensure(contract);
        el.terms.textContent = '';
        const t = contract.terms;
        const field = (name, label, value, hint) => h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, label), h('input', { name, value: value || '' }), hint ? h('span', { class: 'home-dialog__hint' }, hint) : null);
        const form = h('form', { class: 'home-ct__form' },
            field('advancePct', 'Аванс, %', t.advancePct), field('retentionPct', 'Гарантийное удержание, %', t.retentionPct),
            field('paymentTerms', 'Порядок и сроки оплаты', t.paymentTerms, 'Например: в течение 10 рабочих дней после подписания КС-2 и КС-3'),
            field('acceptance', 'Порядок приёмки работ', t.acceptance), field('warrantyMonths', 'Гарантийный срок, мес.', t.warrantyMonths), field('penalty', 'Ответственность сторон (неустойка)', t.penalty),
            field('claimDays', 'Срок ответа на претензию, дней', t.claimDays, 'Если договор не устанавливает иной срок — 30 календарных дней (ч. 5 ст. 4 АПК РФ)'),
            h('div', { class: 'home-ct__wide' }, h('button', { type: 'submit', class: 'home-btn home-btn--primary' }, 'Сохранить')));
        form.addEventListener('submit', ev => {
            ev.preventDefault();
            Object.keys(contract.terms).forEach(k => { if (form.elements[k]) contract.terms[k] = form.elements[k].value.trim(); });
            log(contract, 'Изменены финансовые условия');
            save();
            render();
            notify('Сохранено.');
        });
        el.terms.appendChild(tblock(`Финансовые условия · цена ${contract.price || 'не указана'}`, null, h('div', { class: 'home-cf__pad' }, form)));

        // Supplementary agreements: signed ones change the essential terms of the card
        el.terms.appendChild(tblock('Дополнительные соглашения', [tbtn('Подготовить', () => editAmendment(contract), true)], h('ul', { class: 'home-ct__list' }, contract.amendments.length ? contract.amendments.map(a => h('li', { class: 'home-ct__row' },
            h('div', { class: 'home-ct__row-main' }, h('p', { class: 'home-ct__row-title' }, h('span', { class: `home-ct__badge home-ct__badge--${a.status === 'signed' ? 'done' : 'soon'}` }, CC.AMENDMENT_STATUS[a.status]), `№ ${a.number || '—'} от ${formatDate(a.date)} · ${a.subject}`),
                h('p', { class: 'home-ct__row-meta' }, [a.changes.price ? `цена: ${a.changes.price}` : '', a.changes.end ? `окончание работ: ${formatDate(a.changes.end)}` : '', a.changes.start ? `начало работ: ${formatDate(a.changes.start)}` : '', a.reason ? `основание: ${a.reason}` : ''].filter(Boolean).join(' · ') || 'без изменения цены и сроков'),
                a.signedAt ? h('p', { class: 'home-ct__row-meta' }, `Подписано ${formatDate(a.signedAt)}`) : null, fileLinks(a.files)),
            h('div', { class: 'home-record__actions' }, ...(a.status !== 'signed' ? [h('button', { type: 'button', onclick: () => editAmendment(contract, a) }, 'Изменить'), h('button', { type: 'button', onclick: () => signAmendment(contract, a) }, 'Подписано'), h('button', { type: 'button', onclick: () => { a.status = 'approval'; log(contract, `ДС № ${a.number}: на согласовании`); save(); render(); } }, 'На согласовании')] : []),
                h('button', { type: 'button', onclick: () => askExpert('construction-lawyer', contract, null, { type: 'other', text: `Проект дополнительного соглашения № ${a.number}: ${a.subject}. ${a.text || ''}` }) }, 'Юрист')))) : h('li', { class: 'home-ct__none' }, 'Дополнительных соглашений нет.'))));

        const w = CC.warnings(contract);
        el.terms.appendChild(tblock('Риски и предупреждения', [tbtn('Добавить риск', () => editRisk(contract)), tbtn('Договорной специалист', () => askExpert('contract-specialist', contract))], h('ul', { class: 'home-ct__list' },
            ...w.map(x => h('li', { class: 'home-ct__row' }, h('div', { class: 'home-ct__row-main' }, h('p', { class: 'home-ct__row-title' }, h('span', { class: `home-ct__badge home-ct__badge--${x.level >= 3 ? 'overdue' : x.level === 2 ? 'soon' : 'review'}` }, x.level >= 3 ? 'Нарушение' : x.level === 2 ? 'Внимание' : 'Контроль'), x.text), h('p', { class: 'home-ct__row-meta' }, 'Предупреждение системы по данным карточки')))),
            ...contract.risks.map(x => h('li', { class: 'home-ct__row' }, h('div', { class: 'home-ct__row-main' }, h('p', { class: 'home-ct__row-title' }, h('span', { class: `home-ct__badge home-ct__badge--${x.level === 'high' ? 'overdue' : x.level === 'medium' ? 'soon' : 'review'}` }, LEVELS[x.level]), x.text),
                h('p', { class: 'home-ct__row-meta' }, [x.kind, x.measure ? `мера: ${x.measure}` : '', x.source].filter(Boolean).join(' · '))), h('div', { class: 'home-record__actions' }, h('button', { type: 'button', onclick: () => { contract.risks = contract.risks.filter(y => y !== x); save(); render(); } }, 'Снят')))),
            !w.length && !contract.risks.length ? h('li', { class: 'home-ct__none' }, 'Рисков и предупреждений нет.') : null)));
        if (contract.analyses.length) el.terms.appendChild(tblock('Заключения договорного специалиста', null, h('ul', { class: 'home-ct__list' }, contract.analyses.map(x => h('li', { class: 'home-ct__row' }, h('div', { class: 'home-ct__row-main' },
            h('p', { class: 'home-ct__row-meta' }, `${new Date(x.at).toLocaleString('ru-RU')} · ${x.by}`), h('p', { class: 'home-es__report' }, x.text)))))));

        el.terms.appendChild(tblock('Документы по договору', null, h('ul', { class: 'home-ct__list' }, ...documentsOf(contract).map(d => h('li', { class: 'home-ct__row' }, h('div', { class: 'home-ct__row-main' },
            h('p', { class: 'home-ct__row-title' }, h('span', { class: 'home-ct__badge home-ct__badge--review' }, d.kind), d.file ? h('button', { type: 'button', class: 'home-ct__file', onclick: () => openFile(d.file) }, d.title) : d.title), d.meta ? h('p', { class: 'home-ct__row-meta' }, d.meta) : null))), documentsOf(contract).length ? null : h('li', { class: 'home-ct__none' }, 'Документов нет.'))));

        const ready = CC.closeReadiness(contract);
        el.terms.appendChild(tblock(contract.closed ? `Договор закрыт ${formatDate(contract.closed.date)}` : 'Готовность к закрытию договора', contract.closed ? null : [tbtn('Закрыть договор', () => closeContract(contract, ready))],
            h('ul', { class: 'home-ct__list' }, ready.items.map(i => h('li', { class: 'home-ct__row' }, h('div', { class: 'home-ct__row-main' }, h('p', { class: 'home-ct__row-title' }, h('span', { class: `home-ct__badge home-ct__badge--${i.ok ? 'done' : 'soon'}` }, i.ok ? 'Готово' : 'Не готово'), i.text)))))));
    }

    const documentsOf = CC.documents;

    function editAmendment(contract, a) {
        openDialog(a ? 'Дополнительное соглашение' : 'Новое дополнительное соглашение', [
            { name: 'number', label: 'Номер', value: a ? a.number : String(contract.amendments.length + 1), required: true },
            { name: 'date', label: 'Дата', type: 'date', value: a ? a.date : today(), required: true },
            { name: 'subject', label: 'Предмет', value: a && a.subject, required: true, hint: 'Изменение цены, сроков, объёмов, дополнительные работы' },
            { name: 'price', label: 'Новая цена договора', value: a ? a.changes.price : '', hint: `Сейчас: ${contract.price || 'не указана'}` },
            { name: 'start', label: 'Новая дата начала работ', type: 'date', value: a ? a.changes.start : '' },
            { name: 'end', label: 'Новая дата окончания работ', type: 'date', value: a ? a.changes.end : '', hint: contract.end ? `Сейчас: ${formatDate(contract.end)}` : '' },
            { name: 'reason', label: 'Основание (пункт договора, письмо, акт)', value: a && a.reason },
            { name: 'text', label: 'Текст изменений', type: 'textarea', rows: 4, value: a && a.text }
        ], 'Сохранить', v => {
            const fields = { number: v.number, date: v.date, subject: v.subject, reason: v.reason, text: v.text, changes: { price: v.price, start: v.start, end: v.end } };
            if (a) Object.assign(a, fields); else contract.amendments.push({ id: uid(), status: 'draft', files: [], ...fields });
            log(contract, `${a ? 'Изменён' : 'Подготовлен'} проект ДС № ${v.number}: ${v.subject}`);
            save();
        });
    }

    function signAmendment(contract, a) {
        openDialog(`Подписано ДС № ${a.number}`, [
            { name: 'date', label: 'Дата подписания', type: 'date', value: today(), required: true },
            { name: 'files', label: 'Подписанное соглашение', type: 'file' }
        ], 'Отметить', async v => {
            a.status = 'signed';
            a.signedAt = v.date;
            a.files = [...(a.files || []), ...(await storeFiles(v.files))];
            ['price', 'start', 'end'].forEach(k => { if (a.changes[k]) contract[k] = a.changes[k]; });
            log(contract, `Подписано ДС № ${a.number}: ${a.subject}${a.changes.price ? '; цена ' + a.changes.price : ''}${a.changes.end ? '; окончание ' + formatDate(a.changes.end) : ''}`);
            save();
        });
    }

    function editRisk(contract) {
        openDialog('Риск по договору', [
            { name: 'text', label: 'Риск', type: 'textarea', rows: 2, required: true },
            { name: 'kind', label: 'Вид', type: 'select', options: [['Договорной', 'Договорной'], ['Финансовый', 'Финансовый'], ['Организационный', 'Организационный'], ['Технический', 'Технический']] },
            { name: 'level', label: 'Уровень', type: 'select', value: 'medium', options: Object.entries(LEVELS) },
            { name: 'measure', label: 'Мера снижения' },
            { name: 'source', label: 'Источник', hint: 'Пункт договора, заключение специалиста, письмо' }
        ], 'Добавить', v => {
            contract.risks.push({ id: uid(), at: Date.now(), ...v });
            log(contract, `Добавлен риск: ${v.text.slice(0, 80)}`);
            save();
        });
    }

    function closeContract(contract, ready) {
        openDialog('Закрыть договор', [
            { name: 'date', label: 'Дата закрытия', type: 'date', value: today(), required: true },
            { name: 'note', label: 'Основание', type: 'textarea', rows: 2, required: true, hint: ready.ready ? 'Все пункты готовности выполнены' : 'Не все пункты готовности выполнены — укажите основание закрытия' }
        ], 'Закрыть', v => {
            contract.closed = { date: v.date, note: v.note };
            log(contract, `Договор закрыт ${formatDate(v.date)}: ${v.note}`);
            save();
        });
    }

    function prepareNotice(contract, o) {
        const counterparty = o && o.party === 'contractor' ? contract.customer : contract.contractor;
        openDialog('Подготовить уведомление', [
            { name: 'type', label: 'Вид уведомления', type: 'select', value: 'other', options: Object.entries(NOTICE_TYPES).map(([k, v]) => [k, v.title]) },
            { name: 'obligation', label: 'Обязательство', type: 'select', value: o && o.id, options: obligationOptions(contract) },
            { name: 'clause', label: 'Пункт договора (основание)', value: o && o.clause },
            { name: 'addressee', label: 'Адресат', value: counterparty, required: true },
            { name: 'sender', label: 'Отправитель', value: o && o.party === 'contractor' ? contract.contractor : contract.customer },
            { name: 'due', label: 'Направить не позднее', type: 'date', hint: 'Срок направления уведомления по договору' },
            { name: 'answerBy', label: 'Просим ответить до', type: 'date' },
            { name: 'details', label: 'Обстоятельства', type: 'textarea', rows: 3 }
        ], 'Сформировать проект', v => {
            const obligation = contract.obligations.find(x => x.id === v.obligation);
            const notice = {
                id: uid(), type: v.type, obligationId: v.obligation || '', clause: v.clause || (obligation && obligation.clause) || '',
                addressee: v.addressee, due: v.due, status: 'draft', created: Date.now(),
                text: draftText(contract, v.type, obligation, v)
            };
            contract.notices.unshift(notice);
            log(contract, `Подготовлен проект: ${NOTICE_TYPES[v.type].title} → ${v.addressee}`);
            save();
            setTimeout(() => showNotice(contract, notice), 0);
        });
    }

    function showNotice(contract, n) {
        const area = h('textarea', { name: 'text', rows: 16, class: 'home-ct__notice-text', readonly: n.status !== 'draft' });
        area.value = n.text;
        const note = h('p', { class: 'home-dialog__hint' }, n.status === 'draft'
            ? 'Проект сформирован по шаблону. Проверьте текст и основания перед отправкой; при необходимости обсудите его со юристом.'
            : 'Уведомление отправлено: текст зафиксирован и не редактируется.');
        el.dialogTitle.textContent = NOTICE_TYPES[n.type].title;
        el.dialogBody.textContent = '';
        el.dialogError.hidden = true;
        el.dialogBody.append(area, note);
        el.dialogFoot.textContent = '';
        el.dialogFoot.append(
            h('button', { type: 'button', class: 'home-btn home-btn--secondary', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(area.value); notify('Текст скопирован.'); } }, 'Копировать'),
            h('button', { type: 'button', class: 'home-btn home-btn--secondary', onclick: () => { el.dialog.close(); askExpert('construction-lawyer', contract, contract.obligations.find(o => o.id === n.obligationId), { ...n, text: area.value }); } }, 'Проверить с юристом'),
            n.status === 'draft' ? h('button', {
                type: 'button', class: 'home-btn home-btn--primary', onclick: () => {
                    n.text = area.value;
                    log(contract, `Изменён текст проекта: ${NOTICE_TYPES[n.type].title}`);
                    save();
                    el.dialog.close();
                    render();
                }
            }, 'Сохранить') : null);
        el.dialog.showModal();
    }

    function sendToDocs(contract, n) {
        const store = readDocs();
        const now = Date.now();
        store.docs.unshift({
            id: uid(), title: `${NOTICE_TYPES[n.type].title} — договор${contract.number ? ' № ' + contract.number : ''}`,
            type: 'Уведомление', contractId: contract.id, noticeId: n.id, responsible: '', due: n.due || '',
            text: n.text, files: [], route: [], status: 'draft', created: now,
            history: [{ at: now, text: 'Создан из раздела «Договоры»' }]
        });
        try {
            localStorage.setItem(DOCS_KEY, JSON.stringify(store));
        } catch (e) {
            return notify('Не удалось передать документ: хранилище браузера недоступно.');
        }
        log(contract, `Проект «${NOTICE_TYPES[n.type].title}» передан на согласование в DOCS`);
        save();
        render();
        notify('Проект передан в DOCS. Направьте его на согласование в разделе «Документы» кабинета.');
    }

    // A notice counts as sent only with proof of the actual dispatch
    function markSent(contract, n) {
        openDialog('Отметить отправку уведомления', [
            { name: 'sentAt', label: 'Дата отправки', type: 'date', value: today(), required: true },
            { name: 'method', label: 'Способ направления', type: 'select', options: METHODS.map(m => [m, m]), required: true },
            { name: 'sentRef', label: 'Подтверждение отправки', hint: 'Почтовый идентификатор, номер в ЭДО, отметка о вручении. Можно приложить документ ниже.' },
            { name: 'sentFiles', label: 'Документ, подтверждающий отправку', type: 'file' }
        ], 'Отметить отправку', async v => {
            if (!v.sentRef && !v.sentFiles.length) {
                return 'Без подтверждения фактической отправки уведомление не считается отправленным. Укажите номер отправления или приложите документ.';
            }
            Object.assign(n, { status: 'sent', sentAt: v.sentAt, method: v.method, sentRef: v.sentRef, sentFiles: await storeFiles(v.sentFiles) });
            log(contract, `Отправлено: ${NOTICE_TYPES[n.type].title} → ${n.addressee} (${v.method}, ${v.sentRef || 'документ приложен'})`);
            save();
            return null;
        });
    }

    function markReceived(contract, n) {
        openDialog('Отметить получение адресатом', [
            { name: 'receivedAt', label: 'Дата получения', type: 'date', value: today(), required: true },
            { name: 'receivedRef', label: 'Подтверждение получения', hint: 'Входящий номер, отметка о вручении, уведомление о доставке' },
            { name: 'receivedFiles', label: 'Документ, подтверждающий получение', type: 'file' }
        ], 'Отметить получение', async v => {
            if (!v.receivedRef && !v.receivedFiles.length) {
                return 'Укажите подтверждение получения или приложите документ.';
            }
            Object.assign(n, { status: 'received', receivedAt: v.receivedAt, receivedRef: v.receivedRef, receivedFiles: await storeFiles(v.receivedFiles) });
            log(contract, `Получено адресатом: ${NOTICE_TYPES[n.type].title} (${v.receivedRef || 'документ приложен'})`);
            save();
            return null;
        });
    }

    // ---- Specialists with the contract context --------------------------------

    function contextText(contract, o, notice) {
        const lines = [
            `Договор${contract.number ? ' № ' + contract.number : ''}${contract.date ? ' от ' + formatDate(contract.date) : ''}.`,
            contract.subject ? `Предмет: ${contract.subject}.` : '',
            contract.customer ? `Заказчик: ${contract.customer}.` : '',
            contract.contractor ? `Подрядчик: ${contract.contractor}.` : '',
            contract.price ? `Цена: ${contract.price}.` : '',
            contract.start || contract.end ? `Сроки работ: ${formatDate(contract.start) || '—'} — ${formatDate(contract.end) || '—'}.` : ''
        ];
        if (o) {
            lines.push(`Обязательство (${PARTIES[o.party] || ''}, п. ${o.clause || '—'}): ${o.text}. ${dueText(o)}. Статус: ${STATUS_LABEL[obligationStatus(o)]}.`);
        } else {
            const open = contract.obligations.filter(x => x.status !== 'done').slice(0, 15);
            if (open.length) lines.push('Открытые обязательства:\n' + open.map(x => `— п. ${x.clause || '—'}: ${x.text} (${dueText(x)}; ${STATUS_LABEL[obligationStatus(x)]})`).join('\n'));
        }
        if (notice) lines.push(`Проект уведомления «${NOTICE_TYPES[notice.type].title}»:\n${notice.text}`);
        if (contract.file) lines.push(`Файл договора: «${contract.file.name}» — приложите его в чате, если нужен разбор текста.`);
        lines.push('\nВопрос: ');
        return lines.filter(Boolean).join('\n');
    }

    function askExpert(slug, contract, o, notice) {
        if (typeof window.AirchitectOpenSpecialist !== 'function') return;
        // The contract specialist works with this card: it becomes the selected contract of the workspace
        if (slug === 'contract-specialist' && contract) CC.select(contract.id);
        window.AirchitectOpenSpecialist(slug, contextText(contract, o, notice));
    }

    root.querySelectorAll('[data-ct-expert]').forEach(button => {
        button.addEventListener('click', () => askExpert(button.dataset.ctExpert, current()));
    });

    // ---- Extraction of obligations from the contract file ----------------------

    async function extractObligations(contract, auto = false) {
        if (!contract.file) {
            return notify('Сначала приложите файл договора во вкладке «Сведения о договоре».');
        }
        const blob = await readFileBlob(contract.file);
        if (!blob) return notify('Файл договора не найден в браузере. Приложите его заново.');
        const extractor = window.AirchitectContractExtract;
        notify(EXTRACT_API ? 'Специалист читает договор. Это может занять минуту-две.' : 'Читаю договор и ищу контрольные точки…');
        try {
            const result = await extractor.run(blob, contract.file, EXTRACT_API);
            const added = CC.applyExtraction(contract, result, EXTRACT_API ? 'ai' : 'auto', contract.file.name);
            save();
            el.filterStatus.value = added ? 'review' : 'all';
            render();
            notify(added
                ? `Найдено контрольных точек: ${added}. Проверьте и подтвердите каждую.`
                : 'Новых контрольных точек не найдено. Добавьте обязательства вручную.');
        } catch (err) {
            notify(err.message || 'Не удалось прочитать договор.');
            if (!auto) console.error(err);
        }
    }

    // ---- Wiring -------------------------------------------------------------

    root.querySelector('[data-ct-add]').addEventListener('click', addContract);
    root.querySelectorAll('[data-ct-action]').forEach(button => {
        button.addEventListener('click', () => {
            const contract = current();
            if (!contract) return;
            ({
                notice: () => prepareNotice(contract),
                done: () => markDone(contract),
                event: () => addEvent(contract),
                obligation: () => addObligation(contract),
                extract: () => extractObligations(contract)
            })[button.dataset.ctAction]();
        });
    });
    [el.filterStatus, el.filterPeriod].forEach(select => select.addEventListener('change', () => {
        const contract = current();
        if (contract) renderObligations(contract);
    }));
    root.querySelectorAll('[data-ct-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            root.querySelectorAll('[data-ct-tab]').forEach(t => t.setAttribute('aria-selected', String(t === tab)));
            root.querySelectorAll('[data-ct-panel]').forEach(p => { p.hidden = p.dataset.ctPanel !== tab.dataset.ctTab; });
        });
    });

    // Changes from the cabinet (DOCS approvals) or another tab: reload and redraw
    window.addEventListener('storage', e => {
        if (e.key !== STORE_KEY && e.key !== DOCS_KEY) return;
        if (e.key === STORE_KEY) {
            data = CC.read();
            data.contracts.forEach(CC.ensure);
        }
        if (!el.dialog.open) render();
    });

    render();
    function runAction(action) {
        const c = current();
        if (!action || !c) return;
        if (action === 'notice') prepareNotice(c);
        if (action === 'claim') { prepareNotice(c); const sel = el.dialog.querySelector('[name=type]'); if (sel) sel.value = 'claim'; }
        if (action === 'amendment') editAmendment(c);
        if (action === 'terms' && root.querySelector('[data-ct-tab="terms"]')) root.querySelector('[data-ct-tab="terms"]').click();
    }
    runAction((new URLSearchParams(location.search).get('id') || '').split('~')[1]);

    // The contract specialist's workspace (contract-workspace.js): open a card and its action, reload after its changes
    document.addEventListener('contractopen', ev => {
        currentId = ev.detail.id;
        window.history.replaceState(null, '', withCabinet(`?id=${encodeURIComponent(currentId)}`));
        render();
        el.card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        runAction(ev.detail.action);
    });
    document.addEventListener('contractschange', ev => {
        if (!ev.detail || ev.detail.source !== 'workspace') return;
        data = CC.read();
        data.contracts.forEach(CC.ensure);
        if (!data.contracts.some(c => c.id === currentId)) currentId = CC.selected() || (data.contracts[0] && data.contracts[0].id);
        if (!el.dialog.open) render();
    });
});
