---
phase: 39-outillage-prod-de-v-rification
reviewed: 2026-11-09T00:00:00Z
depth: deep
files_reviewed: 7
files_reviewed_list:
  - scripts/lib-smoke-accounts.sh
  - scripts/smoke-test.sh
  - scripts/test-join-token-real.sh
  - app/e2e/join-token-real.spec.ts
  - app/e2e/critical-paths.spec.ts
  - app/playwright.config.ts
  - docs/EXPLOITATION.md
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 39 : Code Review Report

**Reviewed:** 2026-11-09
**Depth:** deep
**Files Reviewed:** 7
**Status:** issues_found

## Summary

La phase livre un outillage smoke solide sur le plan de la discipline des secrets : le secret ne circule que via fichier `curl -K` en 0600 (aucune occurrence `-H … SECRET_KEY` en argv, garde vérifié), la purge est prouvée par re-delete → 404 exigé, les 422/429 sont distingués, la spec réelle ne contient aucun skip conditionnel, les verbatims D-03/D-17 de la spec correspondent au code source réel, et `--project=chromium` est bien épinglé dans le wrapper.

Mais un défaut **bloquant** s'est introduit dans `smoke-test.sh` : une ligne de commentaire a fusionné avec le code (apostrophe non fermée dans le code exécutable), et le script **plante à l'exécution** avant toute étape — preuve ci-dessous. Le gate `sh -n` du plan est vert uniquement parce que les apostrophes se rééquilibrent par accident à travers ~350 lignes : c'est exactement le « contrôle vert sur un cas fautif » que §2.7 B décrit.

Preuve d'exécution (fake `.env`, stack injoignable — le crash survient avant toute requête) :

```
$ STACK_ENV=/tmp/fake.env API=https://api.exemple.fr sh scripts/smoke-test.sh
Parcours de bout en bout — https://api.exemple.fr
scripts/smoke-test.sh: 266: ALICE_MAIL: parameter not set
```

## Critical Issues

### CR-01: Ligne 201 — commentaire fusionné dans le code, le smoke plante avant sa première étape

**File:** `scripts/smoke-test.sh:201-203`
**Issue:** La ligne 201 lit :

```sh
RUN="$(date +%s)$$" : le runid porte l'entropy $$ (deux runs à
```

