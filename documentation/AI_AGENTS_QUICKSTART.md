# AI Calling Agents Module - Quick Reference

## 🎯 What Was Built

A complete AI Calling Agents management system integrated into Tasknova Admin Panel with:

✅ **6 Tab-Based Pages**
- Dashboard (metrics, charts, insights)
- Agents (agent management with metrics)
- Calls (call tracking with filtering)
- Evaluations (evaluation scoring & analysis)
- Prompts (prompt version management)
- Settings (API configuration)

✅ **8 Backend API Endpoints**
- POST /api/ai-agents/start-call
- GET /api/ai-agents/calls
- GET /api/ai-agents/index
- GET /api/ai-agents/[id]/metrics
- GET /api/ai-agents/dashboard
- GET /api/ai-agents/evaluations
- GET/POST /api/ai-agents/prompt-versions
- GET/POST /api/ai-agents/settings

✅ **Webhook Handler**
- POST /api/webhooks/ai-agents/indus
- Handles: call.completed, call.failed, transcript.ready, transcript.failed

✅ **7 Database Tables**
- ai_agents
- prompt_versions
- ai_calls
- ai_transcripts
- ai_evaluations
- ai_settings
- ai_audit_logs

✅ **Evaluation Engine**
- Automatic call scoring (0-100)
- Issue detection
- Improvement suggestions
- Performance tracking

---

## 📂 File Locations

### Frontend Components
```
src/app/admin/(dashboard)/ai-calling-agents/
├── page.tsx
└── tabs/
    ├── DashboardTab.tsx
    ├── AgentsTab.tsx
    ├── CallsTab.tsx
    ├── EvaluationsTab.tsx
    ├── PromptsTab.tsx
    └── SettingsTab.tsx
```

### Backend APIs
```
src/app/api/
├── ai-agents/
│   ├── start-call/route.ts
│   ├── calls/route.ts
│   ├── index/route.ts
│   ├── [id]/metrics/route.ts
│   ├── dashboard/route.ts
│   ├── evaluations/route.ts
│   ├── prompt-versions/route.ts
│   └── settings/route.ts
└── webhooks/
    └── ai-agents/
        └── indus/route.ts
```

### Utilities
```
src/lib/aiAgentsUtils.ts       # Evaluation engine & helper functions
supabase/migrations/024_*.sql   # Database schema
```

### Documentation
```
documentation/
├── AI_CALLING_AGENTS_GUIDE.md  # Complete implementation guide
└── .env.ai-agents.example      # Environment variables template
```

---

## 🚀 Getting Started

### 1. Run Database Migration
```bash
# Option A: Using Supabase CLI
supabase migration up

# Option B: Copy SQL from supabase/migrations/024_create_ai_calling_agents_tables.sql
# and paste into Supabase SQL Editor
```

### 2. Add Environment Variables
Copy `.env.ai-agents.example` to `.env.local` and fill in:
```env
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_ROLE_KEY=your_key
```

