-- Allow evaluation records to be created in "processing" state before scores exist
ALTER TABLE public.ai_evaluations
  ALTER COLUMN score DROP NOT NULL;

-- Normalize legacy active-call status values to the canonical lifecycle status
UPDATE public.ai_calls
SET status = 'in_progress'
WHERE status = 'success';

-- Enable Supabase Realtime for the calling → evaluation workflow
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_evaluations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_transcripts;

-- Ensure evaluation updates are allowed (upserts require UPDATE + SELECT under RLS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_evaluations'
      AND policyname = 'Allow authenticated users to update ai_evaluations'
  ) THEN
    CREATE POLICY "Allow authenticated users to update ai_evaluations"
      ON public.ai_evaluations
      FOR UPDATE
      USING (auth.role() = 'authenticated_user');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_transcripts'
      AND policyname = 'Allow authenticated users to update ai_transcripts'
  ) THEN
    CREATE POLICY "Allow authenticated users to update ai_transcripts"
      ON public.ai_transcripts
      FOR UPDATE
      USING (auth.role() = 'authenticated_user');
  END IF;
END $$;
