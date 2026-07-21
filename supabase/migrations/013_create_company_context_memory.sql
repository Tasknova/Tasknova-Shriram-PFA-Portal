-- =====================================================
-- COMPANY CONTEXT MEMORY TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS company_context_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Source reference
  source_insight_id TEXT,
  source_meeting_id TEXT REFERENCES daily_standup_meetings(meeting_id) ON DELETE SET NULL,
  
  -- Content
  insight_text TEXT NOT NULL,
  
  -- Analysis metadata
  confidence_score NUMERIC(3, 2) CHECK (confidence_score >= 0 AND confidence_score <= 1.0),
  relevance_score NUMERIC(3, 2) CHECK (relevance_score >= 0 AND relevance_score <= 1.0),
  keywords TEXT[] DEFAULT '{}',
  category TEXT,
  
  -- Memory management
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  access_count INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT FALSE,
  
  -- Additional data
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_company_context_memory_user_id ON company_context_memory(user_id);
CREATE INDEX idx_company_context_memory_created_at ON company_context_memory(created_at DESC);
CREATE INDEX idx_company_context_memory_last_accessed ON company_context_memory(last_accessed_at DESC);
CREATE INDEX idx_company_context_memory_is_pinned ON company_context_memory(is_pinned);
CREATE INDEX idx_company_context_memory_source_meeting ON company_context_memory(source_meeting_id);
CREATE INDEX idx_company_context_memory_keywords ON company_context_memory USING GIN(keywords);

-- RLS
ALTER TABLE company_context_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own company context memory"
  ON company_context_memory FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert company context memory"
  ON company_context_memory FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update company context memory"
  ON company_context_memory FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete company context memory"
  ON company_context_memory FOR DELETE
  USING (auth.uid() = user_id);
