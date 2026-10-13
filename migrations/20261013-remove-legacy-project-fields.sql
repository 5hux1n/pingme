-- Run after deploying the unified-catalog Worker.
ALTER TABLE projects DROP COLUMN color;
ALTER TABLE projects DROP COLUMN icon;
