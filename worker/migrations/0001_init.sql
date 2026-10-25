-- AIRCHITECT server data model (Cloudflare D1, SQLite).
-- Company → Project → Contract → Documents → Obligations → Tasks → Specialists → Results.
-- Every row carries company_id: all reads and writes are filtered by the company of the session.
-- Times are Unix milliseconds. Document contents live in R2, not here.

CREATE TABLE companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- role: admin — manages employees and projects of the company; member — works in assigned projects
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    must_change_password INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
);
CREATE INDEX users_company ON users(company_id);

-- Only the SHA-256 of the session token is stored
CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    company_id TEXT NOT NULL REFERENCES companies(id),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    name TEXT NOT NULL,
    code TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL
);
CREATE INDEX projects_company ON projects(company_id);

-- Members of a project; company admins have access to every project of their company
CREATE TABLE project_members (
    project_id TEXT NOT NULL REFERENCES projects(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    company_id TEXT NOT NULL REFERENCES companies(id),
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('manager', 'member')),
    PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user ON project_members(user_id);

-- Construction contract card (stage B: extraction of obligations, control points)
CREATE TABLE contracts (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    number TEXT,
    date TEXT,
    subject TEXT,
    customer TEXT,
    contractor TEXT,
    price TEXT,
    start_date TEXT,
    end_date TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'closed')),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL
);
CREATE INDEX contracts_project ON contracts(company_id, project_id);

-- kind: pdf | docx | xlsx | txt. status: ok | no_text (PDF without a text layer) | error
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    contract_id TEXT REFERENCES contracts(id),
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('pdf', 'docx', 'xlsx', 'txt')),
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ok', 'no_text', 'error')),
    status_note TEXT,
    pages INTEGER,
    text_chars INTEGER NOT NULL DEFAULT 0,
    uploaded_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL
);
CREATE INDEX documents_project ON documents(company_id, project_id);

-- Obligations of a contract; specialist — slug of the specialist whose competence it is (assigned manually at stage A)
CREATE TABLE obligations (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    contract_id TEXT NOT NULL REFERENCES contracts(id),
    party TEXT NOT NULL CHECK (party IN ('customer', 'contractor', 'both')),
    text TEXT NOT NULL,
    clause TEXT,
    due TEXT,
    condition TEXT,
    specialist TEXT,
    responsible_user_id TEXT REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('review', 'active', 'done', 'breached')),
    source_document_id TEXT REFERENCES documents(id),
    created_at INTEGER NOT NULL
);
CREATE INDEX obligations_contract ON obligations(company_id, contract_id);

-- Tasks by competence (stage B will create them from obligations; now only manually)
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    contract_id TEXT REFERENCES contracts(id),
    obligation_id TEXT REFERENCES obligations(id),
    title TEXT NOT NULL,
    specialist TEXT NOT NULL,
    assignee_user_id TEXT REFERENCES users(id),
    due TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL
);
CREATE INDEX tasks_project ON tasks(company_id, project_id);

-- Dialogs are personal: only their author sees them
CREATE TABLE dialogs (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    specialist TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX dialogs_user ON dialogs(company_id, user_id, specialist);

-- documents: JSON array of document ids attached to this user message (replayed in place on every turn)
-- sources: JSON array of citations of an assistant message
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    dialog_id TEXT NOT NULL REFERENCES dialogs(id),
    company_id TEXT NOT NULL REFERENCES companies(id),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    text TEXT NOT NULL,
    documents TEXT NOT NULL DEFAULT '[]',
    sources TEXT NOT NULL DEFAULT '[]',
    stop_reason TEXT,
    review_required INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
CREATE INDEX messages_dialog ON messages(dialog_id, created_at);

-- Saved materials of the specialists: references, conclusions, calculations, letters (visible to the project)
CREATE TABLE results (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    contract_id TEXT REFERENCES contracts(id),
    specialist TEXT NOT NULL,
    dialog_id TEXT REFERENCES dialogs(id),
    message_id TEXT REFERENCES messages(id),
    kind TEXT NOT NULL DEFAULT 'answer',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    sources TEXT NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL
);
CREATE INDEX results_project ON results(company_id, project_id, specialist);

-- Personal notifications (stage B); written by the server, read by the user
CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    ref TEXT,
    read_at INTEGER,
    created_at INTEGER NOT NULL
);
CREATE INDEX notifications_user ON notifications(user_id, read_at);

-- Usage of the model per user and day: requests, tokens and estimated cost (millionths of a dollar)
CREATE TABLE usage_daily (
    company_id TEXT NOT NULL REFERENCES companies(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    day TEXT NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    cost_micro_usd INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (company_id, user_id, day)
);

-- Failed sign-in attempts per e-mail, to slow down password guessing
CREATE TABLE login_attempts (
    email TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0
);
