# 43-REVIEW-DISPOSITION — Phase 43

Review : `.planning/phases/43-preuve-prod-du-bridge-ardoise-w1/43-REVIEW.md`
(gsd-code-reviewer, depth standard — 0 critique, 2 warnings, 5 info).

## Warnings — corrigés (commit fix 43)

| ID | Fichier | Correction |
|---|---|---|
| WR-01 | `scripts/lib-smoke-accounts.sh:289` | **Cause réelle identifiée au diag du 2026-11-11 (reproduction locale) : le body GoTrue duplique l'email dans `user_metadata.email`** (copie de création) ; le `grep -o '"email": *"'` matchait les DEUX occurrences → chaque résiduel listé 2× (runs 10/11). L'hypothèse « pagination clampée » du review était fausse : les pages suivantes sont réellement vides (page 2/3 = 0 users au diag). Correction de la classe : extraction `jq -r '.users[]?.email // empty'` (champ racine uniquement, jq déjà employé par `seed-test-accounts.sh`). La garde anti-clamp `cmp -s` est conservée comme défense, commentaire réécrit. Prouvé : la fonction corrigée liste 3 emails, `uniq -d` vide. |
| WR-02 | `scripts/test-ardoise-bridge-real.sh:454` | La sonde résiduelle ne confond plus échec et liste vide : `smoke_accounts_list` sans `2>/dev/null`, branche `else` explicite qui nomme l'échec (« ne pas conclure à l'absence », §2.7 F). Un `$?` indirect a été écarté : après `&&`, un statut 1 est aussi celui d'un test `[ -n ]` sur liste vide. |

Vérification : `bash -n` OK sur les deux fichiers.

## Info — non corrigées (advisory, acceptées telles quelles)

- IN-01 capture `CODE_B` non validée vide : capture de confort, l'étape suivante échoue bruyamment si vide.
- IN-02 token muté commençant par `X`/finissant par `Y` : le négatif reste rouge et nommé (replay 410 « révoqué »), aucune preuve fausse.
- IN-03 mot de passe e2e en argv via `--data` dans la lib : mot de passe jetable codé, exposition nulle ; le principe `-K` reste appliqué à tout secret réel.
- IN-04 `get_json` muet sur status 000 : le diagnostic d'échec global de l'étape cite la commande et le code.
- IN-05 branches mortes de `post_json` : défensives, jamais atteintes par les sites d'appel actuels.

## Verdict

Warnings traités avant la fin de phase ; infos documentées. Review advisory — rien ne bloquait la clôture.