Le commentaire prévu (« le runid porte l'entropy $$ … ») a été fusionné avec l'assignation : le texte après `"` est **exécuté comme une commande** (`: le runid porte l'entropy $$ (deux runs à` — erreur de syntaxe `(` en sh isolé). Elle ne passe `sh -n` que parce que l'apostrophe de `l'entropy` ouvre une quote qui traverse les lignes suivantes et se rééquilibre accidentellement plus bas dans le fichier : les lignes 202-206 (dont `PASSWORD='Mot-de-passe-de-test-2026!'` et les assignations `ALICE_MAIL`/`BOB_MAIL` l.204-205) sont alors absorbées comme arguments de la commande `:`. À l'exécution sous `set -u`, le script meurt à la ligne 266 avec `ALICE_MAIL: parameter not set`, avant l'étape 1. Constaté en exécutant réellement le script avec un `.env` factice (voir Summary). Les assignations `PASSWORD`, `ALICE_MAIL`, `BOB_MAIL` et `SMOKE_ACCOUNT_PASSWORD="$PASSWORD"` (l.204-210) ne s'exécutent jamais tel que écrit.
**Fix:** Refermer le commentaire sur sa propre ligne — la ligne d'assignation ne doit contenir QUE l'assignation :

```sh
# Le runid porte l'entropy $$ (deux runs à la même seconde ne collisionnent
# pas), et le + isole ces adresses de tout vrai destinataire.
RUN="$(date +%s)$$"
ALICE_MAIL="e2e+${RUN}-1@${E2E_MAIL_DOMAIN}"
BOB_MAIL="e2e+${RUN}-2@${E2E_MAIL_DOMAIN}"
```

Leçon §2.7 B : le gate `sh -n` de ce plan a été vert sur le cas fautif — un contrôle qui n'a jamais refusé n'a pas été exercé ; ajouter au moins une exécution réelle du script (même jusqu'à son premier refus nommé) au passage obligatoire.

## Warnings

### WR-01: Point 6b — course entre l'expiration à 6 s et le déroulé du test (flakiness)

**File:** `app/e2e/join-token-real.spec.ts:148-187`
**Issue:** Le token éphémère expire 6 000 ms après sa création (l.166), mais entre la création et l'attente du bouton « Rejoindre le foyer » (l.182, expect timeout 8 s) s'intercalent un login complet par formulaire (`seConnecter` : goto + remplissage + clic + `waitForURL`) et une navigation. Si ce déroulé dépasse 6 s — probable sur un run chargé — le pré-écran passe en phase `dead` (alerte MESSAGE_LIEN_MORT, bouton absent) et l'expect l.182 échoue avant même le scénario prévu. Le commentaire (« la preview est consultée AVANT l'expiration ») affirme une garantie que le code ne possède pas : aucun réarmement, aucune vérification du temps restant.
**Fix:** Soit allonger la durée de vie (ex. `expiresAt = Date.now() + 30_000`) et attendre l'expiration par le temps réel restant (le `waitForTimeout(9_000)` devient inutile si l'attente couvre déjà la fenêtre), soit, après `seConnecter(JOIN…)`, re-crée un token frais si l'objectif est « preview OK puis redeem expiré ». Documenter le budget de temps choisi dans le commentaire au lieu de l'affirmer.

### WR-02: Mode signup (stack dev) — comptes créés mais jamais ni suivis ni purgés

**File:** `scripts/smoke-test.sh:317-361` (créations signup), `scripts/smoke-test.sh:18-19` (en-tête), `scripts/smoke-test.sh:251-260` (purge)
**Issue:** En mode dev (`mailer_autoconfirm=true`), Alice et Bob sont créés via `/auth/v1/signup` sans passer par la bibliothèque : rien n'est écrit dans `SMOKE_ACCOUNTS_LOG`, donc la purge du cleanup ne voit « aucun compte créé, rien à purger » alors que deux comptes existent toujours. Pire, le run suivant les signalera comme « comptes e2e résiduels hors de ce run … à traiter à la main ». L'en-tête du script (l.18-19, « Les comptes sont jetables et supprimés en sortie ») et le refus sans secret qui justifie l'exigence du secret « dans les DEUX modes » (l.79-92) sont donc faux en mode signup : le secret y est exigé mais ne sert à rien pour ces comptes.
**Fix:** En mode signup, enregistrer les comptes créés (uid + email) dans `SMOKE_ACCOUNTS_LOG` (l'uid est présent dans la réponse signup) afin que `smoke_accounts_purge` les supprime et en prouve la suppression — c'est précisément ce que le refus sans secret annonce.

### WR-03: Échec de suppression de foyer = simple « ! », le run sort vert avec un résidu

**File:** `scripts/test-join-token-real.sh:163-166` et `scripts/smoke-test.sh:233-235`
**Issue:** `households.created_by` étant `on delete set null`, un foyer dont la suppression échoue survit à la suppression des comptes — résidu permanent en prod. Or cet échec n'est signalé que par un « ! foyer non supprimé » et ne fait pas échouer le run, alors que la purge des comptes, elle, fait échouer le script. Discipline incohérente : un résidu de compte est bloquant, un résidu de foyer (plus visible et plus difficile à traiter à la main, puisqu'il n'apparaît dans aucun préfixe e2e listable) ne l'est pas. §2.7 F s'applique pareillement aux deux.
**Fix:** Traiter l'échec de suppression de foyer comme un échec du run (exit ≠ 0 dans le trap, après avoir tout rapporté), ou à minima l'accompagner de l'identifiant complet et d'une mention explicite « résidu à supprimer à la main » dans le rapport final, avec statut de sortie non nul.

### WR-04: Échec de `smoke_accounts_list` avalé silencieusement dans les cleanup

**File:** `scripts/smoke-test.sh:242-245`, `scripts/test-join-token-real.sh:175-178`
**Issue:** `if residus="$(smoke_accounts_list 2>/dev/null)" && [ -n "$residus" ]` — si la liste échoue (code ≠ 200, retour 1 de la bibliothèque), le message d'erreur de la bibliothèque est redirigé vers /dev/null et la branche `if` n'est jamais prise : le run se termine sans aucune mention que la détection résiduelle n'a pas pu tourner. Un « aucun résidu rapporté » indistinguable d'un « détection impossible » est un succès muet (§2.7 F).
**Fix:** Distinguer les trois issues :

```sh
if ! residus="$(smoke_accounts_list)"; then
  echo "   ✗ détection résiduelle impossible (voir l'erreur ci-dessus)" >&2
  PURGE_KO=1   # ou une variable dédiée qui fait échouer le run
elif [ -n "$residus" ]; then
  printf '     %s\n' "$residus" >&2
fi
```

### WR-05: Détection résiduelle bornée à 1 000 utilisateurs et à un `filter` dont le support dépend de GoTrue

**File:** `scripts/lib-smoke-accounts.sh:249-263`
**Issue:** Deux limites silencieuses : (1) la boucle s'arrête à 20 pages × 50 = 1 000 utilisateurs — au-delà, tout résidu page 21+ est ignoré sans message, produisant un faux « aucun résidu » ; (2) le paramètre `?filter=e2e` n'est pas contractuellement garanti par toutes les versions de GoTrue : si la version déployée l'ignore, la liste renvoie les pages d'utilisateurs non filtrées (les 1 000 premiers comptes tous préfixes confondus) et les résidus e2e au-delà du millième utilisateur deviennent invisibles. Le commentaire (l.238-241) décrit la re-vérification par email mais pas ce plafond.
**Fix:** Utiliser le `page`/`per_page` jusqu'à ce qu'une page renvoie strictement moins de `per_page` résultats (condition de fin correcte, au lieu du compteur d'emails + plafond arbitraire de 20), et afficher un avertissement nommé si le plafond est atteint. Vérifier sur la stack réelle que `filter` est honoré (comparer le nombre de résultats avec et sans) et le consigner dans la doc d'exploitation.

## Info

### IN-01: Paramètre `RUN_ID` de `smoke_accounts_purge` inutilisé

**File:** `scripts/lib-smoke-accounts.sh:207`
**Issue:** La fonction accepte `RUN_ID` mais purge tout le contenu de `SMOKE_ACCOUNTS_LOG` sans le lire — la borne au run courant est de fait assurée par le fichier de log par-processus, pas par le paramètre. Le nom suggère une filtration qui n'existe pas.
**Fix:** Soit supprimer le paramètre, soit le consommer réellement (filtrer le log par runid) si un jour plusieurs runids cohabitent dans un même processus.

### IN-02: Assignations mortes dans le wrapper

**File:** `scripts/test-join-token-real.sh:126-127`
**Issue:** `INVITER_MAIL` et `JOIN_MAIL` sont calculées (avec deux expressions de défaut différentes : `$(smoke_accounts_domain)` pour l'une, `ensemble.jeremymaillot.fr` codé en dur pour l'autre) puis systématiquement écrasées par `SMOKE_CREATED_EMAIL` aux lignes 215 et 227. Code mort, et la divergence des défauts est trompeuse à la lecture.
**Fix:** Supprimer les deux assignations, ou les réduire à un seul appel partagé à `smoke_accounts_domain` si l'affichage initial (l.205) doit rester.

### IN-03: Défaut du domaine e2e dupliqué en trois endroits

**File:** `scripts/lib-smoke-accounts.sh:147`, `scripts/smoke-test.sh:106`, `scripts/test-join-token-real.sh:127`
**Issue:** Le défaut `ensemble.jeremymaillot.fr` est répété trois fois. Le jour où le domaine change, une copie peut rester périmée — exactement la classe de défaut §2.7 I (une absence/affirmation périmée coûte plus cher qu'une absence).
**Fix:** Une seule source de vérité : la fonction `smoke_accounts_domain` de la bibliothèque ; le smoke et le wrapper l'appellent au lieu de redéfinir le défaut.

### IN-04: Fichiers temporaires à nom fixe dans la bibliothèque

**File:** `scripts/lib-smoke-accounts.sh:162` (`creation-body`), `scripts/lib-smoke-accounts.sh:245-251` (`emails-tous`, `liste-body`)
**Issue:** Noms fixes dans le répertoire temporaire du processus. Correct aujourd'hui (un processus = un répertoire = usage sérialisé), mais tout usage futur concurrent dans un même processus écraserait silencieusement le corps d'une création en cours.
**Fix:** Au besoin, suffixer par index (`creation-body-$index`) ou documenter explicitement le contrat « un appel à la fois » dans l'en-tête de la fonction.

---

## Contrôles verts constatés (non-exhaustif, pour traçabilité)

- Secret jamais en argv sur les appels Admin : `grep -nE '\-H "[^"]*SECRET_KEY'` vide sur les trois scripts ; le secret ne circule que via `curl -K` fichier 0600, supprimé au trap (`smoke_accounts_tmp_clean`).
- Aucune directive de linter dans les fichiers revus (§2.7) : grep vide.
- Verbatims D-03/D-17 de la spec identiques au code source (`join-household-page.tsx:41`, `invites.ts:260`).
- `--project=chromium` et `cd app` présents dans le wrapper ; les 8 skips de `critical-paths.spec.ts` sont les skips documentés de la signature 38, les 2 tests join-token périmés sont supprimés (l.123-127 ne garde qu'un commentaire d'archéologie).
- `playwright.config.ts:14` : le `testIgnore` est une exclusion de run documentée (écart Rule 3 consigné), pas un skip conditionnel — la spec réelle est incluse dans le run du wrapper qui pose `E2E_BASE_URL`.

---

_Reviewed: 2026-11-09_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
