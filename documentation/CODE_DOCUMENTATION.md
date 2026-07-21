# Tasknova Admin Panel - Code Structure Documentation

## 1. Repository Layout

Top-level structure:

- src/: application source
- supabase/: SQL migrations and edge functions
- public/: static assets
- scripts/: utility scripts
- documentation/: project documentation bundle

Core runtime lives in src/ and is split into app, components, lib, and types.

## 2. src/ Directory Map

## 2.1 src/app/

### Root app files

- src/app/layout.tsx: root layout shell
- src/app/page.tsx: entry page
- src/app/globals.css: global styles

### Admin app routes

- src/app/admin/login/page.tsx: admin login UI
- src/app/admin/(dashboard)/layout.tsx: authenticated admin shell and navigation
- src/app/admin/(dashboard)/dashboard/page.tsx: top-level metrics dashboard

Feature pages under src/app/admin/(dashboard)/:

- admins/
- blogs/
- chat-conversations/
- company-brain/
- daily-standup-meetings/
- demo-requests/
- industry-reports/
- job-applicants/
- job-openings/
- meetings-intelligence/
- playbooks/
- project-brain/
- voice-conversations/

Nested details:

- job-applicants/[id]/analysis/page.tsx: detailed analysis view
- daily-standup-meetings/[id]/page.tsx: standup detail view
- meetings-intelligence/[id]/page.tsx: intelligence detail view

### API routes (server)

Auth:

- src/app/api/auth/login/route.ts
- src/app/api/auth/logout/route.ts
- src/app/api/auth/session/route.ts

Admin APIs:

- src/app/api/admin/dashboard/route.ts
- src/app/api/admin/admins/route.ts
- src/app/api/admin/blogs/route.ts
- src/app/api/admin/playbooks/route.ts
- src/app/api/admin/industry-reports/route.ts
- src/app/api/admin/demo-requests/route.ts
- src/app/api/admin/voice-conversations/route.ts
- src/app/api/admin/chat-conversations/route.ts
- src/app/api/admin/job-openings/route.ts
- src/app/api/admin/job-applicants/route.ts
- src/app/api/admin/job-applicants/analyze/route.ts
- src/app/api/admin/job-applicants/scrape-linkedin/route.ts
- src/app/api/admin/daily-standup-meetings/route.ts
- src/app/api/admin/meetings-intelligence/route.ts
- src/app/api/admin/company-context-memory/route.ts
- src/app/api/admin/project-context-memory/route.ts

Utility API:

- src/app/api/extract-text/route.ts

## 2.2 src/components/

Key reusable components:

- BrainPage.tsx: company brain management + chat + document pipeline
- ProjectBrainPage.tsx: project brain management + docs + semantic workflows
- DataTable.tsx: tabular listing with view/search actions
- Modal.tsx: generic modal shell
- DeleteConfirm.tsx: destructive action guard
- FileUpload.tsx: generic file upload widget
- ImageUpload.tsx: image upload widget

## 2.3 src/lib/

Core domain and infra utilities:

- auth.ts: password hashing, session creation/verification, login helper
- supabase.ts: client and service-role server client builders
- utils.ts: formatting and utility helpers
- textExtraction.ts: file-content extraction logic support
- embeddings.ts: company embedding generation and storage helpers
- projectEmbeddings.ts: project embedding generation and retrieval helpers
- contextMemory.ts: insight classification, validation, storage, approval-aware memory lifecycle
- jobApplicantAnalysis.ts: scraping, extraction, prompt orchestration, fallback scoring

## 2.4 src/types/

- src/types/index.ts: shared DTO and model interfaces for pages and APIs

## 3. Feature Modules and Responsibilities

## 3.1 Authentication and Session

Primary files:

