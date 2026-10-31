-- Each priority destination keeps its own travel mode (FR-PREF-03). Existing rows keep the
-- public-transport assumption they were scored with before this column existed.
ALTER TABLE "PriorityDestination" ADD COLUMN "mode" VARCHAR(8) NOT NULL DEFAULT 'pt';
ALTER TABLE "PriorityDestination" ADD CONSTRAINT "destination_mode_known" CHECK ("mode" IN ('pt', 'walk', 'drive', 'cycle'));
