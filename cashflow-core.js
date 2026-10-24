// Cash flow (Движение денежных средств): store and calculations shared by cashflow.html and the cabinet.
// Not an accounting system: planned and actual payments of the company by contracts and objects,
// receivables and payables, advances and retentions, balance forecast, cash gaps and scenarios.
// Three kinds of figures are kept apart everywhere:
//   fact     - payments recorded by the user (date, amount, payment document);
//   plan     - expected payments; "confirmed" when the basis document exists (signed act, invoice, schedule);
//   forecast - balances calculated from the opening balance, facts and remaining plans.

(function () {
    const STORE_KEY = 'airchitect-cashflow-v1';
    const SOON_DAYS = 7;

    const CATEGORIES = {
        in: {
            advance: 'Аванс',
            work: 'Оплата выполненных работ',
            retention: 'Возврат гарантийного удержания',
            security: 'Возврат обеспечения',
            other_in: 'Прочие поступления'
        },
        out: {
            subcontract: 'Субподрядчики',
            materials: 'Материалы и оборудование',
            machinery: 'Техника и аренда',
            payroll: 'Оплата труда',
            taxes: 'Налоги и взносы',
            credit: 'Кредиты и проценты',
            guarantee: 'Банковские гарантии',
            overhead: 'Накладные расходы',
            other_out: 'Прочие платежи'
        }
    };
    const PRIORITIES = { critical: 'Обязательный', normal: 'Обычный', deferrable: 'Можно перенести' };
    const CRITICAL_CATEGORIES = ['payroll', 'taxes', 'credit'];
    const STATUS = { planned: 'План', soon: 'Скоро срок', overdue: 'Просрочено', paid: 'Оплачено' };

    function read() {
        try {
            const data = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
            return {
                settings: { opening: '', openingDate: '', minBalance: 0, horizon: 6, ...(data.settings || {}) },
                scenario: { delayDays: 0, expenseUpPct: 0, excludeOverdueIn: false, onlyConfirmedIn: false, ...(data.scenario || {}) },
                ops: Array.isArray(data.ops) ? data.ops : []
            };
        } catch (e) {
            return { settings: { opening: '', openingDate: '', minBalance: 0, horizon: 6 }, scenario: { delayDays: 0, expenseUpPct: 0, excludeOverdueIn: false, onlyConfirmedIn: false }, ops: [] };
        }
    }

    function write(data) {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            return false;
        }
    }

    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const today = () => new Date().toISOString().slice(0, 10);
    const addDays = (date, n) => new Date(new Date(date + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
    const addMonths = (date, n) => {
        const d = new Date(date + 'T00:00:00Z');
        d.setUTCMonth(d.getUTCMonth() + n);
        return d.toISOString().slice(0, 10);
    };
    const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
    const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const money = v => `${Math.round(num(v)).toLocaleString('ru-RU')} ₽`;

    function blankOp(fields = {}) {
        return {
            id: uid(), dir: 'out', category: 'other_out', title: '', counterparty: '', contractId: '', objectId: '', obligationId: '',
            date: '', amount: 0, gross: 0, advanceOffset: 0, retention: 0, basis: '', confirmed: false, priority: 'normal',
            payments: [], note: '', source: 'manual', created: Date.now(), ...fields
        };
    }

    const paidOf = op => (op.payments || []).reduce((s, p) => s + num(p.amount), 0);
    const restOf = op => Math.max(0, num(op.amount) - paidOf(op));

    function statusOf(op, now = today()) {
        if (restOf(op) <= 0) return 'paid';
        if (op.date && op.date < now) return 'overdue';
        if (op.date && daysBetween(now, op.date) <= SOON_DAYS) return 'soon';
        return 'planned';
    }

    // Balance on the accounts: opening balance (entered by the user) plus recorded payments after its date
    function currentBalance(data, ops = data.ops, now = today()) {
        const s = data.settings;
        const hasOpening = s.opening !== '' && s.opening !== null && s.opening !== undefined;
        let balance = hasOpening ? num(s.opening) : 0;
        ops.forEach(op => (op.payments || []).forEach(p => {
            if (p.date > now) return;
            if (hasOpening && s.openingDate && p.date <= s.openingDate) return;
            balance += op.dir === 'in' ? num(p.amount) : -num(p.amount);
        }));
        return { balance, hasOpening };
    }

    // Forecast of balances from today: remaining plans on their dates, overdue ones moved to today.
    // scenario: delayDays (incoming later), expenseUpPct (payments higher), excludeOverdueIn, onlyConfirmedIn.
    // shifts: { opId: date } - planned payments moved by a recommendation.
    function forecast(data, { ops = data.ops, scenario = {}, shifts = {}, start: startBalance, now = today() } = {}) {
        const s = data.settings;
        const end = addMonths(now, num(s.horizon) || 6);
        const min = num(s.minBalance);
        const base = startBalance !== undefined ? { balance: startBalance, hasOpening: true } : currentBalance(data, ops, now);
        const events = [];
        ops.forEach(op => {
            const rest = restOf(op);
            if (rest <= 0 || !op.date) return;
            let date = op.date < now ? now : op.date;
            let amount = rest;
            if (op.dir === 'in') {
                if (scenario.excludeOverdueIn && op.date < now) return;
                if (scenario.onlyConfirmedIn && !op.confirmed) return;
                if (num(scenario.delayDays)) date = addDays(date, num(scenario.delayDays));
            } else {
                if (shifts[op.id]) date = shifts[op.id];
                amount = rest * (1 + num(scenario.expenseUpPct) / 100);
            }
            if (date > end) return;
            events.push({ date, dir: op.dir, amount, op, overdue: op.date < now });
        });
        events.sort((a, b) => a.date.localeCompare(b.date) || (a.dir === 'in' ? -1 : 1));

        const points = [{ date: now, balance: base.balance, inflow: 0, outflow: 0, events: [] }];
        let balance = base.balance;
        events.forEach(e => {
            let p = points[points.length - 1];
            if (p.date !== e.date) {
                p = { date: e.date, balance, inflow: 0, outflow: 0, events: [] };
                points.push(p);
            }
            balance += e.dir === 'in' ? e.amount : -e.amount;
            p.balance = balance;
            p[e.dir === 'in' ? 'inflow' : 'outflow'] += e.amount;
            p.events.push(e);
        });
        if (points[points.length - 1].date < end) points.push({ date: end, balance, inflow: 0, outflow: 0, events: [] });

        // Cash gaps: periods when the forecast balance is below the minimum balance
        const gaps = [];
        let gap = null;
        points.forEach(p => {
            if (p.balance < min) {
                if (!gap) gap = { start: p.date, end: null, low: p.balance, lowDate: p.date, points: [] };
                gap.points.push(p);
                if (p.balance < gap.low) { gap.low = p.balance; gap.lowDate = p.date; }
            } else if (gap) {
                gap.end = p.date;
                gaps.push(gap);
                gap = null;
            }
        });
        if (gap) gaps.push(gap);
        gaps.forEach(g => {
            g.deficit = min - g.low;
            const inside = events.filter(e => e.date >= g.start && e.date <= g.lowDate);
            g.payments = inside.filter(e => e.dir === 'out').sort((a, b) => b.amount - a.amount).slice(0, 4);
            g.expected = events.filter(e => e.dir === 'in' && e.date > g.start && (!g.end || e.date <= g.end)).slice(0, 3);
            g.overdueIn = ops.filter(op => op.dir === 'in' && restOf(op) > 0 && op.date && op.date < now);
            g.points = undefined;
        });
        const low = points.reduce((m, p) => (p.balance < m.balance ? p : m), points[0]);
        return { now, end, min, start: base, points, events, gaps, low, endBalance: balance };
    }

    // Recommendation for gaps: move "can be postponed" payments that fall before the deepest point to after the gap
    function deferralPlan(data, scenario = {}) {
        const before = forecast(data, { scenario });
        if (!before.gaps.length) return { before, after: before, moved: [], financing: 0 };
        const shifts = {};
        const moved = [];
        before.gaps.forEach(g => {
            const target = g.end ? addDays(g.end, 1) : addDays(before.end, 1);
            // nearest to the deepest point first, only as many as the deficit needs
            let need = g.deficit;
            before.events.filter(e => e.dir === 'out' && e.op.priority === 'deferrable' && e.date <= g.lowDate && !shifts[e.op.id])
                .sort((x, y) => y.date.localeCompare(x.date))
                .forEach(e => {
                    if (need <= 0) return;
                    shifts[e.op.id] = target;
                    moved.push({ op: e.op, from: e.date, to: target, amount: e.amount });
                    need -= e.amount;
                });
        });
        const after = forecast(data, { scenario, shifts });
        const financing = after.gaps.reduce((m, g) => Math.max(m, g.deficit), 0);
        return { before, after, moved, financing };
    }

    // Receivables / payables: only confirmed plans (basis document exists) are debts; the rest is plan
    function debts(ops, now = today()) {
        const rows = ops.filter(op => restOf(op) > 0).map(op => ({ op, rest: restOf(op), status: statusOf(op, now), days: op.date ? daysBetween(op.date, now) : null }));
        const pick = (dir, confirmed, overdue) => rows.filter(r => r.op.dir === dir && !!r.op.confirmed === confirmed && (r.status === 'overdue') === overdue);
        const sum = list => list.reduce((s, r) => s + r.rest, 0);
        const group = dir => ({
            overdue: pick(dir, true, true), current: pick(dir, true, false),
            unconfirmedOverdue: pick(dir, false, true), planned: pick(dir, false, false)
        });
        const receivable = group('in');
        const payable = group('out');
        return { receivable, payable, sum };
    }

    // Advances received and offset, retentions held and returned - per contract
    function advancesAndRetentions(ops, contracts) {
        const by = {};
        const row = id => (by[id] = by[id] || { contractId: id, advanceReceived: 0, advanceOffset: 0, retentionHeld: 0, retentionReturned: 0 });
        ops.filter(op => op.dir === 'in').forEach(op => {
            const r = row(op.contractId || '');
            if (op.category === 'advance') r.advanceReceived += paidOf(op);
            // offsets and retentions count once the act is confirmed (signed)
            if (op.category === 'work' && op.confirmed) { r.advanceOffset += num(op.advanceOffset); r.retentionHeld += num(op.retention); }
            if (op.category === 'retention') r.retentionReturned += paidOf(op);
        });
        return Object.values(by).filter(r => r.advanceReceived || r.advanceOffset || r.retentionHeld || r.retentionReturned).map(r => ({
            ...r,
            contract: contracts.find(c => c.id === r.contractId) || null,
            advanceLeft: r.advanceReceived - r.advanceOffset,
            retentionLeft: r.retentionHeld - r.retentionReturned
        }));
    }

    // Plan-fact by a grouping key: planned amounts, recorded payments, remaining and overdue remaining
    function planFact(ops, keyOf, now = today()) {
        const rows = {};
        ops.forEach(op => {
            const key = keyOf(op);
            const r = rows[key] = rows[key] || { key, planIn: 0, factIn: 0, restIn: 0, overdueIn: 0, planOut: 0, factOut: 0, restOut: 0, overdueOut: 0, overspend: 0 };
            const dir = op.dir === 'in' ? 'In' : 'Out';
            r['plan' + dir] += num(op.amount);
            r['fact' + dir] += (op.payments || []).filter(p => p.date <= now).reduce((s, p) => s + num(p.amount), 0);
            r['rest' + dir] += restOf(op);
            if (statusOf(op, now) === 'overdue') r['overdue' + dir] += restOf(op);
            if (op.dir === 'out' && paidOf(op) > num(op.amount)) r.overspend += paidOf(op) - num(op.amount);
        });
        return Object.values(rows);
    }

    // Months for the chart: recorded payments (fact) and remaining plans per month
    function monthly(ops, from, to) {
        const months = [];
        for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonths(m + '-01', 1).slice(0, 7)) months.push({ month: m, factIn: 0, factOut: 0, planIn: 0, planOut: 0 });
        const find = date => months.find(x => x.month === date.slice(0, 7));
        const now = today();
        ops.forEach(op => {
            const dir = op.dir === 'in' ? 'In' : 'Out';
            (op.payments || []).forEach(p => { const m = p.date && find(p.date); if (m) m['fact' + dir] += num(p.amount); });
            const rest = restOf(op);
            if (rest > 0 && op.date) { const m = find(op.date < now ? now : op.date); if (m) m['plan' + dir] += rest; }
        });
        return months;
    }

    window.AirchitectCashflow = {
        STORE_KEY, SOON_DAYS, CATEGORIES, PRIORITIES, CRITICAL_CATEGORIES, STATUS,
        read, write, uid, today, addDays, addMonths, daysBetween, num, money, blankOp,
        paidOf, restOf, statusOf, currentBalance, forecast, deferralPlan, debts, advancesAndRetentions, planFact, monthly
    };
})();
