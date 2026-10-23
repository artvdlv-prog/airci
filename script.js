// Language functionality
let currentLanguage = 'ru';

function switchLanguage(lang) {
    currentLanguage = lang;

    // Update dropdown current language display
    const langCurrent = document.querySelector('.lang-current');
    if (langCurrent) {
        langCurrent.textContent = lang.toUpperCase();
    }

    // Update active language button (for backward compatibility)
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.lang === lang) {
            btn.classList.add('active');
        }
    });
    
    // Update all translatable elements
    const elementsToTranslate = document.querySelectorAll('[data-translate]');
    elementsToTranslate.forEach(element => {
        const translationKey = element.dataset.translate;
        const translation = getNestedProperty(translations[lang], translationKey);
        if (translation) {
            element.textContent = translation;
        }
    });
    
    // Update placeholders
    const placeholderElements = document.querySelectorAll('[data-translate-placeholder]');
    placeholderElements.forEach(element => {
        const translationKey = element.dataset.translatePlaceholder;
        const translation = getNestedProperty(translations[lang], translationKey);
        if (translation) {
            element.placeholder = translation;
        }
    });
    
    // Save language preference
    localStorage.setItem('airchitect-language', lang);

    // Let dynamic blocks (e.g. home page specialists) re-render
    document.dispatchEvent(new CustomEvent('languagechange', { detail: { lang } }));
}

function getNestedProperty(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
}

function loadSavedLanguage() {
    const savedLang = localStorage.getItem('airchitect-language');
    if (savedLang && translations[savedLang]) {
        switchLanguage(savedLang);
    }
}

