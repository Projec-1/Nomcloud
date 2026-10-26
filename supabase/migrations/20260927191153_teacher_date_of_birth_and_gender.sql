-- Teacher date of birth and gender.
--
-- WHY. A school's own staff spreadsheet routinely carries a DOB and a Gender
-- column. Until now the teachers table had nowhere to put either, so the bulk
-- import recognised those columns and then silently discarded them. Storing them
-- is what lets the importer keep what the school already has.
--
-- Both columns are NULLABLE: the import requires only a name and an email, and
-- every teacher already in the table predates these columns.
--
-- The gender CHECK is copied from students_gender_check verbatim — the same three
-- lowercase values, in the same form — so a teacher's gender and a pupil's gender
-- can never drift apart:
--     CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text])))
-- A CHECK is satisfied when its expression is NULL, so this constraint permits a
-- null gender without needing an explicit "gender is null or" clause, exactly as
-- it does on students.
--
-- Idempotent, so an existing installation can apply it safely. It adds columns
-- and one CHECK constraint only: no policy, grant, trigger, function or index is
-- created, altered or dropped here.

alter table public.teachers
  add column if not exists date_of_birth date,
  add column if not exists gender text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'teachers'
      and con.conname = 'teachers_gender_check'
  ) then
    alter table public.teachers
      add constraint teachers_gender_check
      check ((gender = any (array['male'::text, 'female'::text, 'other'::text])));
  end if;
end
$$;

comment on column public.teachers.date_of_birth is
  'Optional date of birth, as the school recorded it. Nullable: the bulk import requires only a name and an email.';

comment on column public.teachers.gender is
  'Optional gender. Constrained to the same three lowercase values as students.gender so the two cannot drift apart.';
