# Phase 43: Preuve prod du bridge ardoise (W1) - Context

**Gathered:** 2026-11-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Prouver en production réelle la surface bridge ardoise (Edge `ardoise-invite` action `household-token` → RPC `create_household_bridge_token` service_role → redeem 0181 réconciliant les participations `invite:` → `membre:`) par un script sœur réexécutable `scripts/test-ardoise-bridge-real.sh` — la preuve traverse le chemin HTTP complet, jamais SQL seul, avec consignation datée dans `docs/`. Le périmètre est 100 % dette/fiabilité : aucune surface produit nouvelle. Les exigences PROOF-01..07 (REQUIREMENTS.md) et les décisions STATE.md verrouillent la grande majorité des choix — ce document capture les décisions d'implémentation restantes prises en discussion.
</domain>

<decisions>
## Implementation Decisions

### Négatifs red-team (PROOF-02)
- **D-01:** Le script exécute **4 négatifs**, pas 3 : replay du token consommé, token forgé/muté HMAC, token expiré, cross-household. Le négatif « expiré » attend les **15 minutes réelles** de l'expiration en dur de `create_household_bridge_token` — jamais de falsification SQL de `expires_at` avant redemption (une colonne falsifiée prouverait la mauvaise couche). Le cross-household demande une 2ᵉ fixture foyer. — **Reversibility:** reversible — chaque négatif est une fonction de script indépendante ; en ajouter ou retirer un plus tard ne touche pas le happy path.
- **D-02:** L'ordre des 4 négatifs est **fixe, déterminé une fois pour toutes dans le script**, justifié par un commentaire français à l'endroit de l'ordre (convention dépôt : le code dit la raison en français, pas de directive creuse).
- **D-03:** La conséquence acceptée : le script dure ~20 minutes (attente réelle) et dépend d'une 2ᵉ fixture foyer — c'est un choix assumé de preuve complète contre la vitesse d'exécution.

### Scénario happy path & foyer éphémère (PROOF-01, PROOF-03)
- **D-04:** Composition : **2 comptes e2e** (payeur, membre admin du foyer éphémère + invité), **1 ardoise, 1 dépense** dont l'invité est participant `invite:` via son `guest_ticket` (redeem-guest anonyme, puis authentification du compte invité pour appeler `household-token`). Le chemin minimal qui traverse tout le bridge.
- **D-05:** Contrainte d'ordre non négociable imposée par le code : les participations `invite:` existent **avant** l'émission du token — le remplissage `ardoise_bridge_identities` (0180b) porte sur les guests de l'ardoise présentée pour l'utilisateur demandeur au moment de l'appel `household-token`.
- **D-06:** La redemption foyer de l'invité passe par l'Edge `ardoise-invite` action `join` — le même canal que l'app réelle, qui appelle `redeem_household_invite_token` (0181). **Jamais** d'appel direct du RPC PostgREST : toute la preuve est HTTP de bout en bout (§2.7 A).

### Consignation PROOF-05
- **D-07:** Le **script auto-rédige** lui-même le document daté dans `docs/` à chaque exécution — la consignation ne peut jamais diverger de la sortie du run (verdicts par étape, estampilles). Le document suit la forme `38-E2E-SIGNATURE.md`.
- **D-08:** **Un seul document réécrit** à chaque run : `docs/BRIDGE-ARDOISE-PREUVE.md`, date du run en tête, historique dans git — pas d'accumulation de fichiers datés.
- **D-09:** Le document consigne aussi ce qui **n'est pas** prouvé, incluant une liste explicite des **seams non couverts** par le script (ex. : le dialog de copie du lien, le rendu du panneau invité) — un lecteur sait d'emblée les angles morts (esprit 38-E2E-SIGNATURE : aucun succès muet).

### Critère PROOF-07 — détection du seam client
- **D-10:** Signal **mécanique dans la sortie du script** quand un comportement HTTP s'écarte du chemin emprunté par l'app réelle (statut inattendu, header CORS absent, redirect non suivi), puis **verdict humain** à la lecture tranche si l'e2e navigateur réel du parcours invité est ajouté. — **Reversibility:** reversible — l'heuristique est un ajout local à la fonction de reporting du script.
- **D-11:** Décision de conflit levée en discussion : une **détection navigateur automatique dans le script a été refusée** — elle contredit la décision verrouillée STATE.md « zéro nouveau paquet, zéro nouveau service : W1 = sh + curl -K + psql.sh stdin + lib-smoke-accounts.sh » et déplacerait l'e2e navigateur (périmètre W2) en préventif, ce que PROOF-07 interdit (« déclenché par besoin, jamais préventif »).

