CREATE TABLE IF NOT EXISTS feedback_notifications (
 ticket_id TEXT PRIMARY KEY REFERENCES tickets(id),
 status TEXT NOT NULL DEFAULT 'pending',
 message_id TEXT NOT NULL DEFAULT '',
 error TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