- src/lib/auth.ts
- src/middleware.ts
- src/app/api/auth/*

Responsibilities:

- Verify credentials against admins table
- Issue JWT with role payload
- Maintain cookie-based session
- Enforce route-level admin guard

## 3.2 Admin CRUD Modules

Each module follows a similar pattern:

- Dashboard page + data table
- API route with GET and write operations (POST/PATCH/DELETE as needed)
- Supabase table mapping

Covered modules:

- admins
- blogs
- playbooks
- industry reports
- demo requests
- voice conversations
- chat conversations
- job openings
- job applicants

## 3.3 Job Applicants AI Module

Primary files:

- src/lib/jobApplicantAnalysis.ts
- src/app/api/admin/job-applicants/analyze/route.ts
- src/app/api/admin/job-applicants/scrape-linkedin/route.ts
- src/app/admin/(dashboard)/job-applicants/[id]/analysis/page.tsx

Responsibilities:

- Multi-source candidate evidence retrieval
- LinkedIn scraping via Apify and fallback providers
- Resume extraction from file URLs
- Structured Gemini analysis generation
- Heuristic fallback when LLM fails
- Bulk analysis and bulk LinkedIn scrape operations

## 3.4 Company Brain Module

Primary files:

- src/components/BrainPage.tsx
- src/lib/embeddings.ts

Responsibilities:

- Manage company profile and metadata
- Upload and index company documents
- Generate embeddings and support semantic retrieval/chat

## 3.5 Project Brain Module

Primary files:

- src/components/ProjectBrainPage.tsx
- src/lib/projectEmbeddings.ts
- src/app/admin/(dashboard)/project-brain/page.tsx

Responsibilities:

- Project lifecycle management (create/edit/archive semantics)
- Project metadata and documents
- Project-specific semantic search and chat context generation

## 3.6 Meetings and Context Memory Module

Primary files:

- src/app/api/admin/daily-standup-meetings/route.ts
- src/app/api/admin/meetings-intelligence/route.ts
- src/app/api/admin/company-context-memory/route.ts
- src/app/api/admin/project-context-memory/route.ts
- src/lib/contextMemory.ts

Responsibilities:

- Display standup records and intelligence outcomes
- Manage context memory approval lifecycle
- Materialize embeddings only after approval
- Track usage and pinning for memory relevance

## 4. API Design Pattern

Most admin API routes share a consistent pattern:

1. Validate session via getSession()
2. Initialize service-role Supabase client via createServerClient()
3. Parse params/body
4. Execute Supabase read/write
5. Return JSON and normalized error responses

Notable differences:

- applicant analyze/scrape routes implement workflow orchestration loops
- context-memory PATCH routes support action-based updates (approve/disapprove/pin)

## 5. State and UI Pattern

UI pages generally follow:

- useState for local data/filters/modals
- useEffect for initial fetch
- toast notifications for operation feedback
- DataTable for list pages
- detail pages for complex records

This yields predictable UX and low cognitive overhead for new contributors.

## 6. Integration Points

External integrations used directly in code:

- Supabase JS client (DB, storage, edge functions)
- Google Gemini API (analysis + embeddings)
- Apify actor API (LinkedIn profile enrichment)
- Jina fallback for public web text extraction
- pdf-parse and mammoth for resume/document parsing

## 7. Cross-Cutting Conventions

- TypeScript strict-ish typing with shared types file
- Zod validation for complex request payloads
- JSON-first API responses with clear success/error status
- Timestamp management usually done in route logic on writes
- Soft-delete behavior used for projects and project documents

## 8. Suggested Onboarding Path for New Developers

1. Start with src/lib/auth.ts and src/middleware.ts to understand security boundaries.
2. Review one full CRUD flow (e.g. blogs page + API route + table fields).
3. Study src/lib/jobApplicantAnalysis.ts for complex orchestration style.
4. Study BrainPage.tsx and ProjectBrainPage.tsx for storage + embeddings integration.
5. Review context memory APIs for approval and embedding lifecycle patterns.
6. Inspect matching SQL migrations in supabase/migrations for authoritative schema details.

## 9. Testing and Quality Notes

Current codebase is optimized for delivery speed with runtime validations and operational checks, but has limited formal test scaffolding in repository.

Recommended near-term improvements:

- Add route-level integration tests for critical APIs
- Add schema-contract tests for analysis_data payload shape
- Add mock-based unit tests for jobApplicantAnalysis parsing/fallback logic

## 10. Summary

The code structure is intentionally practical and feature-centric. Complex logic is concentrated in lib modules and orchestrator routes, while pages/components remain mostly view and interaction layers. This separation is workable for rapid admin product evolution, provided schema and API contracts remain documented and disciplined.