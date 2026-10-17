CREATE TABLE IF NOT EXISTS project_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO project_categories(id,name,description,sort_order) VALUES('other','其他项目','',0);
CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 official_url TEXT NOT NULL DEFAULT '',
 image_key TEXT NOT NULL DEFAULT '', image_source TEXT NOT NULL DEFAULT '', image_path TEXT NOT NULL DEFAULT '',
 category TEXT NOT NULL DEFAULT 'other', sort_order INTEGER NOT NULL DEFAULT 0, homepage_visible INTEGER NOT NULL DEFAULT 1,
 description TEXT NOT NULL DEFAULT '',
 visible INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_projects_image_key ON projects(image_key) WHERE image_key<>'';
CREATE INDEX IF NOT EXISTS idx_projects_category_order ON projects(category,sort_order);
CREATE TABLE IF NOT EXISTS tickets (
 id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, project_id TEXT NOT NULL,
 kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
 app_version TEXT NOT NULL DEFAULT '', platform TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'new', access_hash TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_id,created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status,created_at);
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, role TEXT NOT NULL, body TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(ticket_id) REFERENCES tickets(id)
);
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON messages(ticket_id,created_at);
CREATE TABLE IF NOT EXISTS attachments (
 id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, message_id TEXT,
 name TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, object_key TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(ticket_id) REFERENCES tickets(id)
);
CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON attachments(ticket_id);
CREATE TABLE IF NOT EXISTS rate_limits (
 bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_credentials (
 id TEXT PRIMARY KEY CHECK(id='admin'),
 password_hash TEXT NOT NULL, salt TEXT NOT NULL, iterations INTEGER NOT NULL,
 session_version TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS feedback_notifications (
 ticket_id TEXT PRIMARY KEY REFERENCES tickets(id),
 status TEXT NOT NULL DEFAULT 'pending',
 message_id TEXT NOT NULL DEFAULT '',
 error TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
