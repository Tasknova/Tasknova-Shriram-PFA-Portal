# AI Calling Agents - Setup Guide

## Environment Variables Required

The AI Calling Agents module requires the following environment variables to be configured in your `.env.local` file.

### 1. **IndusLabs API Key** (Required)
```
INDUSLABS_API_KEY=your-api-key-here
```
- Get this from your IndusLabs dashboard at: https://developer.induslabs.io
- This key is used for syncing agents and managing calls

### 2. **IndusLabs Login Credentials** (Required for Agent Details)
```
INDUSLABS_EMAIL=your-email@induslabs.com
INDUSLABS_PASSWORD=your-password-here
```
- These are your IndusLabs developer account credentials
- Used to obtain authentication tokens for fetching agent details from the IndusLabs API
- Required for the "Agent Details" feature in the admin dashboard

### 3. **Webhook Configuration** (Required)
```
WEBHOOK_CALLBACK_URL=https://admin.tasknova.io/api/webhooks/ai-agents/indus
```
- The URL where IndusLabs sends webhook events (calls, transcripts, evaluations, etc.)
- For development: `http://localhost:3000/api/webhooks/ai-agents/indus`
- For production: `https://admin.tasknova.io/api/webhooks/ai-agents/indus`

### 4. **Call Validation Settings** (Optional)
```
MIN_CALL_DURATION=10
EVALUATION_THRESHOLD=50
```
- `MIN_CALL_DURATION`: Minimum call duration in seconds to be considered valid (default: 10)
- `EVALUATION_THRESHOLD`: Minimum score (0-100) for calls to not be flagged (default: 50)

### 5. **Feature Flags** (Optional)
```
ENABLE_CALL_RECORDING=true
ENABLE_AUTO_EVALUATION=true
ENABLE_AUDIT_LOGGING=true
```

## Implementation Details

### API Endpoints Created

#### Fetch Agent Details from IndusLabs
```
GET /api/ai-agents/[id]
```
- Returns agent details from IndusLabs API
- Requires `INDUSLABS_EMAIL` and `INDUSLABS_PASSWORD` in `.env.local`

#### Get Agent Details with Local Data
```
GET /api/ai-agents/[id]/details
```
- Returns combined local database data and remote IndusLabs configuration
- Merges call metrics from local database with agent config from IndusLabs

### Functions Added

#### `getIndusLabsAccessToken()`
- Authenticates with IndusLabs API using email/password from `.env`
- Returns bearer token for subsequent API calls

#### `getIndusLabsAgentDetails(agentId: string)`
- Fetches agent configuration from IndusLabs API
- Returns agent settings, prompts, and metadata

### UI Components

The agent detail view now includes:
- **Local Metrics**: Call history, performance scores, success rates
- **Agent Details Section**: Displays remote agent configuration from IndusLabs
- **Refresh Details Button**: Manually fetch latest agent configuration

## Troubleshooting

### "Failed to obtain access token"
- Verify `INDUSLABS_EMAIL` and `INDUSLABS_PASSWORD` are correct
- Check that your IndusLabs account has API access enabled

### "Agent not found in local database"
- Sync agents first using the "Sync Agents" button in the admin dashboard
- Agents must exist in the local database before details can be fetched

### "Could not fetch remote agent details"
- Ensure webhook URL is accessible from IndusLabs servers
- Verify INDUSLABS_API_KEY is valid and active
- Check IndusLabs API status at https://developer.induslabs.io
