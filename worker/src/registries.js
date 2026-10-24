// Counterparty check: public registries queried on the server (the browser cannot call them: CORS).
// Only publicly available services without authorization are used, at the pace of a person's check:
// one request per source per check. If a service asks for a captcha, the check stops for that source
// and the user is sent to the service itself - the captcha is never bypassed.
//
//   ФНС, ЕГРЮЛ/ЕГРИП          https://egrul.nalog.ru            registration data, official PDF extract
//   ФНС, «Прозрачный бизнес»   https://pb.nalog.ru               status, unreliable information flag
//   ФНС, ГИР БО                https://bo.nalog.gov.ru           accounting statements (thousand rubles)
//   НОСТРОЙ, реестр членов СРО https://reestr.nostroy.ru         membership, responsibility levels
//
// Courts (kad.arbitr.ru), enforcement (ФССП), bankruptcy (Федресурс), procurement registers (ЕИС)
// have no open API: the result gives links to the official search for a manual check and upload.

const UA = 'AIRCHITECT counterparty check (+https://www.airchi.tech)';
const TIMEOUT = 15000;

export function validInn(inn) {
    const s = String(inn || '').trim();
    if (!/^\d{10}$|^\d{12}$/.test(s)) return false;
    const d = s.split('').map(Number);
    const check = (coefs, n) => (coefs.reduce((sum, c, i) => sum + c * d[i], 0) % 11) % 10 === d[n];
    if (s.length === 10) return check([2, 4, 10, 3, 5, 9, 4, 6, 8], 9);
    return check([7, 2, 4, 10, 3, 5, 9, 4, 6, 8], 10) && check([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8], 11);
}

async function call(url, options = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
        const res = await fetch(url, { ...options, signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'application/json', ...(options.headers || {}) } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
    } finally {
        clearTimeout(timer);
    }
}
const form = obj => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(obj).toString() });
const wait = ms => new Promise(r => setTimeout(r, ms));
class Captcha extends Error {}

// ---- ЕГРЮЛ / ЕГРИП ---------------------------------------------------------------------------

export function parseEgrul(data) {
    const rows = (data && data.rows) || [];
    return rows.map(r => ({
        kind: r.k === 'fl' ? 'ip' : 'ul', name: r.n || r.c || '', shortName: r.c || r.n || '', inn: r.i || '', ogrn: r.o || '', kpp: r.p || '',
        registered: r.r || '', liquidated: r.e || '', head: r.g || '', region: r.rn || '', token: r.t || ''
    }));
}

async function egrul(inn) {
    const start = await (await call('https://egrul.nalog.ru/', form({ query: inn }))).json();
    if (start.captchaRequired) throw new Captcha('ЕГРЮЛ запросил проверку «я не робот»');
    await wait(800);
    return parseEgrul(await (await call(`https://egrul.nalog.ru/search-result/${encodeURIComponent(start.t)}`)).json());
}

// Official PDF extract (signed by ФНС): request, wait until ready, download
export async function egrulPdf(rowToken) {
    if (!/^[A-F0-9]{40,400}$/i.test(rowToken || '')) throw new Error('invalid_token');
    const req = await (await call(`https://egrul.nalog.ru/vyp-request/${rowToken}`)).json();
    if (req.captchaRequired) throw new Captcha('ЕГРЮЛ запросил проверку «я не робот»');
    for (let i = 0; i < 10; i++) {
        await wait(800);
        const st = await (await call(`https://egrul.nalog.ru/vyp-status/${rowToken}`)).json();
        if (st.status === 'ready') return call(`https://egrul.nalog.ru/vyp-download/${rowToken}`, { headers: { Accept: 'application/pdf' } });
    }
    throw new Error('Выписка не подготовлена ФНС за отведённое время');
}

// ---- «Прозрачный бизнес» -----------------------------------------------------------------------

