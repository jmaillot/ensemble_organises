# Phase 43: Preuve prod du bridge ardoise (W1) - Pattern Map

**Mapped:** 2026-11-11
**Files analyzed:** 2 (script sœur + doc de consignation auto-rédigé)
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/test-ardoise-bridge-real.sh` | test (script de preuve e2e réel, POSIX sh) | request-response (HTTP curl) + file-I/O (curl -K 0600, psql stdin) | `scripts/test-join-token-real.sh` | exact (sœur structurelle) |
| `docs/BRIDGE-ARDOISE-PREUVE.md` (auto-rédigé par le script) | doc de consignation | transform (sortie run → doc réécrit) | `.planning/milestones/v1.3-phases/38-filet-de-tests-fiable/38-E2E-SIGNATURE.md` | role-match |

⚠️ **Correction de chemin** : CONTEXT cite `docs/38-E2E-SIGNATURE.md` — ce fichier **n'existe pas** à la racine de `docs/`. La copie canonique (versionnée, vérifiée `git ls-files`) est `.planning/milestones/v1.3-phases/38-filet-de-tests-fiable/38-E2E-SIGNATURE.md`. C'est elle que le nouveau doc imite ; le livrable, lui, vit bien dans `docs/BRIDGE-ARDOISE-PREUVE.md` (D-08).

Analogues secondaires cités dans le script :
- `scripts/lib-smoke-accounts.sh` — sourcé tel quel (comptes e2e + purge), pattern `curl -K` 0600.
- `scripts/psql.sh` — lecture d'état après coup **par stdin uniquement**.
- `scripts/test-dispatch-push.sh` — **patron d'en-tête « CE QUE CE SCRIPT PROUVE »** uniquement ; sa sonde `net._http_response` est **hors sujet** ici (aucun pg_net sur le chemin bridge — RESEARCH Summary §2).

## Pattern Assignments

### `scripts/test-ardoise-bridge-real.sh` (test, request-response HTTP)

**Analog principal :** `scripts/test-join-token-real.sh` (301 l., structure intégralement transposable)

**1. En-tête « CE QUE CE SCRIPT PROUVE ET CE QU'IL NE PROUVE PAS »** (l.8-28) — copier la forme verbatim, adapter au bridge :

```sh
# CE QUE CE SCRIPT PROUVE, ET CE QU'IL NE PROUVE PAS
#   La suite e2e standard tourne en mode démonstration ... : elle prouve le UI, pas la chaîne réelle.
#   Il ne prouve PAS ...
#   C'est l'analogue de `test-dispatch-push.sh` pour l'application : un run
#   séparé, documenté, qui exige une ressource réelle (stack déployée) et qui
#   REFUSE sans elle — jamais de skip silencieux.
```
Pour la phase 43 : prouve le fil HTTP bridge (household-token → redeem → réconciliation) ; ne prouve PAS le dialog de copie du lien, le rendu du panneau invité, l'e2e navigateur (W2) — ces exclusions alimentent directement la section D-09 du doc de consignation.

**2. Lecture du .env sans sourcer + refus nommé sans stack** (l.52-114) :

```sh
stack_value() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$STACK_ENV" \
    | head -n 1 | sed 's/[[:space:]]*$//; s/^"\(.*\)"$/\1/'
}
# ... sonde santé (l.101-114) :
health_code="$(curl -sS -o /dev/null -w '%{http_code}' "$API/auth/v1/health" \
  -H "apikey: $PUBLISHABLE_KEY" 2>/dev/null || printf '000')"
if [ "$health_code" != "200" ]; then
  echo "test-join-token-real.sh: la stack ne répond pas ..." >&2
  exit 1   # refus, jamais de skip (JT-03)
fi
```

**3. Sourcing de lib-smoke-accounts + contrat d'appel** (l.116-135) :

```sh
. "$SCRIPT_DIR/lib-smoke-accounts.sh"
SMOKE_API="$API"
SMOKE_STACK_ENV="$STACK_ENV"
SMOKE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY"
SMOKE_ACCOUNT_PASSWORD="$PASSWORD"
RUN_ID="$(date +%s)-$$"
smoke_accounts_init
```
La phase 43 a **2 comptes** (payeur admin du foyer éphémère + invité), même procédé que les 2 comptes des l.215-232 (`smoke_accounts_create "$RUN_ID" 1 "$INVITER_NAME"` puis `smoke_accounts_session ...` → `SMOKE_SESSION_JWT`).

**4. trap EXIT cleanup avec purge vérifiée** (l.143-206) — à transposer : purge du foyer éphémère (`DELETE FROM public.households` via psql.sh stdin, cascade A1) **+** `smoke_accounts_purge "$RUN_ID"` (re-delete → 404 exigé, l.184-196) **+** `smoke_accounts_tmp_clean` ; `exit 1` si purge incomplète (`PURGE_KO`), le code de sortie de la spec est préservé (l.199-204).

**5. Appel Edge avec session JWT** (l.252-266 — modèle pour `household-token` et `household-invite redeem`) :

```sh
tresp="$(curl -sS -w '\n%{http_code}' -X POST "$API/functions/v1/household-invite" \
  -H "apikey: $PUBLISHABLE_KEY" -H "Authorization: Bearer $INVITER_JWT" \
  -H 'Content-Type: application/json' \
  --data "{\"action\":\"create\",\"householdId\":\"$HOUSEHOLD_ID\",\"expiresAt\":\"$(date -u -d '+1 day' +%Y-%m-%dT%H:%M:%SZ)\"}" 2>/dev/null \
  || printf '\n000')"
