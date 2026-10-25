# Phase 06: Cadeaux invites — Research

**Researched:** 2026-10-06
**Domain:** Supabase self-hosted Edge (Deno) SMTP send + anonymous guest reservation for gift lists
**Confidence:** HIGH for stack/schema patterns (in-repo + official example), MEDIUM for SMTP TLS details, LOW where noted

## Summary

Phase 06 adds two capabilities to the existing `gift-list-invite` Edge Function (user-only, HMAC codes, unique `code invalide` oracle, in-memory rate-limit): (1) a `send-email` action that sends a sober invitation email through the stack SMTP relay from the server side only, and (2) a `redeem-guest` publishable action letting a code-bearing visitor declare a name and reserve items without an account, with organizer-side release.

The single most authoritative finding: Supabase's own official Edge Function example (`send-email-smtp`) uses `npm:nodemailer` with an inline `npm:` specifier in Deno [CITED: https://github.com/supabase/supabase/raw/refs/heads/master/examples/edge-functions/supabase/functions/send-email-smtp/index.ts] — so `import nodemailer from 'npm:nodemailer@<pinned>'` is the blessed path, needs no `deno.jsonc` import-map change, and matches this repo's existing inline-`npm:` style (`npm:zod@4.6.5`) [VERIFIED: supabase/functions/gift-list-invite/index.ts:64-66]. For anonymous attribution, a nullable `reserved_by_name text` column beside the existing `reserved_by` member FK (with a mutual-exclusion CHECK) is the minimal, reversible-forward schema that keeps the 0080 masked view and the 0083 reserve guard working with small, auditable deltas.

