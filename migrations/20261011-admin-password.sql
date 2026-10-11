CREATE TABLE IF NOT EXISTS admin_credentials (
 id TEXT PRIMARY KEY CHECK(id='admin'),
 password_hash TEXT NOT NULL, salt TEXT NOT NULL, iterations INTEGER NOT NULL,
 session_version TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
