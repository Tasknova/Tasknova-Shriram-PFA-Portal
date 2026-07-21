-- Add structured AI analysis support for job applicants
alter table public.job_applicants
  add column if not exists analysis_status text not null default 'not_started',
  add column if not exists analysis_data jsonb,
  add column if not exists analyzed_at timestamptz,
  add column if not exists analysis_error text,
  add column if not exists resume_extracted_text text;

-- Guardrail for accepted analysis states
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'job_applicants_analysis_status_check'
  ) then
    alter table public.job_applicants
      add constraint job_applicants_analysis_status_check
      check (analysis_status in ('not_started', 'processing', 'completed', 'failed'));
  end if;
end
$$;

create index if not exists idx_job_applicants_analysis_status
  on public.job_applicants (analysis_status);

create index if not exists idx_job_applicants_analyzed_at
  on public.job_applicants (analyzed_at desc);

-- Normalize older scores that were stored on a 100-point scale
update public.job_applicants
set ai_score = round((ai_score / 10.0)::numeric, 1)
where ai_score is not null
  and ai_score > 10
  and ai_score <= 100;
