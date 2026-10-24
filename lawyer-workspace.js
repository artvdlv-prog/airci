// Workspace of the construction lawyer in Штат (staff.html?id=construction-lawyer): the dialog on top,
// below — legal questions, contracts of Контракт — Исполнение (one card, contract-core.js), claims and
// disputes, documents, the regulatory base (AirCodex registry) and legal risks.
// Legally significant steps (sending a claim, filing a suit, signing) are marked only by the user with
// a confirmation; norms and court practice are checked by the lawyer through official sources.

(function () {
    const LEGAL_KEY = 'airchitect-legal-v1';
    const readLegal = () => { try { return JSON.parse(localStorage.getItem(LEGAL_KEY)) || { questions: [] }; } catch (e) { return { questions: [] }; } };
    const writeLegal = d => { try { localStorage.setItem(LEGAL_KEY, JSON.stringify(d)); return true; } catch (e) { return false; } };
    const LAWYER_SELECTED = 'airchitect-lawyer-v1';
    const selectedId = () => { try { return (JSON.parse(localStorage.getItem(LAWYER_SELECTED)) || {}).id || ''; } catch (e) { return ''; } };
    const select = id => { try { localStorage.setItem(LAWYER_SELECTED, JSON.stringify({ id })); } catch (e) { /* ignore */ } };

    // Chat extension (script.js): the selected contract card goes as context, the server checks norms
    // and practice in official sources; the answer is saved to «Правовые вопросы» and to the card
    function chatExtension() {
        let bar = null;
        const CC = window.AirchitectContracts;
        const current = () => CC && CC.read().contracts.find(c => c.id === selectedId());
        const draw = () => {
            if (!bar) return;
            const c = current();
            bar.textContent = c ? `Контекст: ${CC.name(c)}${c.subject ? ' — ' + c.subject : ''}. Нормы и практика проверяются по официальным источникам.` : 'Общий правовой вопрос. Чтобы юрист учёл договор, выберите его во вкладке «Договоры» ниже.';
        };
        return {
            attach({ form }) {
                bar = document.createElement('p');
                bar.className = 'home-ws__context';
                form.prepend(bar);
                draw();
                document.addEventListener('lawyerselect', draw);
                window.addEventListener('storage', draw);
            },
            payload() {
                const c = current();
                return { type: 'legal', id: c ? c.id : '', context: c ? CC.context(c) : '' };
            },
            reset() { draw(); },
            afterAnswer(message, answerText, request) {
                const bar2 = document.createElement('div');
                bar2.className = 'home-tn__answer-actions';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = 'Сохранить в «Правовые вопросы»';
                btn.addEventListener('click', () => {
                    const msgs = [...document.querySelectorAll('.home-chat__message--user')];
                    const question = msgs.length ? msgs[msgs.length - 1].innerText.trim().slice(0, 500) : '';
                    const d = readLegal();
                    d.questions.unshift({ id: Date.now().toString(36), at: Date.now(), question, answer: answerText.trim(), contractId: request && request.id || '' });
                    let ok = writeLegal(d);
                    if (request && request.id && CC) {
                        const data = CC.read();
                        const c = data.contracts.find(x => x.id === request.id);
                        if (c) {
                            CC.ensure(c);
                            c.analyses.unshift({ id: Date.now().toString(36), at: Date.now(), text: answerText.trim(), by: 'Строительный юрист' });
                            c.log.unshift({ at: Date.now(), text: 'Сохранено заключение строительного юриста' });
                            ok = CC.write(data) && ok;
                        }
                    }
                    const p = document.createElement('p');
                    p.className = 'home-chat__note';
                    p.textContent = ok ? 'Сохранено в «Правовые вопросы»' + (request && request.id ? ' и в карточку договора.' : '.') : 'Не удалось сохранить.';
                    message.appendChild(p);
                    document.dispatchEvent(new Event('legalsaved'));
                });
                bar2.appendChild(btn);
                message.appendChild(bar2);
            }
        };
    }
    window.AirchitectChatExtensions = window.AirchitectChatExtensions || {};
    window.AirchitectChatExtensions.legal = chatExtension;

    document.addEventListener('DOMContentLoaded', () => {
        const page = document.querySelector('[data-chat-page]');
        const CC = window.AirchitectContracts;
        const K = window.AirchitectWorkspaceKit;
        if (!page || !CC || !K || new URLSearchParams(location.search).get('id') !== 'construction-lawyer') return;
        const chatPanel = page.querySelector('[data-tab-panel="chat"]');
        if (!chatPanel) return;
        const { h, notify, badge, rowEl, openFile, openCard, download } = K;
        const { formatDate } = CC;
        const askChat = text => K.askChat(page, text);
        let data = CC.read();
        const save = () => { if (!CC.write(data)) notify('Не удалось сохранить.'); };
        const current = () => data.contracts.find(c => c.id === selectedId());
        const ask = (title, fields, fn, label) => K.ask(title, fields, v => { const err = fn(v); if (err) return err; save(); render(); return null; }, label);
        const uid = CC.uid;
        let tab = 'questions';
        let normsCache = null;

        const STAGES = ['Претензионный порядок', 'Подготовка иска', 'Иск подан', 'Первая инстанция', 'Апелляция', 'Кассация', 'Исполнение решения', 'Урегулирован'];
        const TOPICS = [
            ['44-ФЗ', 'Вопрос по 44-ФЗ (контрактная система): '], ['223-ФЗ', 'Вопрос по 223-ФЗ: '], ['СРО', 'Вопрос о членстве в СРО и допуске к работам (ГрК РФ): '],
            ['Исполнительная документация', 'Вопрос о составе и оформлении исполнительной документации: '], ['Приёмка работ', 'Вопрос о порядке приёмки работ и мотивированном отказе: ']
        ];

        const root = h('section', { class: 'home-ws', 'aria-label': 'Рабочее пространство строительного юриста' });
        chatPanel.after(root);

        const needContract = () => { const c = current(); if (!c) notify('Выберите договор во вкладке «Договоры».'); return c; };
        const ACTIONS = [
            ['Правовая экспертиза договора', () => { const c = needContract(); if (c) askChat('Проведи правовую экспертизу договора: соответствие ГК РФ (гл. 37) и специальным нормам, баланс ответственности, порядок оплаты и приёмки, основания расторжения, подсудность. Для каждого риска — пункт договора, правовое основание (статья, часть) и предлагаемая редакция. Приложи файл договора, если он есть.'); }],
            ['Протокол разногласий', () => { const c = needContract(); if (c) editProtocol(c); }],
            ['Подготовить претензию', () => { const c = needContract(); if (c) openCard(c, 'claim'); }],
            ['Подготовить уведомление', () => { const c = needContract(); if (c) openCard(c, 'notice'); }],
            ['Дополнительное соглашение', () => { const c = needContract(); if (c) openCard(c, 'amendment'); }],
            ['Исковое заявление', () => { const c = needContract(); if (c) lawsuit(c); }],
            ['Оценить правовые риски', () => askChat('Оцени юридические риски по договору и его исполнению: нарушения, сроки претензий и исковой давности, доказательства, перспективы спора. Укажи правовые основания и меры по устранению рисков.')],
            ['Судебная практика', () => askChat('Найди актуальную судебную практику по вопросу: … Указывай только реальные дела с номером, судом, датой и ссылкой на kad.arbitr.ru или vsrf.ru; если практика не найдена — так и скажи.')],
            ['Вопрос по законодательству', () => askChat('Правовой вопрос: ')]
        ];
        const TEAM = [['Договорной специалист', 'contract-specialist', 'Карточка договора, обязательства, сроки и документы.'], ['Финансист', 'financier', 'Суммы требований, неустойки, финансовые последствия спора.'],
            ['Инженер ПТО', 'pto-engineer', 'Объёмы, исполнительная документация и приёмка как доказательства.'], ['Специалист по безопасности', 'security-specialist', 'Проверка контрагента: суды, долги, банкротство.']];
        const TABS = [['questions', 'Правовые вопросы'], ['contracts', 'Договоры'], ['disputes', 'Претензии и споры'], ['documents', 'Документы'], ['norms', 'Нормативная база'], ['risks', 'Риски']];

        function render() {
            data = CC.read();
            data.contracts.forEach(CC.ensure);
            const c = current();
            root.textContent = '';
            const pick = h('select', { 'aria-label': 'Договор', onchange: ev => { select(ev.target.value); document.dispatchEvent(new Event('lawyerselect')); render(); } },
                h('option', { value: '' }, '— общий вопрос, без договора —'), data.contracts.map(x => h('option', { value: x.id, selected: c && x.id === c.id }, `${CC.name(x)}${x.subject ? ' — ' + x.subject : ''}`)));
            root.append(
                h('div', { class: 'home-ws__head' }, h('div', {}, h('p', { class: 'home-eyebrow' }, 'Рабочее пространство'), h('h3', { class: 'home-ws__title' }, 'Правовое сопровождение')),
                    h('div', { class: 'home-ws__pick' }, pick, c ? h('button', { type: 'button', class: 'home-btn home-btn--secondary home-cab__small', onclick: () => openCard(c) }, 'Карточка договора') : null)),
                h('div', { class: 'home-ws__actions' }, ACTIONS.map(([l, fn]) => h('button', { type: 'button', class: 'home-chat__action', onclick: fn }, l))),
                h('div', { class: 'home-tabs', role: 'tablist', 'aria-label': 'Рабочие вкладки' }, TABS.map(([k, l]) => h('button', { type: 'button', role: 'tab', class: 'home-tab', 'aria-selected': String(k === tab), onclick: () => { tab = k; render(); } }, l))));
            const panel = h('div', { class: 'home-ws__panel' });
            root.appendChild(panel);
            ({ questions: renderQuestions, contracts: renderContracts, disputes: renderDisputes, documents: renderDocuments, norms: renderNorms, risks: renderRisks })[tab](panel, c);
            if (c) root.appendChild(h('div', { class: 'home-ws__team' }, h('p', { class: 'home-dialog__label' }, 'Подключить специалиста'), h('div', { class: 'home-ws__actions' },
                TEAM.map(([l, slug, task]) => h('button', { type: 'button', class: 'home-chat__action', title: task, onclick: () => {
                    if (typeof window.AirchitectOpenSpecialist === 'function') window.AirchitectOpenSpecialist(slug, `${CC.context(c)}\n\nЗапрос строительного юриста: ${task}\n\nВопрос: `);
                } }, l)))));
            root.appendChild(h('p', { class: 'home-note' }, 'Юрист работает с карточками раздела «Контракт — Исполнение». Направление претензии, подача иска и подписание документов отмечаются только пользователем с подтверждением. Нормы и судебная практика проверяются по официальным источникам; неподтверждённые ссылки специалист не приводит.'));
        }

        function renderQuestions(panel) {
            const own = readLegal().questions;
            const cardAnswers = data.contracts.flatMap(x => x.analyses.filter(a => a.by === 'Строительный юрист').map(a => ({ ...a, x })));
            panel.appendChild(h('div', { class: 'home-ws__actions' }, TOPICS.map(([l, p]) => h('button', { type: 'button', class: 'home-chat__action', onclick: () => askChat(p) }, l))));
            panel.appendChild(h('ul', { class: 'home-ct__list' }, own.length ? own.map(q => rowEl([badge(new Date(q.at).toLocaleDateString('ru-RU')), q.question || 'Вопрос'], [q.contractId && data.contracts.find(x => x.id === q.contractId) ? CC.name(data.contracts.find(x => x.id === q.contractId)) : 'Без договора', q.answer.slice(0, 500) + (q.answer.length > 500 ? '…' : '')],
                [['Word', () => exportAnswer(q)], ['Удалить', () => { const d = readLegal(); d.questions = d.questions.filter(x => x.id !== q.id); writeLegal(d); render(); }]])) : h('li', { class: 'home-ct__none' }, 'Сохранённых правовых вопросов нет. Задайте вопрос в диалоге и нажмите «Сохранить в «Правовые вопросы»».')));
            if (cardAnswers.length && !own.length) panel.appendChild(h('p', { class: 'home-note' }, `В карточках договоров сохранено заключений юриста: ${cardAnswers.length}.`));
        }

        function renderContracts(panel, c) {
            panel.appendChild(h('ul', { class: 'home-ct__list' }, data.contracts.length ? data.contracts.map(x => {
                const w = CC.warnings(x);
                const legal = w.filter(z => ['claim', 'limitation', 'breach', 'terms', 'dispute'].includes(z.kind));
                return rowEl([x.id === (c && c.id) ? badge('Выбран', 'done') : null, `${CC.name(x)}${x.subject ? ' · ' + x.subject : ''}`],
                    [[x.customer && `Заказчик: ${x.customer}`, x.contractor && `Подрядчик: ${x.contractor}`].filter(Boolean).join(' · '),
                        `Претензий: ${x.notices.filter(n => n.type === 'claim').length} · споров: ${x.disputes.filter(d => d.status !== 'closed').length} · протоколов разногласий: ${x.protocols.length} · правовых предупреждений: ${legal.length}`],
                    [['Работать с договором', () => { select(x.id); document.dispatchEvent(new Event('lawyerselect')); render(); }], ['Карточка', () => openCard(x)]]);
            }) : h('li', { class: 'home-ct__none' }, 'Договоров нет. Договоры ведутся в разделе «Контракт — Исполнение» или через договорного специалиста.')));
            if (c && c.protocols.length) panel.append(h('p', { class: 'home-dialog__label' }, 'Протоколы разногласий'), h('ul', { class: 'home-ct__list' }, c.protocols.map(p => rowEl([badge({ draft: 'Проект', sent: 'Направлен', signed: 'Подписан' }[p.status], p.status === 'signed' ? 'done' : 'soon'), `от ${formatDate(p.date)}: пунктов ${p.items.length}`], [p.items.slice(0, 3).map(i => `п. ${i.clause}`).join(', ')],
                [['Изменить', () => editProtocol(c, p)], ['Word', () => exportProtocol(c, p)], ...(p.status === 'draft' ? [['Направлен', () => confirmStep(`Протокол разногласий направлен контрагенту?`, 'Способ и подтверждение направления', v => { p.status = 'sent'; p.sentAt = CC.today(); p.sentRef = v; c.log.unshift({ at: Date.now(), text: `Протокол разногласий направлен: ${v}` }); })]] : []),
                    ...(p.status === 'sent' ? [['Подписан', () => confirmStep('Протокол разногласий подписан сторонами?', 'Подтверждение (подписанный экземпляр)', v => { p.status = 'signed'; p.signedAt = CC.today(); p.signRef = v; c.log.unshift({ at: Date.now(), text: `Протокол разногласий подписан: ${v}` }); })]] : [])]))));
        }

        function renderDisputes(panel, c) {
            const list = (c ? [c] : data.contracts).flatMap(x => [
                ...x.notices.filter(n => ['claim', 'breach'].includes(n.type)).map(n => ({ kind: 'notice', x, n })),
                ...x.disputes.map(d => ({ kind: 'dispute', x, d }))]);
            panel.appendChild(h('div', { class: 'home-ct__actions' }, c ? h('button', { type: 'button', class: 'home-btn home-btn--primary home-cab__small', onclick: () => editDispute(c) }, 'Добавить спор') : null, c ? h('button', { type: 'button', class: 'home-btn home-btn--secondary home-cab__small', onclick: () => openCard(c, 'claim') }, 'Подготовить претензию') : null));
            panel.appendChild(h('ul', { class: 'home-ct__list' }, list.length ? list.map(item => {
                if (item.kind === 'notice') {
                    const n = item.n;
                    const term = Number(item.x.terms.claimDays) || 30;
                    const passed = n.sentAt ? -CC.daysUntil(n.sentAt) : null;
                    return rowEl([badge(n.type === 'claim' ? 'Претензия' : 'Уведомление о нарушении', n.answeredAt ? 'done' : n.sentAt ? 'soon' : 'review'), `${n.addressee}`],
                        [`${CC.name(item.x)} · ${n.sentAt ? 'направлена ' + formatDate(n.sentAt) : 'проект — не направлена'}${n.type === 'claim' && passed !== null && !n.answeredAt ? ` · претензионный срок ${term} дн.: ${passed >= term ? 'истёк' : 'осталось ' + (term - passed) + ' дн.'}` : ''}`, n.answeredAt ? `Ответ ${formatDate(n.answeredAt)}: ${n.answer}` : ''],
                        [['Карточка', () => openCard(item.x)], ...(n.sentAt && !n.answeredAt ? [['Ответ получен', () => ask('Ответ на претензию', [{ name: 'date', label: 'Дата ответа', type: 'date', value: CC.today(), required: true }, { name: 'text', label: 'Содержание ответа', type: 'textarea', required: true }], v => { n.answeredAt = v.date; n.answer = v.text; item.x.log.unshift({ at: Date.now(), text: `Получен ответ на претензию (${n.addressee}): ${v.text.slice(0, 80)}` }); })]] : []),
                            ...(n.type === 'claim' && n.sentAt ? [['Исковое заявление', () => lawsuit(item.x, null, n)]] : [])]);
                }
                const d = item.d;
                return rowEl([badge(d.stage, d.status === 'closed' ? 'done' : 'soon'), d.subject], [`${CC.name(item.x)} · ${d.role === 'plaintiff' ? 'мы — истец' : 'мы — ответчик'}${d.amount ? ' · ' + Number(d.amount).toLocaleString('ru-RU') + ' ₽' : ''}${d.court ? ' · ' + d.court : ''}${d.caseNo ? ' · дело ' + d.caseNo : ''}`,
                    d.next ? `${d.nextTitle || 'Следующее действие'}: ${formatDate(d.next)}` : '', d.result ? `Результат: ${d.result}` : ''],
                    [['Изменить', () => editDispute(item.x, d)], ['Исковое заявление', () => lawsuit(item.x, d)], ...(d.caseNo ? [['Картотека дел', () => window.open('https://kad.arbitr.ru/', '_blank', 'noopener')]] : [])]);
            }) : h('li', { class: 'home-ct__none' }, 'Претензий и споров нет.')));
            panel.appendChild(h('p', { class: 'home-note' }, 'Претензионный срок — 30 календарных дней со дня направления претензии, если иной срок не установлен законом или договором (ч. 5 ст. 4 АПК РФ). Иск, требования к его содержанию и приложениям — ст. 125, 126 АПК РФ.'));
        }

        function renderDocuments(panel, c) {
            const docs = (c ? [c] : data.contracts).flatMap(x => CC.documents(x).filter(d => !['КС-2', 'КС-3'].includes(d.kind)).map(d => ({ ...d, x })));
            panel.appendChild(h('ul', { class: 'home-ct__list' }, docs.length ? docs.map(d => rowEl([badge(d.kind), d.file ? h('button', { type: 'button', class: 'home-ct__file', onclick: () => openFile(d.file) }, d.title) : d.title], [[d.meta, c ? '' : CC.name(d.x)].filter(Boolean).join(' · ')])) : h('li', { class: 'home-ct__none' }, 'Юридических документов нет.')));
        }

        // Regulatory base: the AirCodex registry (aircodex.html), documents tagged for the construction lawyer
        async function renderNorms(panel) {
            panel.appendChild(h('p', { class: 'home-ct__row-meta' }, 'Документы реестра AirCodex с отметкой «Строительный юрист» — ссылки на официальные источники. Действующую редакцию юрист сверяет при ответе.'));
            const search = h('input', { type: 'search', placeholder: 'Поиск по номеру или названию', class: 'home-ws__search', oninput: () => draw() });
            const list = h('ul', { class: 'home-ct__list' });
            panel.append(search, list);
            const draw = () => {
                const q = search.value.trim().toLowerCase();
                list.textContent = '';
                (normsCache || []).filter(n => !q || (n.num + ' ' + n.name).toLowerCase().includes(q)).forEach(n => list.appendChild(rowEl([h('a', { href: n.url, target: '_blank', rel: 'noopener', class: 'home-ob__norm' }, n.num)], [n.name], [['Спросить юриста', () => askChat(`Вопрос по документу «${n.num}» (${n.name}): `)]])));
                if (normsCache && !list.children.length) list.appendChild(h('li', { class: 'home-ct__none' }, 'Ничего не найдено.'));
            };
            if (!normsCache) {
                list.appendChild(h('li', { class: 'home-ct__none' }, 'Загружаю реестр…'));
                try {
                    const html = await (await fetch('aircodex.html')).text();
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    normsCache = [...doc.querySelectorAll('.home-registry__row')].filter(r => r.textContent.includes('Строительный юрист')).map(r => {
                        const a = r.querySelector('.home-registry__num');
                        const name = r.querySelector('.home-registry__name');
                        const src = name.querySelector('.home-registry__src');
                        return { num: a.textContent.trim(), url: a.href, name: name.textContent.replace(src ? src.textContent : '', '').trim() };
                    });
                } catch (e) {
                    normsCache = [];
                    notify('Реестр нормативной базы не загрузился.');
                }
            }
            draw();
        }

        function renderRisks(panel, c) {
            if (!c) { panel.appendChild(h('p', { class: 'home-staff__empty' }, 'Выберите договор во вкладке «Договоры».')); return; }
            const w = CC.warnings(c).filter(x => ['claim', 'limitation', 'breach', 'terms', 'dispute', 'amendment', 'payment', 'documents'].includes(x.kind) && x.level >= 1);
            const legalRisks = c.risks.filter(r => r.kind === 'Правовой' || r.kind === 'Договорной');
            panel.appendChild(h('ul', { class: 'home-ct__list' },
                ...w.map(x => rowEl([badge(x.level >= 3 ? 'Критично' : x.level === 2 ? 'Внимание' : 'Контроль', x.level >= 3 ? 'overdue' : x.level === 2 ? 'soon' : 'review'), x.text], ['Предупреждение по данным карточки договора'])),
                ...legalRisks.map(x => rowEl([badge(x.level === 'high' ? 'Высокий' : x.level === 'medium' ? 'Средний' : 'Низкий', x.level === 'high' ? 'overdue' : 'soon'), x.text], [[x.kind, x.measure && 'мера: ' + x.measure, x.source].filter(Boolean).join(' · ')])),
                !w.length && !legalRisks.length ? h('li', { class: 'home-ct__none' }, 'Правовых рисков не выявлено по данным карточки.') : null));
            panel.appendChild(h('div', { class: 'home-ct__actions' }, h('button', { type: 'button', class: 'home-btn home-btn--secondary home-cab__small', onclick: () => ask('Правовой риск', [{ name: 'text', label: 'Риск', type: 'textarea', required: true }, { name: 'basis', label: 'Правовое основание (статья, пункт договора)', required: true }, { name: 'measure', label: 'Как устранить' }, { name: 'level', label: 'Уровень', type: 'select', value: 'medium', options: [['high', 'Высокий'], ['medium', 'Средний'], ['low', 'Низкий']] }],
                v => { c.risks.push({ id: uid(), at: Date.now(), kind: 'Правовой', text: v.text, level: v.level, measure: v.measure, source: v.basis }); c.log.unshift({ at: Date.now(), text: `Юрист: правовой риск — ${v.text.slice(0, 70)}` }); }) }, 'Добавить правовой риск'), h('button', { type: 'button', class: 'home-btn home-btn--secondary home-cab__small', onclick: () => ACTIONS[6][1]() }, 'Оценить с юристом')));
        }

        // ---- Disputes, protocol of disagreements, statement of claim --------------------------------

        function editDispute(c, d) {
            ask(d ? 'Спор' : 'Новый спор', [
                { name: 'subject', label: 'Предмет спора', value: d && d.subject, required: true, hint: 'Взыскание оплаты, неустойки, аванса; качество; сроки; объёмы' },
                { name: 'role', label: 'Наша роль', type: 'select', value: d ? d.role : 'plaintiff', options: [['plaintiff', 'Истец'], ['defendant', 'Ответчик']] },
                { name: 'amount', label: 'Сумма требований, ₽', type: 'number', value: d && d.amount },
                { name: 'stage', label: 'Стадия', type: 'select', value: d ? d.stage : STAGES[0], options: STAGES.map(x => [x, x]) },
                { name: 'court', label: 'Суд', value: d && d.court }, { name: 'caseNo', label: 'Номер дела', value: d && d.caseNo, hint: 'Сведения о деле — в Картотеке арбитражных дел' },
                { name: 'next', label: 'Ближайшее процессуальное действие: дата', type: 'date', value: d && d.next }, { name: 'nextTitle', label: 'Что предстоит', value: d && d.nextTitle, hint: 'Заседание, срок отзыва, срок апелляции' },
                { name: 'result', label: 'Результат', value: d && d.result }
            ], v => {
                const fields = { ...v, status: v.stage === 'Урегулирован' ? 'closed' : 'open' };
                if (d) Object.assign(d, fields); else c.disputes.push({ id: uid(), created: Date.now(), files: [], ...fields });
                c.log.unshift({ at: Date.now(), text: `Юрист: ${d ? 'изменён' : 'добавлен'} спор «${v.subject}» — ${v.stage}` });
            });
        }

        // Protocol of disagreements: clause, wording of the other party, proposed wording, legal reason
        function editProtocol(c, p) {
            const items = p ? p.items.map(i => ({ ...i })) : [{ clause: '', theirs: '', ours: '', reason: '' }];
            K.ask(p ? 'Протокол разногласий' : 'Новый протокол разногласий', [
                { name: 'date', label: 'Дата', type: 'date', value: p ? p.date : CC.today(), required: true },
                { name: 'items', label: 'Пункты: каждый с новой строки в формате «пункт | редакция контрагента | наша редакция | обоснование»', type: 'textarea', rows: 8, required: true, value: items.filter(i => i.clause).map(i => [i.clause, i.theirs, i.ours, i.reason].join(' | ')).join('\n'), hint: 'Обоснование — норма права или условие, ради которого предлагается изменение' }
            ], v => {
                const parsed = v.items.split('\n').map(l => l.split('|').map(s => s.trim())).filter(x => x[0]).map(([clause, theirs = '', ours = '', reason = '']) => ({ clause, theirs, ours, reason }));
                if (!parsed.length) return 'Добавьте хотя бы один пункт.';
                if (parsed.some(x => !x.ours)) return 'Для каждого пункта укажите нашу редакцию.';
                if (p) Object.assign(p, { date: v.date, items: parsed }); else c.protocols.push({ id: uid(), date: v.date, items: parsed, status: 'draft' });
                c.log.unshift({ at: Date.now(), text: `Юрист: ${p ? 'изменён' : 'подготовлен'} протокол разногласий (${parsed.length} п.)` });
                save();
                tab = 'contracts';
                render();
                return null;
            });
        }

        // Legally significant step: only with an explicit confirmation of the user
        function confirmStep(question, refLabel, apply) {
            ask(question, [{ name: 'ref', label: refLabel, required: true }, { name: 'ok', label: 'Подтверждаю: действие выполнено, сведения достоверны', type: 'checkbox', required: true }], v => { apply(v.ref); return null; }, 'Подтвердить');
        }

        async function docx(name, blocks) {
            try {
                if (!window.docx) await new Promise((res, rej) => { const s = h('script', { src: 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js' }); s.onload = res; s.onerror = () => rej(new Error('Не удалось загрузить модуль Word.')); document.head.appendChild(s); });
                const D = window.docx;
                const p = (text, o = {}) => new D.Paragraph({ alignment: o.center ? D.AlignmentType.CENTER : o.right ? D.AlignmentType.RIGHT : undefined, spacing: { after: 100 }, children: [new D.TextRun({ text, bold: o.bold, size: o.size || 22, font: 'Times New Roman' })] });
                const cell = (t, b) => new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: String(t ?? ''), bold: b, size: 20, font: 'Times New Roman' })] })] });
                const children = blocks.map(b => (b.table ? new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [new D.TableRow({ tableHeader: true, children: b.table[0].map(x => cell(x, true)) }), ...b.table.slice(1).map(r => new D.TableRow({ children: r.map(x => cell(x)) }))] }) : p(b.text, b)));
                download(await D.Packer.toBlob(new D.Document({ sections: [{ properties: {}, children }] })), `${name.replace(/[\\/:*?"<>|]/g, ' ')}.docx`);
            } catch (e) {
                notify(e.message);
            }
        }

        const exportProtocol = (c, p) => docx(`Протокол разногласий — ${CC.name(c)}`, [
            { text: 'ПРОТОКОЛ РАЗНОГЛАСИЙ', bold: true, center: true, size: 24 }, { text: `к ${CC.name(c)}${c.subject ? ' (' + c.subject + ')' : ''}`, center: true }, { text: `${formatDate(p.date)}`, right: true },
            { text: `${c.customer || '________'} и ${c.contractor || '________'} составили настоящий протокол о нижеследующем:` },
            { table: [['№', 'Пункт договора', 'Редакция контрагента', 'Предлагаемая редакция', 'Обоснование'], ...p.items.map((i, n) => [n + 1, i.clause, i.theirs, i.ours, i.reason])] },
            { text: 'Пункты договора, не указанные в протоколе, принимаются в редакции договора. Договор действует с учётом настоящего протокола после его подписания сторонами.' },
            { text: `Заказчик: ____________ / ____________          Подрядчик: ____________ / ____________` },
            { text: 'Проект подготовлен в AIRCHITECT. Проверьте редакции и обоснования перед направлением контрагенту.', size: 16 }]);

        const exportAnswer = q => docx(`Правовое заключение ${new Date(q.at).toLocaleDateString('ru-RU')}`, [{ text: 'ПРАВОВОЕ ЗАКЛЮЧЕНИЕ', bold: true, center: true, size: 24 }, { text: `Вопрос: ${q.question}` }, ...q.answer.split('\n').filter(Boolean).map(t => ({ text: t.replace(/^#+\s*/, '').replace(/\*\*/g, '') })), { text: 'Заключение подготовлено строительным юристом AIRCHITECT и носит рекомендательный характер.', size: 16 }]);

        // Statement of claim: the structure of ст. 125 АПК РФ, filled from the card; blanks stay for the lawyer
        function lawsuit(c, d, claim) {
            const sum = d && d.amount ? Number(d.amount) : '';
            const claimNotice = claim || c.notices.find(n => n.type === 'claim' && n.sentAt);
            const term = Number(c.terms.claimDays) || 30;
            const claimLine = claimNotice ? `Претензия направлена ${formatDate(claimNotice.sentAt)}${claimNotice.sentRef ? ' (' + claimNotice.sentRef + ')' : ''}; ${claimNotice.answeredAt ? 'ответ получен ' + formatDate(claimNotice.answeredAt) + ': ' + claimNotice.answer : -CC.daysUntil(claimNotice.sentAt) >= term ? 'ответ в претензионный срок не получен' : 'претензионный срок не истёк — иск подаётся после его истечения'}.` : 'Сведения о направлении претензии в карточке отсутствуют — соблюдение претензионного порядка обязательно (ч. 5 ст. 4 АПК РФ).';
            const breaches = c.obligations.filter(o => o.status === 'breached');
            docx(`Исковое заявление (проект) — ${CC.name(c)}`, [
                { text: 'В Арбитражный суд ________ (подсудность — по договору или ст. 35–37 АПК РФ)', right: true },
                { text: `Истец: ${d && d.role === 'defendant' ? c.customer : c.contractor || '________'} (наименование, адрес, ИНН, ОГРН, контакты)`, right: true },
                { text: `Ответчик: ${d && d.role === 'defendant' ? c.contractor : c.customer || '________'} (наименование, адрес, ИНН, ОГРН)`, right: true },
                { text: `Цена иска: ${sum ? sum.toLocaleString('ru-RU') + ' руб.' : '________'}`, right: true },
                { text: 'ИСКОВОЕ ЗАЯВЛЕНИЕ', bold: true, center: true, size: 24 }, { text: d ? d.subject : 'о взыскании ________', center: true },
                { text: `Между истцом и ответчиком заключён ${CC.name(c)}${c.subject ? ' (' + c.subject + ')' : ''}${c.price ? ', цена договора ' + c.price : ''}.` },
                ...breaches.map(o => ({ text: `Ответчик не исполнил обязательство по п. ${o.clause || '___'} договора: ${o.text}${o.due ? ' (срок — ' + formatDate(o.due) + ')' : ''}. Неисполнение подтверждается: ${o.breachBasis || '________'}.` })),
                { text: 'Обстоятельства, на которых основаны исковые требования, и подтверждающие их доказательства: ________' },
                { text: 'Правовое обоснование (законы и иные нормативные правовые акты): ________' },
                { text: 'Расчёт взыскиваемой суммы: ________' },
                { text: `Соблюдение претензионного порядка: ${claimLine}` },
                { text: 'На основании изложенного прошу: ________', bold: true },
                { text: 'Приложения (ст. 126 АПК РФ): документ об уплате государственной пошлины; документ о направлении копии иска ответчику; документы, подтверждающие обстоятельства; копия договора; документ о соблюдении претензионного порядка; выписка из ЕГРЮЛ; доверенность представителя; расчёт суммы.' },
                { text: 'Представитель истца: ____________ (подпись, расшифровка, дата)' },
                { text: 'Проект подготовлен в AIRCHITECT по данным карточки договора и структуре ст. 125 АПК РФ. Пробелы заполняет юрист; подача иска выполняется пользователем.', size: 16 }]);
            if (d && !['Иск подан', 'Первая инстанция', 'Апелляция', 'Кассация', 'Исполнение решения', 'Урегулирован'].includes(d.stage)) {
                d.stage = 'Подготовка иска';
                c.log.unshift({ at: Date.now(), text: `Юрист: подготовлен проект искового заявления — ${d.subject}` });
                save();
                render();
            }
        }

        window.addEventListener('storage', ev => { if ([CC.STORE_KEY, LAWYER_SELECTED, LEGAL_KEY].includes(ev.key)) render(); });
        document.addEventListener('legalsaved', render);
        render();
    });
})();
