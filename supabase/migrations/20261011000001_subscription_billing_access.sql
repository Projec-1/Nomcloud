-- Preserve the existing owner/director subscription boundary and keep the
-- subscription-plan catalogue private to platform administrators.

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
       and m.role in ('owner', 'director')
  );
$$;

comment on function public.has_school_billing_role(uuid) is
  'True when the caller holds an active owner or director membership in the given school. Used only to authorize school-scoped subscription reads.';

revoke all on function public.has_school_billing_role(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.has_school_billing_role(uuid)
  to authenticated, service_role;

alter table public.subscription_plans enable row level security;
drop policy if exists subscription_plans_public_select
  on public.subscription_plans;

revoke all on public.subscription_plans from anon;
grant select on public.subscription_plans to authenticated;
