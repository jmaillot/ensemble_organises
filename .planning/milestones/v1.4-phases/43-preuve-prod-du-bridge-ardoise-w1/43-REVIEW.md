---
phase: 43-preuve-prod-du-bridge-ardoise-w1
reviewed: 2026-11-11T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - scripts/test-ardoise-bridge-real.sh
  - scripts/lib-smoke-accounts.sh
  - docs/BRIDGE-ARDOISE-PREUVE.md
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 43: Code Review Report

**Reviewed:** 2026-11-11
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Revue du script de preuve prod `scripts/test-ardoise-bridge-real.sh` (1021 lignes, POSIX sh), de la modification de `scripts/lib-smoke-accounts.sh` (retry borné 5xx sur la purge) et du doc auto-rédigé `docs/BRIDGE-ARDOISE-PREUVE.md`.

Le script est globalement très solide : la discipline secrets (`curl -K` 0600, `--data @fichier`, mktemp nettoyé au trap EXIT, zéro secret dans argv/env) est appliquée de façon cohérente ; les lectures/purge SQL passent toutes par `psql.sh < fichier` (stdin uniquement, §2.7 C) avec variables psql `:'var'` — aucune interpolation de chaîne ; chaque assert SQL est borné par foyer et porteur d'un attendu exact (pas de tautologie, §2.7 D) ; les échecs sont nommés (`rouge`, `neg_verdict KO`, refus d'estampille) ; le piège de sous-shell `config_session` est corrigé et commenté à l'endroit exact ; les commentaires français nomment les raisons. Aucun secret dur (la constante `PASSWORD` est un mot de passe jetable e2e, cohérent avec la lib), aucun appel direct aux RPC service_role, aucun linter directive, aucun debug artifact.

Deux défauts réels ont néanmoins été prouvés sur la sortie du run réel (doc versionné) : la pagination de `smoke_accounts_list` boucle sur une page clampée et duplique les résidus, et l'échec de la sonde résiduelle est silencieux dans le trap (§2.7 F).

## Critical Issues

_Aucun._

## Warnings

### WR-01: `smoke_accounts_list` duplique les comptes résiduels — pagination clampée jamais détectée

**File:** `scripts/lib-smoke-accounts.sh:279-293`
**Issue:** La boucle de pagination s'arrête uniquement quand une page est **vide** (`trouves == 0`). Quand la page demandée dépasse la dernière, l'Admin GoTrue clamp sur la dernière page (ou renvoie le même ensemble) au lieu de renvoyer une page vide : `trouves > 0` à chaque itération, la boucle court jusqu'au plafond `page -le 20` en ré-accumulant la même page. Prouvé sur le run réel versionné : `docs/BRIDGE-ARDOISE-PREUVE.md` §5 liste chaque email résiduel **exactement deux fois** (`e2e+1794223918703512-2@…`, `-1@…`, `e2e+1794223911703118-1@…` ×2 chacune). Effets : doc pollué (fausse impression de 6 résidus au lieu de 3), 20 requêtes Admin systématiques même quand tout est propre, et jusqu'à 20× de duplication si les résidus dépassent 50. Aucun résidu n'est raté (le filtre est additif), mais un instrument de signal qui compte double est un instrument au rapport mensonger (§2.7 F).
**Fix:** Détecter la répétition de page ou utiliser le total annoncé. Forme minimale sans dépendance aux en-têtes :

```sh
    cat "$SMOKE_LIB_TMP/page-emails" >>"$emails"
    [ "${trouves:-0}" -gt 0 ] 2>/dev/null || break
    # Page clampée = la page suivante renverrait la même liste : arrêt immédiat.
    if cmp -s "$SMOKE_LIB_TMP/page-emails" "$SMOKE_LIB_TMP/page-precedente" 2>/dev/null; then
      break
    fi
    cp "$SMOKE_LIB_TMP/page-emails" "$SMOKE_LIB_TMP/page-precedente"
```
(ou dédupliquer en fin de boucle : `sort -u "$emails"` avant le filtre `e2e+*`).

### WR-02: Échec de la sonde résiduelle silencieux dans le trap — succès muet (§2.7 F)

**File:** `scripts/test-ardoise-bridge-real.sh:452-456`
**Issue:** Dans `cleanup`, l'appel résiduel est gardé par un test qui avale l'échec :

```sh
if residus="$(smoke_accounts_list 2>/dev/null)" && [ -n "$residus" ]; then
```