export function parsePb(data, inn) {
    const list = [...((data && data.ul && data.ul.data) || []), ...((data && data.ip && data.ip.data) || [])];
    const r = list.find(x => x.inn === inn) || list[0];
    if (!r) return null;
    return {
        name: r.namep || r.namec || '', status: r.sulst_name_ex || '', statusCode: r.sulst_ex || '', liquidation: r.pr_liq === '1',
        unreliable: r.invalid === '1', registered: r.dtreg || r.dtogrn || '', okved: r.okved2main || '', okvedName: r.okved2mainname || '', region: r.regionname || '',
        reportYear: r.yearcode || ''
    };
}

async function pb(inn) {
    const start = await (await call('https://pb.nalog.ru/search-proc.json', form({ mode: 'search-all', queryAll: inn, page: 1, pageSize: 10 }))).json();
    if (start.captchaRequired) throw new Captcha('«Прозрачный бизнес» запросил проверку «я не робот»');
    for (let i = 0; i < 5; i++) {
        await wait(900);
        const data = await (await call('https://pb.nalog.ru/search-proc.json', form({ id: start.id, method: 'get-response' }))).json();
        if (data && (data.ul || data.ip)) return parsePb(data, inn);
    }
    return null;
}

// ---- ГИР БО: accounting statements ----------------------------------------------------------------

const LINES = ['1100', '1150', '1200', '1210', '1230', '1250', '1300', '1400', '1410', '1500', '1510', '1520', '1600', '2110', '2120', '2200', '2300', '2330', '2400'];

// Each statement gives the current and previous year; the latest statement wins for a year
export function parseBo(list) {
    const years = {};
    [...(list || [])].sort((a, b) => Number(a.period) - Number(b.period)).forEach(s => {
        const c = ((s.typeCorrections || [])[0] || {}).correction || {};
        const b = c.balance || {};
        const f = c.financialResult || {};
        const pick = (prefix) => {
            const v = {};
            LINES.forEach(l => { const src = l[0] === '1' ? b : f; const x = src[`${prefix}${l}`]; if (x !== null && x !== undefined && x !== '') v[l] = Number(x); });
            return v;
        };
        const y = Number(s.period);
        years[y - 1] = { ...pick('previous'), ...(years[y - 1] || {}) };
        years[y] = { ...(years[y] || {}), ...pick('current') };
        years[y].statementDate = s.actualBfoDate || '';
        years[y].audit = !!s.hasAz;
    });
    return Object.entries(years).map(([year, lines]) => ({ year: Number(year), lines })).filter(x => Object.keys(x.lines).some(k => /^\d{4}$/.test(k))).sort((a, b) => a.year - b.year);
}

async function bo(inn) {
    const search = await (await call(`https://bo.nalog.gov.ru/advanced-search/organizations/search?query=${inn}&page=0`)).json();
    const org = (search.content || []).find(x => String(x.inn).replace(/<[^>]+>/g, '') === inn);
    if (!org) return { orgId: null, years: [] };
    const list = await (await call(`https://bo.nalog.gov.ru/nbo/organizations/${org.id}/bfo/`)).json();
    return { orgId: org.id, years: parseBo(list) };
}

// ---- НОСТРОЙ -----------------------------------------------------------------------------------

export function parseNostroyMember(x, info) {
    const i = info || {};
    const title = v => (v && v.title) || '';
    return {
        memberId: x.id, status: title(x.member_status), name: x.full_description || '', inn: x.inn || '', registryNumber: x.registration_number || '',
        sro: x.sro ? (x.sro.full_description || x.sro.short_description || '') : '', sroNumber: x.sro ? x.sro.registration_number || '' : '',
        since: (x.registry_registration_date_time_string || '').slice(0, 10), updated: (x.last_updated_at_date_time_string || '').slice(0, 10),
        right: i.right ? title(i.right.right_status) : '', rightBasis: i.right ? i.right.basis || '' : '',
        levelOdo: title(i.responsibility_level_odo), levelOdoCost: (i.responsibility_level_odo || {}).cost || '', fundOdo: i.compensation_fund_fee_odo || '',
        levelVv: title(i.responsibility_level_vv), levelVvCost: (i.responsibility_level_vv || {}).cost || '', fundVv: i.compensation_fund_fee_vv || '',
        accordance: title(i.accordance_status), totalLiability: i.members_total_liability || '', liabilityDate: i.members_total_liability_last_count_dt_date_string || ''
    };
}

