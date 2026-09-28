-- 0028_gift_select_no_selfread.sql
-- `gift_lists_select` ne doit pas relire `gift_lists`.
--
-- DIAGNOSTIC (28/09/2026, exécution réelle, pas relecture)
--   `can_read_gift_list(id)` vérifiait l'accès en relisant la ligne par son
--   id (`select 1 from gift_lists l where l.id = …`). Or une ligne créée dans
--   la MÊME commande est invisible aux scans de cette commande (MVCC :
--   `cmin == curcid`), donc sur `INSERT…RETURNING` l'`EXISTS` rendait faux et
--   PostgreSQL répondait « new row violates row-level security policy ».
--   L'app demande toujours la représentation (`Prefer: return=representation`,
--   `.insert().select().single()`), donc TOUTE création de liste échouait en
--   42501 — tandis que l'insertion nue, la lecture, `UPDATE…RETURNING` (version
--   précédente visible) et les suites (jamais d'`INSERT…RETURNING` en
--   `authenticated`) passaient.
--
-- CORRECTION
--   La politique prédique désormais sur LA LIGNE ELLE-MÊME (colonnes
--   `visibility`, `owner_member_id`, `household_id`, `id`) et sur d'AUTRES
--   tables (`gift_list_shares`, `profiles`, `household_members` via les
--   helpers) : rien ne rescane `gift_lists`, donc rien ne dépend de la
--   visibilité intra-commande. Le corps est la copie exacte des trois branches
--   de `can_read_gift_list`, sans le `select … from gift_lists`.
--
--   `can_read_gift_list` est CONSERVÉE pour les tables enfants
--   (`gift_items`, `gift_list_shares`) : leurs politiques lisent une liste
--   commise par une autre commande, où la relecture est sûre. Elle ne doit
--   plus jamais servir aux politiques propres de `gift_lists`.
--
-- CLASSE, PAS INSTANCE (§2.7.E — inspecté, pas tout réécrit)
--   Même motif structurel sur `conversations_select` et
--   `conversation_members_select` (`is_conversation_member` rescane les
--   tables des conversations). AUCUN chemin client ne les atteint : le module
--   Messages ne fait qu'envoyer des messages (lignes commises), il ne crée ni
--   conversations ni participants. Le jour où un chemin client insérera là
--   avec représentation, même traitement qu'ici. Ne pas « corriger » la
--   sémantique des conversations sans décision produit : la visibilité des
--   directs y est volontairement fermée.

begin;

drop policy if exists gift_lists_select on public.gift_lists;
create policy gift_lists_select on public.gift_lists
  for select using (
    visibility <> 'privee'
    or owner_member_id = private.current_member_id(household_id)
    or exists (
      select 1
        from public.gift_list_shares s
       where s.list_id = id
         and (
           s.shared_with_member_id = private.current_member_id(household_id)
           or s.shared_with_email = (
             select p.email from public.profiles p where p.id = auth.uid()
           )
         )
    )
  );

comment on function private.can_read_gift_list(text) is
  'Reservee aux tables enfants (listes commises) : ne plus utiliser pour les politiques propres de gift_lists, dont la relecture est invisible a INSERT...RETURNING.';

commit;
