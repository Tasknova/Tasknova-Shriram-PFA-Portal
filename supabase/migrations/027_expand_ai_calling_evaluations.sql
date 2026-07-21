ALTER TABLE public.ai_transcripts
ADD COLUMN IF NOT EXISTS transcript_id TEXT;

ALTER TABLE public.ai_evaluations
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'processing'
  CHECK (status IN ('processing', 'completed', 'failed')),
ADD COLUMN IF NOT EXISTS transcript_text TEXT,
ADD COLUMN IF NOT EXISTS transcript_source TEXT DEFAULT 'whisper-1',
ADD COLUMN IF NOT EXISTS analysis_json JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS call_summary TEXT,
ADD COLUMN IF NOT EXISTS customer_intent TEXT,
ADD COLUMN IF NOT EXISTS main_discussion_points JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS call_outcome TEXT,
ADD COLUMN IF NOT EXISTS agent_performance JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS strengths JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS areas_for_improvement JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS next_best_actions JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS overall_feedback TEXT,
ADD COLUMN IF NOT EXISTS overall_score FLOAT,
ADD COLUMN IF NOT EXISTS agent_performance_score FLOAT,
ADD COLUMN IF NOT EXISTS customer_engagement_score FLOAT,
ADD COLUMN IF NOT EXISTS communication_score FLOAT,
ADD COLUMN IF NOT EXISTS qualification_score FLOAT,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP WITH TIME ZONE;

UPDATE public.ai_evaluations
SET
  status = CASE
    WHEN score IS NOT NULL THEN 'completed'
    ELSE 'processing'
  END,
  overall_score = COALESCE(overall_score, score),
  transcript_source = COALESCE(transcript_source, 'whisper-1')
WHERE status IS NULL
   OR overall_score IS NULL
   OR transcript_source IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_evaluations_status
  ON public.ai_evaluations(status);

CREATE INDEX IF NOT EXISTS idx_ai_evaluations_processed_at
  ON public.ai_evaluations(processed_at DESC);