### the agent's Discretion
- Nom exact et contenu du fichier de secrets `curl -K` 0600 (la discipline est verrouillée par PROOF-04, pas le nommage).
- Libellés exacts des étapes et du format de sortie du script (attribuabilité : méthode, statut, champs clés, estampille du build — verrouillée par PROOF-01 ; la mise en forme est libre).
- Choix des champs clés affichés pour chaque appel HTTP dans la sortie.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Exigences et conventions de preuve
- `.planning/REQUIREMENTS.md` §Preuve bridge ardoise (W1) — PROOF-01..07 : les exigences verrouillées du script sœur.
- `.planning/ROADMAP.md` §Phase 43 — goal, success criteria 1..5, out-of-scope (pas de staging, pas de négatif SQL seul, foyer éphémère purgé).
- `.planning/STATE.md` §Accumulated Context — décisions du jalon v1.4 : script sœur, zéro nouveau paquet/service, ordre par risque.
- `.planning/milestones/v1.3-phases/38-filet-de-tests-fiable/38-E2E-SIGNATURE.md` — forme imposée de la consignation (ce qui est prouvé, ce qui ne l'est pas, verdict par étape).
- `AGENTS.md` §2.7 — chaîne de vérification, discipline secrets (`curl -K` 0600, jamais argv/env), attribution net._http_response, assertions bornées par foyer.

### Scripts sœurs existants (patrons à imiter)
- `scripts/test-join-token-real.sh` — patron du script sœur « preuve à ressource réelle » (sister convention : un script par preuve).
- `scripts/test-dispatch-push.sh` — patron de l'attribution : dernier `net._http_response` capturé **avant** l'appel, donc le rapport lu est celui de son appel.
- `scripts/lib-smoke-accounts.sh` — comptes e2e avec purge vérifiée (re-delete → 404), réutilisé tel quel.
- `scripts/psql.sh` — lecture d'état après coup par stdin uniquement (§2.7 C : frontière conteneur).

### Surface bridge (code à prouver)
- `supabase/functions/ardoise-invite/index.ts` — actions `household-token` (handler + limite de débit 8), `redeem-guest`, `join` ; `redeem_household_invite_token` n'est appelé que par l'Edge.
- `supabase/migrations/0180_ardoise_bridge_token.sql` et `0180b_ardoise_bridge_fill.sql` — table pont `private.ardoise_bridge_identities` (clé unique (user_id, guest_id)), RPC `create_household_bridge_token` (max_uses=1, expiration 15 min **en dur**, service_role uniquement).
- `supabase/migrations/0181_ardoise_reconciliation.sql` — réconciliation des participations `invite:` → `membre:` à la redemption.
- `AGENTS.md` §2.7 A — le SQL n'est vérifié qu'à l'exécution : la preuve traverse le fil HTTP, la lecture SQL après coup (bornée par foyer, rôle `postgres` avec bornage manuel) ne prouve que l'état final.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/lib-smoke-accounts.sh` : création/purge de comptes e2e vérifiée — réutiliser directement pour les 2 comptes (payeur + invité) et la purge du foyer éphémère.
- `scripts/test-dispatch-push.sh` : le patron d'attribution attribuable (marque avant appel) à transposer au chemin bridge.
- `scripts/test-join-token-real.sh` : structure générale d'une preuve HTTP réelle (happy path + négatifs + teardown) — le script sœur est frère de celui-ci, **pas** une extension inline (PROOF-01).
- `docs/38-E2E-SIGNATURE.md` (v1.3) : gabarit de consignation à copier pour `docs/BRIDGE-ARDOISE-PREUVE.md`.

### Established Patterns
- Convention « un script par preuve à ressource réelle » : sister scripts, jamais d'extension inline du script existant.
- Discipline secrets : uniquement `curl -K` fichier 0600, jamais argv ni env (§2.7 H).
- psql.sh ne traverse la frontière conteneur que par stdin — la lecture de réconciliation bornée par foyer passe par `psql.sh < fichier` (§2.7 C), en `postgres` avec bornage manuel par foyer (AGENTS.md §2.7 D.2).
- Teardown automatique + idempotence : réexécution après déploiement sans accumulation d'artifacts (PROOF-06) — pattern déjà présent dans les scripts sœurs.

### Integration Points
- Edge `ardoise-invite` action `household-token` (rate-limit 8) : l'émission de token par le compte invité authentifié.
- RPC `create_household_bridge_token` : jamais appelé directement par le script (service_role, revoke public) — l'Edge est le seul appelant légitime, c'est ce chemin qu'on prouve.
- Edge `ardoise-invite` action `join` : consommation du token par l'invité, déclenchant la réconciliation 0181.
- `private.ardoise_bridge_identities` : rempli par l'Edge à l'émission, consommé par la redemption — la lecture après coup vérifie la conversion sans duplication ni orphelin.

</code_context>

<specifics>
## Specific Ideas

- Le négatif « token expiré » attend réellement les 15 minutes en dur — la durée du script (~20 min) est un choix assumé de rigueur de preuve, pas un défaut à optimiser.
- La liste des seams non couverts dans la consignation est une exigence de lisibilité : le lecteur de `docs/BRIDGE-ARDOISE-PREUVE.md` doit savoir sans déduction ce que la preuve ne couvre pas.
- Le commentaire français justifiant l'ordre des négatifs dans le script suit la convention dépôt : la raison d'un choix se dit dans le code, pas sous une directive.

</specifics>

<deferred>
## Deferred Ideas

- **W2 (déjà au backlog)** : spec navigateur Playwright du flux bridge complet (dialog → échange → atterrissage) — reste le lieu de l'e2e navigateur si le verdict humain sur le signal PROOF-07 conclut à un seam.
- Aucune idée nouvelle hors périmètre n'est apparue en discussion — la discussion est restée dans le domaine de la phase.

</deferred>

---

*Phase: 43-Preuve prod du bridge ardoise (W1)*
*Context gathered: 2026-11-11*
