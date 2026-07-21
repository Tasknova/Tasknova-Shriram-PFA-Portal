-- Run this in Supabase SQL Editor to add missing columns to c2c_evaluations
-- https://supabase.com/dashboard/project/YOUR_PROJECT_REF/sql/new

ALTER TABLE c2c_evaluations
  ADD COLUMN IF NOT EXISTS agent_performance_score FLOAT,
  ADD COLUMN IF NOT EXISTS customer_engagement_score FLOAT,
  ADD COLUMN IF NOT EXISTS communication_score FLOAT,
  ADD COLUMN IF NOT EXISTS qualification_score FLOAT,
  ADD COLUMN IF NOT EXISTS call_outcome TEXT,
  ADD COLUMN IF NOT EXISTS agent_performance JSONB,
  ADD COLUMN IF NOT EXISTS analysis_json JSONB,
  ADD COLUMN IF NOT EXISTS transcript_source TEXT DEFAULT 'whisper-1',
  ADD COLUMN IF NOT EXISTS transcript_text TEXT;
