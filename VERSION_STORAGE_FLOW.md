# Agent Version Storage & Fetching Flow

## Data Storage Locations

### 1. **ai_agents table** (Basic Agent Info)
- `agent_id` - Unique identifier
- `name` - Agent name
- `status` - active/inactive/archived
- `created_at`, `updated_at` - Timestamps
- `metadata` - JSON field for extra data
- **Purpose**: Registry of all agents

### 2. **ai_agent_configs table** (Current Configuration)
- `agent_id` - Links to agent
- `system_prompt` - ✅ **Current system prompt**
- `starting_instructions` - ✅ **Current starting instructions**
- `agent_type`, `guardrail_ids`, `call_infields`
- `tts_config`, `stt_config`, `llm_config`, `vad_config` - JSON configs
- `version` (INT) - Config version number
- `is_current` - Marks this as the active config
- `status` - active/inactive
- **Purpose**: Current active configuration for each agent

### 3. **prompt_versions table** (Historical Versions)
- `agent_id` - Links to agent
- `version` (TEXT) - Version identifier (e.g., "1", "2", "3")
- `prompt_text` - ⚠️ **Stores system prompt (NOT separate field)**
- `is_active` - Boolean flag
- `performance_score` - Quality metric
- `call_count` - Number of calls using this version
- `created_at`, `updated_at` - Timestamps
- **Purpose**: Keep history of all prompt versions used
- **NOTE**: Does NOT have `starting_instructions` field

## How Versions Are Fetched

### API Endpoint: `/api/ai-agents/[id]/versions`

**Current Implementation:**
```
1. Query ai_agent_configs
   - Gets ONE record (current config)
   - Extracts: system_prompt, starting_instructions, version, is_current, status

2. Query prompt_versions
   - Gets ALL versions for that agent (ordered by created_at DESC)
   - Extracts: version, prompt_text (mapped to system_prompt), is_active, call_count, performance_score
   
3. Combine both
   - Current config returned as one version
   - All historical versions returned as separate entries
```

## ⚠️ Critical Issue: Missing Data

The agents shown in the UI (e.g., "Process Engineer", "industrial engineer") might be coming from **IndusLabs directly** and may NOT have data in your local Supabase tables.

### Where Are Your Agents Stored?

1. **If created via your "/api/ai-agents/create-agent" endpoint:**
   - ✅ Will have data in `ai_agents`
   - ✅ Will have data in `ai_agent_configs`
   - ✅ Will have data in `prompt_versions`
   - **Result**: Versions will display correctly

2. **If created directly in IndusLabs:**
   - ❌ May NOT exist in `ai_agents`, `ai_agent_configs`, or `prompt_versions`
   - **Result**: Versions will show as empty

## Data Flow for Agent Creation

```
POST /api/ai-agents/create-agent
  ↓
Create on IndusLabs API
  ↓
Save to ai_agents table
  ↓
Save to ai_agent_configs table (full config)
  ↓
Save to prompt_versions table (v1 with system_prompt as prompt_text)
```

## How to Verify

Run these Supabase queries to check:

```sql
-- Check if agents exist in your database
SELECT agent_id, name FROM public.ai_agents LIMIT 10;

-- Check configs for a specific agent
SELECT agent_id, system_prompt, starting_instructions 
FROM public.ai_agent_configs 
WHERE agent_id = 'AGT_3FD52A75';

-- Check prompt versions for a specific agent
SELECT agent_id, version, prompt_text, is_active 
FROM public.prompt_versions 
WHERE agent_id = 'AGT_3FD52A75' 
ORDER BY created_at DESC;
```

## Summary of Correctness

| Aspect | Status | Details |
|--------|--------|---------|
| API fetches from correct tables | ✅ | Queries both ai_agent_configs and prompt_versions |
| System prompt is returned | ✅ | From ai_agent_configs.system_prompt and prompt_versions.prompt_text |
| Starting instructions returned | ✅ | From ai_agent_configs.starting_instructions (but not in versions history) |
| Version history shown | ⚠️ | Only if agent was created via local API; not if created in IndusLabs |
| Current vs historical distinction | ✅ | Uses ai_agent_configs for current, prompt_versions for history |

## Next Steps to Fix Empty Versions

If agents don't show versions:

1. **Sync existing IndusLabs agents to local DB** - Need to fetch agents from IndusLabs API and populate local tables

2. **OR** - Only show agents that have local config data

3. **OR** - Fetch versions directly from IndusLabs API when local data is missing
