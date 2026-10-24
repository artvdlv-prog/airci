// Tenders and procurement (tenders.html): registry of tenders under 44-ФЗ, 223-ФЗ and
// commercial procurement, financial calculation, application checklist, deadlines,
// results and reports from the tender specialist's chat. Uses tender-core.js.

document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('[data-tenders]');
    if (!root || !window.AirchitectTenders) return;
    const T = window.AirchitectTenders;
    const money = T.money;

    const CHECKLIST = [
        'Изучена документация: извещение, ТЗ, проект договора',
        'Проверено соответствие требованиям к участникам',
        'Подтверждён опыт (договоры, акты) — если есть дополнительные требования',
        'Выписка из реестра членов СРО — если требуется',
        'Подготовлено предложение участника и расчёт цены',
        'Обеспечение заявки: деньги на счёте или банковская гарантия',
        'Действующая электронная подпись и аккредитация на площадке',
        'Проверен заказчик (специалист по безопасности)',
        'Проект договора проверен юристом'
    ];

    let data = T.read();
    const save = () => { if (!T.write(data)) notify('Не удалось сохранить данные в браузере.'); };
    const inCabinet = document.documentElement.classList.contains('is-cabinet');
    const withCabinet = q => (inCabinet ? `${q}&cabinet=1` : q);
    const today = () => new Date().toISOString().slice(0, 10);
    const daysUntil = d => (d ? Math.round((new Date(d + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000) : null);
    const formatDate = d => (d ? d.split('-').reverse().join('.') : '');
    const formatStamp = ts => new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    let currentId = new URLSearchParams(location.search).get('id') || (data.tenders[0] && data.tenders[0].id);
    let tab = 'info';
    const current = () => data.tenders.find(t => t.id === currentId);
    const log = (t, text) => t.log.unshift({ at: Date.now(), text });

    function h(tag, attrs = {}, ...children) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (v === undefined || v === null || v === false) return;
            if (k === 'class') node.className = v;
            else if (k === 'html') node.innerHTML = v;
            else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
            else node.setAttribute(k, v === true ? '' : v);
        });
        children.flat().forEach(c => { if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : document.createTextNode(c)); });
        return node;
    }

    function notify(text) {
        const toast = h('div', { class: 'home-ct__toast', role: 'status' }, text);
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // Tender documentation is stored in the same browser file storage as contracts and objects

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
            const meta = { id: T.uid(), name: file.name, type: file.type, size: file.size };
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


    const el = {
        list: root.querySelector('[data-tn-list]'),
        empty: root.querySelector('[data-tn-empty]'),
        card: root.querySelector('[data-tn-card]'),
        title: root.querySelector('[data-tn-title]'),
        meta: root.querySelector('[data-tn-meta]'),
        tabs: root.querySelector('[data-tn-tabs]'),
        panel: root.querySelector('[data-tn-panel]')
    };

    const TABS = [['info', 'Сведения'], ['files', 'Документы'], ['calc', 'Расчёт'], ['application', 'Заявка и сроки'], ['reports', 'Справки'], ['history', 'История']];

    function render() {
        renderList();
        const t = current();
        el.empty.hidden = !!t;
        el.card.hidden = !t;
        if (!t) return;
        el.title.textContent = t.title || t.number || 'Закупка';
        el.meta.textContent = [T.LAWS[t.law], t.number && `№ ${t.number}`, t.customer, t.nmck && `НМЦК ${money(Number(t.nmck))}`, T.STATUSES[t.status]].filter(Boolean).join(' · ');
        document.title = `${el.title.textContent} — Тендеры | AIRCHITECT`;
        el.tabs.textContent = '';
        TABS.forEach(([key, label]) => el.tabs.appendChild(h('button', { type: 'button', role: 'tab', class: 'home-tab', 'aria-selected': String(key === tab), onclick: () => { tab = key; render(); } }, label)));
        el.panel.textContent = '';
        el.panel.appendChild(h('div', { class: 'home-ct__actions' },
            h('button', { type: 'button', class: 'home-btn home-btn--primary', onclick: () => askTender(t) }, h('span', {}, 'Анализ в чате')),
            ...[['Финансист', 'financier'], ['Юрист', 'construction-lawyer'], ['Безопасность', 'security-specialist']].map(([label, slug]) =>
                h('button', { type: 'button', class: 'home-btn home-btn--secondary home-cab__small', onclick: () => askExpert(slug, t) }, label))));
        ({ info: renderInfo, files: renderFiles, calc: renderCalc, application: renderApplication, reports: renderReports, history: renderHistory })[tab](t);
    }

    function renderList() {
        el.list.textContent = '';
        data.tenders.forEach(t => {
            const days = daysUntil(t.deadlines.submission);
            const urgent = ['analysis', 'preparing'].includes(t.status) && days !== null && days >= 0 && days <= 3;
            el.list.appendChild(h('li', {}, h('a', {
                href: withCabinet(`tenders.html?id=${t.id}`), class: 'home-staff__item' + (t.id === currentId ? ' is-active' : ''),
                onclick: e => { e.preventDefault(); currentId = t.id; tab = 'info'; window.history.replaceState(null, '', withCabinet(`?id=${t.id}`)); render(); }
            },
            h('span', { class: 'home-staff__item-title' }, t.title || t.number || 'Закупка', urgent ? h('span', { class: 'home-ct__dot', title: 'Скоро срок подачи' }) : null),
            h('span', { class: 'home-staff__item-text' }, `${T.LAWS[t.law]} · ${T.STATUSES[t.status]}${t.deadlines.submission ? ' · подача ' + formatDate(t.deadlines.submission) : ''}`))));
        });
    }

    const field = (name, label, value, type, opts = {}) => {
        const input = type === 'textarea' ? h('textarea', { name, rows: opts.rows || 3 }) : type === 'select'
            ? h('select', { name }, opts.options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)))
            : h('input', { type: type || 'text', name, step: opts.step });
        if (type !== 'select') input.value = value ?? '';
        return h('label', { class: 'home-dialog__field' + (opts.wide ? ' home-ct__wide' : '') }, h('span', { class: 'home-dialog__label' }, label), input, opts.hint ? h('span', { class: 'home-dialog__hint' }, opts.hint) : null);
    };

    function renderInfo(t) {
        const form = h('form', { class: 'home-ct__form' },
            field('title', 'Предмет закупки', t.title, 'text', { wide: true }),
            field('law', 'Закон', t.law, 'select', { options: Object.entries(T.LAWS) }),
            field('number', 'Номер закупки', t.number),
            field('customer', 'Заказчик', t.customer),
            field('nmck', 'НМЦК, ₽', t.nmck, 'number'),
            field('links', 'Ссылки на закупку', t.links.join('\n'), 'textarea', { wide: true, rows: 2, hint: 'По одной в строке. Анализ ссылок выполняет тендерный специалист в чате.' }),
            field('bidSecurity', 'Обеспечение заявки', t.bidSecurity),
            field('contractSecurity', 'Обеспечение исполнения', t.contractSecurity),
            field('warrantySecurity', 'Обеспечение гарантийных обязательств', t.warrantySecurity),
            field('advance', 'Аванс', t.advance),
            field('payment', 'Условия оплаты', t.payment, 'textarea', { wide: true, rows: 2 }),
            field('requirements', 'Требования к участникам', t.requirements, 'textarea', { wide: true }),
            field('terms', 'Ключевые условия договора', t.terms, 'textarea', { wide: true }),
            field('status', 'Статус', t.status, 'select', { options: Object.entries(T.STATUSES) }),
            h('div', { class: 'home-ct__wide home-ct__info-actions' },
                h('button', { type: 'submit', class: 'home-btn home-btn--primary' }, 'Сохранить'),
                h('button', { type: 'button', class: 'home-btn home-btn--secondary', onclick: () => { if (!confirm('Удалить закупку из реестра?')) return; data.tenders = data.tenders.filter(x => x !== t); currentId = data.tenders[0] && data.tenders[0].id; save(); render(); } }, 'Удалить')));
        form.addEventListener('submit', e => {
            e.preventDefault();
            ['title', 'law', 'number', 'customer', 'nmck', 'bidSecurity', 'contractSecurity', 'warrantySecurity', 'advance', 'payment', 'requirements', 'terms', 'status'].forEach(n => { t[n] = form.elements[n].value.trim(); });
            t.links = form.elements.links.value.split('\n').map(s => s.trim()).filter(Boolean);
            log(t, 'Изменены сведения о закупке');
            save();
            render();
            notify('Сохранено.');
        });
        el.panel.appendChild(form);
        if (t.links.length) {
            el.panel.appendChild(h('p', { class: 'home-note' }, 'Источники: ', ...t.links.map((u, i) => [i ? ', ' : '', h('a', { href: u, target: '_blank', rel: 'noopener', class: 'home-ob__norm' }, u)])));
        }
    }

    function renderFiles(t) {
        const input = h('input', { type: 'file', multiple: true, hidden: true, onchange: async e => {
            const saved = await storeFiles([...e.target.files]);
            t.files.push(...saved.map(f => ({ ...f, at: Date.now() })));
            log(t, `Загружены документы: ${saved.map(f => f.name).join(', ')}`);
            save();
            render();
        } });
        el.panel.appendChild(h('section', { class: 'home-ct__block' },
            h('div', { class: 'home-ct__block-head' }, h('h3', { class: 'home-ct__block-title' }, 'Документация закупки'),
                h('button', { type: 'button', class: 'home-btn home-btn--secondary home-cab__small', onclick: () => input.click() }, 'Загрузить'), input),
            t.files.length
                ? h('ul', { class: 'home-ct__history' }, t.files.map(f => h('li', {},
                    h('button', { type: 'button', class: 'home-cab__reset-link', onclick: () => openFile(f) }, f.name),
                    h('span', { class: 'home-ct__history-date' }, `${Math.max(1, Math.round(f.size / 1024))} КБ`))))
                : h('p', { class: 'home-staff__empty' }, 'Извещение, техническое задание, проект договора, обоснование НМЦК. Если специалист не смог открыть документацию по ссылке, загрузите файлы сюда и приложите их в чате.')));
    }

    // ---- Financial calculation -----------------------------------------------------------

    function renderCalc(t) {
        const i = { ...T.DEFAULT_INPUT, nmck: Number(t.nmck) || 0, law: t.law, ...(t.calc || {}) };
        const form = h('form', { class: 'home-ct__form home-tn__calc' },
            field('nmck', 'НМЦК, ₽', i.nmck, 'number'),
            field('dropPct', 'Снижение цены на торгах, %', i.dropPct, 'number', { step: '0.1' }),
            field('costPct', 'Себестоимость, % от цены контракта', i.costPct, 'number', { step: '0.1', hint: 'Прогноз по вашей смете' }),
            field('durationMonths', 'Срок выполнения, мес.', i.durationMonths, 'number'),
            field('advancePct', 'Аванс, %', i.advancePct, 'number', { step: '0.1' }),
            field('paymentDelayDays', 'Оплата после выполнения, дней', i.paymentDelayDays, 'number'),
            field('bidSecPct', 'Обеспечение заявки, % НМЦК', i.bidSecPct, 'number', { step: '0.1', hint: 'По документации закупки' }),
            field('bidSecMethod', 'Способ обеспечения заявки', i.bidSecMethod, 'select', { options: [['money', 'Деньги'], ['guarantee', 'Банковская гарантия']] }),
            field('perfSecPct', 'Обеспечение исполнения, %', i.perfSecPct, 'number', { step: '0.1', hint: 'По документации закупки' }),
            field('perfSecBase', 'База обеспечения исполнения', i.perfSecBase, 'select', { options: [['price', 'Цена контракта'], ['nmck', 'НМЦК']] }),
            field('perfSecMethod', 'Способ обеспечения исполнения', i.perfSecMethod, 'select', { options: [['guarantee', 'Банковская гарантия'], ['money', 'Деньги']] }),
            field('antiDumpFactor', 'Коэффициент антидемпинговых мер', i.antiDumpFactor, 'number', { step: '0.1', hint: '44-ФЗ, ст. 37: при снижении на 25% и более. Проверьте документацию.' }),
            field('warrantySecPct', 'Обеспечение гарантийных обязательств, %', i.warrantySecPct, 'number', { step: '0.1' }),
            field('warrantyMonths', 'Срок гарантии по обеспечению, мес.', i.warrantyMonths, 'number'),
            field('bgRatePct', 'Комиссия банковской гарантии, % годовых', i.bgRatePct, 'number', { step: '0.1', hint: 'По предложению банка' }),
            field('creditRatePct', 'Ставка кредита на оборотные средства, %', i.creditRatePct, 'number', { step: '0.1' }),
            field('otherCosts', 'Прочие расходы, ₽', i.otherCosts, 'number', { hint: 'Площадка, ЭП, подготовка заявки' }),
            h('div', { class: 'home-ct__wide home-ct__info-actions' },
                h('button', { type: 'submit', class: 'home-btn home-btn--primary' }, 'Рассчитать'),
                h('button', { type: 'button', class: 'home-btn home-btn--secondary', onclick: () => T.calcToXlsx(`Расчёт — ${t.title || t.number || 'закупка'}`, T.calculate(t.calc || i)).catch(e => notify(e.message)) }, 'Excel')));
        form.addEventListener('submit', e => {
            e.preventDefault();
            const values = { law: t.law, antiDump: true };
            [...form.elements].forEach(x => { if (x.name) values[x.name] = x.type === 'number' ? Number(x.value) : x.value; });
            t.calc = values;
            log(t, 'Выполнен финансовый расчёт');
            save();
            render();
        });

        if (!t.calc) el.panel.appendChild(h('div', { class: 'home-ct__alert' }, 'Расчёт по типовым допущениям. Введите проценты обеспечений, аванс и условия оплаты из документации закупки, себестоимость — по вашей смете, и нажмите «Рассчитать».'));
        const r = T.calculate(i);
        const group = (title, note, items) => h('section', { class: 'home-ct__block' },
            h('div', { class: 'home-ct__block-head' }, h('h3', { class: 'home-ct__block-title' }, title)),
            h('p', { class: 'home-tn__group-note' }, note),
            h('ul', { class: 'home-tn__sums' }, items.map(([label, value, strong]) => h('li', { class: strong ? 'is-total' : '' }, h('span', {}, label), h('span', {}, value)))));
        el.panel.append(
            group('Суммы обеспечения', 'Блокируются на счёте или обеспечиваются банковской гарантией. Это не расход.', [
                ['Обеспечение заявки', money(r.security.bid)], ['Обеспечение исполнения', money(r.security.performance)], ['Обеспечение гарантийных обязательств', money(r.security.warranty)]]),
            group('Фактические расходы', 'Комиссии, проценты и прочие расходы участия и исполнения.', [
                ['Комиссия БГ: заявка', money(r.costs.bidGuarantee)], ['Комиссия БГ: исполнение', money(r.costs.performanceGuarantee)], ['Комиссия БГ: гарантийный период', money(r.costs.warrantyGuarantee)],
                ['Прочие расходы', money(r.costs.other)], ['Проценты за кассовый разрыв (прогноз)', money(r.costs.financing)], ['Итого', money(r.costs.total), true]]),
            group('Прогноз', 'Рассчитан по введённым допущениям: цена, себестоимость, график оплаты.', [
                ['Цена контракта', money(r.price)], ['Себестоимость', money(r.forecast.cost)], ['Прибыль', money(r.forecast.profit), true],
                ['Рентабельность', `${r.forecast.margin.toFixed(1)}%`], ['Потребность в оборотных средствах', money(r.forecast.workingCapital), true]]));
        if (r.notes.length) el.panel.appendChild(h('div', { class: 'home-ct__alert' }, r.notes.join(' ')));
        el.panel.appendChild(h('section', { class: 'home-ct__block' },
            h('div', { class: 'home-ct__block-head' }, h('h3', { class: 'home-ct__block-title' }, 'Движение денежных средств (прогноз)')),
            h('div', { class: 'home-cab__table-wrap' }, h('table', { class: 'home-cab__table' },
                h('thead', {}, h('tr', {}, ['Месяц', 'Поступления', 'Платежи', 'Остаток', 'Операции'].map(c => h('th', {}, c)))),
                h('tbody', {}, r.forecast.flow.map(f => h('tr', {}, h('td', {}, String(f.month)), h('td', {}, money(f.inflow)), h('td', {}, money(f.outflow)),
                    h('td', { class: f.balance < 0 ? 'home-tn__neg' : '' }, money(f.balance)), h('td', {}, f.items.join(', ')))))))));
        el.panel.appendChild(h('h3', { class: 'home-tn__form-title' }, 'Исходные данные'));
        el.panel.appendChild(form);
    }

    // ---- Application, deadlines and result --------------------------------------------------

    function renderApplication(t) {
        if (!t.checklist.length) t.checklist = CHECKLIST.map(text => ({ text, done: false }));
        const done = t.checklist.filter(c => c.done).length;
        el.panel.appendChild(h('ul', { class: 'home-ct__stats' }, [
            ['Подача заявки', t.deadlines.submission ? formatDate(t.deadlines.submission) : '—'], ['До подачи, дней', t.deadlines.submission ? String(daysUntil(t.deadlines.submission)) : '—'],
            ['Комплектность', `${done} / ${t.checklist.length}`], ['Статус', T.STATUSES[t.status]]
        ].map(([l, v]) => h('li', {}, h('span', { class: 'home-ct__stat-value' }, v), h('span', { class: 'home-ct__stat-label' }, l)))));

        const dates = h('form', { class: 'home-ct__form' },
            field('submission', 'Окончание подачи заявок', t.deadlines.submission, 'date'),
            field('review', 'Рассмотрение / торги', t.deadlines.review, 'date'),
            field('results', 'Подведение итогов', t.deadlines.results, 'date'),
            field('result', 'Результат участия', t.result, 'text', { hint: 'Например: победа, цена 41,8 млн ₽, протокол № 3' }),
            h('div', { class: 'home-ct__wide' }, h('button', { type: 'submit', class: 'home-btn home-btn--primary' }, 'Сохранить')));
        dates.addEventListener('submit', e => {
            e.preventDefault();
            ['submission', 'review', 'results'].forEach(n => { t.deadlines[n] = dates.elements[n].value; });
            t.result = dates.elements.result.value.trim();
            log(t, 'Изменены сроки и результат участия');
            save();
            render();
        });
        el.panel.appendChild(dates);

        el.panel.appendChild(h('section', { class: 'home-ct__block' },
            h('div', { class: 'home-ct__block-head' }, h('h3', { class: 'home-ct__block-title' }, 'Комплектность заявки'),
                h('button', { type: 'button', class: 'home-btn home-btn--secondary home-cab__small', onclick: () => { const text = prompt('Пункт проверки'); if (text) { t.checklist.push({ text, done: false }); save(); render(); } } }, 'Добавить пункт')),
            h('ul', { class: 'home-tn__check' }, t.checklist.map(c => h('li', {}, h('label', {},
                h('input', { type: 'checkbox', checked: c.done, onchange: e => { c.done = e.target.checked; log(t, `${c.done ? 'Выполнено' : 'Снята отметка'}: ${c.text}`); save(); render(); } }), ` ${c.text}`))))));

        const result = h('div', { class: 'home-ct__actions' });
        if (t.status === 'won') {
            result.append(
                h('button', { type: 'button', class: 'home-btn home-btn--primary', onclick: () => toContract(t) }, h('span', {}, t.contractId ? 'Договор создан' : 'Создать договор в «Контрактах»')),
                h('button', { type: 'button', class: 'home-btn home-btn--secondary', onclick: () => toObject(t) }, t.objectId ? 'Объект создан' : 'Создать объект'),
                t.calc ? h('button', { type: 'button', class: 'home-btn home-btn--secondary', onclick: () => toCashflow(t) }, t.cashflowAt ? 'Прогноз в ДДС' : 'Перенести прогноз в ДДС') : null);
        } else {
            result.append(h('p', { class: 'home-note' }, 'После победы (статус «Победа» во вкладке «Сведения») закупку можно передать в «Контракты» и «Объекты».'));
        }
        el.panel.appendChild(result);
    }

    function renderReports(t) {
        if (!t.reports.length) {
            el.panel.appendChild(h('p', { class: 'home-staff__empty' }, 'Справок пока нет. Нажмите «Анализ в чате»: тендерный специалист откроет ссылки, подготовит справку, а её можно сохранить сюда из чата.'));
            return;
        }
        t.reports.forEach(rep => {
            const body = h('div', { class: 'home-chat__body home-tn__report' });
            body.innerHTML = renderMarkdown(rep.text);
            el.panel.appendChild(h('section', { class: 'home-ct__block' },
                h('div', { class: 'home-ct__block-head' }, h('h3', { class: 'home-ct__block-title' }, `Справка от ${formatStamp(rep.at)}`),
                    h('div', { class: 'home-ct__filters' },
                        h('button', { type: 'button', class: 'home-btn home-btn--secondary home-cab__small', onclick: () => T.reportToDocx(`Справка — ${t.title || t.number || 'закупка'}`, rep.text).catch(e => notify(e.message)) }, 'Word'),
                        h('button', { type: 'button', class: 'home-btn home-btn--secondary home-cab__small', onclick: () => { try { T.reportToPdf(`Справка — ${t.title || t.number || 'закупка'}`, body.innerHTML); } catch (e) { notify(e.message); } } }, 'PDF'))),
                h('div', { class: 'home-tn__report-wrap' }, body)));
        });
    }

    function renderHistory(t) {
        el.panel.appendChild(h('section', { class: 'home-ct__block' }, h('ul', { class: 'home-ct__history' },
            t.log.map(l => h('li', {}, h('span', { class: 'home-ct__history-date' }, formatStamp(l.at)), h('span', {}, l.text))))));
    }

    // Small markdown renderer for saved reports (same rules as the chat)
    function renderMarkdown(text) {
        const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        const out = [];
        let table = null;
        let list = false;
        const flush = () => {
            if (table) { out.push(`<div class="home-chat__table"><table>${table.map((r, i) => `<tr>${r.map(c => i ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`).join('')}</tr>`).join('')}</table></div>`); table = null; }
            if (list) { out.push('</ul>'); list = false; }
        };
        text.split('\n').forEach(line => {
            if (/^\s*\|.*\|\s*$/.test(line)) {
                if (list) { out.push('</ul>'); list = false; }
                if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) return;
                (table = table || []).push(line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
                return;
            }
            const heading = line.match(/^#{1,6}\s+(.*)/);
            const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
            if (heading) { flush(); out.push(`<h4>${inline(heading[1])}</h4>`); }
            else if (bullet) { if (table) flush(); if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(bullet[1])}</li>`); }
            else if (line.trim()) { flush(); out.push(`<p>${inline(line)}</p>`); }
            else flush();
        });
        flush();
        return out.join('');
    }

    // ---- Integrations -------------------------------------------------------------------

    function contextText(t) {
        return [
            `Закупка: ${t.title || '—'}${t.number ? ', № ' + t.number : ''} (${T.LAWS[t.law]}).`,
            t.customer ? `Заказчик: ${t.customer}.` : '',
            t.nmck ? `НМЦК: ${money(Number(t.nmck))}.` : '',
            t.bidSecurity ? `Обеспечение заявки: ${t.bidSecurity}.` : '',
            t.contractSecurity ? `Обеспечение исполнения: ${t.contractSecurity}.` : '',
            t.advance ? `Аванс: ${t.advance}.` : '',
            t.payment ? `Оплата: ${t.payment}.` : '',
            t.deadlines.submission ? `Подача заявок до ${formatDate(t.deadlines.submission)}.` : '',
            t.links.length ? `Ссылки:\n${t.links.join('\n')}` : 'Ссылок нет — приложите документацию закупки.'
        ].filter(Boolean).join('\n');
    }

    function askTender(t) {
        if (typeof window.AirchitectOpenSpecialist !== 'function') return;
        window.AirchitectOpenSpecialist('tender-specialist', `${contextText(t)}\n\nПодготовь аналитическую справку по закупке: требования, обеспечения и расходы, условия оплаты, риски, рентабельность и рекомендации.`);
    }

    function askExpert(slug, t) {
        if (typeof window.AirchitectOpenSpecialist !== 'function') return;
        const task = {
            'financier': 'Оцени финансовую нагрузку: обеспечения, банковские гарантии, кассовые разрывы и потребность в оборотных средствах.',
            'construction-lawyer': 'Оцени правовые риски проекта договора и требований к участникам.',
            'security-specialist': 'Проверь заказчика: надёжность, платёжную дисциплину, судебные споры.'
        }[slug];
        const calc = t.calc ? T.calculate(t.calc) : null;
        window.AirchitectOpenSpecialist(slug, `${contextText(t)}${calc ? `\nРасчёт: цена ${money(calc.price)}, обеспечение исполнения ${money(calc.security.performance)}, расходы ${money(calc.costs.total)}, потребность в оборотных средствах ${money(calc.forecast.workingCapital)}, рентабельность ${calc.forecast.margin.toFixed(1)}% (прогноз).` : ''}\n\n${task}\n\nВопрос: `);
    }

    function readStore(key, fallback) {
        try {
            return JSON.parse(localStorage.getItem(key)) || fallback;
        } catch (e) {
            return fallback;
        }
    }

    // Won tender -> contract in Контракты with the obligations known from the tender
    function toContract(t) {
        if (t.contractId) return openIn('contracts', t.contractId);
        const store = readStore('airchitect-contracts-v1', { contracts: [] });
        const settings = readStore('airchitect-cabinet-v1', {});
        const calc = t.calc ? T.calculate(t.calc) : null;
        const id = T.uid();
        const ob = (text, clause) => ({ id: T.uid(), party: 'contractor', text, clause, due: '', condition: '', responsible: '', status: 'active', confirmed: false, source: 'auto', files: [] });
        store.contracts.unshift({
            id, number: '', date: '', subject: t.title, customer: t.customer, contractor: settings.company || '', price: calc ? money(calc.price) : (t.nmck ? money(Number(t.nmck)) : ''),
            start: '', end: '', file: null,
            obligations: [
                t.contractSecurity || calc ? ob(`Предоставить обеспечение исполнения договора${calc ? ' ' + money(calc.security.performance) : ''}${t.contractSecurity ? ' (' + t.contractSecurity + ')' : ''}`, 'документация закупки') : null,
                t.warrantySecurity ? ob(`Предоставить обеспечение гарантийных обязательств (${t.warrantySecurity})`, 'документация закупки') : null
            ].filter(Boolean),
            notices: [], events: [], log: [{ at: Date.now(), text: `Создан из закупки ${t.number ? '№ ' + t.number : t.title}` }]
        });
        localStorage.setItem('airchitect-contracts-v1', JSON.stringify(store));
        t.contractId = id;
        log(t, 'Создан договор в разделе «Контракты»');
        save();
        render();
        notify('Договор создан в «Контрактах». Укажите номер, дату и приложите подписанный договор.');
    }

    function toObject(t) {
        if (t.objectId) return openIn('objects', t.objectId);
        const store = readStore('airchitect-objects-v1', { objects: [] });
        const id = T.uid();
        store.objects.unshift({ id, name: t.title || 'Объект', code: '', address: '', stage: '', participants: t.customer ? [{ id: T.uid(), role: 'Застройщик', org: t.customer, person: '', basis: '' }] : [], contractIds: t.contractId ? [t.contractId] : [], works: [], rd: [], id: [], materials: [], remarks: [], handovers: [], log: [{ at: Date.now(), text: 'Создан из закупки' }] });
        localStorage.setItem('airchitect-objects-v1', JSON.stringify(store));
        t.objectId = id;
        log(t, 'Создан объект в разделе «Объекты»');
        save();
        render();
        notify('Объект создан в «Объектах».');
    }

    // Won tender -> monthly forecast of the calculation as unconfirmed plan in Движение денежных средств
    function toCashflow(t) {
        if (t.cashflowAt) return openIn('cashflow', '');
        const start = prompt('Дата начала работ (ГГГГ-ММ-ДД): от неё строится помесячный план', today());
        if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return;
        const store = readStore('airchitect-cashflow-v1', {});
        store.ops = store.ops || [];
        const flow = T.calculate(t.calc).forecast.flow;
        const at = n => { const d = new Date(start + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
        const op = (dir, f, amount) => ({
            id: T.uid(), dir, category: dir === 'in' ? (f.month === 0 && t.calc.advancePct ? 'advance' : 'work') : 'other_out',
            title: `Прогноз тендера «${t.title || t.number}»: ${dir === 'in' ? 'поступления' : 'расходы'}, мес. ${f.month}`,
            counterparty: dir === 'in' ? t.customer : '', contractId: t.contractId || '', objectId: t.objectId || '', obligationId: '',
            date: at(f.month), amount: Math.round(amount), gross: 0, advanceOffset: 0, retention: 0, basis: '', confirmed: false, priority: 'normal',
            payments: [], note: f.items.join(', '), source: 'tender', created: Date.now()
        });
        flow.forEach(f => {
            if (f.inflow > 0) store.ops.push(op('in', f, f.inflow));
            if (f.outflow > 0) store.ops.push(op('out', f, f.outflow));
        });
        localStorage.setItem('airchitect-cashflow-v1', JSON.stringify(store));
        t.cashflowAt = Date.now();
        log(t, 'Прогноз расчёта перенесён в «Движение денежных средств» как план');
        save();
        render();
        notify('Прогноз перенесён в ДДС как неподтверждённый план. Уточните суммы и даты по договору.');
    }

    function openIn(section, id) {
        if (inCabinet && window.parent !== window) window.parent.location.hash = id ? `${section}/${encodeURIComponent(id)}` : section;
        else location.href = id ? `${section}.html?id=${encodeURIComponent(id)}` : `${section}.html`;
    }

    // ---- Wiring ---------------------------------------------------------------------------

    root.querySelector('[data-tn-add]').addEventListener('click', () => {
        const t = T.blankTender({ title: 'Новая закупка' });
        data.tenders.unshift(t);
        currentId = t.id;
        tab = 'info';
        save();
        render();
    });
    // Presentation example: invented values, marked as demo, without links to real procurements
    root.querySelector('[data-tn-demo]').addEventListener('click', () => {
        const inDays = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
        const t = T.blankTender({
            title: 'Демо: капитальный ремонт здания школы', law: '44', status: 'preparing', number: 'демо', customer: 'Демо-заказчик (учреждение)', nmck: '48000000',
            bidSecurity: '1% НМЦК', contractSecurity: '5% цены контракта', warrantySecurity: 'не требуется', advance: '30%', payment: 'Аванс 30%, оплата выполненных работ в течение 7 рабочих дней после подписания документа о приемке',
            requirements: 'Членство в СРО; дополнительные требования к опыту — исполненный договор на работы по капитальному ремонту объекта капитального строительства',
            terms: 'Срок выполнения — 6 месяцев; гарантийный срок — 5 лет; неустойки по ст. 34 44-ФЗ',
            deadlines: { submission: inDays(6), review: inDays(8), results: inDays(10) },
            calc: { ...T.DEFAULT_INPUT, nmck: 48000000, dropPct: 7, costPct: 84, durationMonths: 6, advancePct: 30, paymentDelayDays: 10, law: '44' }
        });
        log(t, 'Создан демо-пример закупки');
        data.tenders.unshift(t);
        currentId = t.id;
        tab = 'calc';
        save();
        render();
    });
    window.addEventListener('storage', e => {
        if (e.key !== T.STORE_KEY) return;
        data = T.read();
        render();
    });

    render();
});
