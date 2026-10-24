-- Return only verified, non-sensitive provider receipt details to users who
-- can access the linked fee. Raw payment payloads remain admin-only.
alter table public.fee_payments
  add column evidence_path text,
  add constraint fee_payments_evidence_path_check
    check (
      evidence_path is null
      or evidence_path ~ (
        '^' || school_id::text || '/fee-payments/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|png|jpg|webp)$'
      )
    );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-evidence',
  'payment-evidence',
  false,
  5242880,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
);

create policy payment_evidence_admin_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-evidence'
    and public.has_school_admin_role(public.storage_path_uuid(name, 1))
  );

create policy payment_evidence_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-evidence'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/fee-payments/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|png|jpg|webp)$'
    and public.has_school_admin_role(public.storage_path_uuid(name, 1))
  );

create policy payment_evidence_admin_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'payment-evidence'
    and public.has_school_admin_role(public.storage_path_uuid(name, 1))
  );

create function public.fee_payment_receipt_details(p_fee_payment_ids uuid[])
returns table (
  fee_payment_id uuid,
  provider text,
  provider_event_id text,
  received_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pe.fee_payment_id,
    pe.provider,
    pe.provider_event_id,
    pe.received_at
  from public.payment_events pe
  join public.fee_records fr
    on fr.school_id = pe.school_id
   and fr.id = pe.fee_record_id
  where pe.fee_payment_id = any(coalesce(p_fee_payment_ids, array[]::uuid[]))
    and pe.event_type = 'approved'
    and pe.processing_status = 'applied'
    and (
      public.has_school_admin_role(pe.school_id)
      or public.is_guardian_of_student(pe.school_id, fr.student_id)
    );
$$;

revoke all on function public.fee_payment_receipt_details(uuid[]) from public, anon;
grant execute on function public.fee_payment_receipt_details(uuid[]) to authenticated;

-- Keep an unverified gateway reference from being entered through the staff
-- manual-payment form. Verified provider payments are inserted atomically by
-- apply_payment_event with external_ref set to the event id.
create function public.guard_fee_payment_provider_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_matches_verified_event boolean;
begin
  if new.external_ref is null then
    if exists (
      select 1
      from public.payment_events pe
      where pe.school_id = new.school_id
        and (
          pe.provider_event_id = new.reference
          or pe.provider || '-' || pe.provider_event_id = new.reference
        )
    ) then
      raise exception 'This reference belongs to an online payment attempt. Wait for provider verification.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  select exists (
    select 1
    from public.payment_events pe
    where pe.school_id = new.school_id
      and pe.provider_event_id = new.external_ref
      and pe.fee_record_id = new.fee_record_id
      and pe.event_type = 'approved'
      and pe.processing_status = 'received'
      and pe.amount = new.amount
      and pe.currency = new.currency
      and new.reference = pe.provider || '-' || pe.provider_event_id
      and new.method = case pe.payment_method
        when 'card' then 'card'
        when 'bank_agent' then 'bank_transfer'
        else 'mobile_money'
      end
  )
  into v_matches_verified_event;

  if not v_matches_verified_event then
    raise exception 'External payment references are accepted only from a verified provider event.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger fee_payments_guard_provider_reference
  before insert on public.fee_payments
  for each row execute function public.guard_fee_payment_provider_reference();

revoke all on function public.guard_fee_payment_provider_reference() from public, anon, authenticated;
