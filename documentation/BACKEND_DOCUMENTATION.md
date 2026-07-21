# Tasknova Admin Panel - Backend Documentation

## 1. Backend Stack

- Database: Supabase PostgreSQL
- API layer: Next.js App Router route handlers
- Auth/session: custom JWT cookie auth over admins table
- Vector search: pgvector (vector(768), IVFFlat cosine indexes)
- File storage: Supabase Storage buckets
- Edge compute: Supabase Edge Functions (Deno)
- AI providers: Gemini API + Apify for LinkedIn enrichment

## 2. Environment and Backend Configuration

Core environment variables:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- JWT_SECRET
- NEXT_PUBLIC_GEMINI_API_KEY
- APIFY_API_TOKEN

Security note:

- Server routes use service-role key via createServerClient() for privileged admin operations.

## 3. Database Schema

This section reflects current live schema and migration intent together.

## 3.1 Administrative and Operational Tables

### public.admins

Purpose:

- Admin authentication and authorization identities

Key columns:

- id (uuid, PK)
- full_name
- email (unique)
- password_hash
- role (super_admin | admin)
- is_active
- created_at
- last_login

### public.demo_requests

Purpose:

- Inbound demo lead records

Key columns:

- id (uuid, PK)
- name, email, company, role, team_size, notes
- company_website, company_scraped_info
- preferred_date, preferred_time, timezone
- mail_sent
- created_at

### public.voice_conversations

Purpose:

- Voice interaction logs and analytics artifacts

Key columns include status, transcript, messages, recording URLs, summary, analysis, lead fields, timestamps.

### public.chat_conversations

Purpose:

- Chat session logs, messages, and metadata

Key columns:

- id (uuid, PK)
- session_id
- messages (jsonb)
- summary, metadata
- created_at, updated_at

## 3.2 Content and Hiring Tables

### public.blogs

Purpose:

- Blog content management

Key columns:

- id (uuid, PK)
- title, slug (unique), excerpt, content
- hero/author metadata
- tags, category, read_time
- is_published, published_at
- created_at, updated_at

### public.playbooks

Purpose:

- Playbook metadata and downloadable resources

Key columns:

- id (uuid, PK)
- title, slug
- description, topics, pages, downloads
- file_path, file_url
- created_at

### public.industry_reports

Purpose:

- Industry report metadata and links

Key columns:

- id (uuid, PK)
- title, slug
- description, year, pages, downloads
- key_findings, pdf_url
- is_published
- created_at, updated_at

### public.job_openings

Purpose:

- Job posting definitions

Key columns:

- id (uuid, PK)
- title, department, location, type
- description, about
- responsibilities (jsonb)
- skills (jsonb)
- gradient, is_active, created_at

### public.job_applicants

Purpose:

- Applicant records + AI analysis lifecycle

Key columns:

- id (uuid, PK)
- job_id (FK -> job_openings.id)
- full_name, email, phone, experience_years
- portfolio_url, resume_url, cover_letter, answers
- linkedin_url
- linkedin_scraped_data (jsonb)
- portfolio_scraped_data (jsonb)
- ai_score, ai_score_reasoning
- analysis_status (not_started|processing|completed|failed)
- analysis_data (jsonb)
- analyzed_at, analysis_error
- resume_extracted_text
- created_at

## 3.3 Company Brain and Project Brain Tables

### Company Brain Group

#### public.company_brain

- One brain per user/company identity
- Strategic company profile + custom fields + context

#### public.document_groups

- Optional grouping for company documents

#### public.brain_documents

- Company document metadata and storage pointers
- Includes budget columns and content_text for AI retrieval

#### public.company_brain_embeddings

- content_type: company_info | document | additional_context
- embedding vector(768)
- metadata jsonb

### Project Brain Group

#### public.projects

- Project shell records and lifecycle status

#### public.project_metadata

- One metadata row per project
- domain/industry/tech/goals/pricing/budget fields

#### public.project_documents

- Project docs with content_text, soft-delete and status

#### public.project_embeddings

- content_type: project_metadata | document | document_chunk
- vector(768) + metadata