// Smooth scrolling for navigation links
document.addEventListener('DOMContentLoaded', function() {
    // Load saved language on page load
    loadSavedLanguage();
    
    // Language switcher functionality
    const languageButtons = document.querySelectorAll('.lang-btn');
    languageButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const lang = this.dataset.lang;
            switchLanguage(lang);
        });
    });
    // Navigation scrolling
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');

            // Only handle anchor links (#), allow normal navigation for external pages
            if (href && href.startsWith('#')) {
                e.preventDefault();
                const targetSection = document.querySelector(href);
                if (targetSection) {
                    targetSection.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
            // For external pages (projekty.html, tseli.html, etc.), allow normal navigation
        });
    });

    // Mobile navigation toggle
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');

    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            navToggle.classList.toggle('active');
        });

        // Close mobile menu when clicking on nav links
        const mobileNavLinks = navMenu.querySelectorAll('.nav-link');
        mobileNavLinks.forEach(link => {
            link.addEventListener('click', function() {
                // Close menu only if it's not a dropdown toggle
                if (!this.classList.contains('dropdown-toggle')) {
                    navMenu.classList.remove('active');
                    navToggle.classList.remove('active');
                }
            });
        });

        // Close mobile menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
                navMenu.classList.remove('active');
                navToggle.classList.remove('active');
            }
        });
    }


    // Module card interactions
    const moduleCards = document.querySelectorAll('.module-card');
    moduleCards.forEach(card => {
        card.addEventListener('click', function() {
            const moduleData = this.dataset.module;
            const moduleName = this.querySelector('.module-title').textContent;
            
            // Navigate to module page
            if (moduleData) {
                window.location.href = `modules/${moduleData}/index.html`;
            } else {
                highlightModule(moduleName);
            }
        });
        
        // Add cursor pointer style
        card.style.cursor = 'pointer';
    });

    function highlightModule(moduleName) {
        // Create a subtle notification
        showNotification(`Learn more about ${moduleName} - Request a demo to see it in action!`);
    }

    function showNotification(message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: var(--primary-orange);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 8px 30px rgba(255, 106, 0, 0.4);
            z-index: 1500;
            transform: translateX(0px);
            max-width: 300px;
            font-size: 14px;
            font-weight: 500;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Show notification
        notification.style.transform = 'translateX(0)';
        
        // Remove after 4 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 4000);
    }

    // Demo button functionality
    const demoBtns = document.querySelectorAll('.demo-btn, .cta-primary');
    demoBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const cabinet = typeof HOME_ROUTES !== 'undefined' ? HOME_ROUTES.cabinet : null;
            if (cabinet) {
                window.location.href = cabinet;
            } else {
                showDemoForm();
            }
        });
    });

    function showDemoForm() {
        const messages = {
            en: 'Demo request feature coming soon! For now, please contact us directly.',
            ru: 'Функция запроса демо скоро появится! Пока свяжитесь с нами напрямую.'
        };
        showNotification(messages[currentLanguage] || messages.en);
    }

    // Home page: routes, digital specialists, architectural visuals, reveal animations
    initHomePage();

    function initHomePage() {
        if (!document.querySelector('main.home')) return;

        const routes = typeof HOME_ROUTES !== 'undefined' ? HOME_ROUTES : {};
        const t = key => getNestedProperty(translations[currentLanguage], key) || '';
        const local = value => (value && typeof value === 'object') ? (value[currentLanguage] || value.ru || '') : (value || '');

        // Routes that are not implemented yet show a notice instead of leading to a fake page
        function bindRoute(link, url) {
            if (url) {
                link.setAttribute('href', url);
                return;
            }
            link.addEventListener('click', function(e) {
                e.preventDefault();
                showNotification(t('home.pending'));
            });
        }

        document.querySelectorAll('[data-route]').forEach(link => {
            bindRoute(link, routes[link.dataset.route]);
        });

        function enabledSpecialists() {
            const source = typeof HOME_SPECIALISTS !== 'undefined' ? HOME_SPECIALISTS : [];
            return source
                .filter(item => item && item.enabled !== false)
                .slice()
                .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
        }

        // Specialist page (specialist.html?id=slug) is filled from the same configuration
        function renderSpecialistPage(pageRoot = document.querySelector('[data-specialist-page]')) {
            if (!pageRoot) return;

            const id = new URLSearchParams(location.search).get('id');
            const item = enabledSpecialists().find(s => (s.slug || s.id) === id);
            pageRoot.classList.toggle('is-missing', !item);
            if (!item) return;

            const title = local(item.title);
            document.title = `${title} — AIRCHITECT`;
            pageRoot.querySelectorAll('[data-sp-title]').forEach(el => { el.textContent = title; });
            pageRoot.querySelectorAll('[data-sp-description]').forEach(el => { el.textContent = local(item.description); });

            const media = pageRoot.querySelector('[data-sp-media]');
            if (media) {
                media.textContent = '';
                media.dataset.archSeed = item.slug || item.id;
                media.dataset.image = item.image || '';
            }

            const tasks = pageRoot.querySelector('[data-sp-tasks]');
            if (tasks) {
                tasks.textContent = '';
                (item.tasks || []).forEach(task => {
                    const li = document.createElement('li');
                    li.className = 'home-task';
                    const h = document.createElement('h3');
                    h.className = 'home-task__title';
                    h.textContent = local(task.title);
                    const p = document.createElement('p');
                    p.className = 'home-task__text';
                    p.textContent = local(task.text);
                    li.append(h, p);
                    tasks.appendChild(li);
                });
            }

            const slug = encodeURIComponent(item.slug || item.id);
            pageRoot.querySelectorAll('[data-sp-chat]').forEach(el => { el.href = `staff.html?id=${slug}`; });
            pageRoot.querySelectorAll('[data-sp-page]').forEach(el => { el.href = `specialist.html?id=${slug}`; });

            const others = pageRoot.querySelector('[data-specialists]');
            if (others) others.dataset.exclude = item.slug || item.id;
        }

        // "Штат" (staff.html?id=slug): chat, history and register of each specialist.
        // Chat goes through the proxy in worker/. Dialogs and registers are kept in this
        // browser only: there is no server-side storage yet.
        function initChat() {
            const chatRoot = document.querySelector('[data-chat-page]');
            if (!chatRoot) return;

            const specialists = enabledSpecialists();
            const id = new URLSearchParams(location.search).get('id');
            const item = id ? specialists.find(s => (s.slug || s.id) === id) : specialists[0];
            const slug = item ? (item.slug || item.id) : null;
            const endpoint = typeof HOME_ASSISTANT_API !== 'undefined' ? HOME_ASSISTANT_API : null;

            const log = chatRoot.querySelector('[data-chat-log]');
            const form = chatRoot.querySelector('[data-chat-form]');
            const input = chatRoot.querySelector('[data-chat-input]');
            const fileInput = chatRoot.querySelector('[data-chat-file]');
            const fileList = chatRoot.querySelector('[data-chat-files]');
            const sendButton = chatRoot.querySelector('[data-chat-send]');
            const MAX_FILES = 3;
            const MAX_FILE_BYTES = 10 * 1024 * 1024;

            const store = staffStore();
            let history = [];   // conversation sent to the proxy (with file data of this session)
            let dialog = null;  // saved copy of the current dialog: texts and file names only
            let pendingFiles = [];
            let busy = false;

            renderStaffList();

            if (!item) {
                chatRoot.querySelector('[data-chat-missing]').hidden = false;
                chatRoot.querySelectorAll('.home-staff__top, .home-tabs, [data-tab-panel]').forEach(el => { el.hidden = true; });
                return;
            }

            const fill = () => {
                renderSpecialistPage(chatRoot);
                chatRoot.querySelector('[data-registry-title]').textContent = local(item.registry) || 'Реестр';
                document.title = `${local(item.title)} — Штат | AIRCHITECT`;
                renderStaffList();
            };
            fill();
            document.addEventListener('languagechange', fill);

            initTabs();
            greet();
            renderHistory();
            renderRegistry();

            if (!endpoint) {
                chatRoot.querySelector('[data-chat-offline]').hidden = false;
                form.querySelectorAll('textarea, input, button').forEach(el => { el.disabled = true; });
                return;
            }

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
                        showNotification(`Можно приложить не больше ${MAX_FILES} файлов к сообщению.`);
                        break;
                    }
                    if (file.size > MAX_FILE_BYTES) {
                        showNotification(`Файл «${file.name}» больше 10 МБ.`);
                        continue;
                    }
                    pendingFiles.push(file);
                }
                renderPendingFiles();
            });

            chatRoot.querySelector('[data-chat-reset]').addEventListener('click', () => {
                if (busy) return;
                history = [];
                dialog = null;
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
                const files = await Promise.all(pendingFiles.map(readFile));
                const userMessage = { role: 'user', text, files };
                history.push(userMessage);
                addMessage('user', text, files.map(f => f.name));
                input.value = '';
                autoGrow();
                pendingFiles = [];
                renderPendingFiles();

                const answer = addMessage('assistant', '');
                answer.classList.add('is-typing');
                let answerText = '';
                let stopReason = null;

                try {
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ specialist: slug, messages: history })
                    });
                    if (!response.ok || !response.body) {
                        const problem = await response.json().catch(() => ({}));
                        // The proxy returns readable Russian messages for user errors and codes for the rest
                        throw new Error(/[а-я]/i.test(problem.error || '') ? problem.error : 'Не удалось отправить сообщение. Попробуйте позже.');
                    }

                    await readEvents(response.body, event => {
                        if (event.type === 'text') {
                            answerText += event.text;
                            answer.classList.remove('is-typing');
                            setMessageText(answer, answerText);
                        } else if (event.type === 'done') {
                            stopReason = event.stop_reason;
                        } else if (event.type === 'error') {
                            throw new Error(event.message);
                        }
                    });

                    if (stopReason === 'refusal') {
                        appendNotice(answer, 'Специалист не может ответить на этот запрос. Попробуйте переформулировать вопрос.');
                    } else if (stopReason === 'max_tokens') {
                        appendNotice(answer, 'Ответ получился слишком длинным и был обрезан. Попросите продолжить.');
                    }
                    if (!answerText) throw new Error('Ответ не получен. Попробуйте ещё раз.');
                    history.push({ role: 'assistant', text: answerText });
                    saveTurn(userMessage, answerText);
                } catch (err) {
                    // Failed turn is removed so the conversation stays valid; the text returns to the input
                    history.pop();
                    if (!answerText) answer.remove();
                    const reason = err instanceof TypeError ? 'Нет связи с сервером чата. Проверьте подключение к интернету.' : err.message;
                    appendNotice(addMessage('assistant', ''), reason || 'Не удалось получить ответ.');
                    if (!input.value) input.value = text;
                    autoGrow();
                } finally {
                    answer.classList.remove('is-typing');
                    busy = false;
                    sendButton.disabled = false;
                    input.focus();
                }
            });

            function greet() {
                const title = local(item.title);
                addMessage('assistant', `Здравствуйте! Я ${title.charAt(0).toLowerCase() + title.slice(1)} AIRCHITECT. Опишите задачу или приложите документ — договор, закупочную документацию, смету.`);
            }

            function renderStaffList() {
                const list = chatRoot.querySelector('[data-staff-list]');
                list.textContent = '';
                specialists.forEach(s => {
                    const sSlug = s.slug || s.id;
                    const li = document.createElement('li');
                    const link = document.createElement('a');
                    link.href = `staff.html?id=${encodeURIComponent(sSlug)}`;
                    link.className = 'home-staff__item';
                    if (sSlug === slug) {
                        link.classList.add('is-active');
                        link.setAttribute('aria-current', 'page');
                    }
                    const name = document.createElement('span');
                    name.className = 'home-staff__item-title';
                    name.textContent = local(s.title);
                    const text = document.createElement('span');
                    text.className = 'home-staff__item-text';
                    text.textContent = local(s.description);
                    link.append(name, text);
                    li.appendChild(link);
                    list.appendChild(li);
                });
            }

            function initTabs() {
                const tabs = [...chatRoot.querySelectorAll('[data-tab]')];
                tabs.forEach(tab => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));
                const fromHash = location.hash.slice(1);
                selectTab(tabs.some(tab => tab.dataset.tab === fromHash) ? fromHash : 'chat', false);
            }

            function selectTab(name, remember = true) {
                chatRoot.querySelectorAll('[data-tab]').forEach(tab => {
                    tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
                });
                chatRoot.querySelectorAll('[data-tab-panel]').forEach(panel => {
                    panel.hidden = panel.dataset.tabPanel !== name;
                });
                // window.history: the local `history` above is the conversation
                if (remember) window.history.replaceState(null, '', name === 'chat' ? location.pathname + location.search : `#${name}`);
            }

            function saveTurn(userMessage, answerText) {
                const now = Date.now();
                if (!dialog) {
                    const firstFile = userMessage.files[0];
                    dialog = {
                        id: now.toString(36),
                        title: (userMessage.text || (firstFile && firstFile.name) || 'Диалог').slice(0, 90),
                        created: now,
                        messages: []
                    };
                    store.dialogs(slug).unshift(dialog);
                }
                dialog.messages.push(
                    { role: 'user', text: userMessage.text, files: userMessage.files.map(f => f.name) },
                    { role: 'assistant', text: answerText }
                );
                dialog.updated = now;
                userMessage.files.forEach((file, index) => {
                    store.registry(slug).unshift({
                        id: `${now.toString(36)}-${index}`,
                        name: file.name,
                        type: file.type,
                        size: Math.round(file.data.length * 3 / 4),
                        date: now,
                        dialogId: dialog.id
                    });
                });
                store.save();
                renderHistory();
                renderRegistry();
            }

            function openDialog(saved) {
                if (busy) return;
                dialog = saved;
                // Files are not stored in the browser: the model gets their names instead
                history = saved.messages.map(m => ({
                    role: m.role,
                    text: m.files && m.files.length ? `${m.text}\n\n[Ранее приложены файлы: ${m.files.join(', ')}]` : m.text,
                    files: []
                }));
                log.textContent = '';
                saved.messages.forEach(m => addMessage(m.role, m.text, m.files || []));
                if (saved.messages.some(m => m.files && m.files.length)) {
                    appendNotice(addMessage('assistant', ''), 'Файлы из прошлых сообщений не хранятся в браузере. Если они нужны для ответа, приложите их заново.');
                }
                selectTab('chat');
            }

            function renderHistory() {
                const list = chatRoot.querySelector('[data-history-list]');
                const dialogs = store.dialogs(slug);
                list.textContent = '';
                chatRoot.querySelector('[data-history-empty]').hidden = dialogs.length > 0;
                dialogs.forEach(saved => {
                    const meta = `${formatDate(saved.updated || saved.created)} · сообщений: ${saved.messages.length}`;
                    list.appendChild(recordRow(saved.title, meta, [
                        ['Открыть', () => openDialog(saved)],
                        ['Удалить', () => {
                            if (!confirm('Удалить диалог из истории?')) return;
                            const all = store.dialogs(slug);
                            all.splice(all.indexOf(saved), 1);
                            if (dialog === saved) dialog = null;
                            store.save();
                            renderHistory();
                        }]
                    ]));
                });
            }

            function renderRegistry() {
                const list = chatRoot.querySelector('[data-registry-list]');
                const entries = store.registry(slug);
                list.textContent = '';
                chatRoot.querySelector('[data-registry-empty]').hidden = entries.length > 0;
                entries.forEach(entry => {
                    const saved = store.dialogs(slug).find(d => d.id === entry.dialogId);
                    const meta = `${fileKind(entry)} · ${formatSize(entry.size)} · ${formatDate(entry.date)}`;
                    const actions = [];
                    if (saved) actions.push(['Диалог', () => openDialog(saved)]);
                    actions.push(['Удалить', () => {
                        const all = store.registry(slug);
                        all.splice(all.indexOf(entry), 1);
                        store.save();
                        renderRegistry();
                    }]);
                    list.appendChild(recordRow(entry.name, meta, actions));
                });
            }

            function recordRow(title, meta, actions) {
                const li = document.createElement('li');
                li.className = 'home-record';
                const main = document.createElement('div');
                const name = document.createElement('p');
                name.className = 'home-record__title';
                name.textContent = title;
                const info = document.createElement('p');
                info.className = 'home-record__meta';
                info.textContent = meta;
                main.append(name, info);
                const buttons = document.createElement('div');
                buttons.className = 'home-record__actions';
                actions.forEach(([label, onClick]) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.textContent = label;
                    button.addEventListener('click', onClick);
                    buttons.appendChild(button);
                });
                li.append(main, buttons);
                return li;
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
        }

        // Dialogs and registers of the staff section, per specialist, in localStorage
        function staffStore() {
            const KEY = 'airchitect-staff-v1';
            let data = {};
            try {
                data = JSON.parse(localStorage.getItem(KEY)) || {};
            } catch (e) {
                data = {};
            }
            const bucket = slug => {
                data[slug] = data[slug] || { dialogs: [], registry: [] };
                return data[slug];
            };
            return {
                dialogs: slug => bucket(slug).dialogs,
                registry: slug => bucket(slug).registry,
                save() {
                    try {
                        localStorage.setItem(KEY, JSON.stringify(data));
                    } catch (e) {
                        // Storage is full or blocked: keep working with the in-memory copy
                    }
                }
            };
        }

        function formatDate(timestamp) {
            return new Date(timestamp).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        }

        function formatSize(bytes) {
            if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
            return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
        }

        function fileKind(entry) {
            if (entry.type === 'application/pdf') return 'PDF';
            if ((entry.type || '').startsWith('image/')) return 'Изображение';
            if (entry.type === 'text/plain') return 'Текст';
            return 'Файл';
        }

        function addMessage(role, text, fileNames = []) {
            const log = document.querySelector('[data-chat-log]');
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
            // Scroll the chat log only, not the whole page
            log.scrollTop = log.scrollHeight;
            return message;
        }

        function setMessageText(message, text, plain = false) {
            const body = message.querySelector('.home-chat__body');
            if (plain) {
                body.textContent = text;
            } else {
                body.innerHTML = renderMarkdown(text);
            }
            const log = message.parentElement;
            if (log) log.scrollTop = log.scrollHeight;
        }

        function appendNotice(message, text) {
            const notice = document.createElement('p');
            notice.className = 'home-chat__error';
            notice.textContent = text;
            message.appendChild(notice);
        }

        function readFile(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve({
                    name: file.name,
                    type: file.type || (file.name.toLowerCase().endsWith('.txt') ? 'text/plain' : ''),
                    data: String(reader.result).split(',')[1] || ''
                });
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
            });
        }

        // Reads "data: {...}" Server-Sent Events from the proxy
        async function readEvents(body, onEvent) {
            const reader = body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let boundary;
                while ((boundary = buffer.indexOf('\n\n')) !== -1) {
                    const chunk = buffer.slice(0, boundary);
                    buffer = buffer.slice(boundary + 2);
                    const data = chunk.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('');
                    if (data) onEvent(JSON.parse(data));
                }
            }
        }

        // Minimal safe Markdown for answers: headings, lists, bold, inline code, paragraphs
        function renderMarkdown(text) {
            const escape = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            const inline = s => escape(s)
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/`([^`]+)`/g, '<code>$1</code>');
            const html = [];
            let list = null;
            let paragraph = [];
            const flushParagraph = () => {
                if (paragraph.length) html.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
                paragraph = [];
            };
            const closeList = () => {
                if (list) html.push(`</${list}>`);
                list = null;
            };
            text.split('\n').forEach(line => {
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
            flushParagraph(); closeList();
            return html.join('');
        }

        function renderSpecialists() {
            const list = document.querySelector('[data-specialists]');
            if (!list) return;

            const specialists = enabledSpecialists().filter(item => (item.slug || item.id) !== list.dataset.exclude);

            list.textContent = '';
            specialists.forEach(item => {
                const li = document.createElement('li');
                li.id = item.slug || item.id;
                const link = document.createElement('a');
                link.className = 'home-specialist';
                link.href = '#';

                const media = document.createElement('div');
                media.className = 'home-media';
                media.dataset.archSeed = item.slug || item.id;
                media.dataset.image = item.image || '';

                const body = document.createElement('span');
                body.className = 'home-specialist__body';

                const title = document.createElement('span');
                title.className = 'home-specialist__title';
                title.textContent = local(item.title);
                body.appendChild(title);

                const description = local(item.description);
                if (description) {
                    const text = document.createElement('span');
                    text.className = 'home-specialist__text';
                    text.textContent = description;
                    body.appendChild(text);
                }

                const more = document.createElement('span');
                more.className = 'home-specialist__more';
                more.setAttribute('aria-hidden', 'true');
                more.innerHTML = '<svg class="home-btn__arrow" viewBox="0 0 16 16"><path d="M2 8h11M9 4l4 4-4 4"/></svg>';
                body.appendChild(more);

                link.append(media, body);
                li.appendChild(link);
                list.appendChild(li);

                // One cabinet for all specialists: the route template points to the specialist's tab
                const url = routes.specialist ? routes.specialist.replace('{slug}', encodeURIComponent(item.slug || item.id)) : null;
                bindRoute(link, url);
            });

            renderMedia(list);

            // Specialist opened by link (office.html#slug): cards are rendered here, so mark and scroll manually
            const opened = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
            if (opened && list.contains(opened)) {
                opened.classList.add('is-target');
                opened.scrollIntoView({ block: 'center' });
            }
        }

        // Fills image slots: a real image when data-image is set, otherwise a generated line drawing
        function renderMedia(root) {
            root.querySelectorAll('.home-media').forEach(slot => {
                if (slot.firstChild) return;
                if (slot.dataset.image) {
                    const img = document.createElement('img');
                    img.src = slot.dataset.image;
                    img.alt = '';
                    img.loading = 'lazy';
                    img.decoding = 'async';
                    slot.appendChild(img);
                } else {
                    slot.innerHTML = archVisual(slot.dataset.archSeed || 'airchitect');
                }
            });
        }

        // Deterministic minimalist facade drawing (concrete and glass volumes) for a given seed
        function archVisual(seedText) {
            let hash = 2166136261;
            for (let i = 0; i < seedText.length; i++) {
                hash ^= seedText.charCodeAt(i);
                hash = Math.imul(hash, 16777619);
            }
            let state = hash >>> 0;
            const rand = () => {
                state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
                return state / 4294967296;
            };

            const W = 400, H = 300, ground = 272;
            const tones = ['#d9dad7', '#cbccc9', '#e5e5e2', '#bcc1c4'];
            const f = n => n.toFixed(1);
            let volumes = '';
            let x = 28 + rand() * 70;

            for (let i = 0, count = 2 + Math.floor(rand() * 2); i < count && x < W - 70; i++) {
                const w = Math.min(80 + rand() * 100, W - 20 - x);
                const top = 36 + rand() * 140;
                const h = ground - top;
                const vertical = rand() < 0.5;
                const step = vertical ? 8 + Math.floor(rand() * 3) * 4 : 12 + Math.floor(rand() * 3) * 4;
                let lines = '';
                if (vertical) {
                    for (let lx = x + step; lx < x + w - 2; lx += step) lines += `M${f(lx)} ${f(top)}V${ground}`;
                } else {
                    for (let ly = top + step; ly < ground - 2; ly += step) lines += `M${f(x)} ${f(ly)}H${f(x + w)}`;
                }
                volumes += `<rect x="${f(x)}" y="${f(top)}" width="${f(w)}" height="${f(h)}" fill="${tones[Math.floor(rand() * tones.length)]}"/>`
                    + `<path d="${lines}" stroke="#a9aaa7" stroke-width="1" fill="none"/>`
                    + `<rect x="${f(x + w * 0.62)}" y="${f(top)}" width="${f(w * 0.38)}" height="${f(h)}" fill="#ffffff" fill-opacity="0.18"/>`;
                x += w - rand() * 28 + (rand() < 0.4 ? 14 : 0);
            }

            return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">`
                + `<rect width="${W}" height="${H}" fill="#f0f0ee"/>${volumes}`
                + `<rect x="0" y="${ground}" width="${W}" height="${H - ground}" fill="#e8e8e5"/>`
                + `<path d="M0 ${ground}H${W}" stroke="#c6c7c4" stroke-width="1"/></svg>`;
        }

        function initReveal() {
            const items = document.querySelectorAll('.home-reveal');
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (reduceMotion || !('IntersectionObserver' in window)) return;

            document.documentElement.classList.add('home-motion');
            const observer = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                });
            }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
            items.forEach(item => observer.observe(item));
        }

        renderSpecialistPage();
        initChat();
        renderMedia(document);
        renderSpecialists();
        document.addEventListener('languagechange', () => {
            renderSpecialistPage();
            renderMedia(document);
            renderSpecialists();
        });
        initReveal();
    }




});

