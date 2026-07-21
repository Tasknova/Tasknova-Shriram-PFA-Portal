-- Add durable AI analysis caching fields for voice conversations
alter table public.voice_conversations
  add column if not exists analysis_status text not null default 'not_started',
  add column if not exists analysis_generated_at timestamptz,
  add column if not exists analysis_error text;

-- Guardrail for accepted analysis states
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_conversations_analysis_status_check'
  ) then
    alter table public.voice_conversations
      add constraint voice_conversations_analysis_status_check
      check (analysis_status in ('not_started', 'processing', 'completed', 'failed'));
  end if;
end
$$;

create index if not exists idx_voice_conversations_analysis_status
  on public.voice_conversations (analysis_status);

create index if not exists idx_voice_conversations_analysis_generated_at
  on public.voice_conversations (analysis_generated_at desc);

-- Backfill status for rows that already have saved analysis
update public.voice_conversations
set
  analysis_status = 'completed',
  analysis_generated_at = coalesce(analysis_generated_at, now()),
  analysis_error = null
where analysis is not null
  and btrim(analysis::text) not in ('', 'null', '{}', '[]', '""');
