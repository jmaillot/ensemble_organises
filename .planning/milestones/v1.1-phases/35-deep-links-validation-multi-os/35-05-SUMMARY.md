---
phase: 35-deep-links-validation-multi-os
plan: 05
subsystem: validation-multi-os
tags: [deep-links, offline, pwa, validation, android, dlnk-02, d07]
requires: ["35-04 (correctif bootstrap hors-ligne)"]
provides:
  - "Rejeu on-device daté des cas §1.4/§1.5 consigné dans 35-VALIDATION-MATRICE.md"
  - "Statut final des 2 items deep-link dans deferred-items.md"
affects: ["vérification Android §1.4 (suivi)"]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/35-deep-links-validation-multi-os/35-05-SUMMARY.md
  modified:
    - .planning/phases/35-deep-links-validation-multi-os/35-VALIDATION-MATRICE.md
    - .planning/phases/35-deep-links-validation-multi-os/deferred-items.md
decisions:
  - "Échoué Android §1.4 consigné tel quel avec symptôme exact (D-11) — jamais coché à tort ; gap 1 reconnu PARTIELLEMENT clos"
  - "Item D-07 (§1.5) clôturé : re-validé on-device Passé sur les deux OS"
  - "Item DLNK-02 Android réouvert avec symptôme et piste diagnostique (pas de code dans ce plan)"
metrics:
  duration: "~10 min (session de consignation)"
  completed: 2026-11-06
status: complete
actuals:
  tokens: 4500
  tasks: 2
  commits: 0
plan_head_before: "(docs-only — .planning gitignored)"
plan_head_after: "(docs-only — .planning gitignored)"
---

# Phase 35 Plan 05: Rejeu on-device des cas §1.4/§1.5 après correctif 35-04 Summary

**One-liner:** Rejeu humain 2026-11-06 consigné : §1.5 « connexion requise » **Passé** sur Desktop Chrome ET Android 16 (gap 2 clos), §1.4 cold-start hors-ligne avec session **Passé** sur Desktop mais **Échoué** sur Android 16 (« encore chargement de votre foyer ») — gap 1 partiellement clos, item Android réouvert avec symptôme.

## Résultat du rejeu (2026-11-06, build ≥ v1.0-116, après correctif 35-04)

| Cas | Desktop Chrome | Android 16 | Verdict |
|---|---|---|---|
| §1.4 — deep link `/taches/jour` cold-start hors-ligne AVEC session (DLNK-02) | **Passé** (« ça a bien marché sur desktop ») | **Échoué** — « j'ai encore chargement de votre foyer » : l'écran de chargement du bootstrap s'affiche au lieu de `/taches/jour` rendue depuis le cache | Gap 1 **PARTIELLEMENT clos on-device** |
| §1.5 — deep link hors-ligne SANS session (D-07) | **Passé** (« ok ») | **Passé** (« ok pour les 2 ») | Gap 2 **clos on-device** |

## Ce qui a été fait

- **Matrice** (35-VALIDATION-MATRICE.md) : tables « Rejeu » ajoutées sous §1.4 et §1.5, entrée `7-rejeu` dans la checklist, CONFIRMATION-CONSIGNATION complétée avec la date du rejeu. L'historique du passage 2026-11-06 initial est **intact** (rien n'a été écrasé).
- **deferred-items.md** : item D-07 (§1.5) **clôturé** (« corrigé 35-04, re-validé on-device 2026-11-06, cellules = Passé ») ; item DLNK-02 **réouvert sous « DLNK-02 Android »** avec le symptôme exact et la trace on-device. L'item outbox (échec silencieux d'écriture vers ligne supprimée) reste **OUVERT et hors périmètre** — il relève de la file d'écriture (phase 34), pas des deep links.
- **Aucun code modifié dans ce plan** — uniquement des documents de consignation.

## Gap 1 (§1.4 Android) — état honnête

Le correctif 35-04 est prouvé par les tests automatisés (unitaires A–F + e2e hors-ligne chromium/mobile) et fonctionne on-device sur Desktop Chrome, mais **échoue encore sur Android 16** au cold-start hors-ligne avec session : l'écran « Chargement de votre foyer » apparaît au lieu de la vue `/taches/jour`.

**Piste diagnostique (pour le suivi — NOT a fix task, aucun code écrit ici) :** le symptôme suggère soit (a) que le service worker n'a pas pris le contrôle sur Android malgré le version check, soit (b) que le chemin de restauration du foyer persisté (zustand persist, restauration sync au boot) se comporte différemment au cold-start Android. À verser dans la vérification complémentaire / prochain diagnostic — noté dans STATE.md.

## Verification (Task 2)

```
python3 -c "import re,sys; t=open('.planning/phases/35-deep-links-validation-multi-os/35-VALIDATION-MATRICE.md').read(); rows=[l for l in t.splitlines() if re.search(r'§1\.[45]', l) and re.search(r're-?jeu|rejeu', l, re.I)]; sys.exit(0 if all(re.search(r'Passé|Échoué|Quirk', r) for r in rows) and rows else 1)"
→ exit=0
```

Compte les lignes de rejeu §1.4/§1.5 porteuses d'un statut D-11 — un statut Échoué est valide pour ce contrôle.

## Deviations from Plan

**1. [Rule 3 - Blocking] En-têtes de table rejeu non conformes au contrôle automatisé**
- **Found during:** Task 2 (verify)
- **Issue:** les lignes d'intro/en-tête des tables « Rejeu » (matchées par le grep du plan) ne portaient pas de statut D-11 → exit=1
- **Fix:** chaque ligne matchée porte désormais un statut explicite (résultat Passé/Échoué dans le titre de la table rejeu, marqueur « rejeu §1.x » déplacé des en-têtes vers la colonne « Cas »)
- **Files modified:** 35-VALIDATION-MATRICE.md
- **Commit:** (docs-only, .planning gitignored — fichiers sur disque)

## Notes de consignation

- Commits: 0 — plan exclusivement documentaire, `.planning/` est gitignore (jamais `git add -f`).
- Le rejeu §1.5 « ok pour les 2 » rapporté par l'humain couvre les deux OS dans une seule réponse — consigné Passé sur Desktop et Android, cellule par cellule.
- Le human_verification item 3 de 35-VERIFICATION.md (« rejeu des cas §1.4/§1.5 après correction ») est **exécuté et consigné** — avec un Échoué Android assumé, la boucle ne se ferme pas sur un faux vert (D-11).
