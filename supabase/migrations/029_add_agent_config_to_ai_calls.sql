-- Store per-call agent_config (e.g. customer_name for Shriram PFA) on call records
ALTER TABLE public.ai_calls
ADD COLUMN IF NOT EXISTS agent_config JSONB DEFAULT NULL;
