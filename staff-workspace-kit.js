// Shared parts of the specialists' workspaces in Штат (contract-workspace.js, lawyer-workspace.js):
// DOM helper, toast, rows, small dialog, files in the browser storage of Контракты, navigation to the
// contract card and prepared requests in the specialist's dialog.

(function () {
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

    function notify(text) {
        const t = h('div', { class: 'home-ct__toast', role: 'status' }, text);
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 4500);
    }

    const badge = (text, tone) => h('span', { class: `home-ct__badge home-ct__badge--${tone || 'review'}` }, text);
    const rowEl = (title, metas, actions) => h('li', { class: 'home-ct__row' },
        h('div', { class: 'home-ct__row-main' }, h('p', { class: 'home-ct__row-title' }, ...[].concat(title)), ...metas.filter(Boolean).map(m => h('p', { class: 'home-ct__row-meta' }, m))),
        actions && actions.length ? h('div', { class: 'home-record__actions' }, actions.map(([l, fn]) => h('button', { type: 'button', onclick: fn }, l))) : null);

    // Files of contracts live in IndexedDB (the same database as Контракты and Объекты)
    const filesDb = new Promise(resolve => {
        if (!('indexedDB' in window)) return resolve(null);
        const req = indexedDB.open('airchitect-contract-files', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('files', { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
    });
    async function storeFile(file) {
        const db = await filesDb;
        const meta = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: file.name, type: file.type, size: file.size };
        if (db) await new Promise((resolve, reject) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put({ ...meta, blob: file }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }).catch(() => notify('Файл не сохранён: недостаточно места.'));
        return meta;
    }
    async function openFile(meta) {
        const db = await filesDb;
        if (!db) return;
        const req = db.transaction('files', 'readonly').objectStore('files').get(meta.id);
        req.onsuccess = () => {
            if (!req.result) return notify('Файл не найден в браузере.');
            download(req.result.blob, meta.name);
        };
    }
    function download(blob, name) {
        const a = h('a', { href: URL.createObjectURL(blob), download: name });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }

    // Small modal form; fields: { name, label, type: text|date|number|textarea|select|checkbox, options, value, required, hint }
    let dlg = null;
    function ask(title, fields, onSubmit, submitLabel = 'Сохранить') {
        if (!dlg) { dlg = h('dialog', { class: 'home-dialog' }); document.body.appendChild(dlg); }
        dlg.textContent = '';
        const form = h('form', { class: 'home-dialog__form', method: 'dialog' });
        const input = f => {
            if (f.type === 'textarea') { const t = h('textarea', { name: f.name, rows: f.rows || 3, required: f.required }); t.value = f.value || ''; return t; }
            if (f.type === 'select') return h('select', { name: f.name }, f.options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(f.value ?? '') }, l)));
            if (f.type === 'checkbox') return h('input', { type: 'checkbox', name: f.name, checked: !!f.value, required: f.required });
            return h('input', { name: f.name, type: f.type || 'text', value: f.value ?? '', required: f.required, step: f.type === 'number' ? 'any' : null });
        };
        const error = h('p', { class: 'home-dialog__error', hidden: true });
        form.append(h('div', { class: 'home-dialog__head' }, h('h2', { class: 'home-dialog__title' }, title), h('button', { type: 'button', class: 'home-window__close', 'aria-label': 'Закрыть', onclick: () => dlg.close() }, '×')),
            h('div', { class: 'home-dialog__body' }, fields.map(f => h('label', { class: 'home-dialog__field' + (f.type === 'checkbox' ? ' home-cf__check' : '') },
                f.type === 'checkbox' ? [input(f), h('span', { class: 'home-dialog__label' }, f.label)] : [h('span', { class: 'home-dialog__label' }, f.label + (f.required ? ' *' : '')), input(f)],
                f.hint ? h('span', { class: 'home-dialog__hint' }, f.hint) : null))), error,
            h('div', { class: 'home-dialog__foot' }, h('button', { type: 'button', class: 'home-btn home-btn--secondary', onclick: () => dlg.close() }, 'Отмена'),
                h('button', { type: 'submit', class: 'home-btn home-btn--primary', onclick: ev => {
                    ev.preventDefault();
                    if (!form.reportValidity()) return;
                    const v = {};
                    fields.forEach(f => { const el = form.elements.namedItem(f.name); v[f.name] = f.type === 'checkbox' ? el.checked : el.value.trim(); });
                    const err = onSubmit(v);
                    if (err) { error.textContent = err; error.hidden = false; return; }
                    dlg.close();
                } }, submitLabel)));
        dlg.appendChild(form);
        dlg.showModal();
    }

    const inCabinet = () => document.documentElement.classList.contains('is-cabinet');
    const embedded = () => new URLSearchParams(location.search).get('embed') === '1';

    // Contract card in Контракты; action: notice | claim | amendment | terms (handled by contracts.js)
    function openCard(contract, action) {
        const id = `${contract.id}${action ? '~' + action : ''}`;
        if (inCabinet() && window.parent !== window) window.parent.location.hash = `contracts/${encodeURIComponent(id)}`;
        else (embedded() && window.top !== window ? window.top : window).location.href = `contracts.html?id=${encodeURIComponent(id)}`;
    }

    // Prepared request in the specialist's dialog (the user reviews and sends it)
    function askChat(page, text) {
        const input = page.querySelector('[data-chat-input]');
        if (!input) return;
        input.value = text;
        input.dispatchEvent(new Event('input'));
        const tab = page.querySelector('[data-tab="chat"]');
        if (tab) tab.click();
        input.focus();
        input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    window.AirchitectWorkspaceKit = { h, notify, badge, rowEl, storeFile, openFile, download, ask, openCard, askChat, inCabinet, embedded };
})();
