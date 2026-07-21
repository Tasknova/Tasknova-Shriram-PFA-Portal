-- =====================================================
-- MEETINGS INTELLIGENCE TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS meetings_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Link to daily_standup_meetings
  meeting_id TEXT NOT NULL REFERENCES daily_standup_meetings(meeting_id) ON DELETE CASCADE,
  team TEXT,
  
  -- Tasks Analysis
  tasks_completed INTEGER,
  tasks_completed_details TEXT,
  
  tasks_delayed INTEGER,
  tasks_delayed_details TEXT,
  
  -- Blockers Analysis
  blockers_detected INTEGER,
  blockers_detected_details TEXT,
  
  critical_blockers INTEGER,
  critical_blockers_details TEXT,
  
  -- Pipeline & Sales Analysis
  pipeline_deals_progressed INTEGER,
  pipeline_deals_progressed_details TEXT,
  
  pipeline_deals_stalled INTEGER,
  pipeline_deals_stalled_details TEXT,
  
  -- Revenue Impact Analysis
  revenue_impact_discussions INTEGER,
  revenue_impact_discussions_details TEXT,
  
  revenue_risk_signals INTEGER,
  revenue_risk_signals_details TEXT,
  
  -- Customer & Feature Analysis
  customer_feedback_count INTEGER,
  customer_feedback_details TEXT,
  
  feature_requests INTEGER,
  feature_requests_details TEXT,
  
  -- Follow-ups Analysis
  followups_assigned INTEGER,
  followups_assigned_details TEXT,
  
  followups_pending INTEGER,
  followups_pending_details TEXT,
  
  -- Sentiment & Efficiency Scoring
  sentiment_score INTEGER CHECK (sentiment_score >= -5 AND sentiment_score <= 5),
  sentiment_reasoning TEXT,
  
  meeting_efficiency_score INTEGER CHECK (meeting_efficiency_score >= 0 AND meeting_efficiency_score <= 100),
  meeting_efficiency_reasoning TEXT,
  
  -- Key Insights & Analysis
  key_insights TEXT,
  
  -- Additional structured data
  participants_analysis JSONB,
  analysis JSONB,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_meetings_intelligence_user_id ON meetings_intelligence(user_id);
CREATE INDEX idx_meetings_intelligence_meeting_id ON meetings_intelligence(meeting_id);
CREATE INDEX idx_meetings_intelligence_team ON meetings_intelligence(team);
CREATE INDEX idx_meetings_intelligence_created_at ON meetings_intelligence(created_at DESC);

-- RLS
ALTER TABLE meetings_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own meetings intelligence"
  ON meetings_intelligence FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert meetings intelligence"
  ON meetings_intelligence FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update meetings intelligence"
  ON meetings_intelligence FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete meetings intelligence"
  ON meetings_intelligence FOR DELETE
  USING (auth.uid() = user_id);
