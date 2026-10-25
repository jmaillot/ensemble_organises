---
status: complete
phase: 10-notifications
source: [10-01-SUMMARY.md, 10-02-SUMMARY.md, 10-03-SUMMARY.md]
started: 2026-10-19T15:05:00Z
updated: 2026-10-19T16:15:49Z
---

## Current Test

[testing complete — 10 passés, 0 issue, 0 bloqué]

## Tests

### 1. Pastille + ligne pour un fil non ouvert (10-01 D-01)
expected: Poster dans un fil non ouvert lève la pastille et une ligne (titre, extrait, lien /messages) sur la cloche montée par le shell.
result: pass
source: automated
coverage_id: D1
verification: "app/src/hooks/use-notifications.test.tsx#fait surface un message posté dans un fil non ouvert"

### 2. Ouvrir le fil solde sa ligne (10-01 D-02)
expected: Ouvrir le fil marque lu et fait passer sa ligne en lus récents — comportement voulu, inchangé.
result: pass
source: automated
coverage_id: D2
verification: "app/src/hooks/use-notifications.test.tsx#ouvrir le fil solde sa ligne"

### 3. Préférence messages coupée (10-01 D-01)
expected: Couper la préférence masque les lignes messages, les rappels calculés restent visibles.
result: pass
source: automated
coverage_id: D3
verification: "app/src/hooks/use-notifications.test.tsx#masque les lignes messages quand la préférence est coupée"

### 4. Auto-masquage des lignes lues, partout (10-03 D-02)
expected: Une ligne lue disparaît des deux onglets sur les trois voies de marquage (clic, fil ouvert, tout-marquer).
result: pass
source: automated
coverage_id: D1
verification: "app/src/hooks/use-notifications.test.tsx#ouvrir le fil cache sa ligne partout (auto-masquage à la lecture) ; #le marquage au niveau du fil ouvert cache aussi la ligne (sans markItem) ; #le marquage d'un post au niveau du Cercle cache aussi sa ligne"

### 5. Réaffichage sur activité fraîche (10-03 D-02)
expected: Une activité fraîche sur un fil masqué le réaffiche avec pastille (rien d'avalé en silence) ; un masque expiré refait surface.
result: pass
source: automated
coverage_id: D2
verification: "app/src/hooks/use-notifications.test.tsx#une activité fraîche sur un fil masqué le réaffiche avec pastille ; #un masque expiré réaffiche le rappel (horizon jusqu'à demain)"

### 6. Croix et Tout-effacer inchangés (10-03 D-02)
expected: Le masquage manuel et « Tout effacer » gardent le même magasin et le même horizon jusqu'à demain.
result: pass
source: automated
coverage_id: D3
verification: "app/src/hooks/use-notifications.test.tsx#expose lus récents, masquage et effacement sans suppression"

### 7. Cloche en usage réel
expected: |
  Un message posté par un autre membre dans un fil que tu n'as pas ouvert
  lève la pastille de la cloche et une ligne (titre du fil, extrait, lien vers
  /messages) sans que tu aies besoin d'ouvrir Messages. Ouvrir le fil solde sa
  ligne : elle disparaît de la liste des non-lus et rejoint les lus récents.
result: pass
reported: "il y a un phenomene bizarre, c'est la personne qui a mis un message qui recoit la notification, l'autre membre n'a rien"
note: |
  Fausse alerte, et elle vaut d'être gardée. Le compte administrateur avait sa
  propre préférence `message_notifications_enabled` **coupée** — réglée pendant
  l'UAT des préférences (test 3). La cloche filtrait donc les lignes messages
  pour ce seul compte, comportement voulu et prouvé par le test 3, pendant que
  le membre, préférence intacte, recevait les siennes : d'où l'asymétrie
  rapportée, qui suivait le compte et non le sens du message.

  Mesures de production qui ont écarté les autres pistes : identités saines
  (chaque compte a sa ligne de membre avec son `user_id`), fil partagé, dernier
  message de TestAdmin2 à 15:23:40 pour une marque de lecture du compte admin
  restée à 15:20:17 (donc non lu), et cloche toujours vide après rechargement
  complet — ni temps réel (la publication `supabase_realtime` contient bien
  `messages`) ni cache en cause. Interrupteur rallumé : la ligne apparaît.

### 8. Push prod d'un message
expected: |
  Un appareil réellement abonné reçoit la notification d'un nouveau message
  arrivé dans un fil non ouvert, sans que l'application soit au premier plan —
  le message push part par le job `eo-push-messages` (toutes les 5 minutes).
  C'est le chemin que le correctif de trame du 2026-10-19 débloque.
result: pass
reported: "je n'ai pas eu de notification push, mais simplement un element dans la bulle de notification"
note: |
  Le job `eo-push-messages` **échouait à chaque passage** (`cron.job_run_details`
  en `failed`, 15:25 → 15:45) : `a column definition list is only allowed for
  functions returning "record"`. `0042:260` avait recopié la forme fautive de
  `0019:530/559`, corrigée en `0020:50/77` (`as n` + `n.value`) : la faute en
  était à sa troisième occurrence. Dix lignes dormaient dans
  `message_notifications` (15:11 → 15:34), jamais consommées ; seuls les rappels
  partaient (`net._http_response` : `scope: rappels`). La cloche fonctionnait :
  seul le push manquait.

  Réparé le 2026-10-19 : migration `0130` (`as n` + `n.value`), test qui
  **exécute** le dispatch (rouge sur la base d'avant avec l'erreur de prod, vert
  après), contrôle statique 9 (liste de colonnes sur `jsonb_array_elements`).
  Appliqué en production, file purgée avant la migration, puis message neuf :
  push reçu. Le test est soldé par la mesure, pas par la correction.

### 9. Push prod d'un rappel (M-01/M-02)
expected: |
  `sh scripts/test-dispatch-push.sh` avec un appareil réellement abonné :
  `delivered` sans `dropped`, et le rappel consommé. Preuve acquise en
  production le 2026-10-19 — à confirmer ici plutôt qu'à rejouer.
result: pass
note: |
  Confirmé par l'utilisateur sur la mesure du 2026-10-19 : rappel reçu,
  `delivered` sans `dropped`, rappel consommé. Preuve non rejouée — elle eût
  été identique, et le test dit ce qu'il accepte.

### 10. Frontière serveur du ventilateur (10-02 D-03)
expected: |
  Un membre sortant (tombstoné) ne reçoit pas de push de message, et le
  ventilateur garde la fenêtre de 24 h, l'exclusion de l'auteur et le filtre de
  préférence. Prouvé par les suites SQL (`0039`, `0041`, `0013`) ; dis si tu
  acceptes ce constat ou veux un test réel supplémentaire.
result: pass
note: |
  Constat accepté le 2026-10-19. Les trois garde-fous étaient déjà exercés —
  auteur exclu (`0013`), partant exclu dans les deux sens (`0039:284`,
  `0041:147`), préférence coupée (`0013`). Le quatrième ne l'était pas : la
  fenêtre de 24 h (`0100:233`) n'était couverte par aucune suite, et le texte
  de ce test l'affirmait pourtant. Assertion ajoutée à `0013` le 2026-10-19 —
  contrôle positif, puis file vieillie de 25 h, zéro annonce, ligne conservée ;
  vue échouer sur une file vieillie d'une heure avant d'être gardée.

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
