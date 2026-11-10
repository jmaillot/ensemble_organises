# Phase 39: Outillage prod de vérification - Pattern Map

**Mapped:** 2026-11-09
**Files analyzed:** 5
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/lib-smoke-accounts.sh` (nouveau, CS-04) | utility (bibliothèque sourcée) | request-response (HTTP Admin GoTrue) | `scripts/seed-test-accounts.sh` | exact (pattern `-K` 0600) |
| `scripts/smoke-test.sh` (modifié, CS-01/CS-02/CS-03) | utility (script d'exécution) | request-response | `scripts/smoke-test.sh` lui-même + `scripts/test-dispatch-push.sh` (refus explicite, purge vérifiée) | exact |
| `scripts/test-join-token-real.sh` (nouveau, JT-01/JT-04) | utility (wrapper run séparé) | request-response + orchestration | `scripts/test-dispatch-push.sh` | exact (run séparé exigeant une ressource réelle) |
| `app/e2e/join-token-real.spec.ts` (nouveau, JT-02) | test (spec e2e Playwright) | request-response (UI + Edge) | `app/e2e/critical-paths.spec.ts` | role-match |
| `app/e2e/critical-paths.spec.ts` (modifié, JT-03 : suppression l.123-140) | test | — | — | suppression, pas de pattern à copier |
| `docs/EXPLOITATION.md` (modifié, DS-03) | doc | — | sections existantes du même fichier (« Bilan de porte », « Sources des checks ») | exact |

Tous les analogs sont vérifiés git-tracked (`git ls-files`).

## Pattern Assignments

### `scripts/lib-smoke-accounts.sh` (utility, request-response)

**Analog:** `scripts/seed-test-accounts.sh` — c'est la SEULE occurrence du dépôt qui prouve l'absence du secret dans `ps` (recherche : §2.7 H).

**Pattern `-K` 0600** (seed-test-accounts.sh l.54-77) — à copier pour TOUS les appels Admin (création, purge, liste) avec `SUPABASE_SECRET_KEY` en tête :
```sh
TMP_DIR=$(mktemp -d)
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT HUP INT TERM

# Un fichier de configuration par identité : l'en-tête `apikey` est public, le
# jeton de session ne l'est pas. `curl -K` les lit sans les exposer dans `ps`.
auth_config() {
  file="$TMP_DIR/auth-$1"
  header_a="apikey: $PUBLISHABLE_KEY"
  header_b="Authorization: Bearer $2"
  {
    printf 'header = "%s"\n' "$header_a"
    printf 'header = "%s"\n' "$header_b"
  } >"$file"
  chmod 600 "$file"
  printf '%s' "$file"
}
```

**Appel HTTP code+corps séparés** (seed-test-accounts.sh l.80-91) — réutiliser la forme `-o body -w '%{http_code'}` pour obtenir code et corps sans les mélanger :
```sh
http() {
  method=$1; url=$2; config=$3; body=${4:-}
  if [ -n "$body" ]; then
    curl -sS -o "$TMP_DIR/body" -w '%{http_code}' -X "$method" "$url" \
      -K "$config" -H 'Content-Type: application/json' --data "$body"
  else
    curl -sS -o "$TMP_DIR/body" -w '%{http_code}' -X "$method" "$url" -K "$config"
  fi
}
```

**Anchorage des chemins sur le script, pas le cwd** (smoke-test.sh l.31-32) :
```sh
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
REPO_DIR="$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)"
```

⚠️ **Violations existantes à corriger dans `smoke-test.sh`, pas dans la bibliothèque :**
- **Secret en argv** (smoke-test.sh l.211-212) — la purge actuelle viole §2.7 H :
```sh
  curl -sS -o /dev/null -X DELETE "$API/auth/v1/admin/users/$uid" \
    -H "apikey: $SECRET_KEY" -H "Authorization: Bearer $SECRET_KEY" 2>/dev/null || true