Si `smoke_accounts_list` échoue (5xx Admin, stack qui s'arrête pendant le teardown), la fonction retourne 1, `RESIDUS` reste vide, et **aucune ligne ne le dit** : la détection « pas de résidu » est produite par une sonde qui n'a rien vu, précisément le motif « un contrôle qui ne regarde rien » (§2.7 B/F). Le `2>/dev/null` supprime en plus le message d'erreur nommé de la lib (`lib-smoke-accounts: liste des utilisateurs impossible (code N)`). Ce n'est pas `purge_ko` (choix défendable — EE-02 est un signalement, pas une obligation de suppression), mais le **silence** sur l'échec du contrôle viole la règle du dépôt.
**Fix:** Distinguer échec et vide, nommer l'échec :

```sh
  RESIDUS=''
  if residus="$(smoke_accounts_list)"; then
    if [ -n "$residus" ]; then
      RESIDUS="$residus"
      echo "   ! comptes e2e résiduels hors de ce run (à traiter à la main) :" >&2
      printf '     %s\n' "$residus" >&2
    fi
  else
    echo "   ! détection résiduelle impossible (voir l'erreur lib ci-dessus) — signalée, non muette" >&2
  fi
```

## Info

### IN-01: `CODE_B` capturé sans validation de non-vide

**File:** `scripts/test-ardoise-bridge-real.sh:913`
**Issue:** Toutes les autres captures (code ardoise l.649, guest_ticket l.669, token l.734…) sont validées `if [ -z … ]` avec un `rouge` nommé ; `CODE_B` (l.913) ne l'est pas. Un code vide produirait un 400/410 à l'étape 16, attrapé par le check de statut — donc pas de succès muet — mais avec un diagnostic moins précis (incohérence de style de capture dans un script dont la thèse est l'échec nommé).
**Fix:** Ajouter après la capture :
```sh
if [ -z "$CODE_B" ]; then
  rouge "create (2ᵉ foyer) : code brut non capturé"
  exit 1
fi
```

### IN-02: Mutation du token muté — cas limite `X…Y`

**File:** `scripts/test-ardoise-bridge-real.sh:812-815`
**Issue:** `sed 's/^./X/'` puis repli `sed 's/.$/Y/'` si égalité. Un token de la forme `X…Y` dont le premier caractère est `X` et le dernier `Y` repartirait **inchangé** des deux mutations : le « négatif muté » re-présenterait le token réel et échouerait en 410 « révoqué » au lieu de 404 — rouge nommé (pas de succès muet), mais un faux négatif de couverture. Probabilité ~1/2048 par run.
**Fix:** Boucler sur une mutation garantie : remplacer un caractère par un chiffre à une position calculée (`i = ${#token} / 2`), ou vérifier `token_mute != BRIDGE_TOKEN` après le second essai et muter un 3ᵉ caractère sinon.

### IN-03: Mot de passe e2e passé en argv de curl (`--data`)

**File:** `scripts/lib-smoke-accounts.sh:174-179, 321-324`
**Issue:** `smoke_accounts_create` et `smoke_accounts_session` passent le corps (contenant le mot de passe) via `--data "$body"` en argv, visible dans `ps` pendant l'appel — la lib pose elle-même en commentaire (l.106) que `-K` est « la seule forme du dépôt qui prouve l'absence du secret dans `ps` ». La valeur est un mot de passe jetable **hardcodé et public** dans le dépôt (`test-ardoise-bridge-real.sh:135`, lib l.169), donc l'exposition réelle est nulle — c'est l'incohérence de principe avec la discipline affichée qui est notée, pas une fuite.
**Fix:** Si le principe doit tenir, écrire le corps JSON de création/session dans un fichier 0600 et passer `--data @fichier`, même régime que les corps porteurs de token dans le script principal.

### IN-04: `get_json` avale la cause curl sur un échec réseau

**File:** `scripts/test-ardoise-bridge-real.sh:219-220`
**Issue:** `post_json` imprime `curl-err` quand le statut est 000 (l.211-213, « un échec réseau n'est jamais muet ») ; `get_json` redirige le même fichier mais ne le relit jamais. Un `GET ardoise_guests` qui tombe réseau donnerait un 000 sans cause affichée — l'échec serait nommé (statut ≠ 200 → rouge) mais son diagnostic perdu.
**Fix:** Dupliquer la garde de `post_json` :
```sh
code="$(http_code_ou_000 … 2>"$SMOKE_LIB_TMP/curl-err")"
[ "$code" = "000" ] && [ -s "$SMOKE_LIB_TMP/curl-err" ] && cat "$SMOKE_LIB_TMP/curl-err" >&2
```

### IN-05: Branches mortes dans `post_json` (config/corps vides jamais exercées)

**File:** `scripts/test-ardoise-bridge-real.sh:203-209`
**Issue:** Les branches `elif [ -n "$config" ]` (POST sans corps) et `else` (POST sans `-K`) ne sont appelées par aucun site d'appel : tous les `post_json` du script passent config **et** corps. Le chemin `else` avec corps vide exécuterait `--data @""` en erreur. Code mort qui gonfle la surface à relire sans couverture d'exécution.
**Fix:** Réduire à la branche réellement utilisée (config + corps) et refuser nommément les autres combinaisons, ou supprimer les branches inexercées.

---

## Points vérifiés et conformes (non-findings)

- **Secrets (§2.7 H, T-43-01)** : `grep` sur `sb_secret`/JWT/`Bearer` dans les 3 fichiers et dans le doc versionné → rien ; le doc ne contient que des UUID métier et des lignes HTTP. La clé secrète ne sort du `.env` que vers des fichiers `curl -K` 0600 dans `mktemp -d` supprimé au trap.
- **psql stdin (§2.7 C)** : les 4 sites d'appel (`427`, `434`, `470`, `981`) utilisent tous `<fichier.sql` avec `</dev/null` évité — le piège stdin est corrigé et commenté à l'endroit (l.423-426).
- **Asserts bornés (§2.7 D)** : chaque lecture porte `household_id = :'foyer'` (ou `:'foyer_b'`), les bornes guest viennent de la capture pré-redeem (l.711-718), attendus exacts (0/1), aucun `>= 0` ni tautologie.
- **Pas de falsification SQL** : aucun `expires_at` modifié ; attente réelle `sleep 1020` (l.853), conforme à la décision D-01/D-03.
- **Budget rate-limit** : espacement `attend_budget` entre chaque appel `redeem`/`household-token`/`redeem-guest` répété ; les appels ardoise-invite `create-ardoise`/`create` de même minute (étapes 14-15) portent des buckets distincts (10/min vs 20/min) — pas de dépassement.
- **Chaîne de vérification exécutée** : `bash -n` du script — OK ; `grep` linter-directives/TODO/FIXME — rien ; doc réécrit daté run 10 avec les 5 sections exigées et verdict VERT cité.

---

_Reviewed: 2026-11-11T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