tcode="$(printf '%s' "$tresp" | tail -n 1)"
tbody="$(printf '%s' "$tresp" | sed '$d')"
TOKEN="$(printf '%s' "$tbody" | sed -n 's/.*"token": *"\([^"]*\)".*/\1/p' | head -n 1)"
```
⚠️ Pour la phase 43, durcir ce pattern selon RESEARCH Code Examples : le **corps porte un secret** (token brut, code ardoise) → écrire le corps dans un fichier 0600 et passer `--data @"$corps"` (le `--data "…"` inline du l.255 ne convient **pas** pour le token bridge, bien que le token soit éphémère — la discipline §2.7 H s'applique, RESEARCH Code Examples l.210-215). Extraire les champs par `sed -n` (`smoke_json_string`, lib l.53-55) — **jamais jq** (zéro nouveau paquet, STATE.md).

**6. Ligne de sortie attribuable par appel (PROOF-04/PROOF-01)** — nouveau pattern local au script, à ajouter comme fonction helper (aucune sœur ne l'a sous cette forme ; RESEARCH Pattern 2) :

```sh
# ÉTAPE n | POST <url> | HTTP <statut> | champs clés (jamais un secret) | estampille
```
**Ne PAS répliquer** la fenêtre `net._http_response` de `test-dispatch-push.sh` : ce patron porte sur pg_cron/pg_net, hors du chemin bridge (RESEARCH Summary §2, Pitfall 2). L'estampille vient de `GET $E2E_BASE_URL/version.json` (canal officiel, `app/nginx.conf:54`).

**Extrait des secrets `curl -K` 0600** — source `scripts/lib-smoke-accounts.sh:105-117`, réutiliser `smoke_admin_config` tel quel et produire les fichiers headers de session dans le même répertoire :

```sh
smoke_admin_config() {
  ...
  file="$SMOKE_LIB_TMP/admin-headers"
  {
    printf 'header = "apikey: %s"\n' "$SMOKE_SECRET_KEY"
    printf 'header = "Authorization: Bearer %s"\n' "$SMOKE_SECRET_KEY"
  } >"$file"
  chmod 600 "$file"
}
```

**7. Lecture d'état après coup bornée par foyer** — source `scripts/psql.sh:1-15` (contrat stdin) + RESEARCH Code Examples l.230-247 :

```sh
sh scripts/psql.sh < "$SMOKE_LIB_TMP/verif-reconciliation.sql"
```
```sql
-- postgres, bornage manuel par foyer (§2.7 D.2 — la RLS ne borne pas postgres) :
select count(*) as guests_restants
  from public.expense_participants ep
  join public.expenses e on e.id = ep.expense_id
 where e.household_id = :'foyer'
   and ep.participant_type = 'guest'
   and ep.guest_id in (select guest_id from private.ardoise_bridge_identities
                        where household_id = :'foyer');   -- attendu 0
-- ⚠️ Capter les identifiants du pont AVANT le redeem (RESEARCH l.249) :
-- la table pont est purgée par la redemption, sinon l'assert est tautologique.
```
Règles SQL : `select` uniquement en lecture (jamais `--rollback` nécessaire), chaque assert borné `household_id = foyer du run`, chaque assert peut échouer (pas de `count(*) >= 0`, §2.7 D.3). DML purge du foyer : `DELETE FROM public.households WHERE id = :'foyer'` (cascade).

---

### `docs/BRIDGE-ARDOISE-PREUVE.md` (doc de consignation auto-rédigé)

**Analog :** `.planning/milestones/v1.3-phases/38-filet-de-tests-fiable/38-E2E-SIGNATURE.md` (89 l.)

Structure à copier (le **script** la génère par heredoc/printf à chaque run, D-07/D-08 — un seul fichier réécrit) :

1. **En-tête daté** (l.1-7) : `# BRIDGE-ARDOISE-PREUVE — Preuve prod du bridge ardoise (phase 43)` / `**Run du :** <date>` / `**Exigences couvertes :** PROOF-01..07` — remplacer « Référence avant-phase » par l'estampille du build (`/version.json`).
2. **§1 « Chaîne, dans l'ordre, chaque étape citée »** (l.10-19) : table `| # | Étape | Appel HTTP | Statut | Champs clés |` — chaque ligne du doc cite la ligne de sortie correspondante du script (Pitfall 8 : aucun verdict sans sa preuve).
3. **§2 Négatifs** (analog §2 « Signature e2e ») : les 4 négatifs D-01 avec statut **et message** épinglés (410 « épuisé » / 404 « inconnu » / 410 « expiré » / borne cross-household) — cf. RESEARCH l.111-114.
4. **§3 Lecture SQL après coup** : résultats bornés par foyer cités avec chiffres.
5. **§4 « Ce qui n'est PAS prouvé »** (D-09) — section explicite listant les seams : dialog de copie du lien, rendu du panneau invité, estampille Edge (A4 : pas de canal dédié), e2e navigateur W2, l'heuristique PROOF-07 est un signal D-10 à verdict humain.
6. **§5 Verdict + Self-Check** (l.64-88) : verdict global, mention que l'attribution PROOF-04 est satisfaite par la sortie curl par appel (OQ-3), self-check purge (comptes re-delete → 404, foyer → 0 lignes).

Style : français, aucune affirmation non vérifiée (§2.7 I), chaque chiffre cite sa source de sortie.

## Shared Patterns

### Discipline des secrets (§2.7 H)
**Source:** `scripts/lib-smoke-accounts.sh:105-117` (pattern `smoke_admin_config`)
**Apply to:** tout appel HTTP du script — clés et JWT uniquement dans fichiers `curl -K` 0600 sous `mktemp -d` nettoyé au trap EXIT ; corps porteurs de token au même régime (`--data @fichier`) ; **jamais** argv/env ; jamais de valeur secrète imprimée dans la sortie ni le doc.

### Refus nommé, jamais de skip silencieux (§2.7 F)
**Source:** `scripts/test-join-token-real.sh:101-114` (sonde santé) et `:184-196` (purge vérifiée re-delete → 404)
**Apply to:** sonde santé en tête, purge en trap EXIT — un échec est une cause nommée sur stderr, le script sort non-nul au premier verdict rouge.

### Frontière conteneur par stdin (§2.7 C)
**Source:** `scripts/psql.sh:9-19`
**Apply to:** toute lecture/purge SQL — `sh scripts/psql.sh < fichier.sql` ; jamais `-f` avec un chemin hôte ; les utilitaires du script qui résolvent un contexte détournent `< /dev/null` leur propre stdin.

### Bornage manuel des assertions SQL (§2.7 D.2/D.3)
**Source:** RESEARCH Code Examples l.230-247
**Apply to:** chaque requête après coup porte `household_id = :'foyer'` (rôle postgres) ; capter les identifiants du pont **avant** le redeem ; aucune tautologie.

### Extraction JSON par sed, zéro nouveau paquet
**Source:** `scripts/lib-smoke-accounts.sh:53-55` (`smoke_json_string`)
**Apply to:** extraction de `token`, `household_id`, `guest_ticket`, `ardoise_id` — jamais jq (STATE.md).

### Convention « un script par preuve »
**Source:** `test-join-token-real.sh` / `test-dispatch-push.sh` (sœurs existantes)
**Apply to:** `test-ardoise-bridge-real.sh` est **frère**, jamais une extension inline (PROOF-01) ; commentaire français justifiant chaque choix verrouillé, notamment l'**ordre fixe des 4 négatifs** (D-02).

### Rate-limit budget (anti-429)
**Source:** RESEARCH Pitfall 3 / `ardoise-invite/index.ts:251`, `household-invite/index.ts:220-226` (LIMITS = 8/min/IP sur les actions du chemin)
**Apply to:** espacer ou grouper les appels d'une même action ≤ 8/min ; un 429 inattendu est un signal D-10, pas un verdict.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `docs/BRIDGE-ARDOISE-PREUVE.md` (génération par le script) | doc auto-rédigé | transform | Aucune sœur n'auto-rédige un doc : `38-E2E-SIGNATURE.md` en est la **forme** mais a été écrit à la main. Le planner définit la fonction de reporting du script (printf/heredoc, verdicts + estampille + seams) à partir de la structure du gabarit — c'est un pattern nouveau, borné par D-07/D-08/D-09 et la forme du gabarit. |
| Négatif « attente réelle 15 min » | test | event (temps) | Aucun script du dépôt n'attend une expiration réelle ; la marge recommandée est +120 s (RESEARCH A3). Pattern nouveau, à spécifier au plan. |

## Metadata

**Analog search scope:** `scripts/`, `.planning/milestones/v1.3-phases/38-filet-de-tests-fiable/`, `docs/`
**Files scanned:** 6 (4 scripts + 1 gabarit + vérification `git ls-files` sur tous les chemins nommés — tous versionnés, aucun miroir gitignored)
**Pattern extraction date:** 2026-11-11
**Correction matérielle reprise de RESEARCH:** canal de redemption = Edge `household-invite` action `redeem` (D-06 corrigé) ; PROOF-04 = sortie curl par appel, pas `net._http_response`.
