// Digital assistants page (assistants.html): chat with AgentArea agents over A2A, straight from the browser.
// Self-contained: the rest of the site (Штат, cabinet, chat proxy in worker/) is not touched.
// Each key is bound to its one agent (workspace «Airchitect» on agentarea.ru) and expires.
// Files are read to text here (contract-extract.js: PDF via pdf.js, Word via mammoth).

(function () {
    const API = 'https://api.agentarea.ru';
    const ASSISTANTS = [
        {
            slug: 'contract-specialist',
            id: '22b9f90a-7e6b-453b-99e7-ebe1a730c668',
            key: 'aat_rbetH8FAJhGiPAR1CPnDyuVKDEQsfd0FFbTWurb85sc',
            title: 'Договорной специалист',
            description: 'Договор, сроки и контрольные точки',
            greeting: 'Здравствуйте! Я договорной специалист AIRCHITECT. Приложите договор в Word или PDF — подготовлю паспорт договора: реквизиты, контрольные точки и сроки, ответственность и риски с номерами пунктов.',
            actions: [
                ['Паспорт договора', 'Подготовь паспорт договора.'],
                ['Контрольные точки', 'Выдели все контрольные точки и сроки исполнения по договору в таблицу.'],
                ['Риски договора', 'Оцени риски условий договора для нашей стороны и предложи правки.']
            ]
        },
        {
            slug: 'construction-lawyer',
            id: '17662b4f-7bf0-4158-9fca-c025219e1761',
            key: 'aat_pehd4UGJtK0DUA1cVko3_c4BRwpxDWB2yAK6YhLlzUs',
            title: 'Юрист',
            description: 'Правовые и договорные вопросы',
            greeting: 'Здравствуйте! Я юрист AIRCHITECT. Задайте правовой вопрос по строительству или приложите договор — оценю риски, подготовлю претензию или протокол разногласий.',
            actions: [
                ['Предварительный анализ договора', 'Проведи предварительный правовой анализ договора: риски, спорные условия, что предложить в протоколе разногласий.'],
                ['Просрочка подрядчика', 'Подрядчик просрочил сдачу работ. Какие действия заказчика и какие документы нужны?'],
                ['Претензия', 'Подготовь проект претензии по договору: ']
            ]
        },
        {
            slug: 'estimator',
            id: '937edf70-5799-4f32-ba4e-0a75ba9ee166',
            key: 'aat_Q8XAbu60ghF-zwrNx0Z3073_c2lYT_8TUcEdGAFKZas',
            title: 'Инженер-сметчик',
            description: 'Сметы и их соответствие договору',
            greeting: 'Здравствуйте! Я инженер-сметчик AIRCHITECT. Приложите смету, ведомость объёмов или договор — проверю расчёт и соответствие объёмам и условиям договора.',
            actions: [
                ['Проверить смету', 'Проверь смету: арифметику, объёмы, расценки, коэффициенты и НДС.'],
                ['Смета и договор', 'Сопоставь смету с ценой и условиями договора.'],
                ['Исходные данные', 'Какие исходные данные нужны для сметного расчёта по объекту: ']
            ]
        },
        {
            slug: 'security-specialist',
            id: '598c1252-5980-449f-9b27-47a3ebab9a3e',
            key: 'aat_IXShb6CO6tsDb00y3In0-1BwUQIwTGnOPbdrsldBuVU',
            title: 'Специалист по безопасности',
            description: 'Проверка контрагентов',
            greeting: 'Здравствуйте! Я специалист по безопасности AIRCHITECT. Пришлите сведения о контрагенте или его документы — оценю риски сотрудничества и подскажу, что проверить.',
            actions: [
                ['План проверки контрагента', 'Составь план проверки нового контрагента-подрядчика: что и где проверить.'],
                ['Документы контрагента', 'Какие документы запросить у контрагента перед заключением договора подряда?']
            ]
        }
    ];
    const MAX_FILES = 3;
    const MAX_FILE_BYTES = 10 * 1024 * 1024;
    const MAX_MESSAGE = 300000;
    const FAILED = 'Специалист не смог ответить. Попробуйте ещё раз.';

    const root = document.querySelector('[data-assistants]');
    if (!root) return;

    const slug = new URLSearchParams(location.search).get('id');
    const item = ASSISTANTS.find(a => a.slug === slug) || ASSISTANTS[0];
    const log = root.querySelector('[data-chat-log]');
    const form = root.querySelector('[data-chat-form]');
    const input = root.querySelector('[data-chat-input]');
    const fileInput = root.querySelector('[data-chat-file]');
    const fileList = root.querySelector('[data-chat-files]');
    const sendButton = root.querySelector('[data-chat-send]');
    // One A2A context per dialog: AgentArea carries the conversation on inside it
    let contextId = crypto.randomUUID();
    let pendingFiles = [];
    let busy = false;

    // Specialists list and header
    const list = root.querySelector('[data-staff-list]');
    ASSISTANTS.forEach(a => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        // Inside the personal cabinet (?cabinet=1) the switch keeps the cabinet mode
        link.href = `assistants.html?id=${a.slug}${document.documentElement.classList.contains('is-cabinet') ? '&cabinet=1' : ''}`;
        link.className = 'home-staff__item' + (a === item ? ' is-active' : '');
        if (a === item) link.setAttribute('aria-current', 'page');
        const name = document.createElement('span');
        name.className = 'home-staff__item-title';
        name.textContent = a.title;
        const text = document.createElement('span');
        text.className = 'home-staff__item-text';
        text.textContent = a.description;
        link.append(name, text);
        li.appendChild(link);
        list.appendChild(li);
    });
    root.querySelector('[data-sp-title]').textContent = item.title;
    root.querySelector('[data-sp-description]').textContent = item.description;
    document.title = `${item.title} — Цифровые помощники | AIRCHITECT`;

    // Quick requests above the input
    const bar = document.createElement('div');
    bar.className = 'home-chat__actions';
    item.actions.forEach(([label, prompt]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'home-chat__action';
        button.textContent = label;
        button.addEventListener('click', () => {
            input.value = prompt;
            autoGrow();
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        });
        bar.appendChild(button);
    });
    form.prepend(bar);

    addMessage('assistant', item.greeting);

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            form.requestSubmit();
        }
    });
    input.addEventListener('input', autoGrow);

    fileInput.addEventListener('change', () => {
        const added = [...fileInput.files];
        fileInput.value = '';
        for (const file of added) {
            if (pendingFiles.length >= MAX_FILES) {
                notice(`Можно приложить не больше ${MAX_FILES} файлов к сообщению.`);
                break;
            }
            if (file.size > MAX_FILE_BYTES) {
                notice(`Файл «${file.name}» больше 10 МБ.`);
                continue;
            }
            pendingFiles.push(file);
        }
        renderPendingFiles();
    });

    root.querySelector('[data-chat-reset]').addEventListener('click', () => {
        if (busy) return;
        contextId = crypto.randomUUID();
        pendingFiles = [];
        renderPendingFiles();
        log.textContent = '';
        addMessage('assistant', 'Начнём заново. Чем помочь?');
    });

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const text = input.value.trim();
        if (busy || (!text && pendingFiles.length === 0)) return;
        busy = true;
        sendButton.disabled = true;

        let files;
        try {
            files = await Promise.all(pendingFiles.map(readFileText));
        } catch (err) {
            notice(err.message || 'Не удалось прочитать файл.');
            busy = false;
            sendButton.disabled = false;
            return;
        }
        addMessage('user', text, files.map(f => f.name));
        input.value = '';
        autoGrow();
        pendingFiles = [];
        renderPendingFiles();

        const answer = addMessage('assistant', '');
        answer.classList.add('is-typing');
        let answerText = '';
        try {
            await ask({ text, files }, event => {
                if (event.type === 'text') {
                    answerText = event.text;
                    answer.classList.remove('is-typing');
                    setMessageText(answer, answerText);
                } else if (event.type === 'status' && !answerText) {
                    answer.querySelector('.home-chat__body').textContent = event.text;
                }
            });
            if (!answerText) throw new Error('Ответ не получен. Попробуйте ещё раз.');
        } catch (err) {
            // The text returns to the input so the turn can be sent again
            if (!answerText) answer.remove();
            const reason = err instanceof TypeError ? 'Нет связи со специалистом. Проверьте подключение к интернету.' : err.message;
            appendNotice(addMessage('assistant', ''), reason || FAILED);
            if (!input.value) input.value = text;
            autoGrow();
        } finally {
            answer.classList.remove('is-typing');
            busy = false;
            sendButton.disabled = false;
            input.focus();
        }
    });

    // Text of an attached file: PDF and Word are read by contract-extract.js
    async function readFileText(file) {
        const extract = window.AirchitectContractExtract;
        const plain = file.type.startsWith('text/') || /\.(txt|md|csv)$/i.test(file.name);
        if (!plain && !(extract && /\.(pdf|docx)$/i.test(file.name))) {
            throw new Error(`Файл «${file.name}»: специалист читает PDF, Word (DOCX) и текстовые файлы.`);
        }
        const text = plain ? await file.text() : await extract.readText(file, file.name);
        if (!text.trim()) throw new Error(`В файле «${file.name}» нет текста: сканы без текстового слоя пока не читаются.`);
        return { name: file.name, text };
    }

    // One A2A call for one turn. The dialog's contextId makes AgentArea carry the conversation on,
    // so only this turn and the text of its files are sent. onEvent gets {type: 'status', text}
    // while the agent works and {type: 'text', text} with the whole answer so far.
    async function ask(turn, onEvent) {
        const docs = (turn.files || []).map(f => `\n\n--- Документ «${f.name}» ---\n${f.text}`).join('');
        const text = `${turn.text || ''}${docs}`;
        if (text.length > MAX_MESSAGE) throw new Error('Сообщение с документами слишком большое. Приложите часть документа.');

        const rpc = (method, params, stream) => fetch(`${API}/v1/agents/${item.id}/a2a/rpc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: stream ? 'text/event-stream' : 'application/json', 'A2A-Version': '1.0', Authorization: `Bearer ${item.key}` },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
        });
        const response = await rpc('SendStreamingMessage', { message: { messageId: crypto.randomUUID(), contextId, role: 'ROLE_USER', parts: [{ text }] } }, true);
        if (!response.ok || !response.body || !(response.headers.get('content-type') || '').includes('event-stream')) {
            throw new Error('Специалист сейчас недоступен. Попробуйте позже.');
        }

        const partsText = parts => (parts || []).map(p => p.text || '').join('');
        // An update without append replaces its artifact
        const artifacts = new Map();
        const emitText = () => onEvent({ type: 'text', text: [...artifacts.values()].join('\n\n') });
        let taskId = null;
        let finished = false;
        let step = 'Специалист изучает материалы…';
        const onStatus = (status, metadata) => {
            if (status.state === 'TASK_STATE_WORKING' || status.state === 'TASK_STATE_SUBMITTED') {
                step = stepText(metadata && metadata.agentarea_event, partsText(status.message && status.message.parts)) || step;
                onEvent({ type: 'status', text: step });
                return;
            }
            finished = true;
            if (status.state !== 'TASK_STATE_COMPLETED' && status.state !== 'TASK_STATE_INPUT_REQUIRED') throw new Error(FAILED);
            const extra = partsText(status.message && status.message.parts);
            if (!artifacts.size && extra) onEvent({ type: 'text', text: extra });
        };

        // A cut stream fails in the browser as a network error: the task is then read by id below
        await readEvents(response.body, event => {
            if (event.error) throw new Error(FAILED);
            const result = event.result || {};
            const update = result.artifactUpdate || result.statusUpdate;
            taskId = taskId || (result.task && result.task.id) || (update && update.taskId);
            if (result.artifactUpdate) {
                const { artifact = {}, append } = result.artifactUpdate;
                artifacts.set(artifact.artifactId, (append ? artifacts.get(artifact.artifactId) || '' : '') + partsText(artifact.parts));
                emitText();
            } else if ((result.statusUpdate || result.task || {}).status) {
                const update = result.statusUpdate || result.task;
                onStatus(update.status, result.statusUpdate && result.statusUpdate.metadata);
            }
        }).catch(err => {
            if (!(err instanceof TypeError) || !taskId) throw err;
        });

        // The gateway closes long streams (about 15 s) while the agent keeps working:
        // the finished task is then read by its id
        for (let i = 0; !finished && taskId && i < 120; i++) {
            await new Promise(resolve => setTimeout(resolve, 2500));
            const task = await rpc('GetTask', { id: taskId }).then(r => r.json()).then(d => d.result).catch(() => null);
            if (!task || !task.status) continue;
            if (task.status.state !== 'TASK_STATE_WORKING' && task.status.state !== 'TASK_STATE_SUBMITTED') {
                (task.artifacts || []).forEach(a => artifacts.set(a.artifactId, partsText(a.parts)));
                if (artifacts.size) emitText();
            }
            onStatus(task.status);
        }
        if (!finished) throw new Error('Специалист не успел ответить. Попробуйте ещё раз.');
    }

    // What the specialist is doing, from the step AgentArea reports (metadata.agentarea_event and a
    // line in English such as "Step 2" or "Calling read_contract"); null keeps the previous line
    function stepText(event, text) {
        const tool = (text.match(/^Calling (.+)$/) || [])[1];
        const step = (text.match(/^Step (\d+)$/) || [])[1];
        switch (event) {
            case 'turn.started': return step && step !== '1' ? `Специалист продолжает работу (шаг ${step})…` : 'Специалист изучает материалы…';
            case 'tool.call': return tool ? `Специалист использует инструмент «${tool}»…` : 'Специалист использует инструменты…';
            case 'tool.progress': return `Специалист работает: ${text.replace(/^[^:]*:\s*/, '')}`;
            case 'delegation.started': return 'Специалист советуется с коллегой…';
            case 'context.compacted': return 'Специалист сводит длинный диалог…';
            case 'task.awaiting_infrastructure': return 'Специалист ждёт, пока сервис снова станет доступен…';
            default: return null;
        }
    }

    // Reads "data: {...}" Server-Sent Events; AgentArea separates lines with \r\n
    async function readEvents(body, onEvent) {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
            let boundary;
            while ((boundary = buffer.indexOf('\n\n')) !== -1) {
                const chunk = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                const data = chunk.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('');
                if (data) onEvent(JSON.parse(data));
            }
        }
    }

    function addMessage(role, text, fileNames = []) {
        const message = document.createElement('div');
        message.className = `home-chat__message home-chat__message--${role}`;
        if (fileNames.length) {
            const files = document.createElement('ul');
            files.className = 'home-chat__attached';
            fileNames.forEach(name => {
                const li = document.createElement('li');
                li.textContent = name;
                files.appendChild(li);
            });
            message.appendChild(files);
        }
        const body = document.createElement('div');
        body.className = 'home-chat__body';
        message.appendChild(body);
        setMessageText(message, text, role === 'user');
        log.appendChild(message);
        log.scrollTop = log.scrollHeight;
        return message;
    }

    function setMessageText(message, text, plain = false) {
        const body = message.querySelector('.home-chat__body');
        if (plain) body.textContent = text;
        else body.innerHTML = renderMarkdown(text);
        log.scrollTop = log.scrollHeight;
    }

    function appendNotice(message, text) {
        const p = document.createElement('p');
        p.className = 'home-chat__error';
        p.textContent = text;
        message.appendChild(p);
    }

    function notice(text) {
        appendNotice(addMessage('assistant', ''), text);
    }

    function autoGrow() {
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
    }

    function renderPendingFiles() {
        fileList.textContent = '';
        pendingFiles.forEach((file, index) => {
            const li = document.createElement('li');
            li.textContent = file.name;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.setAttribute('aria-label', `Убрать ${file.name}`);
            remove.textContent = '×';
            remove.addEventListener('click', () => {
                pendingFiles.splice(index, 1);
                renderPendingFiles();
            });
            li.appendChild(remove);
            fileList.appendChild(li);
        });
    }

    // Minimal safe Markdown for answers (same rules as the chat in script.js): headings, lists,
    // tables, bold, inline code, paragraphs
    function renderMarkdown(text) {
        const escape = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const inline = s => escape(s)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');
        const html = [];
        let list = null;
        let paragraph = [];
        let table = null;
        const flushParagraph = () => {
            if (paragraph.length) html.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
            paragraph = [];
        };
        const closeList = () => {
            if (list) html.push(`</${list}>`);
            list = null;
        };
        const closeTable = () => {
            if (!table) return;
            const [head, ...rows] = table;
            html.push(`<div class="home-chat__table"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
            table = null;
        };
        text.split('\n').forEach(line => {
            if (/^\s*\|.*\|\s*$/.test(line)) {
                flushParagraph(); closeList();
                if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) return;
                table = table || [];
                table.push(line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
                return;
            }
            closeTable();
            const heading = line.match(/^#{1,6}\s+(.*)/);
            const bullet = line.match(/^\s*[-*•]\s+(.*)/);
            const numbered = line.match(/^\s*\d+[.)]\s+(.*)/);
            if (heading) {
                flushParagraph(); closeList();
                html.push(`<h4>${inline(heading[1])}</h4>`);
            } else if (bullet || numbered) {
                flushParagraph();
                const type = bullet ? 'ul' : 'ol';
                if (list !== type) { closeList(); html.push(`<${type}>`); list = type; }
                html.push(`<li>${inline((bullet || numbered)[1])}</li>`);
            } else if (!line.trim()) {
                flushParagraph(); closeList();
            } else {
                closeList();
                paragraph.push(line);
            }
        });
        closeTable(); flushParagraph(); closeList();
        return html.join('');
    }
})();
