-- Forge Component Reference Library
-- Stores extracted component patterns from local codebases for AI search

CREATE TABLE IF NOT EXISTS forge_component_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  source_codebase TEXT NOT NULL,        -- e.g., 'awb-website', 'awb-admin-dashboard', 'forge'
  source_path TEXT NOT NULL,            -- relative path in source codebase
  category TEXT NOT NULL,               -- page, component, form, data-display, hook, utility, etc.
  description TEXT NOT NULL,
  tags JSONB DEFAULT '[]'::jsonb,       -- searchable tags array
  imports JSONB DEFAULT '[]'::jsonb,    -- npm packages used
  code TEXT NOT NULL,                   -- truncated code snippet (max ~150 lines)
  line_count INTEGER DEFAULT 0,
  content_hash TEXT,                    -- for dedup on re-ingestion
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(source_codebase, source_path)  -- one entry per file per codebase
);

-- Index for text search
CREATE INDEX IF NOT EXISTS idx_forge_refs_name ON forge_component_references USING gin(to_tsvector('english', name || ' ' || description));
CREATE INDEX IF NOT EXISTS idx_forge_refs_category ON forge_component_references(category);
CREATE INDEX IF NOT EXISTS idx_forge_refs_tags ON forge_component_references USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_forge_refs_codebase ON forge_component_references(source_codebase);

-- Enable RLS (service role bypasses)
ALTER TABLE forge_component_references ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access" ON forge_component_references
  FOR ALL USING (true) WITH CHECK (true);
