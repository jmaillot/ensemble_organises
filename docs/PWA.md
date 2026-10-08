# PWA — installation, mises à jour, iOS, push et synchro d’arrière-plan

Références verrouillées : décisions D-03/D-05/D-06 du contexte 09, étapes
opérateur M-01/M-02 (la preuve push et les clés VAPID restent des actions
opérateur, pas du code).

## Installation

- Une seule source de manifeste : le bloc `manifest` de `app/vite.config.ts`
  (le fichier statique `public/manifest.webmanifest` a été supprimé en 09-02
  car il divergeait : `start_url`, `scope`, icône SVG seule). Le manifeste
  généré est servi à `/manifest.webmanifest`, revalidé à chaque visite par
  la règle no-cache de `app/nginx.conf`.
- Icônes raster commises : `app/public/icon-192.png` + `icon-512.png`
  (régénérées par `scripts/generate-pwa-icons.py` depuis `icon.svg`,
  fond plein-bord, motif inscrit à ~76 % pour la zone de sécurité maskable ;
  `purpose any` + entrée `maskable` dédiée en 512).
- Parcours : le bouton « Installer l’application » du panneau hors ligne
  (Paramètres) utilise le `beforeinstallprompt` différé quand le navigateur
  le propose ; sinon, menu du navigateur → « Installer » / « Ajouter à
  l’écran d’accueil ».
- Preuve d’installabilité : audit Lighthouse PWA **1,0** sur le build de
  production (`lighthouse@11`, Chrome Playwright, `.planning/phases/09-
  pwa-offline/lighthouse-pwa-09-02.json`) — `installable-manifest`,
  `splash-screen`, `themed-omnibox`, `content-width`, `viewport`,
  `maskable-icon` au vert ; les trois contrôles restants de la catégorie
  sont informatifs, pas bloquants.

## Mises à jour : choix du silence

- `registerType: 'autoUpdate'` + `registerSW({ immediate: true })` :
  le service worker se met à jour **sans demander**, à chaque déploiement.
- Le panneau affiche « service worker mis à jour automatiquement à chaque
  déploiement » et répond au ping `EO_VERSION` : un worker actif mais
  obsolète (constante `SW_VERSION` dans `app/src/sw.ts`, à bumper à chaque
  modification des gestionnaires) est détectable au lieu de rester muet.
- Conséquence assumée : pas de bannière « nouvelle version disponible » ;
  un déploiement cassé se propage seul — d’où la chaîne verte exigée avant
  chaque mise en ligne (typecheck, tests, build, e2e).

## Limites iOS (à lire avant de promettre)

- Pas de `beforeinstallprompt` : installation uniquement manuelle via
  Partager → « Sur l’écran d’accueil ». Le bouton du panneau n’apparaît
  que quand le navigateur propose l’invite (donc jamais sur iOS).
- `apple-touch-icon` pointe sur `icon-192.png` (iOS ignore le SVG).
- Background Sync et Periodic Sync **n’existent pas** sur iOS : la file
  rejouée à la fermeture de l’onglet attend la prochaine ouverture.
  Safari ne réveille pas le worker sans onglet.
- Push web iOS : uniquement à partir d’iOS 16.4, **et** uniquement pour une
  application installée sur l’écran d’accueil. En deçà, aucun rappel push
  n’arrive, sans erreur visible — le reçu `EO_VERSION`/push du panneau
  permet de distinguer transport et affichage.

## Synchro d’arrière-plan (D-05)

- Mise en file → `requestQueueSync()` enregistre le tag `eo-mutations`
  auprès du SyncManager ; le navigateur réveille alors le worker même
  onglet fermé, là où il le permet (Chrome/Edge desktop et Android).
- Le worker (`app/src/sw.ts`, `replayViaClients`) **ne rejoue jamais
  lui-même** : sans session utilisateur, un rejeu direct partirait sans JWT
  et gonflerait `attempts` pour rien. Il compte la file en attente
  (lecture brute d’IndexedDB, sans Dexie) et demande aux onglets ouverts
  de rejouer via le chemin existant `flushWithAdapter` — même ordre, même
  comptabilité, nouveau déclencheur uniquement.
- Sans onglet ouvert, le worker ré-enregistre le tag et le rejeu se
  conclut à la prochaine ouverture. Periodic Sync (`eo-periodic`, ~12 h,
  Chrome/Edge uniquement) ajoute un déclenchement périodique best-effort.
- Dégradation : iOS, Firefox, SyncManager absent → aucun appel, aucune
  erreur ; le rejeu à la reconnexion (`online`), le message `EO_SYNC_NOW`
  entre onglets et le bouton « Synchroniser maintenant » restent.

## Limites de rejeu et conflits (D-06)

- Dernier-écrivain gagne, sans fusion : une écriture rejouée écrase
  silencieusement l’état serveur qui aurait bougé entre-temps.
- Les insertions portent un identifiant client (`randomId`) : un double
  rejeu ne duplique pas la ligne. `update`/`delete` rejoués sont
  idempotents par construction. Au-delà, aucune idempotence garantie.
- Les créations et mises à jour en attente n’apparaissent qu’après
  synchronisation ; les suppressions retirent le cache en optimiste.
- Les invitations et la création de foyer exigent une connexion et ne
  sont jamais mises en file.

## Exploitation push — checklist opérateur (M-01/M-02)

1. **Clés VAPID (M-02)** : générer avec `scripts/generate-vapid-keys.sh`,
   copier dans le `.env` de la stack (service `functions`), jamais dans
   le dépôt ni en ligne de commande. Vérifier via le panneau
   notifications (abonnement + envoi d’essai).
2. **Preuve push prod (M-01)** : `sh scripts/test-dispatch-push.sh` avec
   un **vrai appareil abonné** — un endpoint factice rend `dropped`, pas
   `delivered`, et ne prouve rien. Le script note le dernier
   `net._http_response` avant l’appel : le rapport lu est celui de son
   appel, même si un job `pg_cron` s’intercale.
3. **Diagnostic** : si le reçu du panneau avance sans notification, c’est
   la phase d’affichage (OS, permission révoquée) ; s’il ne bouge pas,
   c’est le transport (service Push → navigateur).
4. **Rotation `INVITE_TOKEN_HMAC_SECRET`** : invalide tous les tokens
   d’invitation actifs (régénération requise) ; sans rapport avec VAPID,
   ne pas confondre les deux secrets.