### 3. Configure Settings in UI
1. Go to Admin Panel → AI Calling Agents → Settings
2. Enter IndusLabs API Key (from https://developer.induslabs.io)
3. Set callback URL: `https://yourdomain.com/api/webhooks/ai-agents/indus`
4. Adjust call settings as needed

### 4. Start Dev Server
```bash
npm run dev
# Visit: http://localhost:3000/admin/ai-calling-agents
```

---

## 📊 Key Features

### Dashboard Tab
- Real-time metrics (total calls, valid, failed, etc.)
- 30-day trends (calls over time, score trend)
- Outcome distribution chart
- Top insights (common issues, best agent, etc.)

### Agents Tab
- List all agents with performance metrics
- Click agent to view detailed metrics
- Track total calls, success rates, avg scores

### Calls Tab
- View all calls with full details
- Filter by agent, status, call type
- Click call to see:
  - Full transcript
  - Audio recording player
  - Evaluation score
  - Issues and suggestions

### Evaluations Tab
- Score-based filtering (min/max)
- Agent filtering
- Detailed evaluation view showing:
  - Score with progress bar
  - Issues detected
  - Improvement suggestions

### Prompts Tab
- Create new prompt versions
- Mark versions as active
- Track performance score per version
- Compare versions side-by-side

### Settings Tab
- Store IndusLabs API key (securely masked)
- Configure webhook callback URL
- Set minimum call duration
- Set evaluation threshold score

---

## 🔄 Call Flow

```
User initiates call
    ↓
POST /api/ai-agents/start-call
    ↓
System calls IndusLabs API
    ↓
Call created in database
    ↓
IndusLabs processes call...
    ↓
[Multiple webhook events]
    ↓
call.completed → Store recording URL
    ↓
transcript.ready → Classify & evaluate
    ↓
Store evaluation score & suggestions
    ↓
Update dashboard metrics
```

---

## 💾 Database Schema Overview

### ai_calls
```
call_id (TEXT, PRIMARY KEY)
agent_id (TEXT, FK → ai_agents)
prompt_version_id (UUID, FK → prompt_versions)
status (pending, in_progress, completed, failed)
call_type (valid, failed, invalid, unknown)
duration (INT)
recording_url (TEXT)
transcript_status (pending, processing, completed, failed)
outcome (TEXT)
created_at (TIMESTAMP)
```

### ai_evaluations
```
id (UUID, PRIMARY KEY)
call_id (TEXT, FK → ai_calls, UNIQUE)
score (FLOAT 0-100)
issues (JSONB array)
suggestions (JSONB array)
created_at (TIMESTAMP)
```

### ai_settings
```
id (UUID, PRIMARY KEY)
setting_key (TEXT, UNIQUE)
setting_value (TEXT)
created_at (TIMESTAMP)
```

---

## 📝 Common Tasks

### Start a Call
```typescript
fetch('/api/ai-agents/start-call', {
  method: 'POST',
  body: JSON.stringify({
    agent_id: 'agent_123',
    customer_number: '+1234567890',
    agent_number: '+0987654321',
    did: 'your_did'
  })
})
```

### Get Agent Metrics
```typescript
fetch('/api/ai-agents/agent_123/metrics')
```

### Create Prompt Version
```typescript
fetch('/api/ai-agents/prompt-versions', {
  method: 'POST',
  body: JSON.stringify({
    agent_id: 'agent_123',
    version: '1.0.0',
    prompt_text: 'Your prompt here...',
    is_active: true
  })
})
```

### Update Settings
```typescript
fetch('/api/ai-agents/settings', {
  method: 'POST',
  body: JSON.stringify({
    setting_key: 'induslabs_api_key',
    setting_value: 'your_api_key'
  })
})
```

---

## 🔐 Security Notes

1. **API Keys**: Stored in database, masked in UI
2. **Authentication**: All endpoints require session (except webhooks)
3. **RLS Enabled**: Database tables have Row Level Security
4. **Webhook**: Consider adding signature verification in production
5. **HTTPS**: Required for production webhook delivery

---

## ⚡ Performance Tips

1. **Caching**: Dashboard data refreshes every 10 minutes
2. **Pagination**: Use limit/offset for large datasets
3. **Indexes**: Created on frequently queried columns
4. **Real-time**: Charts update on tab focus or manual refresh

---

## 🛠️ Troubleshooting

### "API Key not configured" error
→ Go to Settings tab, enter API key, click Save

### Webhooks not received
→ Check callback URL is publicly accessible and correctly configured

### No calls showing
→ Verify IndusLabs integration, check for call creation errors

### Evaluations missing
→ Check call duration >= min_call_duration setting

### Charts not loading
→ Ensure chart.js library is properly installed

---

## 📚 Additional Resources

- Full Guide: `documentation/AI_CALLING_AGENTS_GUIDE.md`
- IndusLabs API: https://developer.induslabs.io
- Supabase Docs: https://supabase.com/docs
- Project Structure: See architecture diagram in main guide

---

## ✨ Features Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| Dashboard with metrics | ✅ | Real-time charts & insights |
| Agent management | ✅ | Track performance |
| Call tracking | ✅ | Full call details & recording |
| Call evaluation | ✅ | Automatic scoring & analysis |
| Prompt versioning | ✅ | Internal management |
| Settings UI | ✅ | Configure API keys & options |
| Webhook handling | ✅ | IndusLabs integration |
| Evaluation engine | ✅ | Scoring & suggestions |
| Database schema | ✅ | 7 tables with RLS |
| API endpoints | ✅ | 8 endpoints implemented |
| Sidebar integration | ✅ | Navigation added |
| Error handling | ✅ | Toast notifications |
| Loading states | ✅ | Better UX |
| Responsive design | ✅ | Mobile & desktop |

---

## 🎉 You're Ready!

The module is production-ready. Start by:

1. Running the migration
2. Configuring your API key in Settings
3. Testing a call via the Calls tab
4. Monitoring dashboard metrics

Good luck! 🚀