```
Remplacer par l'appel `-K` + purge vérifiée (re-delete → 404 attendu, §2.7 F).
- **Fallback muet sans secret** (smoke-test.sh l.197) — à transformer en refus `exit 1` (CS-02) :
```sh
  [ -n "$SECRET_KEY" ] || { echo "   (pas de clé secrète : comptes laissés en place)"; return 0; }
```

---

### `scripts/smoke-test.sh` (utility, request-response)

**Analog:** lui-même (structure à préserver) + `test-dispatch-push.sh` (discipline refus/purge).

**Lecture du `.env` sans le sourcer — `stack_value`** (smoke-test.sh l.46-55) — canal unique du secret, à réutiliser dans la bibliothèque :
```sh
stack_value() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$STACK_ENV" \
    | head -n 1 | sed 's/[[:space:]]*$//; s/^"\(.*\)"$/\1/'
}
PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-$(stack_value SUPABASE_PUBLISHABLE_KEY)}"
SECRET_KEY="${SECRET_KEY:-$(stack_value SUPABASE_SECRET_KEY)}"
```

**Outils `call`/`json_string` à réutiliser pour la sonde et l'extraction** (smoke-test.sh l.113-144) :
```sh
call() {
  path="$1"; method="$2"; payload="$3"; bearer="$4"; key="${5:-$PUBLISHABLE_KEY}"
  ...
  response="$(curl -sS -w '\n%{http_code}' -X "$method" "$API$path" \
    -H "apikey: $key" -H 'Content-Type: application/json' -H "$auth_header" \
    ${prefer:+-H "Prefer: $prefer"} \
    ${payload:+--data "$payload"} 2>/dev/null || printf '\n000')"
  CODE="$(printf '%s' "$response" | tail -n 1)"
  BODY="$(printf '%s' "$response" | sed '$d')"
}
json_string() {
  printf '%s' "$1" | sed -n "s/.*\"$2\": *\"\([^\"]*\)\".*/\1/p" | head -n 1
}
```
⚠️ `call` passe `apikey` en argv — acceptable pour la clé **publiable** ; ne JAMAIS y passer `SECRET_KEY` (garder `-K` pour l'Admin).

**Sonde `GET /auth/v1/settings`** (de recherche, Pattern 2) — utilisation directe de `call` + `json_string` :
```sh
call "/auth/v1/settings" GET "" ""
if [ "$(json_string "$BODY" mailer_autoconfirm)" = "false" ]; then
  MODE="admin"   # prod : POST /auth/v1/admin/users, email_confirm: true
else
  MODE="signup"  # stack dev : chemin actuel l.237/l.358
fi
```

**Compteurs ok/ko et rapport de sortie** (smoke-test.sh l.85-101, l.494-505) — préserver inchangés (CS-03 : le parcours 10 étapes ne change pas) :
```sh
ok=0; ko=0
pass() { echo "   ✓ $1"; ok=$((ok + 1)); }
fail() { echo "   ✗ $1" >&2; ko=$((ko + 1)); }
# ... fin :
if [ "$ko" -eq 0 ]; then echo "Parcours de bout en bout : $ok contrôles réussis, aucun échec."; exit 0; fi
echo "Parcours de bout en bout : $ok réussis, $ko échecs." >&2
exit 1
```

**Runid avec entropy** (smoke-test.sh l.172-175) — conserver le `$$` (Pitfall 3 : deux runs au même `date +%s`) ; l'adapter au format EE-01 :
```sh
RUN="$(date +%s)$$"
ALICE_MAIL="alice-$RUN@example.fr"
BOB_MAIL="bob-$RUN@example.fr"
```
→ remplacer `example.fr` par le domaine e2e paramétré (`e2e+$RUN@…`).

**Gestion 422/429 (DS-02)** — modèle du `case` par code avec corps nommé (smoke-test.sh l.240-280) :
```sh
case "$CODE" in
  200|201) ... ;;
  422|400) fail "inscription refusée (code $CODE) : $BODY" ;;
  500)
    # Le corps est ici plus utile que le code — c'est lui qui nomme la cause.
    ...
    ;;
  *) fail "inscription inattendue (code $CODE) : $BODY" ;;
