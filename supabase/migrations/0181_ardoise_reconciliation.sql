-- 0181_ardoise_reconciliation.sql
-- Phase 40 (ARD-02) — Réconciliation `guest:` → `membre:` à l'adhésion foyer.
--
-- Definition effective recopiee depuis 0145 (jamais reecrite, AGENTS §2.7-A) :
-- signature, refus du role enfant (D-17a), verrou for update, idempotence
-- deja-membre, incrementation use_count. SEUL changement : le bloc de
-- reconciliation insere entre l'insert household_members et l'update
-- household_invite_tokens — meme transaction, tout ou rien.
--
-- Regle d'identite OPTION B verrouillee (40-CONTEXT) : la correspondance passe
-- EXCLUSIVEMENT par la table pont private.ardoise_bridge_identities (posee par
-- create_household_bridge_token, 0180b). AUCUNE correspondance par
-- display_name — le risque d'homonyme est ecarte par construction.
--
-- Vocabulaire effectif du schema : les participations invitees sont
-- participant_type = 'guest' avec guest_id (0056/0063) — le plan parlait de
-- 'invite', le schema reel prime (AGENTS §5 : les migrations font foi).
--
-- Politique de fusion doublon verrouillee : si une depense a deja une part
-- membre pour le nouvel arrivant, la part membre est GARD EE et la part guest
-- est SUPPRIMEE (pas de double comptage). Le delete PRECEDE l'update pour
-- garantir que la contrainte expense_participants_member_unique (0015) ne
-- peut jamais lever 23505.
--
-- Correctif necessaire (absent du plan) : le trigger validate_expense_participant
-- (0008 sur insert or update, fonction 0056) exige qu'un participant 'membre'
-- soit inscrit a l'ardoise de la depense (ardoise_members). La conversion
-- insere donc d'abord les lignes ardoise_members des ardoises touchees.

begin;

