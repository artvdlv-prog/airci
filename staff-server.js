// «Штат» with the AIRCHITECT server (worker/): dialogs, documents of the project and results are stored on the
// server for the company, the project and the employee. Started by script.js when AirchitectApi.enabled;
// otherwise «Штат» keeps working in this browser as before.
//
// In the chat: project of the work, documents of the project (upload and choice), answer with sources and a mark
// «Требует проверки», saving to the results. History — dialogs of the employee; the register — documents and
// results of the project.

(function () {
    const KIND = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', txt: 'Текст' };
    const ACCEPT = '.pdf,.docx,.xlsx,.txt';
    const MAX_FILE_MB = 15;

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
    const date = t => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const size = n => (n > 1048576 ? `${(n / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`);
    const cabinetLink = () => (document.documentElement.classList.contains('is-cabinet') ? null : 'cabinet.html');

    function init(ctx) {
        const API = window.AirchitectApi;
        const { chatRoot, item, slug, form, input, fileInput, sendButton, extension, addMessage, appendNotice, setMessageText, selectTab, autoGrow, notify } = ctx;
        const log = chatRoot.querySelector('[data-chat-log]');
        let projects = [];
        let projectId = '';
        let documents = [];
        let selected = [];          // documents chosen for the next message
        let attachedInDialog = [];  // documents already in the current dialog (the server replays them)
        let dialogId = null;
        let busy = false;

        fileInput.setAttribute('accept', ACCEPT);
        const bar = h('div', { class: 'home-srv__bar' });
        const chips = h('ul', { class: 'home-chat__files' });
        form.prepend(bar, chips);

        // ---- Session and project -------------------------------------------------------------

        const locked = text => {
            log.textContent = '';
            const message = addMessage('assistant', '');
            appendNotice(message, text);
            const link = cabinetLink();
            if (link) message.appendChild(h('p', {}, h('a', { href: link, class: 'home-link' }, 'Войти в личный кабинет')));
            form.querySelectorAll('textarea, button, input, select').forEach(el => { el.disabled = true; });
        };

        async function start() {
            if (!API.signedIn()) return locked('Чтобы работать со специалистами, войдите в личный кабинет: диалоги и документы хранятся на сервере компании.');
            let me;
            try {
                me = await API.me();
            } catch (err) {
                return locked(err.code === 'password_change_required' ? 'Смените временный пароль в личном кабинете.' : err.message);
            }
            if (me.must_change_password) return locked('Смените временный пароль в личном кабинете, чтобы начать работу.');
            projects = me.projects;
            if (!projects.length) return locked(me.role === 'admin' ? 'Создайте проект в разделе «Настройки» личного кабинета — документы и диалоги привязываются к проекту.' : 'Вас ещё не добавили ни в один проект. Обратитесь к администратору компании.');
            projectId = API.project(projects);
            renderBar();
            await loadProject();
        }

        async function loadProject() {
            API.setProject(projectId);
            selected = [];
            await refreshDocuments();
            newDialog();
            renderHistory();
            renderRegistry();
        }

        async function refreshDocuments() {
            try {
                documents = await API.request('GET', `/api/documents?project_id=${encodeURIComponent(projectId)}`);
            } catch (err) {
                documents = [];
                notify(err.message);
            }
            renderBar();
            renderChips();
        }

        function renderBar() {
            bar.textContent = '';
            const pick = h('select', { 'aria-label': 'Проект', onchange: e => { projectId = e.target.value; loadProject(); } },
                projects.map(p => h('option', { value: p.id, selected: p.id === projectId }, p.code ? `${p.name} (${p.code})` : p.name)));
            bar.append(h('label', { class: 'home-srv__project' }, h('span', {}, 'Проект'), pick),
                h('button', { type: 'button', class: 'home-chat__action', onclick: openPicker }, `Документы проекта${documents.length ? ` (${documents.length})` : ''}`));
        }

        function renderChips() {
            chips.textContent = '';
            selected.forEach(id => {
                const doc = documents.find(d => d.id === id);
                if (!doc) return;
                chips.appendChild(h('li', {}, doc.name, h('button', { type: 'button', 'aria-label': `Убрать ${doc.name}`, onclick: () => { selected = selected.filter(x => x !== id); renderChips(); } }, '×')));
            });
        }

        // ---- Documents: upload with the paperclip and choice from the project ------------------

        async function uploadFiles(files) {
            for (const file of files) {
                if (file.size > MAX_FILE_MB * 1048576) { notify(`Файл «${file.name}» больше ${MAX_FILE_MB} МБ.`); continue; }
                const pending = h('li', { class: 'is-loading' }, `Загружаю ${file.name}…`);
                chips.appendChild(pending);
                try {
                    const doc = await API.upload(projectId, file);
                    if (doc.status === 'error') notify(`«${doc.name}»: ${doc.status_note}`);
                    else {
                        if (doc.status === 'no_text') notify(`«${doc.name}»: ${doc.status_note}`);
                        selected = [...new Set([...selected, doc.id])];
                    }
                } catch (err) {
                    notify(err.message);
                }
                pending.remove();
            }
            await refreshDocuments();
        }
        // The page's own handler is not attached in server mode: files go to the project storage
        fileInput.addEventListener('change', () => { const files = [...fileInput.files]; fileInput.value = ''; uploadFiles(files); });

        let picker = null;
        function openPicker() {
            if (!picker) { picker = h('dialog', { class: 'home-dialog' }); document.body.appendChild(picker); }
            picker.textContent = '';
            const choice = new Set(selected);
            const list = h('ul', { class: 'home-records' }, documents.length ? documents.map(d => h('li', { class: 'home-record' },
                h('label', { class: 'home-srv__doc' },
                    h('input', { type: 'checkbox', checked: choice.has(d.id), disabled: d.status === 'error' || attachedInDialog.includes(d.id), onchange: e => (e.target.checked ? choice.add(d.id) : choice.delete(d.id)) }),
                    h('span', {}, h('span', { class: 'home-record__title' }, d.name),
                        h('span', { class: 'home-record__meta' }, [KIND[d.kind], size(d.size), d.pages ? `${d.pages} с.` : '', attachedInDialog.includes(d.id) ? 'уже в диалоге' : '', d.status === 'error' ? 'не прочитан' : d.status === 'no_text' ? 'скан' : ''].filter(Boolean).join(' · ')),
                        d.status_note && d.status !== 'ok' ? h('span', { class: 'home-dialog__hint' }, d.status_note) : null)))) : h('li', { class: 'home-staff__empty' }, 'В проекте пока нет документов. Загрузите их кнопкой ниже или скрепкой в чате.'));
            const upload = h('input', { type: 'file', multiple: true, accept: ACCEPT, hidden: true, onchange: async e => { const files = [...e.target.files]; picker.close(); await uploadFiles(files); openPicker(); } });
            picker.append(h('form', { class: 'home-dialog__form', method: 'dialog' },
                h('div', { class: 'home-dialog__head' }, h('h2', { class: 'home-dialog__title' }, 'Документы проекта'), h('button', { type: 'button', class: 'home-window__close', 'aria-label': 'Закрыть', onclick: () => picker.close() }, '×')),
                h('div', { class: 'home-dialog__body' }, h('p', { class: 'home-dialog__hint' }, `PDF, DOCX, XLSX и TXT до ${MAX_FILE_MB} МБ. Документы доступны сотрудникам проекта.`), list, upload),
                h('div', { class: 'home-dialog__foot' },
                    h('button', { type: 'button', class: 'home-btn home-btn--secondary', onclick: () => upload.click() }, 'Загрузить'),
                    h('button', { type: 'button', class: 'home-btn home-btn--primary', onclick: () => { selected = [...choice]; renderChips(); picker.close(); } }, 'Выбрать'))));
            picker.showModal();
        }

        // ---- Dialog -------------------------------------------------------------------------

        function greet() {
            const title = ctx.local(item.title);
            addMessage('assistant', `Здравствуйте! Я ${title.charAt(0).toLowerCase() + title.slice(1)} AIRCHITECT. Опишите задачу, приложите документы или выберите их в документах проекта.`);
        }

        function newDialog() {
            dialogId = null;
            attachedInDialog = [];
            log.textContent = '';
            greet();
        }
        chatRoot.querySelector('[data-chat-reset]').addEventListener('click', () => { if (!busy) { newDialog(); selected = []; renderChips(); } });

        function renderSources(message, sources) {
            if (!sources.length) return;
            message.appendChild(h('div', { class: 'home-chat__sources' }, h('p', { class: 'home-dialog__label' }, 'Источники'),
                h('ol', {}, sources.map((s, i) => h('li', { value: i + 1 }, h('span', { class: 'home-chat__source-title' }, [s.title, s.pages].filter(Boolean).join(', ')), s.quote ? ` — «${s.quote}»` : '', s.url ? [' ', h('a', { href: s.url, target: '_blank', rel: 'noopener' }, 'открыть')] : '')))));
        }

        function answerActions(message, messageId, question, text) {
            const actions = h('div', { class: 'home-tn__answer-actions' });
            const save = h('button', { type: 'button', onclick: async () => {
                const title = prompt('Название результата', (question || 'Ответ специалиста').replace(/\s+/g, ' ').slice(0, 120));
                if (!title) return;
                try {
                    await API.request('POST', '/api/results', { project_id: projectId, specialist: slug, title, content: text, message_id: messageId });
                    save.disabled = true;
                    save.textContent = 'Сохранено в результаты';
                    renderRegistry();
                } catch (err) { notify(err.message); }
            } }, 'Сохранить в результаты');
            actions.appendChild(save);
            message.appendChild(actions);
        }

        const reviewNotice = message => message.appendChild(h('p', { class: 'home-chat__review' }, 'Требует проверки специалистом компании — см. перечень в конце ответа.'));

        form.addEventListener('submit', async e => {
            e.preventDefault();
            e.stopImmediatePropagation();
            const text = input.value.trim();
            if (busy || (!text && !selected.length) || !projectId) return;
            busy = true;
            sendButton.disabled = true;
            const docs = selected.slice();
            const analysis = extension ? extension.payload() : null;
            if (extension) extension.reset();
            addMessage('user', text, docs.map(id => (documents.find(d => d.id === id) || {}).name || 'документ'));
            input.value = '';
            autoGrow();
            selected = [];
            renderChips();
            const answer = addMessage('assistant', '');
            answer.classList.add('is-typing');
            let answerText = '';
            const sources = [];
            let doneEvent = null;
            try {
                await API.stream('/api/chat', { specialist: slug, project_id: projectId, dialog_id: dialogId, text, document_ids: docs, analysis }, event => {
                    if (event.type === 'dialog') dialogId = event.id;
                    else if (event.type === 'text') { answerText += event.text; answer.classList.remove('is-typing'); setMessageText(answer, answerText); }
                    else if (event.type === 'citation') sources[event.n - 1] = event.source;
                    else if (event.type === 'status' && !answerText) answer.querySelector('.home-chat__body').textContent = event.text;
                    else if (event.type === 'data') { if (extension && extension.onData) extension.onData(event.data); }
                    else if (event.type === 'done') doneEvent = event;
                    else if (event.type === 'error') throw new API.ApiError(event.message, 502, 'model');
                });
                if (!doneEvent) throw new API.ApiError('Ответ прервался. Попробуйте ещё раз.', 0, 'stream');
                attachedInDialog = [...new Set([...attachedInDialog, ...docs])];
                renderSources(answer, sources.filter(Boolean));
                if (doneEvent.stop_reason === 'refusal') appendNotice(answer, 'Специалист не может ответить на этот запрос. Попробуйте переформулировать вопрос.');
                if (doneEvent.stop_reason === 'max_tokens') appendNotice(answer, 'Ответ получился слишком длинным и был обрезан. Попросите продолжить.');
                if (doneEvent.review_required) reviewNotice(answer);
                answerActions(answer, doneEvent.message_id, text, answerText);
                if (extension) extension.afterAnswer(answer, answerText, analysis);
                renderHistory();
            } catch (err) {
                if (!answerText) answer.remove();
                appendNotice(addMessage('assistant', ''), err.message || 'Не удалось получить ответ.');
                if (!input.value) input.value = text;
                selected = [...new Set([...docs, ...selected])];
                renderChips();
                autoGrow();
            } finally {
                answer.classList.remove('is-typing');
                busy = false;
                sendButton.disabled = false;
                input.focus();
            }
        }, true);

        // ---- History: dialogs of the employee in this project --------------------------------

        async function openDialog(id) {
            if (busy) return;
            try {
                const d = await API.request('GET', `/api/dialogs/${encodeURIComponent(id)}`);
                dialogId = d.id;
                attachedInDialog = [...new Set(d.messages.flatMap(m => m.documents.map(x => x.id)))];
                log.textContent = '';
                d.messages.forEach(m => {
                    const message = addMessage(m.role, m.text, m.documents.map(x => x.name));
                    if (m.role === 'assistant') {
                        renderSources(message, m.sources);
                        if (m.review_required) reviewNotice(message);
                        const question = d.messages[d.messages.indexOf(m) - 1];
                        answerActions(message, m.id, question && question.text, m.text);
                    }
                });
                selectTab('chat');
            } catch (err) { notify(err.message); }
        }

        const row = (title, meta, actions) => h('li', { class: 'home-record' },
            h('div', {}, h('p', { class: 'home-record__title' }, title), h('p', { class: 'home-record__meta' }, meta)),
            h('div', { class: 'home-record__actions' }, actions.map(([label, fn]) => h('button', { type: 'button', onclick: fn }, label))));

        async function renderHistory() {
            const list = chatRoot.querySelector('[data-history-list]');
            const empty = chatRoot.querySelector('[data-history-empty]');
            let dialogs = [];
            try { dialogs = await API.request('GET', `/api/dialogs?project_id=${encodeURIComponent(projectId)}&specialist=${encodeURIComponent(slug)}`); } catch (err) { /* shown as empty */ }
            list.textContent = '';
            empty.hidden = dialogs.length > 0;
            empty.textContent = 'Диалогов в этом проекте пока нет. Задайте вопрос во вкладке «Чат» — диалог сохранится здесь.';
            dialogs.forEach(d => list.appendChild(row(d.title, `${date(d.updated_at)} · сообщений: ${d.messages}`, [
                ['Открыть', () => openDialog(d.id)],
                ['Удалить', async () => {
                    if (!confirm('Удалить диалог из истории? Сохранённые результаты останутся.')) return;
                    try { await API.request('DELETE', `/api/dialogs/${encodeURIComponent(d.id)}`); if (dialogId === d.id) newDialog(); renderHistory(); } catch (err) { notify(err.message); }
                }]
            ])));
        }

        // ---- Register: results of the specialist and documents of the project -------------------

        let viewer = null;
        function showResult(r) {
            if (!viewer) { viewer = h('dialog', { class: 'home-dialog home-srv__viewer' }); document.body.appendChild(viewer); }
            viewer.textContent = '';
            const body = h('div', { class: 'home-dialog__body home-chat__body' });
            body.innerHTML = window.AirchitectRenderMarkdown ? window.AirchitectRenderMarkdown(r.content) : '';
            if (!window.AirchitectRenderMarkdown) body.textContent = r.content;
            viewer.append(h('div', { class: 'home-dialog__form' },
                h('div', { class: 'home-dialog__head' }, h('h2', { class: 'home-dialog__title' }, r.title), h('button', { type: 'button', class: 'home-window__close', 'aria-label': 'Закрыть', onclick: () => viewer.close() }, '×')),
                body));
            if (r.sources.length) renderSources(viewer.firstChild, r.sources);
            viewer.showModal();
        }

        const wordOf = r => {
            const kit = window.AirchitectWorkspaceKit;
            if (!kit) return;
            let blocks = null;
            if (r.kind === 'doc') { try { blocks = JSON.parse(r.content); } catch (e) { blocks = null; } }
            kit.docx(r.title, blocks || [{ text: r.title, bold: true, center: true, size: 24 }, ...r.content.split('\n').filter(Boolean).map(t => ({ text: t.replace(/^#+\s*/, '').replace(/\*\*/g, '') })),
                ...(r.sources.length ? [{ text: 'Источники', bold: true }, ...r.sources.map((s, i) => ({ text: `${i + 1}. ${[s.title, s.pages].filter(Boolean).join(', ')}${s.quote ? ' — «' + s.quote + '»' : ''}` }))] : [])]);
        };

        async function renderRegistry() {
            const list = chatRoot.querySelector('[data-registry-list]');
            const empty = chatRoot.querySelector('[data-registry-empty]');
            let results = [];
            try { results = await API.request('GET', `/api/results?project_id=${encodeURIComponent(projectId)}&specialist=${encodeURIComponent(slug)}`); } catch (err) { /* shown as empty */ }
            list.textContent = '';
            list.appendChild(h('li', { class: 'home-srv__group' }, 'Результаты'));
            if (!results.length) list.appendChild(h('li', { class: 'home-staff__empty' }, 'Сохранённых результатов нет. Под ответом специалиста нажмите «Сохранить в результаты».'));
            results.forEach(r => list.appendChild(row(r.title, `${r.kind === 'doc' ? 'Документ' : 'Ответ'} · ${r.author} · ${date(r.created_at)}${r.sources.length ? ` · источников: ${r.sources.length}` : ''}`, [
                ...(r.kind === 'doc' ? [] : [['Открыть', () => showResult(r)]]),
                ['Word', () => wordOf(r)],
                ['Удалить', async () => { if (!confirm('Удалить результат?')) return; try { await API.request('DELETE', `/api/results/${encodeURIComponent(r.id)}`); renderRegistry(); } catch (err) { notify(err.message); } }]
            ])));
            list.appendChild(h('li', { class: 'home-srv__group' }, 'Документы проекта'));
            if (!documents.length) list.appendChild(h('li', { class: 'home-staff__empty' }, 'Документов в проекте нет.'));
            documents.forEach(d => list.appendChild(row(d.name, [KIND[d.kind], size(d.size), d.pages ? `${d.pages} с.` : '', d.status === 'error' ? 'не прочитан' : d.status === 'no_text' ? 'скан без текстового слоя' : '', d.uploaded_by_name, date(d.created_at)].filter(Boolean).join(' · '), [
                ['Скачать', () => API.download(`/api/documents/${encodeURIComponent(d.id)}/file`, d.name).catch(err => notify(err.message))],
                ['Удалить', async () => { if (!confirm(`Удалить документ «${d.name}» из проекта?`)) return; try { await API.request('DELETE', `/api/documents/${encodeURIComponent(d.id)}`); await refreshDocuments(); renderRegistry(); } catch (err) { notify(err.message); } }]
            ])));
            empty.hidden = true;
        }

        // Workspaces (e.g. «Закупки») save their documents to the results of the project
        window.AirchitectStaffRegistry = {
            add(entry) {
                const content = entry.blocks ? JSON.stringify(entry.blocks) : String(entry.text || '');
                return API.request('POST', '/api/results', { project_id: projectId, specialist: slug, kind: entry.kind === 'doc' ? 'doc' : 'answer', title: entry.name, content }).then(renderRegistry).catch(err => notify(err.message));
            },
            list: () => []
        };

        document.addEventListener('airchitectsession', () => locked('Сессия завершена. Войдите в личный кабинет снова.'));
        start();
    }

    window.AirchitectServerChat = { init };
})();
