-- Database-backed school subscription checkout. Student fees remain in the
-- fee_payments/payment_events ledger and are not written by these functions.

alter table public.platform_invoices
  add column subscription_plan_id uuid references public.subscription_plans(id) on delete restrict,
  add column billing_interval text check (billing_interval in ('monthly', 'annual'));

alter table public.platform_payments
  add column idempotency_key uuid;

create unique index platform_payments_idempotency_key_unique_idx
  on public.platform_payments (idempotency_key)
  where idempotency_key is not null;

insert into public.subscription_plans (
  code, name, description, price_monthly, price_annual, currency,
  features, is_public, sort_order
)
values
  ('starter', 'Starter', 'School subscription billed monthly or annually.', 60, 600, 'USD', '[]'::jsonb, true, 10),
  ('growth', 'Growth', 'School subscription billed monthly or annually.', 100, 1000, 'USD', '[]'::jsonb, true, 20),
  ('enterprise', 'Enterprise', 'Custom quote; not available through fixed-price checkout.', 0, null, 'USD', '[]'::jsonb, true, 30)
on conflict (code) do nothing;

create function public.create_subscription_checkout(
  p_school_id uuid,
  p_plan_code text,
  p_billing_interval text,
  p_idempotency_key uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_invoice public.platform_invoices%rowtype;
  v_payment public.platform_payments%rowtype;
  v_existing_school_id uuid;
  v_has_active_attempt boolean;
  v_price numeric(12, 2);
  v_amount_minor bigint;
  v_invoice_number text;
begin
  if p_school_id is null
     or p_actor_id is null
     or p_idempotency_key is null
     or p_plan_code is null
     or p_plan_code not in ('starter', 'growth')
     or p_billing_interval is null
     or p_billing_interval not in ('monthly', 'annual') then
    raise exception 'Invalid subscription checkout request' using errcode = '22023';
  end if;

  perform 1
    from public.schools s
   where s.id = p_school_id
   for update;
  if not found then
    raise exception 'School not found' using errcode = '23503';
  end if;

  select i.school_id, p.id, p.invoice_id, p.amount_minor, p.currency, p.status,
         i.invoice_number, i.subscription_plan_id, i.billing_interval
    into v_existing_school_id, v_payment.id, v_payment.invoice_id, v_payment.amount_minor,
         v_payment.currency, v_payment.status, v_invoice.invoice_number,
         v_invoice.subscription_plan_id, v_invoice.billing_interval
    from public.platform_payments p
    join public.platform_invoices i on i.id = p.invoice_id
   where p.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_school_id <> p_school_id
       or v_invoice.subscription_plan_id is distinct from (
         select sp.id from public.subscription_plans sp where sp.code = p_plan_code
       )
       or v_invoice.billing_interval is distinct from p_billing_interval then
      raise exception 'Checkout idempotency key was already used for a different order'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'invoice_id', v_payment.invoice_id,
      'invoice_number', v_invoice.invoice_number,
      'payment_id', v_payment.id,
      'amount_minor', v_payment.amount_minor,
      'currency', v_payment.currency,
      'status', v_payment.status,
      'replayed', true,
      'should_process', false
    );
  end if;

  if exists (
    select 1
      from public.school_subscriptions s
     where s.school_id = p_school_id
       and s.cancelled_at is null
       and s.status in ('trialing', 'active', 'past_due')
       and (s.current_period_end is null or s.current_period_end > now())
  ) then
    raise exception 'An active or trial subscription already exists for this school'
      using errcode = '55000';
  end if;

  select exists (
    select 1
      from public.platform_payments p
      join public.platform_invoices i on i.id = p.invoice_id
     where i.school_id = p_school_id
       and p.status in ('pending', 'unknown')
  ) into v_has_active_attempt;
  if v_has_active_attempt then
    raise exception 'A subscription payment is pending or requires verification for this school'
      using errcode = '55000';
  end if;

  select *
    into v_plan
    from public.subscription_plans p
   where p.code = p_plan_code
     and p.is_public;
  if not found then
    raise exception 'The selected subscription plan is unavailable' using errcode = 'P0002';
  end if;

  v_price := case
    when p_billing_interval = 'monthly' then v_plan.price_monthly
    else v_plan.price_annual
  end;
  if v_price is null or v_price <= 0 or v_price * 100 <> trunc(v_price * 100) then
    raise exception 'The selected subscription plan has no valid price for this billing interval'
      using errcode = '22023';
  end if;
  v_amount_minor := round(v_price * 100)::bigint;

  select *
    into v_invoice
    from public.platform_invoices i
   where i.school_id = p_school_id
     and i.subscription_plan_id = v_plan.id
     and i.billing_interval = p_billing_interval
     and i.status = 'open'
     and (i.due_at is null or i.due_at > now())
   order by i.created_at desc
   limit 1
   for update;

  if found then
    if v_invoice.amount_minor <> v_amount_minor
       or upper(v_invoice.currency) <> upper(v_plan.currency) then
      update public.platform_invoices
         set status = 'void'
       where id = v_invoice.id;
      v_invoice.id := null;
    end if;
  end if;

  if v_invoice.id is null then
    v_invoice_number := 'SUB-' || upper(replace(gen_random_uuid()::text, '-', ''));
    insert into public.platform_invoices (
      invoice_number, school_id, amount_minor, currency, status, issued_at, due_at,
      created_by, subscription_plan_id, billing_interval
    )
    values (
      v_invoice_number, p_school_id, v_amount_minor, v_plan.currency, 'open',
      now(), now() + interval '7 days', p_actor_id, v_plan.id, p_billing_interval
    )
    returning * into v_invoice;
  end if;

  insert into public.platform_payments (
    invoice_id, provider, amount_minor, currency, status, idempotency_key
  )
  values (
    v_invoice.id, 'waafipay', v_invoice.amount_minor, v_invoice.currency,
    'pending', p_idempotency_key
  )
  returning * into v_payment;

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'payment_id', v_payment.id,
    'amount_minor', v_payment.amount_minor,
    'currency', v_payment.currency,
    'status', v_payment.status,
    'replayed', false,
    'should_process', true
  );
