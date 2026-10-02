-- 0067_guest_payer_no_ticket.sql
-- Un payeur externe saisi en texte libre devient un invité SANS ticket
-- d'accès (il ne peut pas se connecter, il est seulement nommé sur les
-- dépenses qu'il a avancées). `ticket_hash` devient donc nullable : NULL =
-- payeur nommé sans accès ; empreinte = invité ayant échangé un code.
-- `verify_ardoise_ticket` compare par égalité et ne rencontre jamais NULL ;
-- l'unicité existante ignore les NULL multiples.

begin;

alter table public.ardoise_guests alter column ticket_hash drop not null;

comment on column public.ardoise_guests.ticket_hash is
  'Empreinte du ticket d''accès, NULL pour un payeur nommé sans accès.';

commit;
