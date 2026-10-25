---
phase: 05-cadeaux-contacts
plan: 03
subsystem: edge-functions
tags: [edge, hmac, gift-invites, user-only, oracle, oq-1]
requires:
  - phase: 05-01
    provides: [gift_ideas-table, contact-lists-table, surprise-rls, contact-seed]
  - phase: 05-02
    provides: [gift-list-invite-rpcs, gift-items-masked-view]
provides:
  - gift-list-invite-edge
  - gift-invite-client-api
  - gift-invite-secret-provisioned
affects: [05-04-cron-dispatch]
actuals:
  tokens: 6157
  tasks: 3
  commits: 1
plan_head_before: 2d588adc4a7fbde6c23a32e4ac288867fe67ab70
plan_head_after: 3fc40f9a06c1cc61835b912f2df11bf2ab243e1f
tech-stack:
  added: []
  patterns: [user-only-edge, fail-closed-secret, oracle-unique-message, household-scoped-exclusion]
key-files:
  created:
    - supabase/functions/gift-list-invite/index.ts
  modified:
    - app/src/modules/cadeaux/api.ts
    - app/src/lib/data/supabase-adapter.ts
    - app/src/types/database.ts
    - supabase-project/docker-compose.traefik.yml
key-decisions:
  - "OQ-1 = OPTION A (verrouillee) : Edge user-only, signup-avec-email-invite puis activation du partage via la branche email de redeem_gift_list_invite ; aucun chemin anonyme"
  - "Secret live dans docker-compose.secrets.yml local (jamais versionne), wiring prod dans docker-compose.traefik.yml versionne"
  - "gift_list_invites exclue de HOUSEHOLD_SCOPED comme household_invite_tokens (RPC-only sans politique)"
  - "Realtime : verification seule, aucune migration — gift_ideas/contact_lists/contacts couverts par 0076/0077, invites exclues par conception"
requirements-completed: [D-15, D-16, D-17, D-18]
coverage:
  - id: D1
    description: "Un owner genere un code d'invitation (128 bits, base64url) affiche une seule fois avec QR"
    requirement: "D-15"
    verification:
      - kind: automated
        ref: "supabase/functions/gift-list-invite/index.ts#handleCreate + typecheck/tests verts"
        status: pass
      - kind: manual
        ref: "Echange create authentifie a faire en UAT (JWT requis, non automatisable ici)"
        status: pending
    human_judgment: true
  - id: D2
    description: "Un membre rachete le code et obtient lecture + reservation sur la liste"
    requirement: "D-16"
    verification:
      - kind: automated
        ref: "supabase/functions/gift-list-invite/index.ts#handleRedeem (branche membre d'abord)"
        status: pass
      - kind: manual
        ref: "Redeem membre authentifie a faire en UAT"
        status: pending
    human_judgment: true
  - id: D3
    description: "Un externe avec l'email invite s'inscrit avec cet email et voit son partage active"
    requirement: "D-17"
    verification:
      - kind: automated
        ref: "redeemGiftListInvite(code, email) -> p_email ; Edge user-only (OPTION A)"
        status: pass
      - kind: manual
        ref: "Parcours signup-puis-redeem a faire en UAT"
        status: pending
    human_judgment: true
  - id: D4
    description: "Regenerer invalide l'ancien code, arreter le partage le revoque"
    requirement: "D-15"
    verification:
      - kind: automated
        ref: "RPC 0079 (wave 2, test-db.sh 27/27) ; Edge create/revoke deleguent sans contournement"
        status: pass
    human_judgment: false
  - id: D5
    description: "Sans GIFT_LIST_INVITE_HMAC_SECRET provisionne, la fonction echoue fermee avec message explicite"
    requirement: "D-18"
    verification:
      - kind: automated
        ref: "checkSecret() avant toute signature (create/redeem) ; 500 'GIFT_LIST_INVITE_HMAC_SECRET doit faire au moins 256 bits.' ; secret present confirme read-only dans le runtime"
        status: pass
      - kind: live
        ref: "OPTIONS 204, POST sans auth -> 401 sans valider le code (pas d'oracle)"
        status: pass
    human_judgment: false
duration: ~90 min
completed: 2026-10-05
status: complete
---

# Phase 05 Plan 03 : Edge gift-list-invite + appel client Summary

