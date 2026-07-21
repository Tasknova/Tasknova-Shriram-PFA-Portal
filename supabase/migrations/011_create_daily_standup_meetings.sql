-- =====================================================
-- DAILY STANDUP MEETINGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS daily_standup_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Meeting metadata
  meeting_id TEXT UNIQUE NOT NULL,
  meeting_date DATE NOT NULL,
  meeting_title TEXT,
  
  -- Content
  meeting_transcript JSONB NOT NULL,
  meeting_summary JSONB,
  
  -- AI Analysis Results (from n8n - memory context insights)
  memory_context_analysis JSONB,
  
  -- Processing status
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_error TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_daily_standup_user_id ON daily_standup_meetings(user_id);
CREATE INDEX idx_daily_standup_meeting_date ON daily_standup_meetings(meeting_date);
CREATE INDEX idx_daily_standup_processed ON daily_standup_meetings(processed);
CREATE INDEX idx_daily_standup_meeting_id ON daily_standup_meetings(meeting_id);

-- RLS
ALTER TABLE daily_standup_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own standup meetings"
  ON daily_standup_meetings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert standup meetings"
  ON daily_standup_meetings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update standup meetings"
  ON daily_standup_meetings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete standup meetings"
  ON daily_standup_meetings FOR DELETE
  USING (auth.uid() = user_id);
