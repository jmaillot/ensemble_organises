-- 0130_fix_dispatch_messages.sql
-- `private.dispatch_message_notifications()` (0042) recopiait la forme fautive de
-- 0019 : une liste de colonnes sur `jsonb_array_elements`, interdite puisqu'une
-- fonction à type de retour connu n'en accepte pas. `0020` l'avait corrigée pour
-- les rappels et les anniversaires — jamais pour les messages, nés après.
--
-- Effet mesuré en production le 2026-10-19 : le job `eo-push-messages` échouait à
-- chaque passage (« a column definition list is only allowed for functions
-- returning "record" »), dix lignes s'accumulaient dans `message_notifications`
-- depuis 15:11, et aucun push de message n'est jamais parti. `0019` reste dans le
-- dépôt : il raconte le défaut, on ne réécrit pas une migration appliquée.
--
-- La colonne de sortie de `jsonb_array_elements` s'appelle `value`.

begin;

create or replace function private.dispatch_message_notifications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due integer;
  v_sent boolean;
begin
  select count(*)::integer into v_due
    from jsonb_array_elements(public.due_push_notifications('messages')) as n
   where jsonb_array_length(n.value -> 'subscriptions') > 0;

  if v_due = 0 then
    return jsonb_build_object('due', 0, 'dispatched', false, 'generated_at', now());
  end if;

  v_sent := private.post_push_dispatch('messages');

  return jsonb_build_object('due', v_due, 'dispatched', v_sent, 'generated_at', now());
end;
$$;

comment on function private.dispatch_message_notifications() is
  'Messages en file : n''appelle la fonction d''envoi que s''il y a des destinataires.';

revoke all on function private.dispatch_message_notifications() from public, anon, authenticated;
grant execute on function private.dispatch_message_notifications() to service_role;

commit;
