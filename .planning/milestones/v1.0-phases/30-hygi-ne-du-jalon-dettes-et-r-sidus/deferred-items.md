# Deferred items — phase 30

## 30-01

- **[Pré-existant, hors périmètre] `supabase/tests/0147_child_push_adults.sql` échoue** :
  assertion « anniversaire enfant : annonce à chaque adulte du foyer (attendu 2, obtenu 0) ».
  Constaté le 2026-10-30. Hors périmètre de 30-01 (le plan ne touche que le schedule
  pg_cron `eo-routine-maintenance` et l'assertion d'occurrence du jour) ; la voie testée
  (`push_birthday_notifications` → `household_birthday_alerts`) n'a aucun lien avec cron.
  À traiter dans un plan de hygiène dédié ou à la revue de la phase 30.
  status: acknowledged

## 30-02 (2026-10-30) — échec pré-existant hors périmètre : test calendrier « supprime un événement après confirmation »

Découvert lors du `<verify>` du Task 2 (balayage D-07, `npm test` complet) : 1678/1679 verts,
1 échec déterministe — reproduit 3× dont 2× en isolé (`-t "supprime un événement après confirmation"`)
sur HEAD propre `c7e6be5`, **sans aucune modification de code par le plan 30-02** (aucun fichier
source touché, `git status -- app/src` vide). Le test attend « Journée libre » après suppression
d'un événement « Anniversaires… » (`calendrier-page.test.tsx:165`) — suspicion de sensibilité à la
date (30 oct.) à confirmer, jamais une régression du balayage réseau. Hors périmètre du plan (§
Scope boundary) : consigné ici, à corriger dans un plan ultérieur. Preuve de mesure entière
conservée (sortie vitest complète, jamais un `tail`).
