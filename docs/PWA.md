# PWA — installation, mises à jour, iOS et push

Références verrouillées : décisions D-03 du contexte 09, étapes
opérateur M-01/M-02 (la preuve push et les clés VAPID restent des actions
opérateur, pas du code).

> **Mode offline données retiré (D-10, UAT 2026-10-12).** Il n’y a plus de
> cache Dexie côté Supabase, plus de file de mutations, plus de repli de
> lecture, plus de synchro foyer ni de minuteur, plus de bannière, de
> panneau de synchro ou d’états « cache vide » : chaque lecture et chaque
> écriture part directement au backend, et l’erreur d’origine s’affiche
> telle quelle. Le service worker ne fait plus que précache des assets +
> push (plus de cache médias, plus de Background/Periodic Sync). Restent :
> l’installation, les notifications push et le mode démo local (IndexedDB,
> inchangé).

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
- Parcours : le bouton « Installer l’application » du panneau
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
- Push web iOS : uniquement à partir d’iOS 16.4, **et** uniquement pour une
  application installée sur l’écran d’accueil. En deçà, aucun rappel push
  n’arrive, sans erreur visible — le reçu `EO_VERSION`/push du panneau
  permet de distinguer transport et affichage.

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
3. **Diagnostic** : trois étages, et le reçu du panneau n'en distingue que
   deux.
   - le reçu **avance sans notification** : l'affichage (OS, permission
     révoquée) ;
   - le reçu **ne bouge pas** et le journal du navigateur montre
     `receivedPushMessage` suivi de `Bad encryption` ou d'un accusé
     `code: 101` : le message est arrivé, mais le navigateur l'a rejeté au
     **déchiffrement** — c'est la trame envoyée (RFC 8188/8291), pas le
     transport ni l'appareil ;
   - le reçu **ne bouge pas** et aucun message n'arrive : le transport
     (service Push → navigateur).

   Un `201` du service, et même un compteur `delivered`, ne disent que
   « accepté » — jamais « lisible ». Seul le reçu écrit par le worker
   (`shown: true`) en témoigne.
4. **Rotation `INVITE_TOKEN_HMAC_SECRET`** : invalide tous les tokens
   d’invitation actifs (régénération requise) ; sans rapport avec VAPID,
   ne pas confondre les deux secrets.
