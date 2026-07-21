-- Run this SQL in your Supabase SQL Editor at:
-- https://supabase.com/dashboard/project/YOUR_PROJECT_REF/sql/new

CREATE TABLE IF NOT EXISTS c2c_calls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id TEXT UNIQUE NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  did TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  duration INTEGER NOT NULL DEFAULT 0,
  recording_url TEXT,
  transcript_status TEXT NOT NULL DEFAULT 'pending',
  outcome TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS c2c_transcripts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id TEXT UNIQUE NOT NULL REFERENCES c2c_calls(call_id) ON DELETE CASCADE,
  transcript_id TEXT,
  summary TEXT,
  call_outcome TEXT,
  history JSONB DEFAULT '[]',
  raw_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS c2c_evaluations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id TEXT UNIQUE NOT NULL REFERENCES c2c_calls(call_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'processing',
  score FLOAT,
  overall_score FLOAT,
  overall_feedback TEXT,
  call_summary TEXT,
  customer_intent TEXT,
  main_discussion_points JSONB DEFAULT '[]',
  call_outcome TEXT,
  agent_performance JSONB,
  strengths JSONB DEFAULT '[]',
  areas_for_improvement JSONB DEFAULT '[]',
  next_best_actions JSONB DEFAULT '[]',
  issues JSONB DEFAULT '[]',
  suggestions JSONB DEFAULT '[]',
  transcript_text TEXT,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS c2c_calls_status_idx ON c2c_calls(status);
CREATE INDEX IF NOT EXISTS c2c_calls_created_at_idx ON c2c_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS c2c_evaluations_call_id_idx ON c2c_evaluations(call_id);
