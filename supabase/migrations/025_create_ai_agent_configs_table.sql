-- Create AI Agent Configs table
CREATE TABLE IF NOT EXISTS public.ai_agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL UNIQUE REFERENCES public.ai_agents(agent_id) ON DELETE CASCADE,
  
  -- Core Configuration
  system_prompt TEXT,
  starting_instructions TEXT,
  agent_type TEXT,
  guardrail_ids TEXT[] DEFAULT '{}',
  call_infields TEXT[] DEFAULT '{}',
  
  -- TTS Configuration
  tts_config JSONB,
  
  -- STT Configuration
  stt_config JSONB,
  
  -- LLM Configuration
  llm_config JSONB,
  
  -- VAD Configuration
  vad_config JSONB,
  
  -- Metadata
  notes TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  version INT DEFAULT 1,
  is_current BOOLEAN DEFAULT TRUE,
  full_config JSONB,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ai_agent_configs_agent_id ON public.ai_agent_configs(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_configs_status ON public.ai_agent_configs(status);
CREATE INDEX IF NOT EXISTS idx_ai_agent_configs_created_at ON public.ai_agent_configs(created_at DESC);

-- Enable RLS
ALTER TABLE public.ai_agent_configs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Enable read access for all users" ON public.ai_agent_configs
  FOR SELECT USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON public.ai_agent_configs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON public.ai_agent_configs
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