**Primary recommendation:** Extend `gift-list-invite` in place — add `send-email` (user-only, nodemailer, fail-closed on missing SMTP env) + `redeem-guest`/`guest-view`/`guest-reserve` (publishable, per-action in-memory rate limits, all writes via new service_role-only RPCs); add `gift_items.reserved_by_name text` with mutual-exclusion CHECK + extend the 0080 masked view and the 0083 guard trigger; keep the unique `code invalide` oracle byte-identical.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Envoi réel via SMTP stack (SMTP_HOST/PORT/USER/PASS), depuis une action Edge serveur (`gift-list-invite`, user-only) — jamais depuis le client. Secrets lus côté serveur uniquement, 500 explicite si absents (fail-closed).
- **D-02:** Gabarit sobre : qui invite (nom membre + foyer), nom de la liste, lien d'invitation avec code, expiration si bornée. Rien d'autre en contenu fixe.
- **D-03:** Champ message personnel (optionnel) saisi par l'hôte dans le dialogue de partage au moment de l'envoi ; texte brut, longueur bornée.
- **D-04:** L'envoi conserve le comportement existant de la part email (création de la part lecture) : l'email embarque le lien à code, le redeem avec compte suit la branche e-mail existante (OQ-1 A inchangée pour ce cas).
- **D-05:** Override explicite de OQ-1 OPTION A (compte exigé) pour la réservation uniquement : un visiteur porteur d'un lien à code valide peut réserver sans compte. Le redeem avec compte reste inchangé.
- **D-06:** Garde-fous : code requis (pas d'accès sans lien), nom auto-déclaré requis (1-80 caractères, même borne que les dossiers), rate-limit côté Edge sur l'action anonyme, oracle unique `code invalide` préservé (T-05-04).
- **D-07:** Attribution : la réservation anonyme porte le nom déclaré (jamais une FK membre) ; le masquage surprise au propriétaire (0080, T-05-03) s'applique pareil (le owner voit « réservé », pas le nom).
- **D-08:** Modération : l'organisateur (owner ou admin) peut libérer une réservation (anonyme comme membre) ; toute libération par un non-gestionnaire est refusée (preuve négative exigée).
- **D-09:** Pas d'email exigé de l'invité, pas de proposition d'idées, pas de compte persistant. Usurpation de nom connue et acceptée comme limite (lien privé + modération), à documenter en risques acceptés.

### the agent's Discretion
Forme exacte du gabarit email (HTML minimal vs texte), libellés des boutons invité, détail du compteur rate-limit.

### Deferred Ideas (OUT OF SCOPE)
- Proposition d'idées par l'invité anonyme — refusé pour cette phase (réserver uniquement)
- Envoi email pour ardoise/autres modules — hors phase (cadeaux uniquement)
- Compte invité persistant / magic link — hors phase

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SMTP send + template | Edge Function (server) | — | Secrets serveur jamais au client (D-01, AGENTS.md §2.6) ; le client ne choisit ni texte fixe ni cible sans contrôle |
| Code validation + HMAC | Edge Function + SQL RPC | — | Motif 0079 établi : Edge calcule l'empreinte, RPC `SECURITY DEFINER` service_role-only décide |
| Anonymous reservation write | SQL RPC (service_role) | Edge (publishable gate) | L'anonyme n'a aucune identité RLS : seul un RPC service_role peut écrire ; l'Edge fait rate-limit + validation Zod avant |
| Reservation read (guest) | Edge Function (publishable) | — | Aucune politique RLS ne peut servir un lecteur sans session : la lecture invitée passe par une action Edge qui valide le code puis rend une vue bornée |
| Surprise masking | Database view (0080 étendue) | — | Une RLS ne filtre pas une colonne ; la vue `SECURITY INVOKER` reste le seul mécanisme (commentaire 0080:4-12) |
| Guest name + reserve UX | Browser / Client | localStorage | Nom déclaré persisté localement (pré-remplissage), état de réservation relu depuis l'Edge (source de vérité) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `nodemailer` | pin exact, latest seen `10.0.15` [CITED: npm registry `npm view nodemailer version`] | SMTP send depuis l'Edge Deno | Exemple SMTP officiel de Supabase pour Edge Functions : `import nodemailer from 'npm:nodemailer@^9'` [CITED: https://github.com/supabase/supabase/raw/refs/heads/master/examples/edge-functions/supabase/functions/send-email-smtp/index.ts]. Chemin béni, pas d'alternative à évaluer |
| `zod` | `4.6.5` (déjà en place) | Validation entrées Edge (email destinataire, message hôte, nom invité) | Déjà le standard des Edge du dépôt [VERIFIED: supabase/functions/gift-list-invite/index.ts:66] |
| `@supabase/server` | `^1` via bare specifier | `withSupabase({auth:['user','publishable']})` multi-mode | Runtime épingle via `volumes/functions/deno.jsonc` [VERIFIED: supabase/functions/gift-list-invite/index.ts:62-64] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (aucune) | — | — | Pas de dépendance additionnelle : HMAC via `crypto.subtle` natif, template email en string literals, pas de HTML builder |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `nodemailer` (npm:) | `denomailer` / `@sholvoir/deno-smtp` (JSR natifs) | Natifs Deno mais non référencés par la doc Supabase, scores/adoption faibles (`@sholvoir/deno-smtp` 2 dl/semaine [CITED: https://jsr.io/@sholvoir/deno-smtp]) ; `denomailer` documente lui-même des restrictions de ports sur Deno Deploy [CITED: https://github.com/EC-Nordbund/denomailer]. Rejetés : l'exemple officiel tranche |
| SMTP direct | API HTTP type Resend | Hors phase : D-01 impose le SMTP de la stack, aucun tiers applicatif (AGENTS.md §8) |
| `transport.sendMail` callback | `await transport.sendMail(...)` (promesse) | Nodemailer résout une promesse quand aucun callback n'est passé (API documentée standard) [ASSUMED] ; l'exemple officiel enveloppe le callback dans `new Promise` — les deux marchent, préférer la forme promesse + `try/catch`, plus courte et déjà idiomatique du fichier |

**Installation:**
```bash
# Rien à installer : specifier npm: inline résolu par le runtime au déploiement.
# Épingler la version exacte dans l'import (pas de ^ flottant — AGENTS.md §2.1) :
#   import nodemailer from 'npm:nodemailer@10.0.15';
# Vérifier la version au moment d'écrire : npm view nodemailer version
```

**Version verification:** `nodemailer@10.0.15` confirmé au registre npm le 2026-10-06 (`npm view nodemailer version`) [CITED: npm registry]. L'exemple officiel cite `npm:nodemailer@^9` — pinner l'exacte v10 vue au registre et la valider par `deploy-functions.sh` + appel réel (le runtime Deno fige ses propres compatibilités ; seul un envoi réel prouve la compatibilité — cf. AGENTS.md §2.7.A).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `nodemailer` | npm | ~13 ans (2013) | ~100M+/mois (transports SMTP standard de l'écosystème) [ASSUMED] | github.com/nodemailer/nodemailer [CITED: npm registry page] | OK (référencé par l'exemple officiel Supabase — voir ci-dessus) | Approved — pinner version exacte, valider par envoi réel |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*Note : le gate `gsd-tools query package-legitimacy` n'est pas exécutable depuis cet environnement ; la légitimité repose sur l'exemple officiel Supabase + l'historique public du paquet. Le planificateur peut ajouter un `checkpoint:human-verify` avant le premier déploiement si la politique l'exige.*

## Architecture Patterns

### System Architecture Diagram

```
Hôte (dialogue partage)                    Serveur (Edge gift-list-invite)              Base (RPC service_role)
─────────────────────────                  ─────────────────────────────────            ─────────────────────────
[user-only + JWT]
  message? + email ──► send-email ──► Zod(email, message≤500) ──► RPC crée part lecture
                          │  (rate 5/min)      (gestion owner/admin revérifiée EN BASE)
                          │                      ──► nodemailer.sendMail via SMTP_* ──► 200 / 500 explicite
                          │                      (from = SMTP_ADMIN_EMAIL, reply-to = email hôte [ASSUMED])
[publishable, SANS session]
  code ──► guest-view ──► HMAC + RPC lecture bornée ──► { listName, items[{id,name,price,reserved:boolean}] }
                          │  (rate 30/min, oracle unique sur code invalide)
  code + nom ──► guest-reserve ──► RPC reserve_anonyme ──► { item, already_reserved }
                     (rate 10/min)    (verrou code FOR UPDATE, CHECK un-seul-auteur, oracle unique)
[compte invité classique — inchangé]
  code + session ──► redeem (existant) ──► branche membre / e-mail (0079+0082)
```

### Recommended Project Structure

Aucun fichier nouveau côté structure : extension en place (motif du dépôt : corriger vers l'avant, jamais de réécriture).
```
supabase/functions/gift-list-invite/index.ts   # + actions send-email / guest-view / guest-reserve
supabase/migrations/0089_gift_guest_reserve.sql # reserved_by_name + RPCs + vue + guard (nom exact au plan)
supabase/tests/0027_gift_guest.sql              # preuves invité (nom au plan)
app/src/modules/cadeaux/api.ts                  # + callGiftInvite publishable (sans JWT) + helpers invité
app/src/modules/cadeaux/components/gift-share-dialog.tsx  # + champ message + bouton Envoyer
app/src/modules/cadeaux/guest-cadeau-page.tsx   # + parcours nom + réserver sans compte
```

### Pattern 1: Nouvelle action Edge = entrée Zod + rate-limit + gate auth + RPC
**What:** Chaque action suit le shape existant : schéma `z.discriminatedUnion('action')`, `enforceRateLimit(request, action)` AVANT tout travail, gate `ctx.authMode`, puis `admin.rpc(...)` + `translateRpcError` à oracle unique [VERIFIED: supabase/functions/gift-list-invite/index.ts:123-154,221-242,388-425].
**When to use:** Pour `send-email` (gate `user` strict, comme les 4 actions actuelles) et pour les actions invitées (gate `publishable` explicite — renversement documenté de la garde OQ-1 lignes 402-408, à réécrire en : seules `create/revoke/summary/redeem/send-email` exigent `user`).
**Example:**
```typescript
// Source: motif existant supabase/functions/gift-list-invite/index.ts:221-242 + D-06
const LIMITS: Record<string, number> = {
  redeem: 8, create: 20, revoke: 20, summary: 30,
  'send-email': 5, 'guest-view': 30, 'guest-reserve': 10, // [ASSUMED] valeurs — discrétion agent (CONTEXT.md)
};
```

### Pattern 2: Écriture anonyme = RPC SECURITY DEFINER service_role-only
**What:** L'anonyme n'est ni `anon` utile ni `authenticated` : aucune politique RLS ne peut l'autoriser proprement. Toute mutation invitée passe par un RPC `SECURITY DEFINER`, `set search_path = ''`, `EXECUTE` accordé au seul `service_role`, qui (1) valide l'empreinte HMAC + état du code sous `FOR UPDATE`, (2) applique la mutation, (3) ne rend que des messages d'oracle uniforme [VERIFIED: supabase/migrations/0079_gift_invites.sql:270-378,383-390].
**When to use:** `guest_reserve` (réserver), et la lecture invitée si on choisit RPC plutôt que lecture Edge-via-service_role (les deux sont le même pouvoir ; préférer que l'Edge appelle le RPC pour garder une seule surface SQL testable — recommandation, pas contrainte).

### Pattern 3: Masquage surprise = vue SECURITY INVOKER étendue, jamais RLS
**What:** La vue `gift_items_for_list` rend `reserved_by` NULL au propriétaire via `private.current_member_id` [VERIFIED: supabase/migrations/0080_gift_items_mask.sql:26-46]. Avec l'anonyme, la vue doit masquer `reserved_by_name` dans le même `CASE` (le owner voit « réservé », pas le nom — D-07), et la lecture invitée ne doit exposer qu'un booléen `reserved` (ni FK ni nom — voir § pitfalls « oracle de présence »).
**When to use:** Migration vers l'avant (`CREATE OR REPLACE VIEW`), test 0026 §7 à étendre avec une ligne réservée-anonyme.

### Anti-Patterns to Avoid
- **Lire/écrire `gift_items` en direct depuis le client invité :** aucun JWT → RLS `authenticated` inapplicable ; toute lecture/écriture invitée passe par l'Edge publishable. Ne pas créer de politique `FOR SELECT TO anon` sur les tables cadeaux (éventrerait l'isolation inter-foyers).
- **Stocker le code brut ou le secret en base :** motif 0079 rappelé en en-tête de migration (lignes 28-31) — HMAC calculé Edge, base = empreinte seule.
- **`secure: Boolean(...)` sur une variable d'env :** l'exemple officiel fait `Boolean(Deno.env.get('SMTP_SECURE')!)` où toute chaîne non vide (même `"false"`) vaut `true` — ne pas recopier tel quel ; dériver `secure` du port (`=== 465`) [CITED: official example raw file], avec `requireTLS` pour 587 en prod [ASSUMED — option nodemailer standard].
- **Assertion SQL lisant le code source comme du texte :** instrument faible, règles AGENTS.md §2.7.D.6 — les nouvelles preuves doivent être comportementales (appeler le RPC, lire `sqlerrm`/compteurs).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Envoi SMTP (handshake, TLS, STARTTLS, MIME, DKIM-friendly headers) | Client SMTP maison sur `Deno.connect`/`startTls` | `nodemailer` (exemple officiel) | Négociation TLS/STARTTLS, encodages, files d'erreur : des centaines de cas limites ; Deno documente lui-même la danse STARTTLS comme non triviale [CITED: https://docs.deno.com/examples/starttls] |
| Validation email/message/nom | Regex maison | `zod` (déjà en place : `.email()`, `.min(1).max(80)`, transform `trim`) | Bornes D-06 (1-80) = shape existant des dossiers ; messages d'erreur FR déjà idiomatiques du fichier |
| Rate-limit distribué exact | Compteur Redis/DB synchrone par requête | Compteur mémoire existant + bornes DB (`max_uses`, `use_count`, verrou `FOR UPDATE`) | Le compteur mémoire est une atténuation anti-spam, pas un quota exact ; l'exactitude (pas de dépassement de `max_uses`, pas de double réserve) est garantie en base par le verrou pessimiste (motif 0079:292-296). Un compteur DB par requête ajouterait une contention eilée sans gain de sécurité prouvé |
| Template email | Moteur de template / HTML builder | String literals + texte brut, interpolation après strip `\r\n` | D-02 sobre + D-03 texte brut borné : aucun besoin de moteur ; chaque dépendance est une surface à auditer |

**Key insight:** La sécurité du périmètre invité ne repose sur aucun secret côté visiteur (le code EST le secret, transmis une fois) : elle repose sur (a) l'oracle unique, (b) le verrouillage en base, (c) le rate-limit Edge, (d) la modération organisateur. Ne pas ajouter de crypto maison (tokens de suivi, signatures invité) — D-09 l'interdit presque explicitement (pas de compte persistant).

## Common Pitfalls

### Pitfall 1: L'Edge publishable expose un oracle de validité des codes
**What goes wrong:** `guest-view`/`guest-reserve` rendent des erreurs différentes selon que le code est inconnu, expiré, épuisé ou révoqué → un attaquant énumère les codes actifs.
**Why it happens:** Tentant de rendre des messages « utiles » (« ce lien a expiré, demandez-en un autre »).
**How to avoid:** Réutiliser `translateRpcError` à l'identique : tout état de code invalide → 404 `Ce code est invalide.` [VERIFIED: supabase/functions/gift-list-invite/index.ts:257-262]. Les tests 0026 §6 (motif 0018, bloc begin/exception + `sqlerrm like '%code invalide%'`) prouvent chaque cas [VERIFIED: supabase/tests/0026_gift_invites.sql:273-326] — étendre aux nouvelles actions.
**Warning signs:** Un message d'erreur contenant « expiré », « épuisé » ou « révoqué » dans une réponse d'action invitée.

### Pitfall 2: Le relais SMTP devient un relais de spam
**What goes wrong:** `send-email` authentifié envoie un texte libre à une adresse arbitraire → un compte compromis (ou un membre malveillant) fait du serveur un canon à spam, avec la réputation du domaine.
**Why it happens:** D-01+D-03 combinent destinataire libre + message libre côté serveur.
**How to avoid:** (1) gate `user` + gestion owner/admin revérifiée EN BASE avant tout envoi (même motif que create/revoke) ; (2) rate-limit serré (`send-email: 5`/min/IP — discrétion agent) ; (3) message hôte texte brut borné (proposer ≤ 500 caractères [ASSUMED]) + strip `\r\n` sur tous les interpolés d'en-tête (nom, liste) contre l'injection d'en-têtes ; (4) l'envoi crée d'abord la part `lecture` (D-04) — un envoi = une trace en base, jamais d'envoi sans part ; (5) `from` fixe = `SMTP_ADMIN_EMAIL`, jamais l'email de l'hôte (reply-to = hôte si besoin [ASSUMED]). Documenter le risque résiduel en risques acceptés.
**Warning signs:** Revue où l'envoi précède la vérification de gestion, ou `to` non validé par Zod `.email().max(320)` (borne existante ligne 152).

### Pitfall 3: `reserved_by` FK ne peut pas porter l'anonyme — et le CHECK doit l'interdire
**What goes wrong:** Écrire le nom déclaré dans `reserved_by` (colonne `text` référençant `household_members.id` [VERIFIED: supabase/migrations/0004_tables_shared.sql:77]) casse la FK ; écrire un id membre « au hasard » usurpe un membre.
**Why it happens:** La colonne est `text`, rien n'empêche visuellement d'y mettre un nom.
**How to avoid:** Nouvelle colonne `reserved_by_name text CHECK (char_length(btrim(...)) BETWEEN 1 AND 80)` + CHECK de mutualité : `NOT (reserved_by IS NOT NULL AND reserved_by_name IS NOT NULL)` ; « réservé » = l'une des deux non-NULL ; « libre » = les deux NULL. Le guard 0083 (qui fige les non-gestionnaires à `reserved_by = soi ou NULL` [VERIFIED: supabase/migrations/0083_gift_reserve_update.sql:81-88]) doit être étendu : un non-gestionnaire authentifié ne touche JAMAIS à `reserved_by_name` (42501), seul le RPC service_role l'écrit.
**Warning signs:** Migration sans CHECK de mutualité, ou guard qui compare `coalesce(NEW.reserved_by_name,'')` sans distinguer les rôles.

### Pitfall 4: Dev (Inbucket:2500 sans auth) vs prod (465/587 avec auth) — un seul code, deux régimes
**What goes wrong:** Code testé en dev (sans auth, sans TLS) qui échoue en prod (auth/TLS), ou l'inverse : `auth` passé avec user vide → 535 du relais.
**Why it happens:** Le `.env` de prod vise `SMTP_PORT=465` [CITED: AGENTS.md §8.4 / docs/BACKEND.md:115] tandis que la stack locale utilise `supabase-mail:2500` avec `SMTP_USER`/`SMTP_PASS` factices [VERIFIED: supabase-project/.env:187-191] et le dev override vide user/pass [VERIFIED: supabase-project/dev/docker-compose.dev.yml:29-31].
**How to avoid:** Construire le transport ainsi : `secure = port === 465` ; `auth` OMISE (pas vide) si `SMTP_USER` absent ; `requireTLS: true` quand `SMTP_PORT` est 587 en prod [ASSUMED — option nodemailer standard, à valider par envoi réel]. Fail-closed D-01 : `SMTP_HOST`/`SMTP_PORT` absents → 500 explicite AVANT toute tentative (motif `checkSecret` [VERIFIED: supabase/functions/gift-list-invite/index.ts:290-296]) ; `SMTP_USER`/`SMTP_PASS` absents + port ≠ 2500/dev → 500 aussi (pas d'envoi anonyme vers un relais prod). Le plan doit prévoir un test d'envoi réel contre Inbucket local (API HTTP `:9000`) comme preuve, pas seulement contre un mock.
**Warning signs:** `auth: { user: Deno.env.get('SMTP_USER')! }` avec `!` sur une valeur vide ; `secure: true` en dur avec port 2500.

### Pitfall 5: SMTP_* n'atteint pas le runtime `functions` sans modification d'override
**What goes wrong:** `Deno.env.get('SMTP_HOST')` vaut `undefined` en prod alors que le `.env` contient les valeurs — parce que seules les variables déclarées dans `functions.environment` du `docker-compose.traefik.yml` traversent.
**Why it happens:** Le `.env` est lu par Compose, pas par les conteneurs : chaque variable doit être mappée service par service. Aujourd'hui `functions` reçoit HMAC/VAPID/SUPABASE_* mais PAS `SMTP_*` [VERIFIED: supabase-project/docker-compose.traefik.yml:65-100].
**How to avoid:** Le plan inclut : ajouter `SMTP_HOST: ${SMTP_HOST:-}`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME` au bloc `functions.environment` (avec `:-` pour éviter les WARN Compose — motif VAPID documenté dans le même fichier), reporter les valeurs dans `supabase-project/.env` (jamais versionné), `sh run.sh recreate functions`. Côté GoTrue, `GOTRUE_SMTP_*` sont déjà mappés depuis les mêmes noms [VERIFIED: supabase-project/docker-compose.yml:165-170] — pas de collision (services distincts), mais documenter que les deux familles partagent le relais et ses quotas.
**Warning signs:** Test local vert (variables injectées à la main) puis 500 en staging.

### Pitfall 6: L'invité « perd » sa réservation (aucun moyen de la reconnaître)
**What goes wrong:** « Mamie » réserve depuis son téléphone, rouvre le lien le lendemain : rien ne dit « c'est vous qui avez réservé le puzzle » → double-réserve ou confusion.
**Why it happens:** D-09 interdit tout compte persistant ; sans identifiant, l'Edge ne peut pas relier deux visites.
**How to avoid:** Ne PAS créer de token de suivi (D-09) : persister `{ code, nomDéclaré }` en `localStorage` (pré-remplissage + mise en évidence « réservé par vous (Mamie) » — purement cosmétique, jamais une preuve). Idempotence serveur : même nom + même article → `{ already_reserved: true }` (pas d'erreur, pas de compteur) ; nom différent + article déjà réservé → 409 `déjà réservé` (message NON-oracle : l'état « réservé » est visible de tout porteur du lien, donc pas de fuite). Documenter la limite : deux invités déclarant le même nom se confondent — usurpation acceptée D-09.
**Warning signs:** Design où l'invité peut « libérer » sa propre réservation sans preuve — refuser (seul l'organisateur libère, D-08).

### Pitfall 7: La vue invitée expose les noms des réserveurs (fuite + aide au spoofing)
**What goes wrong:** `guest-view` rend `reserved_by_name` en clair → un porteur de lien apprend qui a réservé quoi (vie privée du foyer) et peut usurper précisément (« Mamie » existe déjà, je réserve en son nom).
**Why it happens:** Recopie naïve de la vue 0080 côté invité.
**How to avoid:** La charge utile invitée ne contient que `{ id, name, price, comment?, reserved: boolean }` — jamais `reserved_by` ni `reserved_by_name` [ASSUMED — pas de décision CONTEXT, à confirmer en plan]. Symétrique à D-07 (le owner ne voit pas les noms) : personne hors gestionnaire ne voit les noms. Test négatif : la réponse `guest-view` ne contient aucune clé `reserved_by*`.
**Warning signs:** Sérialisation `select *` renvoyée telle quelle depuis l'Edge.

## Code Examples

### Envoi SMTP depuis l'Edge (motif officiel, à adapter)
```typescript
// Source: https://github.com/supabase/supabase/raw/refs/heads/master/examples/edge-functions/supabase/functions/send-email-smtp/index.ts
import nodemailer from 'npm:nodemailer@^9'; // pinner exact, ex. @10.0.15 — AGENTS.md §2.1
const transport = nodemailer.createTransport({
  host: Deno.env.get('SMTP_HOSTNAME')!,
  port: Number(Deno.env.get('SMTP_PORT')!),
  secure: Boolean(Deno.env.get('SMTP_SECURE')!), // NE PAS recopier : toute chaîne non vide vaut true — dériver du port
  auth: { user: Deno.env.get('SMTP_USERNAME')!, pass: Deno.env.get('SMTP_PASSWORD')! }, // omettre si relais sans auth (dev :2500)
});
await new Promise<void>((resolve, reject) => {
  transport.sendMail({ from: ..., to: ..., subject: ..., text: ... }, (error) => error ? reject(error) : resolve());
});
// Préférer : await transport.sendMail({...}) — forme promesse standard [ASSUMED]
```

### Gabarit sobre (recommandation — discrétion agent sur HTML vs texte)
```typescript
// Source: motif proposé (sobre, D-02 + D-03) — texte brut, sujet sans \r\n
const stripBreaks = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();
subject: `${stripBreaks(hostName)} vous partage sa liste « ${stripBreaks(listName)} »`,
text: [
  `${hostName} (${householdName}) vous partage sa liste « ${listName} ».`,
  `Ouvrir la liste : ${inviteUrl}`,
  ...(expiresAt ? [`Ce lien expire le ${expiresAt.slice(0, 10)}.`] : []),
  ...(hostMessage ? ['', 'Message de ' + hostName + ' :', hostMessage] : []), // ≤500 car, Zod .max(500) [ASSUMED]
].join('\n'),
// from: SMTP_ADMIN_EMAIL + `SMTP_SENDER_NAME` ; reply-to: email de l'hôte [ASSUMED — à trancher au plan]
```

### Squelette RPC réserve anonyme (shape 0079, à écrire en migration)
```sql
-- Source: motif supabase/migrations/0079_gift_invites.sql:270-378 (verrou FOR UPDATE + oracle unique)
-- create or replace function public.guest_reserve_gift_item(p_token_hash text, p_item_id text, p_name text)
--   ... set search_path = '' ...
--   1. hash ~ '^[0-9a-f]{64}$' sinon 'code invalide' (22023)
--   2. SELECT invite ... FOR UPDATE + token_hash_matches ; invalide/expired/épuisé → 'code invalide' (P0002)
--   3. item.list_id = invite.list_id sinon 'code invalide' (pas de fuite inter-listes)
--   4. nom : btrim 1-80 sinon 'nom invalide' (22023, message NON-oracle : ne révèle rien du code)
--   5. item déjà réservé (par l'un ou l'autre auteur) :
--        même reserved_by_name (comparaison insensible casse/accents ? btrim+lower [ASSUMED]) → already_reserved:true
--        autre auteur → 'article déjà réservé' (409)
--   6. UPDATE gift_items SET reserved_by_name = v_nom WHERE id = ... (service_role, RLS bypassée en SECURITY DEFINER)
--   7. use_count++ UNIQUEMENT si le code n'a jamais servi CE NOM sur CETTE LISTE ? — NON :
--      le compteur borne les ÉCHANGES (redeem), pas les réserves. Ne pas consommer use_count sur reserve
--      (un invité légitime réserve N articles). L'anti-spam = rate-limit Edge + modération. [recommandation — à trancher au plan]
-- GRANT EXECUTE au seul service_role + assertions has_function_privilege (motif 0079:392-404).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OQ-1 OPTION A : Edge user-only, aucun chemin anonyme [VERIFIED: gift-list-invite/index.ts:17-22] | Override D-05 : action publishable `redeem-guest`/`guest-reserve` + colonne auteur anonyme | 2026-10-06 (CONTEXT.md) | La garde `401 si non-user` lignes 404-408 doit devenir par-action ; T-05-04 re-prouvé pour chaque action invitée |
| `reserved_by` seul (FK membre) [VERIFIED: 0004_tables_shared.sql:77] | `reserved_by` + `reserved_by_name` mutuellement exclusifs | Cette phase | Vue 0080 + guard 0083 à étendre ; RLS `gift_items_insert … member_in_household(coalesce(reserved_by,…))` [VERIFIED: 0007_rls_policies.sql:479-484] inchangée (l'anonyme n'INSERT jamais, il UPDATE via RPC) |
| Partage e-mail = `lecture` puis surclassement au redeem (0082) | Envoi email crée la part `lecture` (D-04), redeem-compte existant surclasse | Inchangé | `send-email` réutilise le même INSERT part que le dialogue ; aucun changement 0082 |

**Deprecated/outdated:**
- `secure: Boolean(Deno.env.get(...))` de l'exemple officiel : toute chaîne non vide → `true`. Ne pas recopier ; dériver du port.
- Deno Deploy bloque les ports SMTP sortants (25/465/587) [CITED: questions.deno.com + stackoverflow ci-dessus] — SANS OBJET ici (fonctions auto-hébergées = conteneur Docker réseau complet), mais le rappel compte si quelqu'un propose de tester sur Deploy.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `await transport.sendMail()` forme promesse supportée par nodemailer v10 | Standard Stack | Faible : repli = enveloppe `new Promise` de l'exemple officiel, 3 lignes |
| A2 | Valeurs rate-limit (`send-email:5`, `guest-view:30`, `guest-reserve:10`/min/IP) | Patterns | Faible : discrétion agent explicite (CONTEXT.md) ; le plan tranche, les tests prouvent le 429 |
| A3 | Message hôte ≤ 500 car ; `from` = SMTP_ADMIN_EMAIL ; reply-to = hôte | Code Examples, Pitfalls | Moyen : trancher au plan/discuss ; impact template + tests Vitest uniquement |
| A4 | Charge invitée = booléen `reserved` seul, sans noms | Pitfalls §7 | Moyen : choix UX/vie-privée non verrouillé en CONTEXT ; confirmer avant d'écrire la vue Edge |
| A5 | `requireTLS` (587) + `auth` omise si user vide + comparaison nom `lower(btrim())` | Pitfalls §4, Code Examples | Moyen : valider par envoi réel dev (Inbucket) + test SQL comportemental, pas par lecture de doc |
| A6 | `use_count` NON consommé par les réserves invitées (borne les échanges, pas les réserves) | Code Examples | Moyen : alternative = consommer 1/liste-invité-réserve ; trancher au plan (impact oracle `épuisé` pour invités légitimes multi-articles) |
| A7 | Statistiques paquet (âge/downloads nodemailer) | Legitimacy | Nul : la légitimité repose sur l'exemple officiel, pas les chiffres |

## Open Questions

1. **From exact + reply-to de l'email d'invitation**
   - What we know: `SMTP_ADMIN_EMAIL` (adresse) + `SMTP_SENDER_NAME` existent dans la stack [VERIFIED: supabase-project/docker-compose.yml:165-170] ; D-02 exige « qui invite (nom membre + foyer) » dans le contenu.
   - What's unclear: `from` = nom hôte <admin@> + reply-to hôte, ou from générique seul ?
   - Recommendation: from = `SENDER_NAME` + reply-to = email du profil hôte (délivrabilité SPF/DKIM alignée sur le domaine, réponse possible) — trancher au plan (A3).

2. **Le compteur `use_count` borne-t-il les réserves invitées ?**
   - What we know: aujourd'hui il borne les ÉCHANGES (un échange = un partage) [VERIFIED: 0079:336-343].
   - What's unclear: un invité sans partage persistant qui réserve 5 articles consomme-t-il 5 ?
   - Recommendation: non (A6) — sinon un invité légitime multi-articles épuise le code ; l'anti-abus = rate-limit + modération D-08. Verrouiller au plan.

3. **Lecture invitée : RPC dédié ou Edge-via-service_role direct ?**
   - What we know: les deux ont le même pouvoir (clé secrète) ; le motif 0079 préfère le RPC testable en SQL.
   - What's unclear: la charge invitée mérite-t-elle un RPC `guest_view_gift_list` versionné ?
   - Recommendation: oui — même testabilité SQL que redeem (0026 §7), oracle prouvé en base, Edge mince.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Relais SMTP dev (Inbucket `supabase-mail:2500`, sans auth) | Preuve d'envoi réelle en dev | ✓ (config) | inbucket 3.0.3 [VERIFIED: supabase-project/dev/docker-compose.dev.yml] | Mock nodemailer en Vitest (jamais comme seule preuve — AGENTS.md §2.7.F) |
| Interface Inbucket `:9000` (API REST de lecture des mails) | Assertion e2e « email bien parti » | ✓ (config, port 9000 publié) | — | `test-dispatch-push.sh`-style : script shell attribuable contre l'API Inbucket [ASSUMED — API Inbucket v3 à confirmer au plan] |
| `functions` runtime (self-hosted, réseau complet) | `npm:nodemailer` + TCP sortant SMTP | ✓ (arch.) | — | Aucun — si le TCP sortant est filtré en prod, l'envoi échoue fermé (500) et le runbook l'indique |
| SMTP prod (HOST/PORT/USER/PASS/SENDER) | Envoi réel en prod | ✗ (à provisionner) | — | Bloquant prod uniquement : dev = Inbucket ; le plan ajoute les `functions.environment` + runbook `.env` |
| Docker ( disposable `test-db.sh`) | Preuves SQL 0027 | À vérifier à l'exécution (`sh scripts/test-db.sh`) | — | `check-sql-statique.py` + relecture (jamais « SQL bon » sans exécution — AGENTS.md §2.7) |

**Missing dependencies with no fallback:**
- Valeurs SMTP prod (HOST/PORT/USER/PASS/ADMIN/SENDER) — à provisionner par l'exploitant avant la recette prod ; le code échoue fermé sans elles (D-01).

**Missing dependencies with fallback:**
- Inbucket joignable ou non en CI : repli = tests SQL (0027) + Vitest MSW + e2e sans assertion mail, avec mention explicite de l'absence (AGENTS.md §2.7, leçon `test-dispatch-push.sh`).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pgTAP-style `testkit` SQL via `sh scripts/test-db.sh` + Vitest 5 + Playwright |
| Config file | `scripts/test-db.sh` / `app/vitest.config.*` / e2e Playwright |
| Quick run command | `python3 scripts/check-sql-statique.py` puis ciblé Vitest cadeaux |
| Full suite command | `cd app && npm run typecheck && npm test && npm run build` + `sh scripts/test-db.sh` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01 send réel + fail-closed | 500 explicite sans SMTP_* ; envoi réel Inbucket en dev | integration (shell attribuable) + unit (sans-secret → 500) | nouveau `scripts/test-gift-mail.sh` (style dispatch-push) | ❌ Wave 0 |
| D-02/D-03 gabarit + message | Template contient hôte/foyer/liste/lien/expiration + message borné, strip \r\n | unit (Vitest, template pur extrait en helper testable) | `npm test -- cadeaux` | ❌ Wave 0 |
| D-05/D-06 redeem-guest | RPC réserve anonyme : code requis, nom 1-80, oracle unique, rate-limit Edge | sql (`0027`) + unit Edge (429) | `sh scripts/test-db.sh` | ❌ Wave 0 (étendre `0026`) |
| D-07 masquage | Vue masque `reserved_by_name` au owner ; `guest-view` sans noms | sql (`0027`, §7-like) + assertion charge Edge | `sh scripts/test-db.sh` | ❌ Wave 0 |
| D-08 libération organisateur | Manager libère (membre+anonyme) ; non-manager refusé (42501) ; invité ne libère pas | sql négatif (`0027`) | `sh scripts/test-db.sh` | ❌ Wave 0 |
| D-09 usurpation acceptée | Même nom par 2 visiteurs → confondus (documenté, pas bloqué) | sql comportemental + note risques | `sh scripts/test-db.sh` | ❌ Wave 0 |
| D-04 part lecture conservée | `send-email` crée part `lecture`, redeem-compte surclasse (0082 inchangé) | sql + e2e | existant 0026 + e2e invité | Partiel (étendre) |
| UX invité | Nom→réserver sans compte, localStorage, libellés | Vitest (`guest-cadeau-page.test.tsx` existe, 88 lignes) + e2e | `npm test -- guest-cadeau` + Playwright | Partiel (étendre) |

### Sampling Rate
- **Per task commit:** `python3 scripts/check-sql-statique.py` + Vitest ciblé cadeaux
- **Per wave merge:** `cd app && npm run typecheck && npm test && npm run build`
- **Phase gate:** Full suite + `sh scripts/test-db.sh` vert avant `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `supabase/tests/0027_gift_guest.sql` — réserve anonyme, libération, masquage étendu, oracle invité, usurpation documentée
- [ ] `scripts/test-gift-mail.sh` — preuve d'envoi attribuable contre Inbucket (ou constat d'absence explicite)
- [ ] Helper template email extrait de l'Edge (testable Vitest) + tests bornes/injection `\r\n`
- [ ] `app/e2e/cadeaux-contacts.spec.ts` — parcours invité nom+réserve (existe : 83 lignes, à étendre, pas à créer)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `send-email` = `user` + gestion revérifiée EN BASE ; actions invitées = `publishable` + code-HMAC (pas d'auth, capacité = le lien) |
| V3 Session Management | no | Aucune session invitée (D-09) ; localStorage = préférence cosmétique, jamais preuve |
| V4 Access Control | yes | RPC service_role-only + `has_function_privilege` assertions ; guard 0083 étendu (`reserved_by_name` intouchable hors RPC) ; libération = manager-only |
| V5 Input Validation | yes | Zod Edge (email 320, message ≤500 [ASSUMED], nom 1-80, code base64url ≥22) + CHECK SQL miroirs + strip `\r\n` en-têtes mail |
| V6 Cryptography | yes | HMAC-SHA-256 `crypto.subtle`, secret ≥256 bits, `token_hash_matches` temps constant (motif 0079, jamais hand-roll) |
| V9 Communications | yes | `secure`/STARTTLS dérivé du port, certificats vérifiés (`rejectUnauthorized` défaut) ; aucun secret en clair (ni base, ni logs, ni `cron.job.command`) |

### Known Threat Patterns for Edge SMTP + anonymous reserve

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Spam via `send-email` (relais) | Abuse | Gestion-only + rate 5/min + part-lecture-trace + message borné (Pitfall 2) |
| Énumération de codes (oracle) | Information disclosure | Message unique `code invalide` partout, y compris `guest-view`/`guest-reserve` (Pitfall 1) |
| Usurpation de nom déclaré | Spoofing | Acceptée D-09 : lien privé + modération + noms invisibles (Pitfall 7) ; documentée en risques acceptés |
| Injection d'en-têtes mail (`\r\n` dans nom/message) | Injection | Strip `\r\n` + Zod `.max()` sur tout interpolé |
| Épuisement `max_uses` par spam de réserves | Denial of service | `use_count` non consommé par réserves (A6 à verrouiller) + rate-limit + révocation organisateur |
| Double-réserve concurrente (TOCTOU) | Tampering | `FOR UPDATE` sur l'invite + UPDATE atomique item (motif 0079) ; test de concurrence si le harnais le permet |

## Sources

### Primary (HIGH confidence)
- `supabase/functions/gift-list-invite/index.ts` — shape Edge complet (Zod, rate-limit, oracle, checkSecret), lu en entier
- `supabase/migrations/0079_gift_invites.sql`, `0080_gift_items_mask.sql`, `0081_author_update_fix.sql`, `0082_gift_redeem_upgrade.sql`, `0083_gift_reserve_update.sql`, `0004_tables_shared.sql:77`, `0007_rls_policies.sql` (cadeaux), `0006_security_helpers.sql` (`can_write_gift_list`) — lus en entier ou sections citées
- `supabase/tests/0026_gift_invites.sql` — motifs de preuve (0018, bornes, idempotence, vue), lu en entier
- `supabase/supabase` official `send-email-smtp` example (raw) — `npm:nodemailer@^9` dans Deno — https://github.com/supabase/supabase/raw/refs/heads/master/examples/edge-functions/supabase/functions/send-email-smtp/index.ts
- `supabase-project/docker-compose.traefik.yml` (`functions.environment`), `supabase-project/docker-compose.yml` (GOTRUE_SMTP_*), `supabase-project/.env:187-191`, `dev/docker-compose.dev.yml` (Inbucket) — lus
- `app/src/modules/cadeaux/{api.ts,guest-cadeau-page.tsx,components/gift-share-dialog.tsx}` — points d'intégration UI, lus

### Secondary (MEDIUM confidence)
- npm registry — `nodemailer@10.0.15` (`npm view`, 2026-10-06)
- Deno docs STARTTLS example — https://docs.deno.com/examples/starttls (complexité du non-nodemailer)
- JSR `@sholvoir/deno-smtp` (adoption faible) ; denomailer repo (restrictions Deploy)

### Tertiary (LOW confidence)
- Options nodemailer (`requireTLS`, forme promesse v10), API REST Inbucket v3 — marquées [ASSUMED], à valider par exécution réelle

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — exemple officiel + registre + style in-repo convergent ; seule la version exacte à re-fixer au moment d'écrire
- Architecture: HIGH — motifs 0079/0080/0083 directement étendus, aucun mécanisme nouveau sauf `sendMail`
- Pitfalls: HIGH pour oracle/spam/schema/env (preuves in-repo) ; MEDIUM pour détails TLS nodemailer (doc non relue en entier, validation par envoi réel exigée)

**Research date:** 2026-10-06
**Valid until:** 2026-11-05 (stable ; re-vérifier `nodemailer` latest + exemple officiel si le plan tarde)
