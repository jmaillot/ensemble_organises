# Phase 26: Export RGPD - Context

**Gathered:** 2026-10-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Un membre demande et obtient l'archive complète de ses données personnelles (JSON structuré + médias, ZIP) par un lien signé sur un bucket privé `gdpr-exports` qui expire (≤ 24 h), sans bloquer l'application et sans jamais livrer la donnée d'un autre membre. Le job est asynchrone (statut visible, notification à l'achèvement) et le contenu du bucket est purgé à 7 jours par le pg_cron existant.

**Point de séquence imposé par le ROADMAP :** la définition de la portée multi-foyers (« à qui correspond la donnée ») est tranchée en SPEC produit **avant toute requête SQL**. Cette discussion n'a pas couvert la portée multi-foyers ni le périmètre exact de la donnée — le chercheur et le planificateur traitent ces deux points comme l'entrée principale de la SPEC, à faire valider avant les migrations.

**Hors périmètre (phases voisines) :** suppression de compte RGPD (RGDP-01…07, phase 27), purge des profils enfants avec le parent (RGDP-06, phase 27), consolidation de l'Edge `household-delete` (RGDP-07, phase 27). Aucune modification de la chaîne de suppression.
</domain>

<decisions>
## Implementation Decisions

### Notification d'achèvement
- **D-01:** À l'achèvement du job, le membre est prévenu par **push** (via la chaîne existante `dispatch_messages` → `push-notify`) **et** voit le statut mis à jour dans l'app. Réutilise le mécanisme de notification D-23 de la phase 25 (rappels d'échéances enfant → adultes).
- **D-02:** En cas d'**échec** du job (crash du build ZIP, échec Storage), l'échec est **notifié comme le succès** : push + statut d'erreur dans l'app, et l'opération reste **retentable** depuis l'écran export. Jamais d'échec silencieux.
- **D-03:** Pendant le job, l'écran affiche **3 états** (en attente → en cours → prêt) + la **durée écoulée**. Pas de pourcentage de progression — un calcul serait factice pour un ZIP assemblé côté serveur.
- **D-04:** La push et la notification in-app disent seulement « votre archive est prête » ; le **téléchargement passe obligatoirement par l'écran export** (via l'historique). Un seul endroit où vit le lien signé — surface de fuite minimale. — **Reversibility:** reversible (ajout d'un lien direct ultérieur sans changement de schéma)

### Accès UI & cadence
- **D-05:** Le déclencheur vit dans un **panneau « Mes données (RGPD) »** dans Paramètres (`app/src/modules/parametres/`), à côté de `household-delete-panel.tsx`. Le panneau porte aussi le statut du job et l'historique.
- **D-06:** Cadence : **un seul job actif à la fois par membre** ; un nouveau déclenchement est possible dès que le job en cours est terminé (succès **ou** échec). Pas de plafond 1/24 h — en tension avec D-02 si un export échoue, il doit pouvoir être retenté immédiatement.
- **D-07:** Le panneau liste l'**historique des exports passés** du membre (date, statut, lien signé tant qu'il est vivant ≤ 24 h). Traçabilité naturelle pour un sujet RGPD ; conforme à D-04, le lien ne vit que là.
- **D-08:** **Tout membre avec session** peut déclencher son export — pas de restriction admin. Le droit d'accès RGPD est un droit personnel de chaque membre (RGEX-01 dit « un membre »). Les profils enfants n'entrent pas en jeu par construction : ils n'ont aucune session (D-17 phase 25).

