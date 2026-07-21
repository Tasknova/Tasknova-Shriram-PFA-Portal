-- Create API Logs table for tracking all API calls and responses
CREATE TABLE IF NOT EXISTS public.api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Request Information
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
  request_body JSONB,
  request_headers JSONB,
  
  -- Response Information
  status_code INT,
  response_body JSONB,
  response_headers JSONB,
  
  -- Context
  agent_id TEXT,
  user_id UUID,
  
  -- Metadata
  duration_ms INT,
  error_message TEXT,
  success BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint ON public.api_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_logs_agent_id ON public.api_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON public.api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_status_code ON public.api_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_api_logs_success ON public.api_logs(success);

-- Enable RLS
ALTER TABLE public.api_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Enable read access for authenticated users" ON public.api_logs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON public.api_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
