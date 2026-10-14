-- Extend the existing application lifecycle without changing existing values.
-- Keep enum additions in their own migration so PostgreSQL commits them before
-- later workflow functions reference the new labels.
alter type public.application_status add value if not exists 'awaiting_information';
alter type public.application_status add value if not exists 'onboarding';