## 3.4 Meetings and Context Memory Tables

### public.daily_standup_meetings

Purpose:

- Persist standup transcripts, summaries, and memory-context analysis payloads

Key columns:

- id (uuid, PK)
- meeting_date, meeting_title
- meeting_transcript (jsonb)
- meeting_summary (jsonb)
- memory_context_analysis (jsonb)
- processed, processed_at, processing_error
- meeting_end_time, meeting_duration
- created_at

### public.meetings_intelligence

Purpose:

- Structured AI analytics tied to standup meeting rows

Key columns:

- id (uuid, PK)
- meeting_id (FK -> daily_standup_meetings.id)
- task/blocker/pipeline/revenue/customer/followup metric fields
- sentiment_score, meeting_efficiency_score
- reasoning fields + participants_analysis + analysis
- created_at, updated_at

### public.company_context_memory

Purpose:

- Company-level memory items derived from insights

Key columns:

- id (uuid, PK)
- user_id (FK auth.users)
- source_insight_id, source_meeting_id
- insight_text, confidence_score, relevance_score
- keywords[], category
- access_count, last_accessed_at, is_pinned
- metadata jsonb
- approval_status, approved_at, approved_by
- approved_disapproved_at, approved_disapproved_by
- created_at, updated_at

### public.project_context_memory

Purpose:

- Project-scoped equivalent of company context memory

Additional key relation:

- project_id (FK -> projects.id)

### public.company_context_embeddings

Purpose:

- Approved company memory vectors

Key columns:

- id, user_id, context_memory_id, embedding(vector), created_at

### public.project_context_embeddings

Purpose:

- Approved project memory vectors

Key columns:

- id, user_id, context_memory_id, embedding(vector), created_at

## 3.5 Key Relationships Summary

Primary FK graph:

- job_applicants.job_id -> job_openings.id
- project_metadata.project_id -> projects.id
- project_documents.project_id -> projects.id
- project_embeddings.project_id -> projects.id
- project_context_memory.project_id -> projects.id
- meetings_intelligence.meeting_id -> daily_standup_meetings.id
- company_context_embeddings.context_memory_id -> company_context_memory.id
- project_context_embeddings.context_memory_id -> project_context_memory.id

## 4. Migrations Overview

Migration sequence under supabase/migrations:

- 001: admins table
- 002: company brain tables + embedding infrastructure
- 003: project brain tables + embedding infrastructure
- 004: vector search RPC functions
- 005-010: budget/content_text evolution for documents
- 011: daily standup meetings
- 012: meetings intelligence
- 013-016: context memory + context embedding tables
- 017: meetings intelligence team-field removal
- 018-019: approval workflow + unified audit columns
- 020: applicant analysis lifecycle columns and status constraints

## 5. API Layer Documentation

All routes below are under src/app/api and return JSON.

## 5.1 Auth APIs

- POST /api/auth/login
- Inputs: email, password
- Actions: validate admin, set admin_session cookie

- GET /api/auth/session
- Returns authenticated boolean + admin payload

- POST /api/auth/logout
- Clears admin_session cookie

## 5.2 Dashboard API

- GET /api/admin/dashboard
- Returns aggregate counts + recent records for key modules

## 5.3 CRUD APIs

Admins:

- GET /api/admin/admins
- POST /api/admin/admins (super_admin)
- PATCH /api/admin/admins (activate/deactivate)
- DELETE /api/admin/admins (super_admin)

Blogs:

- GET/POST/PATCH/DELETE /api/admin/blogs

Playbooks:

- GET/POST/PATCH/DELETE /api/admin/playbooks

Industry reports:

- GET/POST/PATCH/DELETE /api/admin/industry-reports

Demo requests:

- GET/DELETE /api/admin/demo-requests

Voice conversations:

- GET/DELETE /api/admin/voice-conversations

Chat conversations:

- GET/DELETE /api/admin/chat-conversations

Job openings:

- GET/PATCH/DELETE /api/admin/job-openings

Job applicants:

- GET/DELETE /api/admin/job-applicants

## 5.4 Applicant AI APIs

### POST /api/admin/job-applicants/scrape-linkedin