esac
```
Pour l'Admin : 429 → pause fixe + UN retry ; 422 → échec nommé immédiat avec le corps (`email_exists`, `weak_password`…). Jamais de boucle générique.

---

### `scripts/test-join-token-real.sh` (utility, orchestration)

**Analog:** `scripts/test-dispatch-push.sh` — le run séparé qui exige une ressource réelle et « s'arrange à le dire ».

**En-tête qui nomme ce que le script prouve et ne prouve pas** (test-dispatch-push.sh l.1-47) — structure à imiter :
```sh
#!/usr/bin/env sh
# scripts/test-join-token-real.sh
# Spec e2e réelle contre la stack déployée — run séparé, analogue de
# test-dispatch-push.sh pour le push.
#
# CE QUE CE SCRIPT PROUVE, ET CE QU'IL NE PROUVE PAS
#   La suite e2e standard (build+preview, mode démo) ne touche jamais la vraie
#   Edge `household-invite` ni la chaîne JWT réelle. Ce script oui : il crée
#   les comptes via l'Admin GoTrue (bibliothèque smoke), lance la spec, purge.
#
#   Il exige une stack déployée joignable. Sans elle : REFUS explicite, jamais
#   un skip silencieux (JT-03).
#
#   Il ne prouve PAS la traversée par email de l'inscription (aucun accès à la
#   boîte mail du compte e2e) : la traversée D-06 est testée jusqu'au hand-off
#   sessionStorage + navigation, le redeem par login mot de passe.
```

**Refus explicite sans prérequis** (test-dispatch-push.sh l.55-59 et l.222-228) :
```sh
db_require_runtime || exit 1
if ! db_compose ps --status running --services 2>/dev/null | grep -qx "$DB_CONTAINER"; then
  echo "test-dispatch-push.sh: le service '$DB_CONTAINER' n'est pas démarré." >&2
  exit 1
fi
# ...
if [ -z "$ligne" ]; then
  echo "test-dispatch-push.sh: aucun abonnement de push réel sur cette instance." >&2
  echo "  Ouvrir l'application sur un appareil, autoriser les notifications," >&2
  echo "  puis relancer. Un endpoint factice ne prouverait rien." >&2
  exit 1
fi
```
→ équivalent : vérifier `/auth/v1/health` joignable + `SUPABASE_SECRET_KEY` présent, sinon `exit 1` avec les instructions.

**Nettoyage vérifié, pas muet** (test-dispatch-push.sh l.278-296) — le pattern exact de la purge vérifiée CS-02 :
```sh
# Un comptage, pas le statut du DELETE : c'est l'etat de la table qui compte.
reste_a_nettoyer() { ... }
signaler_reste() {
  r="$(reste_a_nettoyer)"
  if [ "$r" = "0" ]; then return 0; fi
  echo "  ÉCHEC         $r ligne(s) de test subsiste(nt) après nettoyage." >&2
  return 1
}
```
→ équivalent Admin : re-delete → 404 attendu (GoTrue répond 200 {} ou 204 au delete réussi) :
```sh
CODE="$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$API/auth/v1/admin/users/$uid" -K "$cfg")"
[ "$CODE" = 200 ] || [ "$CODE" = 204 ] || fail "..."
CODE2="$(re-delete)"; [ "$CODE2" = 404 ] || fail "purge non prouvée (re-delete: $CODE2)"
```

**Trap de sortie avec signalement** (test-dispatch-push.sh l.299) :
```sh
trap 'nettoyer; signaler_reste >&2 || true' EXIT
```

**Exit code exact de la spec** (squelette recommandé, recherche Pattern 3) :
```sh
. "$SCRIPT_DIR/lib-smoke-accounts.sh"
RUN_ID="$(date +%s)-$$"
eval "$(smoke_accounts_create "$RUN_ID" 2)"   # exporte E2E_JOIN_* (publiques/éphémères) — JAMAIS la clé secrète
E2E_BASE_URL="$FRONT_URL" npx --prefix app playwright test e2e/join-token-real.spec.ts --project=chromium
SPEC_STATUS=$?
smoke_accounts_purge "$RUN_ID"                # purge vérifiée, re-delete → 404 attendu
exit $SPEC_STATUS
```
⚠️ `--project=chromium` obligatoire (Pitfall 4 : la config définit chromium ET mobile, l.22-25 de playwright.config.ts — un run sans projet lancerait la spec 2×).

---

### `app/e2e/join-token-real.spec.ts` (test, request-response)

**Analog:** `app/e2e/critical-paths.spec.ts` (structure de test + sélecteurs UI réels).

**Structure de test** (critical-paths.spec.ts l.123-132 — le test foyer/token, style à conserver ; les 2 tests l.123-140 sont les périmés à supprimer de CE fichier, l.134-140 teste le mode démo, anti-feature JT-02) :
```typescript
test('créer un foyer génère un token copiable et un QR code', async ({ page }) => {
  await page.goto('/foyer/nouveau');
  await page.getByLabel('Nom du foyer').fill('Foyer de test');
  await page.getByRole('button', { name: 'Créer mon foyer' }).click();
  await expect(page.getByRole('heading', { name: 'Votre foyer est prêt' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'QR code du token d’invitation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copier' })).toBeVisible();
});
```

**Config Playwright — le switch du run séparé existe déjà** (playwright.config.ts l.4, l.22-25, l.26-33) — la spec ne change rien à la config ; le wrapper passe `E2E_BASE_URL` :
```typescript
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
// ...
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'mobile', use: { ...devices['Pixel 7'] } },
],
webServer: process.env.E2E_BASE_URL
  ? undefined   // ← stack déployée : pas de webServer build+preview
  : { command: `npm run build && npm run preview -- --port ${PORT} --strictPort`, ... },
