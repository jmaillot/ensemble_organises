---
phase: 29-messagerie-v2
plan: 06
subagent: orchestrator-inline
gaps_closed: [G-29-1]
requirements: [MSG-03]
---

# Plan 29-06 — Fermeture du gap G-29-1 (401 INVALID_API_KEY au push)

## Ce qui a été fait

### Task 1 — Sonde Edge dans le prévoluble (commit 8d49c22)

`scripts/test-dispatch-push.sh` : `prevoluble()` sonde désormais `/functions/v1/push-notify`
avec la clé du Vault **avant toute semure**, par le même chemin que le dispatch (0025 :
`net.http_post`, en-tête `apikey`, fenêtre `net._http_response` ouverte sur `max(id)` avant
l'émission, attente bornée réutilisée). Un 401 INVALID_API_KEY produit un diagnostic qui
distingue, **par empreintes md5 sans jamais afficher de secret** :

1. env du conteneur functions vide/absente → retombée silencieuse `{"default":""}`
   (docker-compose.yml:463) → `recreate functions` ;
2. empreintes Vault = env → runtime en retard sur le .env → `recreate functions`
   (un `docker restart` ne ré-interpole JAMAIS le .env) ;
3. empreintes distinctes → `set-push-secrets.sh` puis `recreate functions`.

Sur stack cohérente : « Sonde Edge auth OK (400 métier attendu) » — preuve visible (§2.7 F).
Le dispatch réel ouvre sa propre fenêtre après la sonde (attribuabilité conservée).

### Task 2 — Docs « recreate, jamais restart » (commit b592759)

- `docs/BACKEND.md` §12 : après TOUTE modification du .env, `recreate <service>` — un
  restart redémarre avec l'environnement figé, ne ré-interpole JAMAIS le .env ; cas UAT 29
  nommé (SUPABASE_SECRET_KEYS, docker-compose.yml:463).
- `docs/DEPLOIEMENT-PROD.md` : contre-indication `restart ≠ recreate` + la sonde du
  prévoluble qui nomme la commande à appliquer.

### Task 3 — UAT 1 re-passée (checkpoint blocking-human) — VERTE

Exécution réelle sur le serveur (`ubuntu1`), appareil abonné Firefox :

```
Sonde Edge    auth OK (400 métier attendu)
Réponse       200  {"delivered":4,"consumed":1}   rappel consommé (restant 0)
Réponse msg   200  {"delivered":4,"consumed":3}   « 3 nouveaux messages de Semure »
OK            base → Edge Function → service Push
```

Notifications reçues sur l'appareil, payload sans contenu (D-06/D-07), rappel collant de
l'UAT consommé au premier dispatch 200. **L'utilisateur confirme.**

## Déviations et découvertes pendant l'exécution (§2.7 E — la classe, pas l'instance)

Trois défauts de classe ont été trouvés et corrigés en cours de route — tous de la même
famille que G-29-1 (env de conteneur figé/étranger), ce qui valide l'approche :

1. **Identifiant non-ASCII** (commit 1e48b16) : sur le serveur, `dash` en locale C refuse
   `Expéditeur` (`Expéditeur=: not found`) — le groupe de messages 0172 n'a jamais été
   testé sur le serveur. Renommé `Expediteur`, preuve par `dash -n` sous `LC_ALL=C`. Le
   script n'a plus aucun identifiant non-ASCII.
2. **Stack serveur en retard** : le serveur n'avait ni les migrations 0150+ ni les Edge à
   jour — `migrate.sh` + `deploy-functions.sh` + `recreate functions` l'ont mis à niveau
   (le calcul base du groupe est apparu).
3. **Cause racine exacte du 401 résiduel** : `supabase-envoy` (api-gw) portait un
   `SERVICE_ROLE_KEY` **différent du `.env`** (md5 68235504 vs ec1aeeb5) — recréé avec un
   export shell hérité. L'Edge (client admin supabase-js) envoie sa clé en `apikey` ET
   `Authorization` ; l'apikey ne matchait pas l'env d'Envoy → 401 text/plain
   « Unauthorized » (pas de JSON) → `error.code: undefined` côté Edge → 500 « Calcul des
   rappels impossible ». Fix : shell neuf (aucun export hérité) puis
   `sh run.sh recreate api-gw` + `recreate functions`. Sondes de preuve : le JWT legacy du
   `.env` contre `/rest` rendait 401 avant, 200 après (le JWKS du serveur porte bien
   `1 EC + 1 oct`, comme le local).

Le diagnostic a été rendu possible par la sonde elle-même (auth Edge OK → le défaut
n'était PAS celui que la sonde visait, ce qui a redirigé vers Envoy) — la classe
« diagnostiquable plutôt que reconstituée à la main » a fonctionné.

## Vérification

- `sh -n scripts/test-dispatch-push.sh` : OK ; `LC_ALL=C dash -n` : OK.
- `grep "recreate functions" scripts/test-dispatch-push.sh` et
  `grep "ré-interpole" docs/BACKEND.md docs/DEPLOIEMENT-PROD.md` : présents.
- Script complet sur serveur réel : OK (sortie ci-dessus).
- Chaîne §2.7 non affectée : aucun SQL, aucun TS modifié (script shell + docs seuls) ;
  le script EST la vérification du chemin qu'il teste.

## Commits

- 8d49c22 test(29-6): sonde Edge auth dans le prevoluble, diagnostic 401 a deux causes
- b592759 docs(29-6): recreate, jamais restart
- 1e48b16 test(29-6): identifiants ASCII dans test-dispatch-push.sh (portabilité dash/C)

## Files

- scripts/test-dispatch-push.sh (sonde + renommage)
- docs/BACKEND.md (§12)
- docs/DEPLOIEMENT-PROD.md (bloc recreate)
