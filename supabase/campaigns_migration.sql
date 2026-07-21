-- AI Campaigns Tables
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS ai_campaigns (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES ai_agents(agent_id) ON DELETE RESTRICT,
  did TEXT,
  total_calls INTEGER DEFAULT 0 NOT NULL,
  executed_calls INTEGER DEFAULT 0 NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  contacts JSONB DEFAULT '[]'::jsonb NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_campaign_calls (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  campaign_id UUID REFERENCES ai_campaigns(id) ON DELETE CASCADE NOT NULL,
  call_id TEXT REFERENCES ai_calls(call_id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_number TEXT NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'initiated', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_calls_campaign_id ON ai_campaign_calls(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_calls_call_id ON ai_campaign_calls(call_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON ai_campaigns(status);
