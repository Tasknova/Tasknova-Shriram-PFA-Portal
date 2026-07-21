# AI Calling Agents Module - Implementation Guide

## Overview

The AI Calling Agents module is a complete system for managing and optimizing AI calling agents using IndusLabs APIs. It provides:

- **Call Management**: Track all calls with full details, recordings, and transcripts
- **Agent Performance**: Monitor agent metrics and performance analytics
- **Call Evaluation**: Automatic evaluation of calls with scoring and suggestions
- **Prompt Versioning**: Internal management of prompt versions for optimization
- **Dashboard Analytics**: Real-time insights into call performance and trends
- **Webhook Integration**: Seamless integration with IndusLabs for real-time updates

---

## 🗂️ Project Structure

```
src/
├── app/
│   ├── admin/
│   │   └── (dashboard)/
│   │       └── ai-calling-agents/
│   │           ├── page.tsx                 # Main page with tab navigation
│   │           └── tabs/
│   │               ├── DashboardTab.tsx     # Dashboard with metrics & charts
│   │               ├── AgentsTab.tsx        # Agent management
│   │               ├── CallsTab.tsx         # Call tracking with filtering
│   │               ├── EvaluationsTab.tsx   # Call evaluations
│   │               ├── PromptsTab.tsx       # Prompt version management
│   │               └── SettingsTab.tsx      # Configuration settings
│   ├── api/
│   │   ├── ai-agents/
│   │   │   ├── start-call/route.ts         # POST - Start a call
│   │   │   ├── calls/route.ts              # GET - Fetch calls
│   │   │   ├── index/route.ts              # GET - Fetch agents
│   │   │   ├── [id]/metrics/route.ts       # GET - Agent metrics
│   │   │   ├── dashboard/route.ts          # GET - Dashboard metrics
│   │   │   ├── evaluations/route.ts        # GET - Fetch evaluations
│   │   │   ├── prompt-versions/route.ts    # GET/POST - Prompt management
│   │   │   └── settings/route.ts           # GET/POST - Settings
│   │   └── webhooks/
│   │       └── ai-agents/
│   │           └── indus/route.ts          # POST - IndusLabs webhooks
│   └── lib/
│       └── aiAgentsUtils.ts                # Utilities & evaluation engine
└── supabase/
    └── migrations/
        └── 024_create_ai_calling_agents_tables.sql
```

---

## 🗄️ Database Schema

### Tables Created

1. **ai_agents** - Agent metadata
2. **prompt_versions** - Prompt version tracking
3. **ai_calls** - Call records
4. **ai_transcripts** - Transcript storage
5. **ai_evaluations** - Call evaluation scores and feedback
6. **ai_settings** - Configuration storage
7. **ai_audit_logs** - Audit trail for all events

All tables have RLS (Row Level Security) enabled for authenticated users.

---

## ⚙️ Environment Variables

Add these to your `.env.local` file:

```env
# Existing variables (keep these)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# New variables for AI Agents module
# Note: These are configured via the Settings tab in the UI
# But you can also set defaults here:

# IndusLabs API Configuration
# Get this from https://developer.induslabs.io
INDUSLABS_API_KEY=your_api_key_here

# Webhook callback URL (must be publicly accessible)
# This will receive events from IndusLabs
WEBHOOK_CALLBACK_URL=https://yourdomain.com/webhooks/ai-agents/indus

# Call settings
MIN_CALL_DURATION=10        # Minimum seconds for a valid call
EVALUATION_THRESHOLD=50      # Score threshold for flagging
```

---

## 🚀 Setup Instructions

### 1. Database Migration

Run the migration to create all required tables:

```bash
# Using Supabase CLI
supabase migration up

# Or execute the SQL migration directly in Supabase dashboard
# Copy content from: supabase/migrations/024_create_ai_calling_agents_tables.sql
```

### 2. Configure IndusLabs API Key

