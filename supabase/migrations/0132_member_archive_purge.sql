-- 0132_member_archive_purge.sql
-- Supprimer pour soi, dernière appartenance : le fil s'en va avec ses messages.
--
-- `0131` laissait la ligne `conversations` derrière la dernière appartenance.
-- Personne ne pouvait plus l'atteindre — la visibilité dérive de
-- l'appartenance — mais elle occupait la base, et le geste annonçait une
-- disparition qu'il ne faisait pas (TODO #21). Décision de l'exploitant le
-- 2026-10-20 : purger.
--
-- Ce qu'on ne purge pas, et pourquoi : une **pierre tombale** (`left_at`) garde
-- l'accès à l'historique pour le membre parti, qui le lit en lecture seule.
-- Tant qu'il en reste une, le fil reste donc en base, même si plus aucun des
-- membres présents ne le voit.
--
-- Les fichiers médias ne sont pas concernés : `deleteMessage` ne retire déjà
-- que la ligne en base, pas l'objet Storage. La purge suit la même règle, et
-- laisser les fichiers serait de toute façon impossible depuis SQL.

begin;

create or replace function public.delete_conversation_for_me(p_conversation_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_self text;
  v_deleted integer := 0;
  v_purged_rows integer := 0;
begin
  if auth.uid() is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_conversation_id is null then
    raise exception 'conversation obligatoire' using errcode = '22023';
  end if;

  -- Verrou sur la conversation : deux derniers membres qui supprimeraient en
  -- même temps se sérialisent ici, et le second voit l'état du premier. Sans
  -- lui, les deux pourraient constater une appartenance restante et laisser
  -- une ligne morte.
  select c.household_id into v_household_id
    from public.conversations c
   where c.id = p_conversation_id
     for update;
  if v_household_id is null then
    raise exception 'conversation inconnue' using errcode = '22023';
  end if;

  v_self := private.current_member_id(v_household_id);
  if v_self is null then
    raise exception 'aucune ligne membre pour cet acteur dans ce foyer' using errcode = '42501';
  end if;

  delete from public.conversation_members cm
   where cm.conversation_id = p_conversation_id
     and cm.member_id = v_self;
  get diagnostics v_deleted = row_count;

  if not exists (
    select 1
      from public.conversation_members cm
     where cm.conversation_id = p_conversation_id
  ) then
    delete from public.conversations c where c.id = p_conversation_id;
    get diagnostics v_purged_rows = row_count;
  end if;

  return jsonb_build_object(
    'conversation_id', p_conversation_id,
    'member_id', v_self,
    'deleted', v_deleted,
    'purged', v_purged_rows > 0
  );
end;
$$;

comment on function public.delete_conversation_for_me(text) is
  'Efface ma ligne d''appartenance (active, archivée ou tombée). Dernière appartenance : la conversation part avec ses messages (cascade) ; une pierre tombale restante la conserve. USAGE AUTHENTIFIÉ UNIQUEMENT.';

commit;
