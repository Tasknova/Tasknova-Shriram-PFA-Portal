-- Performance indexes for high-traffic admin pages

-- Sorting / listing indexes
create index if not exists idx_demo_requests_created_at
  on public.demo_requests (created_at desc);

create index if not exists idx_job_applicants_created_at
  on public.job_applicants (created_at desc);

create index if not exists idx_job_openings_created_at
  on public.job_openings (created_at desc);

create index if not exists idx_job_openings_is_active
  on public.job_openings (is_active);

create index if not exists idx_blogs_created_at
  on public.blogs (created_at desc);

create index if not exists idx_blogs_is_published
  on public.blogs (is_published);

create index if not exists idx_playbooks_created_at
  on public.playbooks (created_at desc);

create index if not exists idx_industry_reports_created_at
  on public.industry_reports (created_at desc);

create index if not exists idx_industry_reports_is_published
  on public.industry_reports (is_published);

create index if not exists idx_voice_conversations_created_at
  on public.voice_conversations (created_at desc);

create index if not exists idx_chat_conversations_created_at
  on public.chat_conversations (created_at desc);

create index if not exists idx_daily_standup_meetings_created_at
  on public.daily_standup_meetings (created_at desc);

create index if not exists idx_meetings_intelligence_created_at
  on public.meetings_intelligence (created_at desc);

create index if not exists idx_meetings_intelligence_meeting_id
  on public.meetings_intelligence (meeting_id);

-- Foreign key coverage from advisor warnings
create index if not exists idx_brain_documents_company_brain_id
  on public.brain_documents (company_brain_id);

create index if not exists idx_job_applicants_job_id
  on public.job_applicants (job_id);

create index if not exists idx_company_context_memory_approved_by
  on public.company_context_memory (approved_by);

create index if not exists idx_company_context_memory_approved_disapproved_by
  on public.company_context_memory (approved_disapproved_by);

create index if not exists idx_project_context_memory_approved_by
  on public.project_context_memory (approved_by);

create index if not exists idx_project_context_memory_approved_disapproved_by
  on public.project_context_memory (approved_disapproved_by);

-- Composite indexes for common context-memory filters
create index if not exists idx_company_context_memory_user_approval_created
  on public.company_context_memory (user_id, approval_status, created_at desc);

create index if not exists idx_project_context_memory_project_user_approval_created
  on public.project_context_memory (project_id, user_id, approval_status, created_at desc);
