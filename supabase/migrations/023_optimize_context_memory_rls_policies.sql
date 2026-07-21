-- Optimize RLS performance by avoiding per-row auth.uid() re-evaluation
-- Pattern recommended by Supabase: use (select auth.uid()) in policies.

-- company_context_memory

drop policy if exists "Users can view their own company context memory" on public.company_context_memory;
create policy "Users can view their own company context memory"
on public.company_context_memory
for select
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert company context memory" on public.company_context_memory;
create policy "Users can insert company context memory"
on public.company_context_memory
for insert
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update company context memory" on public.company_context_memory;
create policy "Users can update company context memory"
on public.company_context_memory
for update
using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete company context memory" on public.company_context_memory;
create policy "Users can delete company context memory"
on public.company_context_memory
for delete
using ((select auth.uid()) = user_id);

-- project_context_memory

drop policy if exists "Users can view their own project context memory" on public.project_context_memory;
create policy "Users can view their own project context memory"
on public.project_context_memory
for select
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert project context memory" on public.project_context_memory;
create policy "Users can insert project context memory"
on public.project_context_memory
for insert
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update project context memory" on public.project_context_memory;
create policy "Users can update project context memory"
on public.project_context_memory
for update
using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete project context memory" on public.project_context_memory;
create policy "Users can delete project context memory"
on public.project_context_memory
for delete
using ((select auth.uid()) = user_id);

-- company_context_embeddings

drop policy if exists "Users can view their own company context embeddings" on public.company_context_embeddings;
create policy "Users can view their own company context embeddings"
on public.company_context_embeddings
for select
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert company context embeddings" on public.company_context_embeddings;
create policy "Users can insert company context embeddings"
on public.company_context_embeddings
for insert
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete company context embeddings" on public.company_context_embeddings;
create policy "Users can delete company context embeddings"
on public.company_context_embeddings
for delete
using ((select auth.uid()) = user_id);

-- project_context_embeddings

drop policy if exists "Users can view their own project context embeddings" on public.project_context_embeddings;
create policy "Users can view their own project context embeddings"
on public.project_context_embeddings
for select
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert project context embeddings" on public.project_context_embeddings;
create policy "Users can insert project context embeddings"
on public.project_context_embeddings
for insert
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete project context embeddings" on public.project_context_embeddings;
create policy "Users can delete project context embeddings"
on public.project_context_embeddings
for delete
using ((select auth.uid()) = user_id);