create or replace function public.redeem_household_invite_token(
  p_token_hash text,
  p_user_id uuid,
  p_display_name text,
  p_avatar_url text default null,
  p_role text default 'membre'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.household_invite_tokens%rowtype;
  v_member_id text;
  v_role text;
  v_color text;
  v_already boolean := false;
begin
  if p_user_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token invalide' using errcode = '22023';
  end if;

  -- D-17a : un enfant ne rejoint plus un foyer par invitation — l'enfant est
  -- cree par un parent depuis les parametres du foyer. Refus recopie de 0145
  -- tel quel : l'appelant ne peut pas s'attribuer un role (T-40-06).
  if p_role = 'enfant' then
    raise exception 'un enfant est créé par un parent depuis les paramètres du foyer'
      using errcode = '22023';
  end if;

  -- Un token d'invitation n'attribue jamais un privilège (AGENTS.md §2.6) :
  -- toute autre valeur demandée tombe sur `membre`, comme avant.
  v_role := 'membre';

  -- Verrou pessimiste : deux utilisations simultanees du meme token ne
  -- peuvent pas franchir `use_count < max_uses`. La ligne est d'abord
  -- localisee par l'index sur `token_hash`, puis la comparaison est refaite
  -- a temps constant.
  select t.* into v_token
    from public.household_invite_tokens t
   where t.token_hash = p_token_hash
     and private.token_hash_matches(t.token_hash, p_token_hash)
    for update;

  if not found then
    raise exception 'token inconnu' using errcode = '22023';
  end if;
  if not v_token.is_active then
    raise exception 'token révoqué' using errcode = '22023';
  end if;

  -- Ni ici ni plus bas, un `update` ne peut être suivi d'un `raise` : les
  -- deux sont dans la même instruction, l'exception annule l'UPDATE. La
  -- désactivation d'un token périmé ou épuisé reste laissée à
  -- `private.prune_expired_invite_tokens` (pg_cron, quotidien), comme dans
  -- 0017. Ces deux refus demeurent — seule la désactivation illusoire avait
  -- disparu, et elle ne revient pas.
  if v_token.expires_at is not null and v_token.expires_at <= now() then
    raise exception 'token expiré' using errcode = '22023';
  end if;
  if v_token.use_count >= v_token.max_uses then
    raise exception 'token épuisé' using errcode = '22023';
  end if;

  -- Deja membre : l'utilisation n'est pas comptabilisee (idempotence 0145),
  -- MAIS la reconciliation reste executee (bloc ci-dessous) : c'est le seul
  -- chemin qui realise la fusion verrouillee — un membre existant (part zero
  -- du passe, 0070) qui ponte son identite invited doit voir ses parts
  -- guest converties, la part membre existante gard EE. Sortir avant le bloc
  -- rendrait la politique de fusion inatteignable.
  select m.id into v_member_id
    from public.household_members m
   where m.household_id = v_token.household_id
     and m.user_id = p_user_id;

  v_already := v_member_id is not null;

  if not v_already then
    v_color := (array['accent', 'ink', 'coral', 'amber', 'violet'])[
      1 + (select count(*) from public.household_members where household_id = v_token.household_id) % 5
    ];

    v_member_id := private.new_id('member');

    insert into public.household_members (
      id, household_id, user_id, display_name, avatar_url, color_tag, role
    ) values (
      v_member_id,
      v_token.household_id,
      p_user_id,
      coalesce(nullif(btrim(p_display_name), ''), 'Nouveau membre'),
      p_avatar_url,
      v_color,
      v_role
    );
  end if;

  -- =========================================================================
  -- Bloc reconciliation (ARD-02, phase 40) — OPTION B table pont.
  -- Les participations invitees des guests poses par l'Edge pour CET
  -- utilisateur et CE foyer basculent en participations membres, dans LA
  -- MEME TRANSACTION que l'adhesion. Borne double (T-40-05) : le couple
  -- (user_id, household_id) de la table pont, ET la depense rattachee au
  -- foyer du token via public.expenses. Aucun cross-foyer possible.
  -- =========================================================================

  -- (0) Inscription a l'ardoise : le trigger validate_expense_participant
  -- (0008/0056) refuse un participant 'membre' non inscrit a l'ardoise de
  -- la depense (23514). Les ardoises touchees sont celles qui portent au
  -- moins une part guest du pont. Idempotent (primary key ardoise_id,
  -- member_id).
  insert into public.ardoise_members (ardoise_id, member_id)
  select distinct e.ardoise_id, v_member_id
    from public.expenses e
    join public.expense_participants ep on ep.expense_id = e.id
   where e.household_id = v_token.household_id
     and ep.participant_type = 'guest'
     and ep.guest_id in (
       select bi.guest_id
         from private.ardoise_bridge_identities bi
        where bi.user_id = p_user_id
          and bi.household_id = v_token.household_id
     )
  on conflict do nothing;

  -- (1) Fusion des doublons AVANT la conversion (politique verrouillee :
  -- garder la part membre, supprimer la part guest — pas de double
  -- comptage). Le report de la part supprimee sur la part gard EE est
  -- OBLIGATOIRE : le trigger differe expense_participants_share_total
  -- (0008) impose somme des parts = montant de la depense — un simple
  -- delete ferait echouer la transaction A LA VALIDATION (23514).
  -- Deux causes de conflit avec la future part membre
  -- (expense_participants_member_unique, 0015) :
  --   a. une part membre de v_member_id existe deja sur la depense
  --      (chemin already_member) — les parts guest pontees sont REPORT EES
  --      sur la part membre puis supprimees ;
  --   b. DEUX guests pontes sur la MEME depense (0180b ponte TOUS les
  --      guests de l'ardoise pour l'utilisateur) — les parts convergent
  --      vers le meme (expense_id, member_id) : tout est reporte sur la
  --      part au plus petit id, les autres sont supprimees.
  -- L'ordre a → b garantit que l'update de conversion ne peut jamais
  -- lever 23505, sans jamais modifier la somme des parts.

  -- (1.a) Report des parts guest pontees sur la part membre existante.
  update public.expense_participants keep
     set share_amount = keep.share_amount + (
       select coalesce(sum(dup.share_amount), 0::numeric)
         from public.expense_participants dup
        where dup.expense_id = keep.expense_id
          and dup.participant_type = 'guest'
          and dup.guest_id in (
            select bi.guest_id
              from private.ardoise_bridge_identities bi
             where bi.user_id = p_user_id
               and bi.household_id = v_token.household_id
          )
       )
   where keep.participant_type = 'membre'
     and keep.member_id = v_member_id
     and exists (
       select 1 from public.expenses e
        where e.id = keep.expense_id
          and e.household_id = v_token.household_id
     )
     and exists (
       select 1 from public.expense_participants dup
        where dup.expense_id = keep.expense_id
          and dup.participant_type = 'guest'
          and dup.guest_id in (
            select bi.guest_id
              from private.ardoise_bridge_identities bi
             where bi.user_id = p_user_id
               and bi.household_id = v_token.household_id
          )
     );

  -- (1.a') Suppression des parts guest pontees maintenant reportees.
  delete from public.expense_participants ep
   where ep.participant_type = 'guest'
     and ep.guest_id in (
       select bi.guest_id
         from private.ardoise_bridge_identities bi
        where bi.user_id = p_user_id
          and bi.household_id = v_token.household_id
     )
     and exists (
       select 1 from public.expenses e
        where e.id = ep.expense_id
          and e.household_id = v_token.household_id
     )
     and exists (
       select 1 from public.expense_participants keep
        where keep.expense_id = ep.expense_id
          and keep.participant_type = 'membre'
          and keep.member_id = v_member_id
     );

  -- (1.b) Report des parts des guests pontes surnumeraires sur la part du
  -- guest ponte au plus petit id (le survivant de la depense).
  update public.expense_participants keeper
     set share_amount = keeper.share_amount + (
       select coalesce(sum(dup.share_amount), 0::numeric)
         from public.expense_participants dup
        where dup.expense_id = keeper.expense_id
          and dup.participant_type = 'guest'
          and dup.guest_id in (
            select bi.guest_id
              from private.ardoise_bridge_identities bi
             where bi.user_id = p_user_id
               and bi.household_id = v_token.household_id
          )
          and dup.id > keeper.id
       )
   where keeper.participant_type = 'guest'
     and keeper.guest_id in (
       select bi.guest_id
         from private.ardoise_bridge_identities bi
        where bi.user_id = p_user_id
          and bi.household_id = v_token.household_id
     )
     and exists (
       select 1 from public.expenses e
        where e.id = keeper.expense_id
          and e.household_id = v_token.household_id
     )
     and not exists (
       select 1 from public.expense_participants lower
        where lower.expense_id = keeper.expense_id
          and lower.participant_type = 'guest'
          and lower.guest_id in (
            select bi.guest_id
              from private.ardoise_bridge_identities bi
             where bi.user_id = p_user_id
               and bi.household_id = v_token.household_id
          )
          and lower.id < keeper.id
     );

  -- (1.b') Suppression des parts guest pontees surnumeraires (celles qui
  -- ont ete reportees ci-dessus : tout guest ponte de la depense sauf le
  -- plus petit id).
  delete from public.expense_participants ep
   where ep.participant_type = 'guest'
     and ep.guest_id in (
       select bi.guest_id
         from private.ardoise_bridge_identities bi
        where bi.user_id = p_user_id
          and bi.household_id = v_token.household_id
     )
     and exists (
       select 1 from public.expenses e
        where e.id = ep.expense_id
          and e.household_id = v_token.household_id
     )
     and exists (
       select 1 from public.expense_participants lower
        where lower.expense_id = ep.expense_id
          and lower.participant_type = 'guest'
          and lower.guest_id in (
            select bi.guest_id
              from private.ardoise_bridge_identities bi
             where bi.user_id = p_user_id
               and bi.household_id = v_token.household_id
          )
          and lower.id < ep.id
     );

  -- (2) Conversion guest → membre : les parts du passe deviennent les parts
  -- du nouveau membre (montants inchanges — la somme controlee par le
  -- trigger differe ne bouge pas). Les lignes ardoise_guests ne sont JAMAIS
  -- supprimees : expenses.paid_by_guest y pointe via FK restrict (0056).
  update public.expense_participants ep
     set participant_type = 'membre',
         member_id = v_member_id,
         guest_id = null
   where ep.participant_type = 'guest'
     and ep.guest_id in (
       select bi.guest_id
         from private.ardoise_bridge_identities bi
        where bi.user_id = p_user_id
          and bi.household_id = v_token.household_id
     )
     and exists (
       select 1
         from public.expenses e
        where e.id = ep.expense_id
          and e.household_id = v_token.household_id
     );

  -- (3) Purge du pont consomme : la conversion a eu lieu, la table pont ne
  -- doit pas survivre a un eventuel second redeem (idempotence ARD-03).
  delete from private.ardoise_bridge_identities
   where user_id = p_user_id
     and household_id = v_token.household_id;

  -- Deja membre : sortie idempotente de 0145, sans incrementation de
  -- use_count — apres reconciliation et purge du pont.
  if v_already then
    return jsonb_build_object(
      'household_id', v_token.household_id,
      'member_id', v_member_id,
      'already_member', true
    );
  end if;

  update public.household_invite_tokens
     set use_count = use_count + 1,
         is_active = (use_count + 1 < max_uses)
    where id = v_token.id;

  return jsonb_build_object(
    'household_id', v_token.household_id,
    'member_id', v_member_id,
    'already_member', false
  );
end;
$$;

comment on function public.redeem_household_invite_token(text, uuid, text, text, text) is
  'USAGE SERVEUR UNIQUEMENT. Échange un token contre une ligne household_members, en transaction. Un enfant ne rejoint plus un foyer par invitation (22023, D-17a) : l''enfant est créé par un parent depuis les paramètres du foyer. Un token périmé ou épuisé est refusé ; sa désactivation revient à private.prune_expired_invite_tokens. Phase 40 : consomme private.ardoise_bridge_identities (OPTION B) pour réconcilier les participations guest en participations membre du nouveau membre — même transaction, fusion doublon = garder la part membre, purge du pont après conversion ; aucune correspondance par display_name.';

commit;
