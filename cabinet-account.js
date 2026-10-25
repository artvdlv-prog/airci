// Account of the personal cabinet with the AIRCHITECT server (worker/): sign-in by e-mail and password, change of
// the temporary password, and for the company administrator — employees, projects and the use of the specialists.
// Used by cabinet.js when AirchitectApi.enabled; without the server the cabinet keeps its open local mode.

(function () {
    const API = window.AirchitectApi;

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
    const field = (label, input, hint) => h('label', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, label), input, hint ? h('span', { class: 'home-dialog__hint' }, hint) : null);
    const error = () => h('p', { class: 'home-dialog__error', hidden: true });
    const showError = (el, text) => { el.textContent = text; el.hidden = false; };
    const date = t => new Date(t).toLocaleDateString('ru-RU');

    // Sign-in form; productPicker is the cabinet's own choice of the solution (OFFICE, DOCS, COMPLEX)
    function loginForm({ productPicker, onSignedIn }) {
        const email = h('input', { type: 'email', required: true, autocomplete: 'username', placeholder: 'name@company.ru' });
        const password = h('input', { type: 'password', required: true, autocomplete: 'current-password' });
        const err = error();
        const button = h('button', { type: 'submit', class: 'home-btn home-btn--primary home-cab__login-btn' }, h('span', {}, 'Войти'));
        const form = h('form', { class: 'home-cab__login', onsubmit: async e => {
            e.preventDefault();
            err.hidden = true;
            button.disabled = true;
            try {
                const user = await API.login(email.value.trim(), password.value);
                onSignedIn(user);
            } catch (ex) {
                showError(err, ex.message);
            } finally {
                button.disabled = false;
            }
        } },
        h('h1', { class: 'home-cab__login-title' }, 'Вход в личный кабинет'),
        field('E-mail', email), field('Пароль', password),
        productPicker ? h('div', { class: 'home-dialog__field' }, h('span', { class: 'home-dialog__label' }, 'Решение'), productPicker) : null,
        err, button,
        h('p', { class: 'home-dialog__hint' }, 'Учётную запись создаёт администратор вашей компании. Диалоги и документы хранятся на сервере AIRCHITECT и доступны только сотрудникам компании по их проектам.'));
        setTimeout(() => email.focus(), 0);
        return form;
    }

    function passwordForm({ title, temporary, onDone }) {
        const current = h('input', { type: 'password', required: true, autocomplete: 'current-password' });
        const next = h('input', { type: 'password', required: true, autocomplete: 'new-password', minlength: '10' });
        const again = h('input', { type: 'password', required: true, autocomplete: 'new-password' });
        const err = error();
        return h('form', { class: temporary ? 'home-cab__login' : 'home-ct__form', onsubmit: async e => {
            e.preventDefault();
            err.hidden = true;
            if (next.value !== again.value) return showError(err, 'Новые пароли не совпадают.');
            try {
                await API.request('POST', '/api/auth/password', { current: current.value, next: next.value });
                await API.me();
                onDone();
            } catch (ex) { showError(err, ex.message); }
        } },
        temporary ? h('h1', { class: 'home-cab__login-title' }, title) : null,
        temporary ? h('p', { class: 'home-dialog__hint' }, 'Вы вошли по временному паролю. Задайте свой пароль — не короче 10 символов, с буквами и цифрами.') : null,
        field(temporary ? 'Временный пароль' : 'Текущий пароль', current), field('Новый пароль', next, temporary ? null : 'Не короче 10 символов, буквы и цифры'), field('Новый пароль ещё раз', again),
        err, h('div', { class: 'home-ct__wide home-ct__info-actions' }, h('button', { type: 'submit', class: 'home-btn home-btn--primary' }, 'Сохранить пароль')));
    }

    // One-time display of a temporary password to the administrator
    function showPassword(email, password) {
        const dlg = h('dialog', { class: 'home-dialog' });
        dlg.append(h('div', { class: 'home-dialog__form' },
            h('div', { class: 'home-dialog__head' }, h('h2', { class: 'home-dialog__title' }, 'Временный пароль'), h('button', { type: 'button', class: 'home-window__close', 'aria-label': 'Закрыть', onclick: () => { dlg.close(); dlg.remove(); } }, '×')),
            h('div', { class: 'home-dialog__body' },
                h('p', {}, `Передайте сотруднику ${email} пароль защищённым способом. Он показан один раз; при первом входе сотрудник задаст свой.`),
                h('p', { class: 'home-srv__secret' }, password),
                h('button', { type: 'button', class: 'home-btn home-btn--secondary', onclick: () => navigator.clipboard && navigator.clipboard.writeText(password) }, 'Скопировать'))));
        document.body.appendChild(dlg);
        dlg.showModal();
    }

    // Blocks of «Настройки»: account for everyone; employees, projects and usage for the administrator
    async function settingsBlocks({ block, notify, rerender }) {
        const me = await API.me();
        const out = [];
        out.push(block('Учётная запись', h('div', { class: 'home-cab__data' },
            h('p', { class: 'home-chat__text' }, `${me.name} · ${me.email} · ${me.role === 'admin' ? 'администратор компании' : 'сотрудник'} · ${me.company.name}`),
            passwordForm({ temporary: false, onDone: () => notify('Пароль изменён. Другие сеансы входа завершены.') }))));
        if (me.role !== 'admin') {
            out.push(block('Проекты', h('ul', { class: 'home-records' }, me.projects.length ? me.projects.map(p => h('li', { class: 'home-record' }, h('p', { class: 'home-record__title' }, p.name))) : h('li', { class: 'home-staff__empty' }, 'Вас ещё не добавили в проекты. Обратитесь к администратору.'))));
            return out;
        }
        const [users, usage] = await Promise.all([API.request('GET', '/api/users'), API.request('GET', '/api/usage')]);
        const projects = me.projects;

        // Employees
        const email = h('input', { type: 'email', required: true, placeholder: 'name@company.ru' });
        const name = h('input', { type: 'text', required: true, placeholder: 'Фамилия И.О.' });
        const role = h('select', {}, h('option', { value: 'member' }, 'Сотрудник'), h('option', { value: 'admin' }, 'Администратор'));
        const projectChecks = projects.map(p => h('label', { class: 'home-cf__check' }, h('input', { type: 'checkbox', value: p.id }), h('span', {}, p.name)));
        const userErr = error();
        const addUser = h('form', { class: 'home-ct__form', onsubmit: async e => {
            e.preventDefault();
            userErr.hidden = true;
            try {
                const created = await API.request('POST', '/api/users', { email: email.value, name: name.value, role: role.value, project_ids: projectChecks.map(l => l.firstChild).filter(c => c.checked).map(c => c.value) });
                showPassword(created.email, created.temporary_password);
                rerender();
            } catch (ex) { showError(userErr, ex.message); }
        } }, field('E-mail', email), field('Имя', name), field('Роль', role), projects.length ? h('div', { class: 'home-dialog__field home-ct__wide' }, h('span', { class: 'home-dialog__label' }, 'Проекты'), ...projectChecks) : null, userErr,
        h('div', { class: 'home-ct__wide home-ct__info-actions' }, h('button', { type: 'submit', class: 'home-btn home-btn--primary' }, 'Добавить сотрудника')));
        const patch = async (u, body, done) => { try { const r = await API.request('PATCH', `/api/users/${encodeURIComponent(u.id)}`, body); if (r.temporary_password) showPassword(u.email, r.temporary_password); if (done) notify(done); rerender(); } catch (ex) { notify(ex.message); } };
        out.push(block('Сотрудники', h('ul', { class: 'home-records' }, users.map(u => h('li', { class: 'home-record' },
            h('div', {}, h('p', { class: 'home-record__title' }, `${u.name}${u.status === 'disabled' ? ' (отключён)' : ''}`), h('p', { class: 'home-record__meta' }, [u.email, u.role === 'admin' ? 'администратор' : 'сотрудник', u.must_change_password ? 'временный пароль' : '', `с ${date(u.created_at)}`].filter(Boolean).join(' · '))),
            u.id === me.id ? null : h('div', { class: 'home-record__actions' },
                h('button', { type: 'button', onclick: () => confirm(`Выдать ${u.name} новый временный пароль? Текущие сеансы входа будут завершены.`) && patch(u, { reset_password: true }) }, 'Сбросить пароль'),
                h('button', { type: 'button', onclick: () => patch(u, { status: u.status === 'disabled' ? 'active' : 'disabled' }, u.status === 'disabled' ? 'Доступ восстановлен.' : 'Доступ отключён.') }, u.status === 'disabled' ? 'Включить' : 'Отключить'))))), addUser));

        // Projects and their members
        const projectName = h('input', { type: 'text', required: true, placeholder: 'ЖК «Северный», 2-я очередь' });
        const projectCode = h('input', { type: 'text', placeholder: 'Шифр, необязательно' });
        const projectErr = error();
        const addProject = h('form', { class: 'home-ct__form', onsubmit: async e => {
            e.preventDefault();
            try { await API.request('POST', '/api/projects', { name: projectName.value, code: projectCode.value }); rerender(); } catch (ex) { showError(projectErr, ex.message); }
        } }, field('Название проекта', projectName), field('Шифр', projectCode), projectErr, h('div', { class: 'home-ct__wide home-ct__info-actions' }, h('button', { type: 'submit', class: 'home-btn home-btn--primary' }, 'Создать проект')));
        const projectRows = await Promise.all(projects.map(async p => {
            const members = await API.request('GET', `/api/projects/${encodeURIComponent(p.id)}/members`);
            const others = users.filter(u => u.status === 'active' && !members.some(m => m.id === u.id));
            const pick = h('select', { 'aria-label': 'Сотрудник' }, h('option', { value: '' }, '— добавить сотрудника —'), others.map(u => h('option', { value: u.id }, u.name)));
            pick.addEventListener('change', async () => { if (!pick.value) return; try { await API.request('POST', `/api/projects/${encodeURIComponent(p.id)}/members`, { user_id: pick.value }); rerender(); } catch (ex) { notify(ex.message); } });
            return h('li', { class: 'home-record' }, h('div', {}, h('p', { class: 'home-record__title' }, p.code ? `${p.name} (${p.code})` : p.name),
                h('p', { class: 'home-record__meta' }, members.map(m => m.name).join(', ') || 'нет участников')), others.length ? pick : null);
        }));
        out.push(block('Проекты', h('ul', { class: 'home-records' }, projectRows.length ? projectRows : h('li', { class: 'home-staff__empty' }, 'Проектов нет. Документы и диалоги специалистов привязываются к проекту — создайте первый.')), addProject));

        // Use of the specialists this month
        out.push(block('Использование специалистов', h('div', { class: 'home-cab__data' },
            h('p', { class: 'home-chat__text' }, `${usage.month}: израсходовано $${usage.spent_usd.toFixed(2)} из бюджета $${usage.budget_usd}. Оценка по числу токенов; лимиты и бюджет задаются в настройках сервера.`),
            h('ul', { class: 'home-records' }, usage.by_user.map(u => h('li', { class: 'home-record' }, h('div', {}, h('p', { class: 'home-record__title' }, u.name), h('p', { class: 'home-record__meta' }, `обращений: ${u.requests} · $${u.cost_usd.toFixed(2)}`))))))));
        return out;
    }

    window.AirchitectAccount = { loginForm, passwordForm, settingsBlocks };
})();
