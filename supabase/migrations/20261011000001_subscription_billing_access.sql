-- School billing access: allow the agreed school roles to read their own
-- subscription, and expose only public plan catalogue rows for display.

create or replace function public.has_school_billing_role(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.memberships m
     where m.user_id = auth.uid()
       and m.school_id = p_school_id
       and m.status = 'active'
       and m.role in ('owner', 'director', 'administrator')
  );
$$;

comment on function public.has_school_billing_role(uuid) is
  'True when the caller holds an active owner, director or administrator membership in the given school. Used only to authorize school-scoped subscription reads.';

create policy subscription_plans_public_select on public.subscription_plans
  for select to anon, authenticated
  using (is_public = true);