### the agent's Discretion
- Portée multi-foyers et périmètre exact de la donnée JSON — **tranchés en SPEC produit avant toute requête SQL** (exigence du ROADMAP), pas par le planificateur seul. D-22 de la phase 25 (un enfant = un foyer, pas d'entité globale) est une contrainte d'entrée, pas la réponse.
- Format précis du JSON (un fichier par module vs un document unique), organisation interne du ZIP (arborescence médias), nom du fichier archive.
- Détails de la table de jobs (`gdpr_export_jobs` ou équivalent) : colonnes, états, index.
- Mécanique de construction du ZIP (Edge Function vs RPC + Storage direct) et taille de lot de copie des médias.
- Message exact des push et libellés UI.
- Politique Storage du bucket `gdpr-exports` (forme des chemins, durées de signature) — dans le respect de RGEX-01 (≤ 24 h).

### Folded Todos
*Aucun todo plié — aucun todo en attente n'a matché la phase (`todo_count: 0`).*
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Exigences verrouillées
- `.planning/REQUIREMENTS.md` § Export RGPD — RGEX-01…RGEX-04 (texte intégral + table de traçabilité)
- `.planning/ROADMAP.md` § Phase 26 — objectif, dépendance à la phase 25, critères de succès 1-4
- `.planning/research/SUMMARY.md` — recherche jalon v1.0 (confiance HIGH codebase / MEDIUM RGPD-SMTP)

### Disciplines héritées des phases voisines
- `.planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-CONTEXT.md` — D-16/D-17 (profils enfants sans session → seuls les comptes réels exportent), D-22 (un enfant = un foyer, pas d'entité globale), D-23 (chaîne push échéances → adultes)
- `.planning/STATE.md` § Portes dures de séquence — 26 (export) AVANT 27 (suppression) ; RGDP-04 fixe déjà la discipline « jamais de purge HTTP fragile depuis cron, frontière testée en base » que RGEX-04 hérite

### Stockage & cron existants (à suivre comme motifs)
- `supabase/migrations/0010_storage_and_realtime.sql` — buckets privés `household-media`/`household-avatars`, politiques `<household_id>/…` avec `private.is_household_member`/`private.can_write_household` ; le bucket `gdpr-exports` et ses politiques suivent ce formalisme
- `supabase/migrations/0011_cron.sql`, `0129_push_dispatch_every_minute.sql` — le pg_cron existant qui doit purger `gdpr-exports` à 7 jours (RGEX-04, vérifié en base)
- `supabase/functions/household-delete/index.ts` — motif d'Edge Function avec modes d'auth déclarés (`withSupabase`), parcours paginé des objets Storage, contrat de réponse honnête sur l'échec partiel (`storage_cleanup: 'partial'`)
- Chaîne push `dispatch_messages` → `push-notify` — branchement D-01 ; voir STATE.md § Accumulated Context
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/modules/parametres/` — panneaux existants (`household-delete-panel.tsx` précèdent RGPD, `profile-form.tsx`, `notifications-panel.tsx`) : le panneau « Mes données (RGPD) » s'y insère avec les mêmes conventions (`components/`, `api.ts`, `types.ts`)
- Chaîne push `dispatch_messages` → `push-notify` — notification d'achèvement D-01 sans nouvelle infrastructure
- Adaptateurs `app/src/lib/data` (Supabase direct) + TanStack Query — polling du statut du job avec les hooks existants
- Signatures Storage : `createSignedUrl` déjà utilisée dans recettes/ardoise avec durées variées (3600 s → 30 j) — le signé ≤ 24 h suit le même appel

### Established Patterns
- Buckets privés + politiques par préfixe `<household_id>/…` (0010) — toute donnée exportable est localisable par le chemin
- Écritures métier via RPC serveur avec vérification d'acteur — le déclenchement du job et la génération du lien signé passent par des opérations serveur explicites, jamais d'écriture client directe
- Corrections vers l'avant uniquement, oracles d'erreur RPC invariants, tests SQL négatifs comme preuve (RGEX-03)
- pg_cron avec fuseau `Europe/Paris`, jobs et historique vérifiés dans `cron.job` / `cron.job_run_details` (§2.2 AGENTS.md) — la purge 7 jours de RGEX-04 s'y inscrit

### Integration Points
- `storage.buckets` — création du bucket `gdpr-exports` (privé) dans une migration
- `auth.users` / `household_members` — le demandeur est un compte réel avec session ; la portée de la donnée part de son identité
- Modules métier (`tasks`, `events`, `expenses`, `posts`, `recipes`, etc.) — sources du JSON structuré ; périmètre tranché en SPEC
- Paramètres (`app/src/modules/parametres/`) — point d'entrée UI du panneau

</code_context>

<specifics>
## Specific Ideas

- « Lien direct partout » a été **refusé** (D-04) : la push annonce, l'écran export télécharge — un seul endroit où vit le lien signé.
- Le pourcentage de progression a été **refusé** (D-03) : trois états + durée écoulée, rien de factice.
- Le plafond 1/24 h a été **refusé** (D-06) : un échec doit pouvoir être retenté immédiatement, cohérence avec D-02.
</specifics>

<deferred>
## Deferred Ideas

*Aucune idée hors périmètre — la discussion est restée dans les limites de la phase.*

### Reviewed Todos (not folded)
*Aucun todo examiné — aucun en attente.*
</deferred>

---

*Phase: 26-export-rgpd*
*Context gathered: 2026-10-26*