```
⚠️ `expect: { timeout: 8_000 }` (l.14) — pour la navigation D-09 (délai `DELAI_ATERRISSAGE_MS = 3000`), `waitForURL` avec timeout explicite > 3000 ms (Pitfall 7).

**Le pattern de gating à NE PAS imiter** (offline-shared-device.spec.ts l.30-38, cité comme contre-modèle JT-03) :
```typescript
const userAEmail = process.env.E2E_SHARED_USER_A_EMAIL;
// ...
const skipReason = 'Deux comptes réels ... requis ...';
test.skip(!userAEmail || !userAPassword || !userBEmail || !userBPassword, skipReason);
```
→ La spec réelle **échoue** (fail) sans `E2E_JOIN_TOKEN`/`E2E_BASE_URL` — le gating vit dans le wrapper, qui refuse de lancer sans stack. Aucun `test.skip` conditionnel.

**Sélecteurs du flux réel** (join-household-page.tsx) — repères DOM à utiliser :
- Message uniforme D-03/D-17 : `<p role="alert">` (l.185, l.215) → `page.getByRole('alert')`
- Atterrissage D-09 : `window.setTimeout(() => navigate('/foyer'), DELAI_ATERRISSAGE_MS)` (l.160, `DELAI_ATERRISSAGE_MS = 3000` l.47) → assert message alert d'abord, puis `waitForURL('/foyer')` timeout > 3000
- Traversée D-06 : token en sessionStorage AVANT navigation (l.125) → assertion via `page.evaluate(() => sessionStorage.getItem(...))`

**Entrées de la spec** — uniquement des variables publiques/éphémères transmises par le wrapper : `E2E_BASE_URL`, `E2E_JOIN_TOKEN`, `E2E_JOIN_EMAIL`, `E2E_JOIN_PASSWORD`, `E2E_JOIN_INVITER_NAME`. Jamais `SUPABASE_SECRET_KEY` dans le processus Node (JT-04, §2.7 H).

---

### `docs/EXPLOITATION.md` (doc, DS-03)

**Analog:** sections existantes du même fichier — style : titre de section avec référence d'exigence, justification §2.7-x, commande exacte en bloc `sh`.

Exemple du style à copier (« Bilan de porte ») : titre `## … (phase 28, OPS-02)`, corps qui nomme ce que la vérification prouve et ne prouve pas, commandes littérales. Nouvelle section proposée :
```markdown
## Smoke-test prod (phase 39, SMOKE-01 / TEST-02)

### Quand le lancer
- Avant chaque release ; après tout changement touchant GoTrue, l'auth ou la RLS.

### Ce qu'il prouve (et ne prouve pas)
- La chaîne JWT/RLS réelle en conditions prod (autoconfirm=false) : création
  via Admin API, `email_confirm: true`, ENABLE_EMAIL_AUTOCONFIRM resté false.
- La purge vérifiée (re-delete → 404) et la détection de comptes résiduels.
- Il ne prouve PAS ... (bornage email de la spec).

### Comment le lancer
    sh scripts/smoke-test.sh          # parcours complet
    sh scripts/test-join-token-real.sh   # spec e2e réelle (run séparé)

### Comment lire son rapport
- `✓` = contrôle réussi ; `✗` = échec nommé avec le corps ; exit ≠ 0 = échec.
- Un « comptes laissés en place » ne doit plus exister : sans secret, le script refuse (CS-02, §2.7 F).
```