Modes:

- single: scrape one applicant
- all: bulk scrape candidate set with limit

Behavior:

- skips already successful scrape unless forceRescrape=true
- writes linkedin_scraped_data per applicant

### POST /api/admin/job-applicants/analyze

Modes:

- single applicant analysis
- bulk analysis (pending/failed/null score selection)

Behavior:

- marks processing -> completed/failed
- persists analysis_data + ai_score + reasoning + source payloads

## 5.5 Meetings and Context APIs

### GET /api/admin/daily-standup-meetings

- list or fetch single standup row by id

### GET /api/admin/meetings-intelligence

- list or fetch single intelligence record
- enriches response with linked standup summary fields

### /api/admin/company-context-memory

- GET: list with filters (pending, status, sort, pinned)
- PATCH: approve, disapprove, pin/unpin
- DELETE: remove context item

### /api/admin/project-context-memory

- GET/PATCH/DELETE equivalent scoped by projectId

### POST /api/extract-text

- multipart file input
- supports pdf/docx/txt extraction
- returns extracted text + metadata

## 6. Edge Functions Documentation

Located under supabase/functions.

### match-documents

- Purpose: generic similarity retrieval wrapper over RPC match_documents
- Inputs: table, filter, match_count, query_embedding
- Outputs: matched rows with similarity

### generate-project-embedding

- Purpose: generate and upsert project metadata/document embeddings
- Inputs: type(metadata|document), project_id, company_id, optional document_id

### regenerate-embeddings

- Purpose: full company brain embedding rebuild
- Reindexes company info, additional context chunks, and documents

### regenerate-project-embeddings

- Purpose: full project embeddings rebuild
- Reindexes project metadata and project documents

### process-standup-insights

- Purpose: process daily standup memory_context_analysis into context memory tables
- Key behavior:
- validates insights
- classifies company/project
- inserts pending memory entries
- marks meeting processed/error state

## 7. Vector Search Functions (SQL RPC)

From migration 004:

- match_company_brain_documents(query_embedding, match_user_id, threshold, count)
- match_project_documents(p_query_embedding, p_project_id, threshold, count)
- match_company_projects(p_query_embedding, p_company_id, threshold, count)
- match_documents(p_table, p_query_embedding, p_match_count, p_filter)

All rely on cosine similarity over vector(768) embeddings.

## 8. Storage Layer

Live storage buckets identified:

- blog-images (public)
- brain-documents (public)
- project-documents (public)
- playbooks (public)
- intelligence-guides (public, pdf-limited)
- resumes (public)
- additional legacy/report-named bucket (public)

Common usage patterns:

- Upload object via client SDK
- Store storage_path + public URL in table
- Read directly through public URL in UI

## 9. RLS and Access Posture

Observations:

- Some critical tables have rls_enabled=true (admins, job_openings, job_applicants, meetings/context tables)
- Many content/brain/project tables currently show rls_enabled=false in live schema
- Server-side APIs predominantly use service-role client, which bypasses RLS

Operational interpretation:

- Access control is currently API-session-centric rather than purely DB policy-centric

## 10. Known Schema Drift Notes

- meetings_intelligence relationship currently points to daily_standup_meetings.id in live schema
- older migration text referenced meeting_id string relation and different sentiment constraints

Recommendation:

- maintain a schema snapshot or generated types from live DB for contract certainty in future changes.

## 11. Backend Reliability Notes

Existing resilience patterns:

- explicit status fields for long-running workflows
- persisted error columns (analysis_error, processing_error)
- fallback scoring in applicant analysis
- approve-before-embed memory workflow

Further hardening opportunities:

- queue-backed asynchronous orchestration for bulk analysis/scraping
- request/operation audit table for admin actions
- stronger per-route input schemas for all CRUD routes

## 12. Backend Summary

The backend is a pragmatic Supabase-first architecture with:

- strong relational modeling for operations
- expanding AI/vector capabilities for memory and search
- clear route-level orchestration for business workflows

It is production-capable for current scale and can be incrementally hardened via stricter policy posture, concurrency control, and stronger observability.