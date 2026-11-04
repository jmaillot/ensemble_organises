# Phase 27: Suppression de compte RGPD - Context

**Gathered:** 2026-10-27
**Status:** Ready for planning

<domain>
## Phase Boundary

La voie de suppression de compte existe et est annulable : sessions tuées immédiatement, surface publique anonymisée, réversibilité 30 j par email de confirmation, alerte à J-7, purge effective J+30 purement SQL/pg_cron (manifest de médias construit à la demande, aucun envoi HTTP depuis le cron), et l'Edge `household-delete` consolidée en une seule voie de suppression vivante.

**Hors périmètre :** export RGPD (phase 26, livré), SMTP livrable et spam-proof (phase 28/31 — cette phase consomme le canal d'envoi disponible), sauvegardes/supervision (phase 28).

</domain>

<decisions>
## Implementation Decisions

### Anonymisation de la surface publique
- **D-01:** Le contenu porté par le compte supprimé dans les espaces partagés (posts Cercle, messages, commentaires, réactions, tâches, complétions, dépenses) est **conservé et déshumanisé** — application de D-04 de la phase 25 (« jamais de purge d'historique ») aux comptes adultes. — **Reversibility:** one-way — l'anonymisation remplace l'identité ; seule la restauration D-05 pendant la fenêtre de 30 j permet un retour.
- **D-02:** Visuel de l'ancien membre : **un pseudonyme générique unique** (« Ancien membre ») partout, sans avatar, homogène sur toute l'app. Pas de période de présence affichée, pas de renommage par le foyer.
- **D-03:** La ligne `household_members` **reste en base** en statut « ancien membre » : les sélecteurs l'excluent, les audits et la chaîne de restauration gardent un point d'ancrage stable. Pas de suppression de la ligne membre.

### Réversibilité 30 jours
- **D-04:** **Instantané en base de restauration** : avant anonymisation, la procédure enregistre l'état requis pour l'annulation (ancien nom, avatar, liens user_id) dans des tables de restauration. Tout vit en base, purgeable J+30, accessible au pg_cron existant — conforme à RGDP-04 (aucune logique de purge hors SQL).
- **D-05:** À l'annulation (confirmation par email), l'état est restauré depuis l'instantané et l'utilisateur **se reconnecte normalement** — le lien email ne crée jamais de session.
- **D-06:** **Une seule demande active à la fois** ; une nouvelle demande annule/remplace la précédente et rejoue l'horloge de 30 jours. Une demande refusée ou annulée peut être reposée immédiatement (cohérence avec D-06 phase 26 pour l'export).

### Règles produit (médias, enfants, foyers orphelins)
- **D-07:** **Les médias du foyer restent** à la purge J+30 : les objets Storage vivent sous `<household_id>/…` (0010) et appartiennent au foyer, pas à l'utilisateur. Seules les références strictement personnelles (avatar du compte) sont supprimées. L'audit FK de RGDP-05 vérifie néanmoins référence par référence qu'aucun objet ne devient orphelin.
- **D-08:** **Profils enfants** (lignes sans compte, phase 25) : purgés avec le compte **si le compte était l'unique adulte du foyer** (RGDP-06) ; dans un foyer avec d'autres adultes restants, ils sont **transférés** et deviennent gérés par les adultes restants.
- **D-09:** **Foyer orphelin supprimé** : si le compte supprimé était le seul adulte (aucun adulte restant, rien à transférer), le foyer est supprimé avec ses médias, comme le fait déjà `household-delete` (0074 + Edge).
- **D-10:** **Consolidation RGDP-07 : une seule Edge unifiée**, tout fusionné. L'Edge existante `household-delete` est remplacée par une Edge unique de suppression avec **deux modes déclarés** : mode « foyer » (le panneau admin existant continue de fonctionner via elle) et mode « compte » (la nouvelle chaîne). Un seul code de purge, deux intentions.

### the agent's Discretion
- **Tension de séquence SMTP à traiter par le chercheur** : RGDP-02/03 exigent des emails (confirmation, alerte J-7) alors que le MTA livrable n'arrive qu'en phase 28/31. La chaîne d'envoi disponible aujourd'hui (auth Supabase, SMTP existant de la stack) doit être identifiée — la question n'a pas été discutée, elle est l'entrée principale du chercheur.
- Schéma exact des tables de restauration et de demande (états, index, colonnes d'horloge).
- Détail de l'audit FK vers `auth.users` (liste exhaustive des tables, règles par table : set null / réattribution / anonymisation) — à consigner avant toute migration (RGDP-05).
- Forme du manifest de médias construit à la demande pour la purge J+30.
- Libellés UI du parcours de demande (panneau « Mes données (RGPD) » à côté de l'export, D-05 phase 26) et des emails.

### Folded Todos
*Aucun todo plié — aucun todo en attente n'a matché la phase (`todo_count: 0`).*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Exigences verrouillées
- `.planning/REQUIREMENTS.md` § Suppression de compte RGPD — RGDP-01…RGDP-07 (texte intégral + table de traçabilité)
- `.planning/ROADMAP.md` § Phase 27 — objectif, dépendances (26, 25), critères de succès 1-4
- `.planning/research/SUMMARY.md` — recherche jalon v1.0 (confiance HIGH codebase / MEDIUM RGPD-SMTP)

### Disciplines héritées des phases voisines
- `.planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-CONTEXT.md` — D-04 (traces conservées, jamais purgées), D-15/D-16 (enfants = profils sans compte, 0145), D-22 (un enfant = un foyer) : fondations de D-01, D-08
- `.planning/phases/26-export-rgpd/26-CONTEXT.md` — D-05 (panneau « Mes données (RGPD) » dans Paramètres), D-06 (un job actif, retentable), RGEX-04 (jamais de purge HTTP depuis cron)
- `.planning/STATE.md` § Portes dures de séquence — 26 avant 27 ; 27 conditionne la porte OUV-07 de la phase 31

### Code existant (à suivre comme motifs)
- `supabase/functions/household-delete/index.ts` — Edge à consolider : modes d'auth déclarés (`withSupabase`, `auth: ['user', 'publishable']`), parcours paginé Storage, contrat `storage_cleanup: 'partial'`
- `supabase/migrations/0074_household_delete.sql` — RPC `public.delete_household` (dépenses d'abord, cascades ensuite, `service_role` uniquement) : socle du mode « foyer » de l'Edge unifiée
- `supabase/migrations/0002_tables_identity.sql` — FK vers `auth.users` (`on delete cascade` profils/push, `set null` sur `created_by`) : point de départ de l'audit RGDP-05
- `supabase/migrations/0145_convert_managed_children.sql` — preuve que seul le propriétaire peut `delete from auth.users` ; conversion enfants 0145
- `supabase/migrations/0010_storage_and_realtime.sql` — chemins `<household_id>/…`, buckets privés : fondement de D-07

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `public.delete_household` (0074) + Edge `household-delete` — le socle de purge de foyer à mutualiser dans l'Edge unifiée (D-10)
- Panneau `app/src/modules/parametres/` — `household-delete-panel.tsx` et le panneau RGPD de la phase 26 : le parcours de demande de suppression s'y insère
- pg_cron existant (0011, 0129, purge export RGEX-04) — la purge J+30 et l'alerte J-7 s'y inscrivent (fuseau `Europe/Paris`, jobs vérifiés dans `cron.job`)
- Tables de jobs de la phase 26 (`0158_gdpr_export.sql`) — motif de table d'état avec `user_id`, horloge et états

### Established Patterns
- Opérations serveur explicites via RPC/Edge avec revérification en base — jamais d'écriture client directe pour une action destructive
- Contrat de réponse honnête sur l'échec partiel (`storage_cleanup: 'partial'`) — à reproduire sur la purge J+30
- Corrections vers l'avant, tests SQL négatifs comme preuve, assertions bornées par foyer
- `delete from auth.users` réservé au propriétaire du compte (0145) — la purge J+30 agit en `service_role`

### Integration Points
- Sessions Supabase Auth (tuées immédiatement à la demande — RGDP-01)
- Canal d'envoi d'emails disponible dans la stack (à identifier par le chercheur — SMTP livrable = phase 28)
- Edge unifiée remplaçant `household-delete` : `app/src/modules/parametres/components/household-delete-panel.tsx` doit basculer dessus sans changer son comportement visible

</code_context>

<specifics>
## Specific Ideas

Pas de référence externe spécifique — les choix suivent les motifs établis des phases 25-26 (conserver + déshumaniser, tout en base, un seul socle de purge).

</specifics>

<deferred>
## Deferred Ideas

*Aucune idée hors périmètre — la discussion est restée dans le cadre de la phase.*

</deferred>

---

*Phase: 27-Suppression de compte RGPD*
*Context gathered: 2026-10-27*