**Edge `gift-list-invite` user-only (clone réduit d'ardoise-invite : create/revoke/summary/redeem), secret HMAC dédié provisionné localement, helper client `callGiftInvite` et adapter étendu — OQ-1 tranchée OPTION A et verrouillée en code.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-10-05 (continuation après checkpoint, worktree propre, zéro commit)
- **Completed:** 2026-10-05
- **Tasks:** 3 (2 checkpoints résolus par l'utilisateur + 1 auto)
- **Files modified:** 5 (1 Edge créée, 4 modifiés)

## Accomplishments

- **Task 1 — Secret provisionné (checkpoint résolu) :** `GIFT_LIST_INVITE_HMAC_SECRET` dédié généré (`openssl rand -base64 48`, 384 bits), injecté dans le `.env` de la stack live **par redirection fichier uniquement** (jamais en ligne de commande, jamais affiché), fil déclaré dans `docker-compose.secrets.yml` local (miroir exact du pattern `ARDOISE_HMAC_SECRET`), runtime `functions` recréé, présence confirmée read-only (nom seul) dans le conteneur.
- **Task 2 — OQ-1 tranchée OPTION A (checkpoint résolu) :** Edge strictement user-only, aucun chemin publishable/anonyme ; le lien `/invitation/cadeau?code=…` mène vers signup/connexion avec l'e-mail invité, puis l'échange active le partage via la branche e-mail existante de `redeem_gift_list_invite` (0079). Choix consigné en en-tête de l'Edge, du client et du présent SUMMARY.
- **Task 3 — Edge + client :** `supabase/functions/gift-list-invite/index.ts` (generateCode/hmacSha256Hex/rate-limit/translateRpcError/checkSecret repris verbatim de la famille, schéma Zod discriminatedUnion, code base64url ≥ 22 chars, maxUses 1-100, expiresAt ISO) ; `callGiftInvite` calquée sur `callArdoiseInvite` (mêmes headers apikey + Bearer, même surface d'erreur) + `create/revoke/summary/redeemGiftListInvite` + `giftInviteLink` ; `HOUSEHOLD_SCOPED` étendue à `gift_ideas/contact_lists/contacts` (`gift_list_invites` exclue comme `household_invite_tokens`) ; `GiftIdeaRow/ContactListRow/ContactRow` ajoutées à `database.ts` (miroir exact des colonnes 0076/0077) ; wiring prod `GIFT_LIST_INVITE_HMAC_SECRET` dans `docker-compose.traefik.yml` versionné.
- **Preuves :** `npm run typecheck` vert, suite cadeaux 2/2 verte, full suite 479/480 (1 échec calendrier pré-existant, prouvé sur main pristine), Edge live : OPTIONS 204, POST sans auth → 401 sans valider le code (pas d'oracle), déployée via `deploy-functions.sh` (9 fonctions, 0 obsolète).

## Task Commits

Each task was committed atomically (checkpoints 1-2 = provisioning + décision, sans contenu versionnable propre ; task 3 porte le code) :

1. **Task 3 : Edge gift-list-invite + appel client** - `3fc40f9` (feat, 5 fichiers)

**Plan metadata:** skipped_gitignored — `.planning/` est gitignoré, le commit du SUMMARY a été refusé sans `git add -f` (interdit) ; le fichier est écrit sur disque pour l'orchestrateur.

## Files Created/Modified

- `supabase/functions/gift-list-invite/index.ts` - Edge user-only create/revoke/summary/redeem, OQ-1 OPTION A verrouillée, fail-closed T-05-06
- `app/src/modules/cadeaux/api.ts` - `callGiftInvite` + 4 helpers + `giftInviteLink` (D-16/D-17)
- `app/src/lib/data/supabase-adapter.ts` - HOUSEHOLD_SCOPED + gift_ideas/contact_lists/contacts, exclusion invites documentée
- `app/src/types/database.ts` - `GiftIdeaRow`, `ContactListRow`, `ContactRow`
- `supabase-project/docker-compose.traefik.yml` - wiring prod `GIFT_LIST_INVITE_HMAC_SECRET` (miroir ARDOISE)

## Decisions Made

- **OQ-1 = OPTION A (autorité : réponse checkpoint utilisateur) :** signup-avec-email-invité puis activation du partage ; Edge reste auth user-only, pas d'action publishable, pas de reserve anonyme — T-05-04 reste fermée.
- **Secret live vs prod séparés :** valeur uniquement dans le `.env` + `docker-compose.secrets.yml` locaux (non versionnés) ; seul le *nom* est versionné (`docker-compose.traefik.yml` pour la prod, commentaire de génération/rotation inclus).
- **Realtime vérifiée sans migration :** `gift_ideas`/`contact_lists`/`contacts` déjà publiées par 0076/0077 ; `gift_list_invites` exclue par conception (sans politique, comme `household_invite_tokens`) ; `gift_lists/items/shares` absentes de la publication depuis 0004 — antériorité hors périmètre, signalée sans migration (les `<files>` du plan n'en prévoient aucune).
- **`hasCode: summary.is_active`** (pas de champ dédié en base) : le résumé ne rend jamais l'empreinte, il dit seulement si un code actif existe.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `docker-compose.secrets.yml` local au lieu du seul traefik.yml**
- **Found during:** Task 1 (le runtime recréé n'exposait pas le secret)
- **Issue:** La stack live utilise `COMPOSE_FILE=docker-compose.yml:docker-compose.secrets.yml` (fichier local non versionné, absent du worktree), pas `docker-compose.traefik.yml` — le fichier que l'instruction de reprise nommait n'existe que comme override prod.
- **Fix:** Variable ajoutée au fichier local (miroir exact du pattern ARDOISE, même fichier), `traefik.yml` du worktree édité pour la prod ; miroir temporaire du traefik vers le main pour un recreate intermédiaire, immédiatement restauré (main revérifié identique à sa base).
- **Verification:** `docker exec … env | grep -o "^GIFT_LIST_INVITE_HMAC_SECRET="` → présent ; Edge live 401-sans-oracle.

**2. [Rule 3 - Blocking] `npm ci` dans le worktree avant vérification**
- **Found during:** Task 3 (`tsc: not found`, pas de `node_modules` dans le worktree)
- **Issue:** Le worktree lié ne partage pas le `node_modules` du checkout principal ; typecheck/tests impossibles sans installation.
- **Fix:** `npm ci` strict sur le lockfile (aucun nouveau paquet — hors exclusion Rule 3 qui vise les installs nominatifs).
- **Verification:** typecheck vert, suites exécutées.

---

**Total deviations:** 2 auto-fixed (blocking, sans élargissement du périmètre)

## Issues Encountered

- **Échec calendrier pré-existant :** `calendrier-page.test.tsx > supprime un événement après confirmation` échoue à l'identique sur le checkout principal pristine (7/8 sur main) — hors scope (Rule boundary : fichier non touché par ce plan), à consigner en `deferred-items.md` par l'orchestrateur si suivi voulu. Non corrigé ici.
- **Échange authentifié non rejouable ici :** create/redeem/revoke avec JWT réel exigent une session utilisateur + foyer de test — couverts en code (délégation stricte aux RPC 0079 déjà prouvés 27/27) et reportés en UAT manuelle (cases D1-D3 `pending/human_judgment`).
- **`MAX_USES_DEFAULT = 20`** (pas 10 comme ardoise/household) : aligné sur le défaut 0079 — la base fait foi.

## Threat Flags

T-05-06 (secret dédié, fail-closed `checkSecret`, rotation documentée dans le wiring prod ; preuve live : 401-sans-oracle, pas de signature sans secret) et T-05-07 (Edge user-only + RPC revérifiant propriétaire-OU-admin, redeem n'insère que `reservation` via 0079, jamais d'admin) mitigées. Aucune surface nouvelle hors plan : pas de route publishable, pas de politique RLS ajoutée, table invites toujours sans GRANT client.

## Known Stubs

Aucun. (`fetchGiftListInviteSummary` retourne `null` hors Supabase comme `fetchInviteSummary` ardoise — repli configuré, pas un stub.)
**Note de vérification (pas un stub) :** `BirthdayRow` ne porte pas encore `contact_id` (0078) — antériorité 05-02, aucun code ne le consomme, signalé sans modification.

## User Setup Required

**Prod (exploitant) :** générer un secret dédié (`openssl rand -base64 48` en terminal protégé), l'injecter comme `GIFT_LIST_INVITE_HMAC_SECRET` dans le Vault/secret manager qui alimente le runtime `functions` en production (le wiring `docker-compose.traefik.yml` est déjà en place) ; rotation = invalidation de tous les codes de liste actifs. Ne jamais réutiliser `ARDOISE_HMAC_SECRET` ni `INVITE_TOKEN_HMAC_SECRET`.

## Next Phase Readiness

- Edge déployée et saine sur la stack dev (`gift-list-invite` dans le runtime, `functions` Healthy) ; secret présent.
- Plan 05-04 peut consommer `create/redeem_gift_list_invite` via l'Edge ; UI de partage (écran génération/QR, écran `/invitation/cadeau`) reste à construire sur `callGiftInvite` — hors périmètre de ce plan (pas de routes ajoutées, volontairement).
- UAT manuelle requise : create → QR → signup externe avec e-mail invité → redeem → partage `reservation` visible, puis regen (ancien invalide) et revoke.

## Self-Check

**PASSED** — `supabase/functions/gift-list-invite/index.ts` existe, les 4 fichiers modifiés existent, commit `3fc40f9` présent sur `worktree-agent-p03-1791222864`, typecheck vert, cadeaux 2/2, Edge live 401-sans-oracle, SUMMARY écrit (commit refusé : `.planning/` gitignoré — `skipped_gitignored` explicite, aucun `git add -f`).

---
*Phase: 05-cadeaux-contacts*
*Completed: 2026-10-05*
