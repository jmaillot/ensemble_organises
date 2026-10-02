-- 0063_guest_type_check.sql
-- Correctif : la contrainte inline de 0004 (`participant_type in
-- ('membre','externe')`) n'avait pas été mise à jour en 0056, qui ne touchait
-- que `kind_check`. Le vocabulaire est désormais `membre`/`guest`.

begin;

alter table public.expense_participants drop constraint if exists expense_participants_participant_type_check;
alter table public.expense_participants
  add constraint expense_participants_participant_type_check
  check (participant_type in ('membre', 'guest'));

commit;