---

## Shared Patterns

### Secrets jamais en argv (§2.7 H)
**Source:** `scripts/seed-test-accounts.sh` l.58-77
**Apply to:** tout appel portant `SUPABASE_SECRET_KEY` dans lib-smoke-accounts.sh et smoke-test.sh (création, purge, liste) — et corriger l'occurrence existante smoke-test.sh l.211-212.
```sh
{ printf 'header = "apikey: %s"\n' "$SECRET_KEY"; printf 'header = "Authorization: Bearer %s"\n' "$SECRET_KEY"; } >"$file"
chmod 600 "$file"
# curl -sS ... -K "$file"
```

### Purge vérifiée — un succès muet est un échec inexpliqué (§2.7 F)
**Source:** `scripts/test-dispatch-push.sh` l.278-296 (comptage de l'état, pas statut du DELETE) + recherche Pattern 4 (re-delete → 404)
**Apply to:** cleanup de smoke-test.sh et purge du wrapper.

### Refus explicite sans prérequis, jamais de skip silencieux
**Source:** `scripts/test-dispatch-push.sh` l.55-59, l.222-228 ; contre-modèle `app/e2e/offline-shared-device.spec.ts` l.38
**Apply to:** wrapper (refus sans stack/secret) et spec réelle (échec, pas `test.skip`).

### Rapport pass/fail avec corps nommé
**Source:** `scripts/smoke-test.sh` l.88-101, l.240-280 (`case` par code, corps affiché)
**Apply to:** création admin (422/429 distingués : 429 → pause fixe + 1 retry, 422 → échec immédiat).

### Extraction JSON sans dépendance
**Source:** `scripts/smoke-test.sh` l.138-144 (`json_string`/`json_number`)
**Apply to:** tous les corps GoTrue (id, access_token, mailer_autoconfirm).

### Runid avec entropy
**Source:** `scripts/smoke-test.sh` l.172 (`RUN="$(date +%s)$$"`)
**Apply to:** emails `e2e+<runid>@<domaine>` (EE-01) et identifiants de semure.

## No Analog Found

Aucun — tous les livrables ont un analog exact ou role-match dans le dépôt. Seule nouveauté conceptuelle : l'appel `POST /auth/v1/admin/users` (création admin) n'existe pas encore dans le code, mais son pattern de transport (`-K` 0600) et son pattern de réponse (`call` + `json_string`) sont intégralement couverts par les analogs ci-dessus ; le comportement GoTrue est vérifié dans 39-RESEARCH.md (Context7 /supabase/auth).

## Metadata

**Analog search scope:** `scripts/`, `app/e2e/`, `app/playwright.config.ts`, `docs/`
**Files scanned:** 8 (smoke-test.sh, seed-test-accounts.sh, test-dispatch-push.sh, critical-paths.spec.ts, playwright.config.ts, offline-shared-device.spec.ts, join-household-page.tsx, EXPLOITATION.md)
**Pattern extraction date:** 2026-11-09
