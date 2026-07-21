// Create tables using Supabase Management API
require('dotenv').config({ path: '.env.local' });
const https = require('https');

const sql = `
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
`;

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // Use pg endpoint via REST
  const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });
  
  const text = await resp.text();
  console.log('Status:', resp.status);
  console.log('Response:', text);
}

main();
