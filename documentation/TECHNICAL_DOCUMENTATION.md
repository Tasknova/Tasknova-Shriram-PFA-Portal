# Tasknova Admin Panel - Theoretical Technical Documentation

## 1. System Overview

Tasknova Admin Panel is a Next.js 14 App Router application that centralizes operations across:

- Core admin management (admins, dashboard, CRUD modules)
- Content and demand operations (blogs, playbooks, reports, demo requests)
- Hiring operations (job openings, applicants, AI-assisted analysis)
- Conversational telemetry (voice and chat conversations)
- Knowledge systems:
- Company Brain (organization-level memory + semantic retrieval)
- Project Brain (project-level memory + semantic retrieval)
- Meeting intelligence pipeline (standup ingestion -> insight extraction -> memory approval workflow)

At a high level, this is an operational control plane where the admin UI, backend API routes, PostgreSQL storage, vector search, and AI model integrations are tightly coupled.

## 2. Architectural Style

The project follows a vertical feature architecture over a monolithic Next.js app:

- Frontend pages under src/app/admin/(dashboard)/*
- Backend APIs under src/app/api/* (server routes)
- Domain utilities under src/lib/*
- Persistence in Supabase PostgreSQL + Supabase Storage
- AI orchestration in Node routes and Supabase Edge Functions

This yields low network complexity while preserving clear boundaries between:

- Request handling
- Business logic
- Data access
- AI and embedding workflows

## 3. Runtime Model and Execution Context

### 3.1 Application Runtime

- Next.js server routes execute in Node.js runtime (explicit in certain routes, e.g. extract-text and applicant analysis)
- Client components use the browser-side Supabase client for selected direct operations (document uploads and some table writes)
- Service-role server client is used in API routes for privileged operations

### 3.2 Authentication Runtime

- JWT session token (admin_session) is issued after credential validation
- Token is stored in HttpOnly cookie, 7-day expiry
- Middleware enforces /admin route protection
- API route auth guard uses getSession() and role checks where needed

## 4. Security and Trust Boundaries

### 4.1 Admin Authentication and Authorization

- Credentials are stored in public.admins (bcrypt hashed passwords)
- Login validates email + active flag + bcrypt hash
- Super-admin-only actions are enforced at API level (admin creation/deletion/deactivation)

### 4.2 Database Access Patterns

Two distinct access models coexist:

- Service-role access in server routes bypasses RLS intentionally for admin console operations
- RLS-enabled schemas/tables still exist and are relevant for direct authenticated-user patterns and edge function contexts

Important implication:

- Security is primarily route-guard and server-client-key based for admin dashboard operations
- RLS is still useful but not the only enforcement layer

### 4.3 Storage Security Model

Current buckets are public in live environment. This simplifies retrieval and linking but increases exposure if object paths leak.

## 5. AI and Retrieval-Augmented Patterns

## 5.1 Embedding Strategy

- Embeddings are generated with Gemini embedding model (768 dimensions)
- Stored in pgvector columns
- Indexed with IVFFlat cosine ops
- Queried via SQL RPC similarity functions

Embedding domains:

- company_brain_embeddings for company-wide context
- project_embeddings for project-level context
- company_context_embeddings/project_context_embeddings for approved meeting-derived memory

## 5.2 Retrieval Design

The retrieval pattern is hybrid:

- Domain-scoped similarity RPC for direct retrieval
- Generic match_documents RPC for dynamic table/filter cases
- Metadata attached to embeddings to preserve source interpretability

This supports selective RAG by scope:

- Company-only retrieval
- Single-project retrieval
- Cross-project retrieval within company

## 5.3 Applicant Analysis Pipeline

Applicant analysis is evidence-based and multi-source:

Input sources:

- Resume text (parsed from URL/file format)
- LinkedIn data (Apify actor + fallbacks)
- Portfolio data (web scrape normalization)
- Cover letter
- Job description

Output includes:

- Numerical score out of 10
- Structured strengths/concerns with source evidence
- Recommendation class (strong_yes/yes/maybe/no)
- Scoring breakdown and interview question bank

Fallback behavior:

- If Gemini analysis fails, deterministic heuristic scoring still returns usable output

This ensures graceful degradation while preserving decision-support continuity.

## 6. Meeting Intelligence and Context Memory Architecture

### 6.1 Standup and Intelligence Ingestion

- Daily standup records are stored with transcript/summary payloads
- Separate intelligence records store task, blocker, pipeline, sentiment, and efficiency signals

### 6.2 Memory Context Extraction

Pipeline intent:

- Parse standup meeting insights
- Classify into company-level or project-level memory
- Store as pending memory items
- Approve/disapprove in admin workflow
- Generate embeddings only when approved

This approval-first pattern is critical: unverified AI-derived context does not immediately pollute retrieval vector space.

### 6.3 Lifecycle and Retention

Memory records track:

- approval_status
- pinning
- access count and last accessed time
- source linkage to meeting and insight IDs

LRU cleanup helpers are present to maintain bounded memory growth, preferring retention of pinned and frequently accessed items.

## 7. Document and Knowledge Model

### 7.1 Company Brain

Represents durable organization knowledge:

- company profile and strategic metadata
- grouped document ingestion
- vectorized retrieval content

### 7.2 Project Brain

Represents bounded project knowledge:

- project profile + metadata + goals
- project-scoped documents and extracted text
- project-scoped vector embeddings

### 7.3 Content Text Normalization

Both brain_documents and project_documents support content_text for AI retrieval readiness.

This normalizes ingestion by decoupling:

- raw file storage
- extracted plain text
- embedding content payload

## 8. Data Flow Narratives

### 8.1 Admin Login Flow

1. Credentials posted to /api/auth/login
2. Admin row validated and password checked
3. JWT issued and stored in admin_session cookie
4. Middleware admits /admin routes

### 8.2 Project Document AI-Readiness Flow

1. User uploads file to Supabase Storage (project-documents bucket)
2. project_documents row inserted with metadata and content_text
3. Embedding generation called (client utility or edge function)
4. project_embeddings updated for semantic search

### 8.3 Context Memory Approval Flow

1. Pending context entries are fetched from context memory APIs
2. Approve action generates embedding and writes to context embedding table
3. Disapprove action removes embedding and marks status disapproved
4. Retrieval APIs only include approved context unless explicitly overridden

### 8.4 Bulk Applicant Processing Flow

1. Bulk LinkedIn scrape route scans applicants with LinkedIn URLs
2. Already successful scrapes are skipped unless forceRescrape is true
3. Bulk analysis route processes applicants in not_started/failed/null-score states
4. analysis_data and status are persisted per applicant

## 9. Scalability and Performance Considerations

Current architecture is fit for moderate operational scale, with key strengths:

- Vector indexes for semantic retrieval
- Chunking and truncation safeguards for model prompts
- Cached reuse of previously successful scrape/extraction artifacts

Key bottlenecks to monitor:

- Sequential bulk analysis loops (latency compounds with candidate count)
- Public storage bucket exposure and object lifecycle growth
- Large JSON payloads in transcript and intelligence records

## 10. Reliability and Resilience Patterns

- Defensive parsing for AI model outputs (JSON extraction and schema validation)
- Heuristic analysis fallback when model calls fail
- Explicit processing status fields and error columns for observability
- Non-fatal handling of partial source availability (resume/linkedin/portfolio may be missing)

## 11. Technical Risks and Recommendations

### Current Risks

- Mixed trust model between service-role access and RLS assumptions can confuse future developers
- Public storage buckets may leak sensitive uploaded documents if URLs are shared
- Some migration constraints diverge from current runtime assumptions (meeting id reference shape changed over time)

### Recommended Improvements

- Standardize server-only writes for sensitive datasets
- Add request-level audit logging for admin actions (who changed what)
- Consider private buckets with signed URLs for resumes and internal docs
- Parallelize bulk analysis with bounded concurrency and queue semantics
- Introduce typed response contracts for all admin API routes

## 12. Summary

Tasknova Admin Panel is an operations-centric, AI-augmented admin platform. Its technical architecture combines:

- Next.js App Router admin UX
- Supabase relational + storage backbone
- pgvector-based semantic retrieval
- Controlled memory approval workflows
- AI-assisted applicant and meeting intelligence

Its strongest characteristic is pragmatic orchestration: it favors resilient workflows and fast operational utility over heavy service decomposition, while still providing clear extension points for future hardening and scale.