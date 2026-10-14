-- Allow the established approval transaction to approve a pending application
-- or one whose requested information has been received. No school or account
-- creation behavior is otherwise changed.

create or replace function public.approve_school_application(p_application_id uuid, p_auth_user_id uuid, p_shortcode text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application public.school_applications%rowtype;
  v_school_id uuid;
  v_auth_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
      and revoked_at is null
  ) then
    raise exception 'Platform-admin authority is required' using errcode = '42501';
  end if;

  if p_application_id is null then
    raise exception 'Application id is required' using errcode = '22023';
  end if;

  if p_auth_user_id is null then
    raise exception 'Auth user id is required' using errcode = '22023';
  end if;

  if p_shortcode is null
     or p_shortcode !~ '^[a-z0-9]([a-z0-9-]{1,61})[a-z0-9]$' then
    raise exception 'Shortcode must be DNS-safe, lowercase, and 3-63 characters' using errcode = '22023';
  end if;

  select *
  into v_application
  from public.school_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;

  if v_application.status not in ('pending', 'awaiting_information') then
    raise exception 'Application is no longer awaiting review' using errcode = '55000';
  end if;

  select email::text
  into v_auth_email
  from auth.users
  where id = p_auth_user_id;

  if not found then
    raise exception 'Auth user was not created' using errcode = 'P0002';
  end if;

  if lower(v_auth_email) <> lower(v_application.email::text) then
    raise exception 'Auth user email does not match the application email' using errcode = '22023';
  end if;

  v_school_id := gen_random_uuid();

  insert into public.schools (
    id, shortcode, name, address, phone, email, country
  )
  values (
    v_school_id,
    p_shortcode,
    v_application.school_name,
    v_application.school_address,
    v_application.phone,
    v_application.email,
    coalesce(v_application.country, 'SO')
  );

  insert into public.profiles (
    id, school_id, full_name, email, phone
  )
  values (
    p_auth_user_id,
    v_school_id,
    v_application.administrator_name,
    v_application.email,
    v_application.phone
  );

  insert into public.memberships (
    user_id, school_id, role, status, invited_by
  )
  values
    (p_auth_user_id, v_school_id, 'administrator', 'active', auth.uid()),
    (p_auth_user_id, v_school_id, 'owner', 'active', auth.uid());

  update public.school_applications
  set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = pg_catalog.now(),
    approved_school_id = v_school_id
  where id = v_application.id;

  return pg_catalog.jsonb_build_object(
    'application_id', v_application.id,
    'school_id', v_school_id,
    'user_id', p_auth_user_id
  );
end;
$$;

comment on function public.approve_school_application(uuid, uuid, text) is
  'Creates the school-side records for an Auth user created by the approve-school-application Edge Function. The caller must be an unrevoked platform admin. Accepts pending and awaiting_information applications.';

revoke all on function public.approve_school_application(uuid, uuid, text) from public, anon, service_role;
grant execute on function public.approve_school_application(uuid, uuid, text) to authenticated;
