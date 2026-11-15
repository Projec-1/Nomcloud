-- Hormuud submissions remain unverified until a school administrator reviews
-- them. They do not create fee_payments or change fee_records.amount_paid.

alter table public.payment_events
  drop constraint payment_events_provider_check,
  add constraint payment_events_provider_check
    check (provider in ('waafipay', 'hormuud')),
  drop constraint payment_events_payment_method_check,
  add constraint payment_events_payment_method_check
    check (payment_method in ('mobile_money', 'card', 'ussd', 'bank_agent', 'hormuud_evc')),
  drop constraint payment_events_event_type_check,
  add constraint payment_events_event_type_check
    check (event_type in ('pending', 'approved', 'declined', 'cancelled', 'fee_payment_initiated'));

create table public.fee_payment_submissions (
  id              uuid          not null default gen_random_uuid(),
  school_id       uuid          not null,
  student_id      uuid          not null,
  fee_record_id   uuid          not null,
  amount          numeric(12,2) not null,
  currency        char(3)       not null default 'USD',
  method          text          not null default 'hormuud_evc',
  payer_number    text          not null,
  transaction_id  text,
  evidence_path   text,
  status          text          not null default 'pending_verification',
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  review_note     text,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),

  constraint fee_payment_submissions_pkey
    primary key (id),
  constraint fee_payment_submissions_amount_check
    check (amount > 0),
  constraint fee_payment_submissions_method_check
    check (method = 'hormuud_evc'),
  constraint fee_payment_submissions_status_check
    check (status in ('pending_verification', 'verified', 'rejected')),
  constraint fee_payment_submissions_payer_number_check
    check (btrim(payer_number) <> ''),
  constraint fee_payment_submissions_transaction_id_check
    check (transaction_id is null or btrim(transaction_id) <> ''),
  constraint fee_payment_submissions_evidence_path_check
    check (
      evidence_path is null
      or evidence_path ~ (
        '^' || school_id::text || '/fee-payments/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|png|jpg|webp)$'
      )
    ),
  constraint fee_payment_submissions_review_check
    check (
      (status = 'pending_verification' and reviewed_by is null and reviewed_at is null)
      or (status <> 'pending_verification' and reviewed_by is not null and reviewed_at is not null)
    ),
  constraint fee_payment_submissions_school_id_fkey
    foreign key (school_id) references public.schools (id) on delete cascade,
  constraint fee_payment_submissions_school_id_student_id_fkey
    foreign key (school_id, student_id)
    references public.students (school_id, id) on delete cascade,
  constraint fee_payment_submissions_school_id_fee_record_id_fkey
    foreign key (school_id, fee_record_id)
    references public.fee_records (school_id, id) on delete restrict,
  constraint fee_payment_submissions_reviewed_by_fkey
    foreign key (reviewed_by) references public.profiles (id) on delete restrict
);

comment on table public.fee_payment_submissions is
  'Unverified Hormuud EVC Plus payment claims. These rows are not payments and do not affect fee balances until an administrator verifies them.';

create index fee_payment_submissions_school_id_student_id_created_at_idx
  on public.fee_payment_submissions (school_id, student_id, created_at desc);

create unique index fee_payment_submissions_school_transaction_id_key
  on public.fee_payment_submissions (school_id, transaction_id)
  where transaction_id is not null;

create unique index fee_payment_submissions_school_student_pending_key
  on public.fee_payment_submissions (school_id, student_id)
  where status = 'pending_verification';

create trigger fee_payment_submissions_set_updated_at
  before update on public.fee_payment_submissions
  for each row execute function public.set_updated_at();

revoke all on table public.fee_payment_submissions from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.fee_payment_submissions from authenticated;
grant select on table public.fee_payment_submissions to authenticated;

alter table public.fee_payment_submissions enable row level security;

create policy fee_payment_submissions_admin_select
  on public.fee_payment_submissions
  for select to authenticated
  using (public.has_school_admin_role(school_id));

create policy fee_payment_submissions_guardian_select
  on public.fee_payment_submissions
  for select to authenticated
  using (public.is_guardian_of_student(school_id, student_id));
