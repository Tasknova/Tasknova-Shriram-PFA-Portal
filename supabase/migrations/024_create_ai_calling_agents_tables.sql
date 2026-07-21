-- AI Calling Agents Module Tables

-- Agents table
CREATE TABLE IF NOT EXISTS public.ai_agents (
  agent_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Prompt versions table
CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES public.ai_agents(agent_id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  performance_score FLOAT DEFAULT NULL,
  call_count INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(agent_id, version)
);

-- Calls table
CREATE TABLE IF NOT EXISTS public.ai_calls (
  call_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES public.ai_agents(agent_id) ON DELETE CASCADE,
  prompt_version_id UUID REFERENCES public.prompt_versions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  call_type TEXT DEFAULT 'unknown' CHECK (call_type IN ('valid', 'failed', 'invalid', 'unknown')),
  duration INT DEFAULT 0,
  recording_url TEXT,
  transcript_status TEXT DEFAULT 'pending' CHECK (transcript_status IN ('pending', 'processing', 'completed', 'failed')),
  outcome TEXT,
  customer_number TEXT,
  agent_number TEXT,
  did TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE
);

-- Transcripts table
CREATE TABLE IF NOT EXISTS public.ai_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT NOT NULL UNIQUE REFERENCES public.ai_calls(call_id) ON DELETE CASCADE,
  summary TEXT,
  call_outcome TEXT,
  history JSONB DEFAULT '[]'::jsonb,
  raw_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Evaluations table
CREATE TABLE IF NOT EXISTS public.ai_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT NOT NULL UNIQUE REFERENCES public.ai_calls(call_id) ON DELETE CASCADE,
  score FLOAT NOT NULL,
  issues JSONB DEFAULT '[]'::jsonb,
  suggestions JSONB DEFAULT '[]'::jsonb,
  evaluation_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Settings table for IndusLabs API configuration
CREATE TABLE IF NOT EXISTS public.ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS public.ai_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_ai_calls_agent_id ON public.ai_calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_calls_status ON public.ai_calls(status);
CREATE INDEX IF NOT EXISTS idx_ai_calls_call_type ON public.ai_calls(call_type);
CREATE INDEX IF NOT EXISTS idx_ai_calls_created_at ON public.ai_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_agent_id ON public.prompt_versions(agent_id);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_active ON public.prompt_versions(agent_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ai_transcripts_call_id ON public.ai_transcripts(call_id);
CREATE INDEX IF NOT EXISTS idx_ai_evaluations_call_id ON public.ai_evaluations(call_id);
CREATE INDEX IF NOT EXISTS idx_ai_evaluations_score ON public.ai_evaluations(score);
CREATE INDEX IF NOT EXISTS idx_ai_agents_created_at ON public.ai_agents(created_at DESC);

-- Enable RLS on all tables
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Allow all for authenticated users - adjust as needed)
CREATE POLICY "Allow authenticated users to view ai_agents" ON public.ai_agents
  FOR SELECT USING (auth.role() = 'authenticated_user');

CREATE POLICY "Allow authenticated users to insert ai_agents" ON public.ai_agents
  FOR INSERT WITH CHECK (auth.role() = 'authenticated_user');

CREATE POLICY "Allow authenticated users to view prompt_versions" ON public.prompt_versions
  FOR SELECT USING (auth.role() = 'authenticated_user');

CREATE POLICY "Allow authenticated users to insert prompt_versions" ON public.prompt_versions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated_user');

CREATE POLICY "Allow authenticated users to view ai_calls" ON public.ai_calls
  FOR SELECT USING (auth.role() = 'authenticated_user');

CREATE POLICY "Allow authenticated users to insert ai_calls" ON public.ai_calls
  FOR INSERT WITH CHECK (auth.role() = 'authenticated_user');

CREATE POLICY "Allow authenticated users to update ai_calls" ON public.ai_calls
  FOR UPDATE USING (auth.role() = 'authenticated_user');

CREATE POLICY "Allow authenticated users to view ai_transcripts" ON public.ai_transcripts
  FOR SELECT USING (auth.role() = 'authenticated_user');

CREATE POLICY "Allow authenticated users to insert ai_transcripts" ON public.ai_transcripts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated_user');

CREATE POLICY "Allow authenticated users to view ai_evaluations" ON public.ai_evaluations
  FOR SELECT USING (auth.role() = 'authenticated_user');

CREATE POLICY "Allow authenticated users to insert ai_evaluations" ON public.ai_evaluations
  FOR INSERT WITH CHECK (auth.role() = 'authenticated_user');

CREATE POLICY "Allow authenticated users to view ai_settings" ON public.ai_settings
  FOR SELECT USING (auth.role() = 'authenticated_user');

CREATE POLICY "Allow authenticated users to update ai_settings" ON public.ai_settings
  FOR UPDATE USING (auth.role() = 'authenticated_user');

CREATE POLICY "Allow authenticated users to insert ai_settings" ON public.ai_settings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated_user');

CREATE POLICY "Allow authenticated users to view ai_audit_logs" ON public.ai_audit_logs
  FOR SELECT USING (auth.role() = 'authenticated_user');

CREATE POLICY "Allow authenticated users to insert ai_audit_logs" ON public.ai_audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated_user');
