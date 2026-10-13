ALTER TABLE projects ADD COLUMN image_key TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN image_source TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_projects_image_key ON projects(image_key) WHERE image_key<>'';