end;
$$;

create function public.finalize_subscription_payment(
  p_payment_id uuid,
  p_status text,
  p_provider_payment_id text,
  p_provider_event_id text,
  p_amount_minor bigint,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.platform_payments%rowtype;
  v_invoice public.platform_invoices%rowtype;
  v_subscription public.school_subscriptions%rowtype;
  v_school_id uuid;
  v_start date;
  v_end date;
begin
  if p_payment_id is null
     or p_status is null
     or p_status not in ('pending', 'succeeded', 'failed', 'unknown') then
    raise exception 'Invalid subscription payment result' using errcode = '22023';
  end if;

  select i.school_id
    into v_school_id
    from public.platform_payments p
    join public.platform_invoices i on i.id = p.invoice_id
   where p.id = p_payment_id;
  if not found then
    raise exception 'Subscription payment not found' using errcode = 'P0002';
  end if;

  perform 1
    from public.schools s
   where s.id = v_school_id
   for update;
  if not found then
    raise exception 'School not found' using errcode = '23503';
  end if;

  select *
    into v_payment
    from public.platform_payments p
   where p.id = p_payment_id
   for update;
  if not found then
    raise exception 'Subscription payment not found' using errcode = 'P0002';
  end if;

  select *
    into v_invoice
    from public.platform_invoices i
   where i.id = v_payment.invoice_id
   for update;

  if v_payment.status <> 'pending' then
    return jsonb_build_object(
      'status', v_payment.status,
      'invoice_id', v_invoice.id,
      'subscription_id', v_invoice.subscription_id,
      'replayed', true
    );
  end if;

  if p_amount_minor is distinct from v_payment.amount_minor
     or upper(p_currency) is distinct from upper(v_payment.currency) then
    p_status := 'unknown';
  end if;

  if p_status = 'succeeded' then
    if nullif(btrim(p_provider_payment_id), '') is null
       or nullif(btrim(p_provider_event_id), '') is null
       or v_invoice.status not in ('open', 'overdue')
       or v_invoice.subscription_plan_id is null
       or v_invoice.billing_interval is null then
      p_status := 'unknown';
    else
      v_start := (now() at time zone 'UTC')::date;
      v_end := case
        when v_invoice.billing_interval = 'annual' then (v_start + interval '1 year')::date
        else (v_start + interval '1 month')::date
      end;

      select *
        into v_subscription
        from public.school_subscriptions s
       where s.school_id = v_invoice.school_id
         and s.cancelled_at is null
       order by s.created_at desc
       limit 1
       for update;

      if found and v_subscription.status in ('trialing', 'active', 'past_due')
         and (v_subscription.current_period_end is null or v_subscription.current_period_end > now()) then
        raise exception 'An active or trial subscription already exists for this school'
          using errcode = '55000';
      end if;

      if found then
        update public.school_subscriptions
           set plan_id = v_invoice.subscription_plan_id,
               status = 'active',
               current_period_start = v_start::timestamptz,
               current_period_end = v_end::timestamptz,
               trial_ends_at = null,
               cancelled_at = null,
               external_ref = p_provider_payment_id
         where id = v_subscription.id
        returning * into v_subscription;
      else
        insert into public.school_subscriptions (
          school_id, plan_id, status, current_period_start, current_period_end, external_ref
        )
        values (
          v_invoice.school_id, v_invoice.subscription_plan_id, 'active',
          v_start::timestamptz, v_end::timestamptz, p_provider_payment_id
        )
        returning * into v_subscription;
      end if;

      update public.platform_payments
         set status = 'succeeded',
             provider_payment_id = p_provider_payment_id,
             provider_event_id = p_provider_event_id,
             recorded_at = now()
       where id = v_payment.id;

      update public.platform_invoices
         set status = 'paid',
             subscription_id = v_subscription.id,
             billing_period_start = v_start,
             billing_period_end = v_end
       where id = v_invoice.id;

      return jsonb_build_object(
        'status', 'succeeded',
        'invoice_id', v_invoice.id,
        'subscription_id', v_subscription.id,
        'period_start', v_start,
        'period_end', v_end,
        'replayed', false
      );
    end if;
  end if;

  update public.platform_payments
     set status = p_status,
         provider_payment_id = nullif(btrim(p_provider_payment_id), ''),
         provider_event_id = nullif(btrim(p_provider_event_id), ''),
         recorded_at = now()
   where id = v_payment.id;

  return jsonb_build_object(
    'status', p_status,
    'invoice_id', v_invoice.id,
    'subscription_id', null,
    'replayed', false
  );
end;
$$;

revoke all on function public.create_subscription_checkout(uuid, text, text, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_subscription_payment(uuid, text, text, text, bigint, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_subscription_checkout(uuid, text, text, uuid, uuid)
  to service_role;
grant execute on function public.finalize_subscription_payment(uuid, text, text, text, bigint, text)
  to service_role;

comment on function public.create_subscription_checkout(uuid, text, text, uuid, uuid) is
  'Creates an idempotent provider-backed school subscription invoice and pending payment. Service-role only; the Edge Function verifies the active owner/director membership first.';
comment on function public.finalize_subscription_payment(uuid, text, text, text, bigint, text) is
  'Records the verified provider outcome and activates a school subscription atomically only when amount, currency, provider references, and invoice state match. Service-role only.';
