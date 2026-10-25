// Client of the AIRCHITECT API (worker/): session, requests with the bearer token, answer stream, files.
// The server address comes from HOME_ASSISTANT_API (home-config.js). Without it AirchitectApi.enabled is false
// and the site works as before: data in this browser, chat not connected.
// Loaded after home-config.js and before the scripts of the page.

(function () {
    const chatUrl = typeof HOME_ASSISTANT_API !== 'undefined' ? HOME_ASSISTANT_API : null;
    const base = chatUrl ? chatUrl.replace(/\/chat$/, '') : null;
    const SESSION_KEY = 'airchitect-session-v1';
    const PROJECT_KEY = 'airchitect-project-v1';

    class ApiError extends Error {
        constructor(message, status, code) {
            super(message);
            this.status = status;
            this.code = code;
        }
    }

    const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } };
    const write = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ } };

    function session() {
        const s = read(SESSION_KEY);
        return s && s.token && s.expires_at > Date.now() ? s : null;
    }
    const signedIn = () => !!session();

    // Session ended on the server (expired, password changed, employee disabled): pages show the sign-in again
    function dropSession() {
        if (!read(SESSION_KEY)) return;
        write(SESSION_KEY, null);
        document.dispatchEvent(new Event('airchitectsession'));
    }

    function headers(extra = {}) {
        const s = session();
        return s ? { ...extra, Authorization: `Bearer ${s.token}` } : extra;
    }

    async function failure(res) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) dropSession();
        return new ApiError(data.error || 'Сервер не ответил. Попробуйте позже.', res.status, data.code);
    }

    async function request(method, path, body) {
        const init = { method, headers: headers() };
        if (body instanceof FormData) init.body = body;
        else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
        let res;
        try {
            res = await fetch(base + path, init);
        } catch (e) {
            throw new ApiError('Нет связи с сервером. Проверьте подключение к интернету.', 0, 'network');
        }
        if (!res.ok) throw await failure(res);
        return res.json();
    }

    // Server-Sent Events of /api/chat: every event goes to onEvent
    async function stream(path, body, onEvent) {
        let res;
        try {
            res = await fetch(base + path, { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
        } catch (e) {
            throw new ApiError('Нет связи с сервером. Проверьте подключение к интернету.', 0, 'network');
        }
        if (!res.ok || !res.body) throw await failure(res);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let cut;
            while ((cut = buffer.indexOf('\n\n')) >= 0) {
                const chunk = buffer.slice(0, cut).trim();
                buffer = buffer.slice(cut + 2);
                if (chunk.startsWith('data: ')) onEvent(JSON.parse(chunk.slice(6)));
            }
        }
    }

    async function login(email, password) {
        const data = await request('POST', '/api/auth/login', { email, password });
        write(SESSION_KEY, { token: data.token, expires_at: data.expires_at, user: data.user });
        return data.user;
    }

    async function logout() {
        try { if (session()) await request('POST', '/api/auth/logout', {}); } catch (e) { /* the session is dropped anyway */ }
        write(SESSION_KEY, null);
    }

    async function me() {
        const data = await request('GET', '/api/me');
        const s = session();
        if (s) write(SESSION_KEY, { ...s, user: data });
        return data;
    }

    // Project chosen by the employee (kept between pages); falls back to the first available one
    function project(projects) {
        const id = read(PROJECT_KEY);
        const list = projects || ((session() || {}).user || {}).projects || [];
        return list.find(p => p.id === id) ? id : (list[0] ? list[0].id : '');
    }
    const setProject = id => write(PROJECT_KEY, id);

    function upload(projectId, file) {
        const form = new FormData();
        form.append('project_id', projectId);
        form.append('file', file, file.name);
        return request('POST', '/api/documents', form);
    }

    async function download(path, name) {
        const res = await fetch(base + path, { headers: headers() });
        if (!res.ok) throw await failure(res);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(await res.blob());
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }

    // fetch with the session, for the endpoints of the first version (/extract, /registry, /egrul-pdf)
    function authFetch(url, init = {}) {
        return fetch(url, { ...init, headers: headers(init.headers || {}) }).then(res => {
            if (res.status === 401) dropSession();
            return res;
        });
    }

    window.AirchitectApi = { enabled: !!base, base, ApiError, session, signedIn, user: () => (session() || {}).user || null, login, logout, me, request, stream, upload, download, fetch: authFetch, project, setProject };
})();
