-- Keep authorization predicates available to signed-in users and trusted
-- backend services, but not anonymous API callers. Public login branding is
-- intentionally excluded. Trigger functions are invoked by their triggers,
-- not directly through the API.
do $$
declare
  function_record record;
begin
  for function_record in
    select format(
      '%I.%I(%s)',
      namespace.nspname,
      procedure.proname,
      pg_get_function_identity_arguments(procedure.oid)
    ) as signature
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = any (array[
        'can_manage_class',
        'can_manage_homework',
        'current_guardian_id',
        'current_school_id',
        'current_teacher_id',
        'guardian_has_student_in_class',
        'has_campus_scoped_management',
        'has_school_admin_role',
        'has_school_billing_role',
        'has_school_management_role',
        'has_school_staff_role',
        'is_guardian_of_fee_record',
        'is_guardian_of_student',
        'is_platform_admin',
        'is_school_member',
        'is_thread_participant',
        'teaches_class',
        'teaches_class_subject',
        'teaches_homework',
        'teaches_homework_class'
      ])
  loop
    execute format('revoke all on function %s from public, anon', function_record.signature);
    execute format('grant execute on function %s to authenticated, service_role', function_record.signature);
  end loop;

  for function_record in
    select format(
      '%I.%I(%s)',
      namespace.nspname,
      procedure.proname,
      pg_get_function_identity_arguments(procedure.oid)
    ) as signature
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prorettype = 'trigger'::regtype
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      function_record.signature
    );
  end loop;
end;
$$;
