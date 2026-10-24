// Counterparties (Контрагенты): store and analysis shared by counterparties.html, the cabinet and the chat.
// Registry data comes from the server (/registry: ЕГРЮЛ, «Прозрачный бизнес», ГИР БО, НОСТРОЙ);
// courts, enforcement, bankruptcy, procurement registers and reputation are entered from official
// sources by the user, each fact with its source, link and date. Nothing is generated or guessed:
// a category without data is shown as «нет данных», never as a low risk.

(function () {
    const STORE_KEY = 'airchitect-counterparties-v1';
    const LEVELS = ['Низкий', 'Умеренный', 'Высокий', 'Критический'];
    const CATEGORIES = {
        registration: 'Регистрационные риски', financial: 'Финансовые риски', court: 'Судебные риски', enforcement: 'Исполнительные риски',
        reputation: 'Репутационные риски', corporate: 'Корпоративные риски', construction: 'Строительные риски', contract: 'Договорные риски'
    };
    const ROLES = { customer: 'Заказчик', contractor: 'Подрядчик', subcontractor: 'Субподрядчик', supplier: 'Поставщик', intermediary: 'Посредник' };
    const FACT_KINDS = {
        court: 'Арбитражное дело', enforcement: 'Исполнительное производство', bankruptcy: 'Банкротство (ЕФРСБ)', rnp: 'Реестр недобросовестных поставщиков',
        reputation: 'Деловая репутация', license: 'Лицензия / разрешение', experience: 'Опыт исполнения договоров', relation: 'Корпоративная связь', checked: 'Проверено: сведений нет'
    };
    const COURT_TYPES = { payment: 'Неоплата работ', advance: 'Взыскание аванса', penalty: 'Неустойка', quality: 'Качество работ', termination: 'Расторжение договора', other: 'Иное' };
    const COURT_STATUS = { pending: 'Рассматривается', satisfied: 'Требования удовлетворены', partial: 'Удовлетворены частично', rejected: 'В иске отказано', settled: 'Мировое соглашение' };
    const DECISIONS = {
        recommended: 'Рекомендуется сотрудничество',
        conditional: 'Рекомендуется при выполнении условий',
        more_check: 'Требуется дополнительная проверка',
        not_recommended: 'Не рекомендуется сотрудничество'
    };
    const MANUAL = ['court', 'enforcement', 'bankruptcy', 'rnp', 'reputation'];

    function read() {
        try {
            const d = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
            return { items: d.items || [] };
        } catch (e) {
            return { items: [] };
        }
    }
    function write(d) {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(d));
            return true;
        } catch (e) {
            return false;
        }
    }
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const today = () => new Date().toISOString().slice(0, 10);
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

    function validInn(inn) {
        const s = String(inn || '').trim();
        if (!/^\d{10}$|^\d{12}$/.test(s)) return false;
        const d = s.split('').map(Number);
        const check = (c, n) => (c.reduce((sum, k, i) => sum + k * d[i], 0) % 11) % 10 === d[n];
        if (s.length === 10) return check([2, 4, 10, 3, 5, 9, 4, 6, 8], 9);
        return check([7, 2, 4, 10, 3, 5, 9, 4, 6, 8], 10) && check([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8], 11);
    }

    function blank(fields = {}) {
        return {
            id: uid(), inn: '', name: '', roles: [], contractIds: [], objectKeys: [], tenderIds: [], checks: [], facts: [], files: [], finance: [],
            deal: { amount: '', advancePct: '', workType: '', needSro: false, needExperience: false },
            monitoring: { everyDays: 30, next: '' }, changes: [], log: [{ at: Date.now(), text: 'Карточка создана' }], created: Date.now(), ...fields
        };
    }

    const lastCheck = c => (c.checks || [])[0] || null;

    // Financial statements: registry (ГИР БО, thousand rubles) or entered by the user
    function financeYears(c) {
        const ch = lastCheck(c);
        const byYear = {};
        ((ch && ch.data && ch.data.finance) || []).forEach(y => { byYear[y.year] = { year: y.year, lines: y.lines, source: 'ФНС: ГИР БО', url: 'https://bo.nalog.gov.ru/', date: ch.data.fetchedAt.slice(0, 10) }; });
        (c.finance || []).forEach(y => { if (!byYear[y.year]) byYear[y.year] = { year: y.year, lines: y.lines, source: y.source, url: y.url || '', date: y.date, manual: true }; });
        return Object.values(byYear).sort((a, b) => a.year - b.year);
    }

    // Ratios from the balance and the financial results statement (amounts in thousand rubles)
    function ratios(lines) {
        const v = k => num(lines[k]);
        const div = (a, b) => (a === null || b === null || b === 0 ? null : a / b);
        const liabilities = (v('1400') || 0) + (v('1500') || 0);
        return {
            revenue: v('2110'), profit: v('2400'), assets: v('1600'), equity: v('1300'), current: v('1200'), shortDebt: v('1500'), longDebt: v('1400'), cash: v('1250'),
            currentRatio: div(v('1200'), v('1500')),
            quickRatio: v('1200') === null ? null : div(v('1200') - (v('1210') || 0), v('1500')),
            cashRatio: div(v('1250'), v('1500')),
            autonomy: div(v('1300'), v('1600')),
            debtToAssets: v('1600') ? liabilities / v('1600') : null,
            margin: div(v('2400'), v('2110')),
            salesMargin: div(v('2200'), v('2110'))
        };
    }

    // Responsibility level text of НОСТРОЙ ("не превышает шестьдесят миллионов рублей" / "... и более") -> rubles
    const WORDS = { один: 1, одного: 1, два: 2, двух: 2, три: 3, трёх: 3, трех: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90, сто: 100, двести: 200, триста: 300, четыреста: 400, пятьсот: 500, шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900 };
    function levelLimit(text) {
        const t = String(text || '').toLowerCase();
        if (!t) return null;
        const m = t.match(/([а-яё\s]+?)\s+(миллион|миллиард)/);
        const digits = t.match(/(\d[\d\s]*)\s*(млн|млрд|миллион|миллиард)/);
        let base = null;
        let mult = 1e6;
        if (digits) { base = Number(digits[1].replace(/\s/g, '')); mult = /млрд|миллиард/.test(digits[2]) ? 1e9 : 1e6; }
        else if (m) { base = m[1].trim().split(/\s+/).reduce((s, w) => s + (WORDS[w] || 0), 0) || null; mult = m[2] === 'миллиард' ? 1e9 : 1e6; }
        if (!base) return null;
        return { amount: base * mult, open: /и более/.test(t) };
    }

    // Indirect links between counterparties: same head (by name) from ЕГРЮЛ; confirmed links are relation facts
    const headName = c => { const ch = lastCheck(c); const g = ch && ch.data && ch.data.egrul && ch.data.egrul.head; return g ? g.split(':').slice(1).join(':').trim().toUpperCase() : ''; };
    function relations(store, c) {
        const out = [];
        const h = headName(c);
        store.items.forEach(o => {
            if (o === c) return;
            if (h && headName(o) === h) out.push({ with: o, type: 'Совпадает руководитель (по ФИО в ЕГРЮЛ)', confirmed: false, source: 'ФНС: ЕГРЮЛ' });
        });
        // Links recorded in other cards that point to this counterparty
        store.items.forEach(o => (o.facts || []).filter(f => f.kind === 'relation' && f.withInn === c.inn && o !== c).forEach(f => out.push({ with: o, type: f.text, confirmed: !!f.confirmed, source: f.source, conflict: !!f.conflict })));
        (c.facts || []).filter(f => f.kind === 'relation').forEach(f => {
            const o = store.items.find(x => x.inn === f.withInn);
            out.push({ with: o || { name: f.withName || f.withInn, inn: f.withInn }, type: f.text, confirmed: !!f.confirmed, source: f.source, conflict: !!f.conflict, fact: f });
        });
        return out;
    }

    // ---- Risk assessment: transparent rules, each factor with its evidence ---------------------------

    function assess(c, store) {
        const ch = lastCheck(c);
        const d = ch && ch.data;
        const factors = [];
        const nodata = {};
        const add = (cat, level, text, source, measure) => factors.push({ cat, level, text, source, measure });
        const checkedNone = kind => (c.facts || []).some(f => f.kind === 'checked' && f.area === kind);
        const facts = kind => (c.facts || []).filter(f => f.kind === kind);
        const years = financeYears(c);
        const last = years[years.length - 1];
        const prev = years[years.length - 2];
        const r = last ? ratios(last.lines) : null;
        const deal = c.deal || {};
        const amount = num(deal.amount);

        // Registration
        if (!d || !d.egrul) nodata.registration = 'Нет сведений ЕГРЮЛ/ЕГРИП: выполните проверку по ИНН или загрузите выписку.';
        else {
            const src = `ФНС: ЕГРЮЛ, ${ruDate(d.fetchedAt)}`;
            if (d.egrul.liquidated) add('registration', 3, `Прекратил деятельность ${d.egrul.liquidated}.`, src, 'Договор не заключать.');
            if (d.pb && d.pb.liquidation) add('registration', 3, 'Находится в процессе ликвидации.', 'ФНС: «Прозрачный бизнес»', 'Договор не заключать до выяснения обстоятельств.');
            if (d.pb && d.pb.statusCode && d.pb.statusCode !== '10' && !d.pb.liquidation) add('registration', 2, `Статус: ${d.pb.status}.`, 'ФНС: «Прозрачный бизнес»', 'Запросить пояснения и документы о статусе.');
            if (d.pb && d.pb.unreliable) add('registration', 2, 'В ЕГРЮЛ есть отметка о недостоверности сведений.', 'ФНС: «Прозрачный бизнес»', 'Запросить подтверждение адреса и полномочий руководителя.');
            const reg = (d.egrul.registered || '').split('.').reverse().join('-');
            if (reg) {
                const months = (Date.now() - new Date(reg + 'T00:00:00').getTime()) / (30.44 * 86400000);
                if (months < 3) add('registration', 2, `Зарегистрирован менее 3 месяцев назад (${d.egrul.registered}).`, src, 'Без аванса, поэтапная оплата по факту выполнения.');
                else if (months < 12) add('registration', 1, `Зарегистрирован менее года назад (${d.egrul.registered}).`, src, 'Ограничить аванс, запросить подтверждение ресурсов.');
            }
            if (/временно исполняющ/i.test(d.egrul.head || '')) add('registration', 1, `Руководитель — временно исполняющий обязанности (${d.egrul.head}).`, src, 'Проверить полномочия подписанта договора.');
            if (!factors.some(f => f.cat === 'registration')) add('registration', 0, `Действующая организация, зарегистрирована ${d.egrul.registered}; отметок о недостоверности нет.`, src);
        }

        // Finance
        if (!last) nodata.financial = 'Нет бухгалтерской отчётности: для ИП и организаций, освобождённых от публикации, загрузите отчётность вручную.';
        else {
            const src = `${last.source}, ${last.year} г.`;
            if (r.equity !== null && r.equity < 0) add('financial', 3, `Отрицательный собственный капитал: ${fmtK(r.equity)}.`, src, 'Не выдавать аванс; обеспечение исполнения — банковская гарантия.');
            if (r.profit !== null && r.profit < 0) {
                const prevLoss = prev && num(prev.lines['2400']) < 0;
                add('financial', prevLoss ? 2 : 1, `Убыток ${fmtK(r.profit)}${prevLoss ? ', второй год подряд' : ''}.`, src, 'Поэтапная оплата, обеспечение возврата аванса.');
            }
            if (r.currentRatio !== null && r.currentRatio < 1) add('financial', r.currentRatio < 0.5 ? 2 : 1, `Коэффициент текущей ликвидности ${r.currentRatio.toFixed(2)} (меньше 1).`, src, 'Ограничить аванс, контролировать целевое использование.');
            if (r.debtToAssets !== null && r.debtToAssets > 0.7) add('financial', r.debtToAssets > 0.9 ? 2 : 1, `Обязательства составляют ${(r.debtToAssets * 100).toFixed(0)}% активов.`, src, 'Запросить расшифровку обязательств.');
            if (prev && num(prev.lines['2110']) && r.revenue !== null && r.revenue < num(prev.lines['2110']) * 0.7) add('financial', 1, `Выручка снизилась на ${((1 - r.revenue / num(prev.lines['2110'])) * 100).toFixed(0)}% к ${prev.year} г.`, src, 'Уточнить причины снижения выручки.');
            if (Number(last.year) < new Date().getFullYear() - 2) add('financial', 1, `Последняя доступная отчётность — за ${last.year} г.`, src, 'Запросить актуальную отчётность.');
            if (!factors.some(f => f.cat === 'financial')) add('financial', 0, `Показатели ${last.year} г. без признаков ухудшения платёжеспособности.`, src);
        }

        // Courts: claims are not proven violations; established (decided) claims weigh more
        const courts = facts('court');
        if (!courts.length && !checkedNone('court')) nodata.court = 'Судебные дела не проверены: проверьте картотеку арбитражных дел и внесите дела или отметку «сведений нет».';
        else {
            const asDefendant = courts.filter(f => f.role === 'defendant');
            const decided = asDefendant.filter(f => ['satisfied', 'partial'].includes(f.status));
            const claimed = asDefendant.reduce((s, f) => s + (num(f.amount) || 0), 0);
            const proven = decided.reduce((s, f) => s + (num(f.amount) || 0), 0);
            const revenue = r && r.revenue !== null ? r.revenue * 1000 : null;
            const construction = asDefendant.filter(f => ['payment', 'advance', 'penalty', 'quality', 'termination'].includes(f.claimType));
            if (decided.length) add('court', revenue && proven > revenue * 0.1 ? 2 : 1, `Требования к контрагенту удовлетворены судом (установленные обстоятельства): дел — ${decided.length}, на ${fmtR(proven)}.`, 'внесено по картотеке арбитражных дел', 'Учесть в условиях договора: обеспечение, неустойка, поэтапная приёмка.');
            const pending = asDefendant.filter(f => f.status === 'pending');
            if (pending.length) add('court', revenue && claimed > revenue * 0.1 ? 2 : 1, `Рассматриваются иски к контрагенту (заявленные требования, не доказанные нарушения): дел — ${pending.length}, на ${fmtR(pending.reduce((s, f) => s + (num(f.amount) || 0), 0))}.`, 'внесено по картотеке арбитражных дел', 'Отслеживать результаты рассмотрения.');
            if (construction.length >= 3) add('court', 2, `Повторяющиеся строительные споры в качестве ответчика: ${construction.length} (${[...new Set(construction.map(f => COURT_TYPES[f.claimType]))].join(', ')}).`, 'внесено по картотеке арбитражных дел', 'Проверить причины споров у прежних контрагентов; усилить контроль качества и сроков.');
            if (!factors.some(f => f.cat === 'court')) add('court', 0, asDefendant.length ? 'Существенных споров в качестве ответчика не выявлено.' : 'Дел в качестве ответчика не выявлено.', courts.length ? 'внесено по картотеке арбитражных дел' : 'отметка пользователя');
        }

        // Enforcement, bankruptcy, procurement registers
        const enf = facts('enforcement').filter(f => f.status !== 'ended');
        const bank = facts('bankruptcy');
        const rnp = facts('rnp').filter(f => f.status !== 'excluded');
        const enfChecked = facts('enforcement').length || checkedNone('enforcement');
        if (!enfChecked && !bank.length && !checkedNone('bankruptcy') && !rnp.length && !checkedNone('rnp')) nodata.enforcement = 'Не проверены ФССП, ЕФРСБ и реестр недобросовестных поставщиков.';
        else {
            const sum = enf.reduce((s, f) => s + (num(f.amount) || 0), 0);
            const revenue = r && r.revenue !== null ? r.revenue * 1000 : null;
            if (enf.length) add('enforcement', revenue && sum > revenue * 0.05 ? 2 : 1, `Действующие исполнительные производства: ${enf.length} на ${fmtR(sum)}.`, 'внесено по банку данных ФССП', 'Запросить сведения о погашении; не выдавать аванс до погашения.');
            bank.forEach(f => add('enforcement', f.stage === 'intent' ? 2 : 3, f.text, f.source || 'ЕФРСБ', f.stage === 'intent' ? 'Отложить заключение договора до выяснения обстоятельств.' : 'Договор не заключать.'));
            rnp.forEach(f => add('enforcement', 3, `Включён в реестр недобросовестных поставщиков (${f.law || '44-ФЗ / 223-ФЗ'}): ${f.text}`, f.source || 'ЕИС', 'Не допускать к закупке; проверить требования к участникам.'));
            if (!enf.length && !bank.length && !rnp.length) add('enforcement', 0, 'Исполнительных производств, сведений о банкротстве и включения в РНП не выявлено.', 'отметки пользователя по официальным источникам');
            if (!enfChecked) nodata.enforcementPart = 'ФССП не проверен.';
        }

        // Reputation: only confirmed circumstances raise the risk
        const rep = facts('reputation');
        if (!rep.length && !checkedNone('reputation')) nodata.reputation = 'Деловая репутация не проверялась.';
        else {
            rep.filter(f => f.confirmed).forEach(f => add('reputation', num(f.severity) || 1, f.text, f.source, 'Учесть при выборе условий договора.'));
            if (!rep.some(f => f.confirmed)) add('reputation', 0, rep.length ? `Неподтверждённые сведения (${rep.length}) не учитываются в оценке.` : 'Подтверждённых негативных обстоятельств не выявлено.', 'отметки пользователя');
        }

        // Corporate links
        const rel = relations(store, c);
        rel.filter(x => x.conflict && x.confirmed).forEach(x => add('corporate', 2, `Подтверждённый конфликт интересов: ${x.type} — ${x.with.name}.`, x.source, 'Решение о сотрудничестве принимать с учётом конфликта интересов, вне участия заинтересованных лиц.'));
        rel.filter(x => !x.confirmed).forEach(x => add('corporate', 1, `Косвенный признак возможной связи: ${x.type} — ${x.with.name}. Не является доказательством аффилированности.`, x.source, 'Уточнить связь по ЕГРЮЛ (учредители, руководители).'));
        if (!factors.some(f => f.cat === 'corporate')) add('corporate', 0, rel.length ? 'Подтверждённые связи не образуют конфликта интересов.' : 'Связей с другими контрагентами в базе не выявлено.', 'ЕГРЮЛ и карточки контрагентов');

        // Construction: SRO, licenses, experience for the work under the contract
        if (deal.needSro) {
            const sro = (d && d.sro) || [];
            const active = sro.find(s => s.status === 'Является членом' && (!s.right || s.right === 'Действует'));
            if (!d) nodata.construction = 'Членство в СРО не проверено.';
            else if (!active) add('construction', 3, sro.length ? `Не является действующим членом СРО (${sro.map(s => s.status).join(', ')}).` : 'Сведений о членстве в СРО строителей нет в реестре НОСТРОЙ.', `НОСТРОЙ, ${ruDate(d.fetchedAt)}`, 'Не допускать к работам, требующим членства в СРО (ст. 55.8 ГрК РФ), либо привлечь члена СРО.');
            else {
                add('construction', 0, `Член ${active.sro} (${active.sroNumber}), право ${active.right || 'действует'}.`, `НОСТРОЙ, ${ruDate(d.fetchedAt)}`);
                const lim = levelLimit(active.levelOdoCost);
                if (amount && lim && !lim.open && amount > lim.amount) add('construction', 2, `Сумма договора ${fmtR(amount)} больше предела уровня ответственности по ОДО (${active.levelOdo}: ${active.levelOdoCost}).`, 'НОСТРОЙ', 'Проверить применимость ОДО к договору; запросить повышение уровня или иное обеспечение.');
                else if (amount && !active.levelOdo) add('construction', 1, 'Нет взноса в компенсационный фонд обеспечения договорных обязательств: участие в конкурентных закупках ограничено.', 'НОСТРОЙ', 'Проверить требования закупки.');
            }
        }
        facts('license').filter(f => f.until && f.until < today()).forEach(f => add('construction', 2, `Истёк срок лицензии: ${f.text}.`, f.source, 'Запросить действующую лицензию.'));
        if (deal.needExperience && !facts('experience').length) add('construction', 1, 'Нет подтверждённого опыта аналогичных работ.', 'карточка контрагента', 'Запросить договоры и акты по аналогичным объектам или проверить контракты в ЕИС.');
        if (!factors.some(f => f.cat === 'construction') && !nodata.construction) add('construction', 0, deal.needSro ? 'Требования по СРО выполнены.' : 'Требования к СРО и лицензиям для сделки не заданы.', 'карточка контрагента');

        // Contract: size and advance against confirmed resources
        if (!amount) nodata.contract = 'Не указана сумма предполагаемого договора.';
        else if (!r || r.revenue === null) nodata.contract = 'Нет данных о выручке для сопоставления с суммой договора.';
        else {
            const revenue = r.revenue * 1000;
            const share = amount / revenue;
            const src = `${last.source}, ${last.year} г.`;
            if (share > 1) add('contract', 2, `Сумма договора ${fmtR(amount)} больше годовой выручки ${fmtR(revenue)} (в ${share.toFixed(1).replace('.', ',')} раза): риск недостаточности подтверждённых ресурсов. Это не признак недобросовестности.`, src, 'Поэтапная оплата, банковская гарантия исполнения, контроль ресурсов на объекте.');
            else if (share > 0.5) add('contract', 1, `Сумма договора — ${(share * 100).toFixed(0)}% годовой выручки.`, src, 'Поэтапная оплата, контроль графика.');
            else add('contract', 0, `Сумма договора — ${(share * 100).toFixed(0)}% годовой выручки.`, src);
            const adv = num(deal.advancePct);
            if (adv && r.equity !== null) {
                const advance = amount * adv / 100;
                const eq = r.equity * 1000;
                if (eq <= 0 || advance > eq) add('contract', 2, `Аванс ${fmtR(advance)} больше собственного капитала (${fmtR(eq)}).`, src, 'Банковская гарантия возврата аванса, выдача аванса частями.');
                else if (advance > eq * 0.5) add('contract', 1, `Аванс ${fmtR(advance)} превышает половину собственного капитала.`, src, 'Обеспечение возврата аванса.');
            }
        }

        const perCat = {};
        Object.keys(CATEGORIES).forEach(k => {
            const list = factors.filter(f => f.cat === k);
            perCat[k] = { level: list.length ? Math.max(...list.map(f => f.level)) : null, factors: list, nodata: nodata[k] || (k === 'enforcement' ? nodata.enforcementPart : '') };
        });
        const levels = factors.map(f => f.level);
        const overall = levels.length ? Math.max(...levels) : null;
        let decision;
        if (overall === 3) decision = 'not_recommended';
        else if (nodata.registration || nodata.financial) decision = 'more_check';
        else if (overall === 2) decision = 'conditional';
        else if (Object.keys(nodata).filter(k => ['court', 'enforcement'].includes(k)).length) decision = 'more_check';
        else decision = overall === 1 ? 'conditional' : 'recommended';
        const measures = [...new Set(factors.filter(f => f.level > 0 && f.measure).map(f => f.measure))];
        return { factors, perCat, nodata, overall, decision, measures, ratios: r, years };
    }

    const ruDate = iso => String(iso || '').slice(0, 10).split('-').reverse().join('.');
    const fmtR = v => `${Math.round(v).toLocaleString('ru-RU')} ₽`;
    const fmtK = v => `${Math.round(v).toLocaleString('ru-RU')} тыс. ₽`;

    // ---- Monitoring: confirmed changes between two registry checks ----------------------------------------

    function changes(prev, next) {
        const out = [];
        if (!prev || !next) return out;
        const a = prev.data || {};
        const b = next.data || {};
        const src = `${b.fetchedAt ? b.fetchedAt.slice(0, 10) : ''}`;
        const cmp = (label, x, y, source) => { if ((x || '') !== (y || '')) out.push({ text: `${label}: «${x || '—'}» → «${y || '—'}»`, source: `${source}, ${src}` }); };
        cmp('Наименование', a.egrul && a.egrul.shortName, b.egrul && b.egrul.shortName, 'ФНС: ЕГРЮЛ');
        cmp('Руководитель', a.egrul && a.egrul.head, b.egrul && b.egrul.head, 'ФНС: ЕГРЮЛ');
        cmp('Прекращение деятельности', a.egrul && a.egrul.liquidated, b.egrul && b.egrul.liquidated, 'ФНС: ЕГРЮЛ');
        cmp('Статус', a.pb && a.pb.status, b.pb && b.pb.status, 'ФНС: «Прозрачный бизнес»');
        if (!!(a.pb && a.pb.unreliable) !== !!(b.pb && b.pb.unreliable)) out.push({ text: b.pb && b.pb.unreliable ? 'Появилась отметка о недостоверности сведений' : 'Отметка о недостоверности снята', source: `ФНС: «Прозрачный бизнес», ${src}` });
        const sro = d => (d.sro || []).map(s => `${s.sroNumber || s.sro}: ${s.status}${s.right ? ', право ' + s.right.toLowerCase() : ''}${s.levelOdo ? ', ОДО ' + s.levelOdo.toLowerCase() : ''}`).join('; ');
        cmp('СРО', sro(a), sro(b), 'НОСТРОЙ');
        const ya = (a.finance || []).map(x => x.year);
        (b.finance || []).filter(x => !ya.includes(x.year)).forEach(x => out.push({ text: `Опубликована отчётность за ${x.year} г.: выручка ${x.lines['2110'] !== undefined ? fmtK(x.lines['2110']) : '—'}, чистая прибыль ${x.lines['2400'] !== undefined ? fmtK(x.lines['2400']) : '—'}`, source: `ФНС: ГИР БО, ${src}` }));
        return out;
    }

    const due = c => !!(c.monitoring && c.monitoring.next && c.monitoring.next <= today());

    // Chat extension for the security specialist (script.js): ИНН in the message are checked on the server,
    // the registry data comes back as a 'data' event and can be saved to the counterparty cards
    function chatExtension() {
        let input = null;
        let panel = null;
        let inns = [];
        let selected = new Set();
        let results = [];
        const draw = () => {
            inns = [...new Set((input.value.match(/\b\d{10}(\d{2})?\b/g) || []).filter(validInn))].slice(0, 5);
            selected = new Set([...selected].filter(x => inns.includes(x)));
            inns.forEach(x => { if (!panel.dataset.seen || !panel.dataset.seen.includes(x)) selected.add(x); });
            panel.dataset.seen = inns.join(' ');
            panel.hidden = !inns.length;
            panel.textContent = '';
            if (!inns.length) return;
            const t = document.createElement('p');
            t.className = 'home-tn__panel-title';
            t.textContent = `ИНН в сообщении: ${inns.length}. Проверить по открытым реестрам ФНС и НОСТРОЙ:`;
            panel.appendChild(t);
            inns.forEach(x => {
                const l = document.createElement('label');
                l.className = 'home-tn__url';
                const box = document.createElement('input');
                box.type = 'checkbox';
                box.checked = selected.has(x);
                box.addEventListener('change', () => { box.checked ? selected.add(x) : selected.delete(x); });
                const span = document.createElement('span');
                span.textContent = x;
                l.append(box, span);
                panel.appendChild(l);
            });
        };
        return {
            attach({ form, input: field }) {
                input = field;
                panel = document.createElement('div');
                panel.className = 'home-tn__panel';
                panel.hidden = true;
                form.prepend(panel);
                input.addEventListener('input', draw);
            },
            payload() {
                const chosen = inns.filter(x => selected.has(x));
                return chosen.length ? { type: 'counterparty', inns: chosen } : null;
            },
            reset() {
                inns = [];
                selected = new Set();
                results = [];
                if (panel) { panel.hidden = true; panel.textContent = ''; panel.dataset.seen = ''; }
            },
            onData(data) { results = (data && data.counterparties) || []; },
            afterAnswer(message, answerText) {
                const got = results.filter(x => x && x.inn);
                if (!got.length) return;
                const bar = document.createElement('div');
                bar.className = 'home-tn__answer-actions';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = got.length > 1 ? `Сохранить проверки в карточки (${got.length})` : 'Сохранить проверку в карточку контрагента';
                btn.addEventListener('click', () => {
                    const st = read();
                    got.forEach(data => {
                        let c = st.items.find(x => x.inn === data.inn);
                        if (!c) { c = blank({ inn: data.inn, name: data.egrul ? data.egrul.shortName || data.egrul.name : '' }); st.items.unshift(c); }
                        const prev = lastCheck(c);
                        const check = { id: uid(), at: Date.now(), data };
                        const diff = changes(prev, check);
                        c.checks.unshift(check);
                        c.checks = c.checks.slice(0, 10);
                        if (diff.length) c.changes.unshift({ at: Date.now(), items: diff });
                        c.monitoring.next = new Date(Date.now() + (Number(c.monitoring.everyDays) || 30) * 86400000).toISOString().slice(0, 10);
                        c.log.unshift({ at: Date.now(), text: 'Проверка по реестрам из чата специалиста по безопасности' });
                        if (answerText) c.log.unshift({ at: Date.now(), text: `Ответ специалиста сохранён: ${answerText.slice(0, 160)}…` });
                    });
                    const p = document.createElement('p');
                    p.className = 'home-chat__note';
                    p.textContent = write(st) ? `Сохранено в «Контрагенты»: ${got.map(x => (x.egrul && x.egrul.shortName) || x.inn).join(', ')}.` : 'Не удалось сохранить.';
                    message.appendChild(p);
                });
                bar.appendChild(btn);
                message.appendChild(bar);
            }
        };
    }
    window.AirchitectChatExtensions = window.AirchitectChatExtensions || {};
    window.AirchitectChatExtensions.counterparty = chatExtension;

    window.AirchitectCounterparties = { STORE_KEY, LEVELS, CATEGORIES, ROLES, FACT_KINDS, COURT_TYPES, COURT_STATUS, DECISIONS, MANUAL, read, write, uid, today, validInn, blank, lastCheck, financeYears, ratios, levelLimit, relations, assess, changes, due, fmtR, fmtK };
})();