1. Go to Admin Panel → AI Calling Agents
2. Click "Settings" tab
3. Enter your IndusLabs API Key (get from https://developer.induslabs.io)
4. Set your Callback URL
5. Configure call settings as needed

### 3. Configure Webhook Callback

Your webhook endpoint is available at:
```
POST https://yourdomain.com/api/webhooks/ai-agents/indus
```

Configure this URL in your IndusLabs dashboard under webhook settings.

---

## 📡 API Endpoints

### Public Endpoints (No Auth Required)

```
POST /api/webhooks/ai-agents/indus
  Description: Webhook receiver for IndusLabs events
  Body: { event, data }
  Events: call.completed, call.failed, transcript.ready, transcript.failed
```

### Protected Endpoints (Authentication Required)

```
POST /api/ai-agents/start-call
  Description: Initiate a call
  Body: { agent_id, customer_number, agent_number, did }
  Response: { call_id, success }

GET /api/ai-agents/index
  Description: Fetch all agents with metrics
  Query: None
  Response: { agents[] }

GET /api/ai-agents/calls
  Description: Fetch calls with filters
  Query: ?agent_id=X&status=Y&call_type=Z&limit=50&offset=0
  Response: { calls[], total, limit, offset }

GET /api/ai-agents/[id]/metrics
  Description: Get agent metrics
  Response: { total_calls, valid_calls, failed_calls, avg_score, success_rate, ... }

GET /api/ai-agents/dashboard
  Description: Get dashboard metrics and trends
  Response: { metrics, trends, insights }

GET /api/ai-agents/evaluations
  Description: Fetch evaluations with filters
  Query: ?min_score=X&max_score=Y&agent_id=Z&limit=50&offset=0
  Response: { evaluations[], total, limit, offset }

GET /api/ai-agents/prompt-versions
  Description: Fetch prompt versions
  Query: ?agent_id=X
  Response: { prompt_versions[] }

POST /api/ai-agents/prompt-versions
  Description: Create new prompt version
  Body: { agent_id, version, prompt_text, is_active }
  Response: { prompt_version }

GET /api/ai-agents/settings
  Description: Fetch settings
  Query: ?key=X (optional for specific setting)
  Response: { settings[] or setting }

POST /api/ai-agents/settings
  Description: Save/update setting
  Body: { setting_key, setting_value }
  Response: { success, setting }
```

---

## 🔄 Workflow & Call Lifecycle

### Call Initiation Flow

```
1. User calls POST /api/ai-agents/start-call
   ↓
2. Fetch active prompt version for agent
   ↓
3. Call IndusLabs API to initiate call
   ↓
4. Store call record in database (status: in_progress)
   ↓
5. Return call_id to client
   ↓
6. Wait for webhook events...
```

### Webhook Event Flow

```
IndusLabs → /webhooks/ai-agents/indus

1. call.completed
   - Update call duration & recording_url
   - Set status to 'completed'

2. transcript.ready
   - Store transcript data
   - Classify call (valid/invalid/failed)
   - If duration >= min_call_duration: Trigger evaluation
   - Update prompt version performance

3. call.failed / transcript.failed
   - Mark call_type as 'failed'
   - Do not evaluate
```

### Call Classification

```
Valid Call:
  - Duration >= min_call_duration (default: 10s)
  - Transcript available
  - Will be evaluated

Invalid Call:
  - Duration < min_call_duration
  - Will NOT be evaluated

Failed Call:
  - Transcript failed or missing
  - Recording unavailable
  - Will NOT be evaluated
```

---

## 📊 Evaluation Engine

### Evaluation Logic

The `evaluateCall()` function in `lib/aiAgentsUtils.ts` analyzes:

1. **Duration**: Penalizes calls < 10 seconds
2. **Transcript**: Checks for available transcript data
3. **Outcome**: Analyzes keywords (successful/failed)
4. **Summary**: Validates transcript summary exists

### Score Breakdown

- **100**: Perfect call (all criteria met)
- **80-99**: Excellent (minor issues)
- **60-79**: Good (some issues detected)
- **40-59**: Fair (multiple issues)
- **< 40**: Poor (needs improvement)

### Output

```typescript
{
  score: 0-100,
  issues: ["issue1", "issue2"],
  suggestions: ["suggestion1", "suggestion2"]
}
```

---

## 📈 Dashboard Metrics

The dashboard shows:

### Key Metrics
- Total Calls
- Valid Calls
- Failed Calls
- Invalid Calls
- Average Evaluation Score
- Conversion Rate

### Trends
- Calls over time (30-day graph)
- Score trend (30-day graph)
- Outcome distribution (pie chart)

### Insights
- Most common issues
- Best performing agent
- Agent needing attention
- Top problem patterns

---

## 🔒 Security Considerations

1. **API Keys**: Stored in `ai_settings` table, masked in API responses
2. **Authentication**: All endpoints (except webhooks) require authentication
3. **RLS Policies**: All tables have RLS enabled for authenticated users
4. **Webhook Verification**: Implement signature verification for production
5. **Data Encryption**: Store sensitive data (recordings, transcripts) securely

---

## 🛠️ Troubleshooting

### Issue: Webhook Events Not Received

**Solution:**
- Verify callback URL is publicly accessible
- Check IndusLabs dashboard webhook configuration
- Verify endpoint is `/api/webhooks/ai-agents/indus`
- Check server logs for any errors

### Issue: API Key Not Saving

**Solution:**
- Go to Settings tab
- Verify API key format is correct
- Check browser console for errors
- Verify database connection is active

### Issue: Calls Not Being Evaluated

**Solution:**
- Check call duration >= min_call_duration setting
- Verify transcript was generated (transcript.ready event received)
- Check database for evaluation records
- Review evaluation engine logs

### Issue: Agent Metrics Show Zero

**Solution:**
- Ensure calls exist in database
- Check agent_id matches correctly
- Verify call status is 'completed'
- Run dashboard refresh

---

## 📝 Database Queries

### Useful Queries

```sql
-- Total calls by agent
SELECT agent_id, COUNT(*) as total_calls
FROM ai_calls
GROUP BY agent_id;

-- Average score by agent
SELECT 
  ac.agent_id,
  AVG(ae.score) as avg_score
FROM ai_calls ac
JOIN ai_evaluations ae ON ac.call_id = ae.call_id
GROUP BY ac.agent_id;

-- Calls in last 24 hours
SELECT * FROM ai_calls
WHERE created_at > NOW() - INTERVAL '1 day'
ORDER BY created_at DESC;

-- Most common issues
SELECT issues
FROM ai_evaluations
WHERE issues IS NOT NULL
ORDER BY created_at DESC;
```

---

## 🚀 Performance Optimization

### Indexes
The migration creates indexes on:
- `ai_calls(agent_id, status, call_type, created_at)`
- `prompt_versions(agent_id, is_active)`
- `ai_evaluations(score, call_id)`

### Caching Strategies
- Cache agent metrics for 5 minutes
- Cache dashboard data for 10 minutes
- Refresh on manual "Refresh" button click

### Pagination
- Use limit/offset for large result sets
- Default limit: 50, max: 100
- Implement infinite scroll for better UX

---

## 🔄 Deployment Checklist

- [ ] Run database migration
- [ ] Set environment variables
- [ ] Configure IndusLabs API key
- [ ] Set callback URL in IndusLabs dashboard
- [ ] Test call initiation flow
- [ ] Test webhook handling
- [ ] Verify evaluation engine
- [ ] Test dashboard metrics
- [ ] Configure monitoring/alerts
- [ ] Test error handling
- [ ] Review security settings

---

## 📞 Support & Resources

- **IndusLabs Documentation**: https://developer.induslabs.io
- **Supabase Documentation**: https://supabase.com/docs
- **Tasknova Admin Panel**: Internal documentation in `/documentation`

---

## Version History

- **v1.0.0** (2026-05-04): Initial implementation
  - Complete AI calling agents module
  - Dashboard with metrics and charts
  - Webhook integration with IndusLabs
  - Evaluation engine
  - Prompt version management
