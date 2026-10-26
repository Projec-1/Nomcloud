-- MANUAL OPT-IN ONLY. Never run this as part of a migration or against
-- production without explicit approval of the copied data and retention.
-- Preflight aggregate counts, test on isolated staging, then review counts
-- after execution. This intentionally duplicates existing contact details.

begin;

insert into public.platform_cases (
  title, case_type, status, priority, description, source_contact_message_id, resolution,
  created_at, resolved_at
)
select
  left(cm.topic || ' enquiry from ' || cm.name, 200),
  'support',
  case when cm.status = 'handled' then 'resolved' else 'open' end,
  'normal',
  cm.message,
  cm.id,
  case when cm.status = 'handled' then 'Previously handled contact enquiry' else null end,
  cm.created_at,
  cm.handled_at
from public.contact_messages cm
on conflict (source_contact_message_id) do nothing;

insert into public.platform_case_events (case_id, event_type, body, created_at)
select pc.id, 'created', 'Imported existing contact enquiry', pc.created_at
  from public.platform_cases pc
 where pc.source_contact_message_id is not null
   and not exists (
     select 1
       from public.platform_case_events pce
      where pce.case_id = pc.id
        and pce.event_type = 'created'
        and pce.body = 'Imported existing contact enquiry'
   );

commit;