async function nostroy(inn) {
    const list = await (await call('https://reestr.nostroy.ru/api/sro/all/member/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filters: { inn }, page: 1, pageCount: '10' }) })).json();
    const members = ((list.data || {}).data || []).filter(x => x.inn === inn);
    const out = [];
    for (const m of members.slice(0, 3)) {
        let info = null;
        try {
            info = ((await (await call(`https://reestr.nostroy.ru/api/member/${m.id}/info`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()).data) || null;
        } catch (e) {
            info = null;
        }
        out.push(parseNostroyMember(m, info));
    }
    return out;
}

// ---- Check -----------------------------------------------------------------------------------------

export function officialLinks(inn, name) {
    const q = encodeURIComponent(inn);
    return [
        { id: 'kad', title: 'Картотека арбитражных дел', url: 'https://kad.arbitr.ru/', note: `Поиск по ИНН ${inn} или наименованию; выгрузите карточки дел и загрузите их в карточку контрагента.` },
        { id: 'fssp', title: 'Банк данных исполнительных производств ФССП', url: 'https://fssp.gov.ru/iss/ip', note: 'Поиск юридического лица по наименованию и региону.' },
        { id: 'efrsb', title: 'ЕФРСБ (Федресурс)', url: `https://bankrot.fedresurs.ru/bankrupts?searchString=${q}`, note: 'Сообщения о банкротстве.' },
        { id: 'fedresurs', title: 'Федресурс', url: `https://fedresurs.ru/search/entity?code=${q}`, note: 'Существенные факты деятельности.' },
        { id: 'rnp', title: 'Реестр недобросовестных поставщиков (ЕИС)', url: `https://zakupki.gov.ru/epz/dishonestsupplier/search/results.html?searchString=${q}`, note: '44-ФЗ и 223-ФЗ.' },
        { id: 'contracts', title: 'Контракты в ЕИС', url: `https://zakupki.gov.ru/epz/contract/search/results.html?searchString=${q}`, note: 'Опыт исполнения государственных контрактов.' },
        { id: 'pb', title: '«Прозрачный бизнес» ФНС', url: `https://pb.nalog.ru/search.html#t=${Date.now()}&mode=search-all&queryAll=${q}`, note: 'Налоговая задолженность, массовый адрес, дисквалификация.' },
        { id: 'fedsfm', title: 'Перечень Росфинмониторинга', url: 'https://www.fedsfm.ru/documents/terrorists-catalog-portal-act', note: 'Если проверка применима к сделке.' }
    ];
}

export async function checkCounterparty(inn) {
    const fetchedAt = new Date().toISOString();
    const sources = [];
    const run = async (id, title, url, fn) => {
        try {
            const data = await fn();
            const empty = data === null || (Array.isArray(data) && !data.length) || (data && data.years && !data.years.length);
            sources.push({ id, title, url, status: empty ? 'empty' : 'ok', fetchedAt });
            return data;
        } catch (e) {
            sources.push({ id, title, url, status: e instanceof Captcha ? 'captcha' : 'error', message: e.message, fetchedAt });
            return null;
        }
    };
    const [egrulRows, pbData, boData, sro] = await Promise.all([
        run('egrul', 'ФНС: ЕГРЮЛ / ЕГРИП', 'https://egrul.nalog.ru/', () => egrul(inn)),
        run('pb', 'ФНС: «Прозрачный бизнес»', 'https://pb.nalog.ru/', () => pb(inn)),
        run('bo', 'ФНС: ГИР БО (бухгалтерская отчётность)', 'https://bo.nalog.gov.ru/', () => bo(inn)),
        run('nostroy', 'НОСТРОЙ: реестр членов СРО', 'https://reestr.nostroy.ru/', () => nostroy(inn))
    ]);
    const reg = (egrulRows || []).find(r => r.inn === inn) || (egrulRows || [])[0] || null;
    return { inn, fetchedAt, sources, egrul: reg, pb: pbData, finance: boData ? boData.years : [], boOrgId: boData ? boData.orgId : null, sro: sro || [], links: officialLinks(inn, reg && reg.name) };
}
