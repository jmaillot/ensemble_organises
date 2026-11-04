# Phase 31: Inscriptions ouvertes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-03
**Phase:** 31-inscriptions-ouvertes
**Areas discussed:** Consultation pré-auth du foyer, Traversée du token post-confirmation, Identité expéditeur & preuves email, Mentions légales — contenu réel, UI gouvernance du token, UI du pré-écran d'invitation

---

## Consultation pré-auth du foyer

| Option | Description | Selected |
|--------|-------------|----------|
| Edge dédiée | Edge `household-invite-preview` distincte, surface minimale, Edge de redeem inchangée | ✓ |
| Mode preview sur l'Edge existante | Moins de code, mais la Edge de redeem porte une seconde responsabilité publique | |
| RPC SQL public | Pas d'Edge, mais surface PostgREST supplémentaire à sécuriser | |

**User's choice:** Edge dédiée
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Nom du foyer seul (+ inviteur) | Réponse minimale : `household_name` (+ prénom inviteur si disponible) | ✓ |
| Nom + couleur | Pré-écran plus chaleureux, fuite marginale en plus | |

**User's choice:** Nom du foyer (+ inviteur, précisé en discussion du pré-écran)
**Notes:** L'inviteur a été ajouté lors de la zone « UI du pré-écran » ; la réponse reste minimale et uniforme pour un token mort.

| Option | Description | Selected |
|--------|-------------|----------|
| Réponse uniforme | Même code HTTP et même message pour tout token non valide — anti-énumération | ✓ |
| Codes distincts | Plus facile à déboguer, mais énumérable | |

**User's choice:** Réponse uniforme
**Notes:** La distinction inconnu/expiré/épuisé n'existe que côté redeem authentifié.

| Option | Description | Selected |
|--------|-------------|----------|
| Gabarit existant | Rate-limit applicatif de `household-invite` comme gabarit | ✓ |
| Traefik + applicatif | Double barrière, config en plus | |

**User's choice:** Gabarit existant
**Notes:** —

## Traversée du token post-confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| sessionStorage | Token copié à l'arrivée sans session ; survit à la sortie de l'app pour la confirmation email | ✓ |
| URL / state router seul | Fragile : la confirmation email quitte l'app | |

**User's choice:** sessionStorage
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Retour générique | Lien de confirmation vers `SITE_URL`, token réinjecté par sessionStorage — jamais dans l'email | ✓ |
| Token dans l'email | Visible en clair dans le mail et les logs de messagerie | |

**User's choice:** Retour générique
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Pré-écran + confirmation | Bouton « Rejoindre » — consentement explicite avant d'entrer dans le foyer | ✓ |
| Application silencieuse | Aterrit dans le foyer sans confirmation | |

**User's choice:** Pré-écran + confirmation
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Message + état normal | Message dédié puis état normal (choix créer/rejoindre) — jamais bloqué | ✓ |
| Silencieux | Retour accueil sans explication | |

**User's choice:** Message + état normal
**Notes:** —

## Identité expéditeur & preuves email

| Option | Description | Selected |
|--------|-------------|----------|
| noreply@votredomaine.fr | Alias « Envoyer en tant que » classique | |
| Autre adresse | Alias au choix de l'éditeur | ✓ |

**User's choice:** Autre adresse → **contact@jeremymaillot.fr** (réponse libre)
**Notes:** Premier réflexe de l'éditeur : `jeremymaillot@gmail.com` — signalé comme interdit par la Prohibition ② (FROM jamais l'adresse Gmail brute) ; l'éditeur a alors donné `contact@jeremymaillot.fr`, configuré comme alias « Envoyer en tant que » du compte Gmail relais.

| Option | Description | Selected |
|--------|-------------|----------|
| Inscription réelle | Email de confirmation de prod aux deux comptes, captures datées de la boîte de réception dans 31-UAT.md | ✓ |
| Email de test | Hors flux réel — ne prouve pas le flux | |

**User's choice:** Inscription réelle
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Doc GoTrue + test réel | Valeurs relevées de la doc, citées avec source, rafale manuelle prouve le 429 | ✓ |
| Sans test de rafale | L'acceptance exige le 429 constaté | |

**User's choice:** Doc GoTrue + test réel
**Notes:** —

## Mentions légales — contenu réel

| Option | Description | Selected |
|--------|-------------|----------|
| Jeremy Maillot (EI) | Entrepreneur individuel, éditeur et directeur de publication | ✓ |
| Autre structure | Société, association… | |

**User's choice:** Jeremy Maillot (EI)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-hébergé | « Hébergé par l'éditeur lui-même sur son propre serveur » + contact | ✓ |
| Hébergeur tiers | À nommer | |

**User's choice:** Auto-hébergé
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| contact@jeremymaillot.fr | Cohérent avec l'alias expéditeur | ✓ |
| Autre adresse | — | |

**User's choice:** contact@jeremymaillot.fr
**Notes:** —

## UI gouvernance du token

| Option | Description | Selected |
|--------|-------------|----------|
| Enrichir l'existant | `invitations-panel.tsx` enrichi : défauts pré-remplis + liste + révocation | ✓ |
| Nouvel écran dédié | Duplication de surface paramètres | |

**User's choice:** Enrichir l'existant
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Anonymisée | Création, expiration, compteur, statut — jamais le token brut | ✓ |
| Pas de liste | Révocation globale uniquement | |

**User's choice:** Anonymisée
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Individuelle + modale | Token par token, confirmation par modale (AGENTS.md §6) | ✓ |
| Globale seule | Régénérer uniquement | |

**User's choice:** Individuelle + modale
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Trois distincts | « invalide » / « a expiré » / « a atteint sa limite » — côté redeem | ✓ |
| Un générique | Moins aidant pour l'admin | |

**User's choice:** Trois distincts
**Notes:** La surface publique (pré-écran) reste uniforme (anti-énumération).

## UI du pré-écran d'invitation

| Option | Description | Selected |
|--------|-------------|----------|
| Écran dédié | `join-household-page` sur primitives existantes ; sign-in-page reste centrée auth | ✓ |
| Bandeau sur sign-in | Mélange deux intentions sur la page générique | |

**User's choice:** Écran dédié
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Un gabarit, deux actions | Connecté : « Rejoindre » direct ; étranger : « Continuer vers l'inscription » | ✓ |
| Deux écrans | Duplication | |

**User's choice:** Un gabarit, deux actions
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Nom du foyer + inviteur si possible | « Marie t'invite à rejoindre [Nom du foyer] » — sinon formule impersonnelle | ✓ |
| Verbatim SPEC seul | Strictement « Vous avez été invité au foyer X » | |

**User's choice:** Nom du foyer + inviteur si possible
**Notes:** Le point de consultation renvoie le nom + prénom inviteur si disponible ; réponse uniforme et minimale pour un token mort.

---

## the agent's Discretion

- Seuil applicatif du rate-limit du point de consultation (gabarit `household-invite`)
- Forme exacte de l'Edge preview (mode d'auth, signature, gabarit `withSupabase`)
- Mécanique sessionStorage (durée de vie, nettoyage, multi-onglets)
- Verbatim finaux des messages dédiés et du pré-écran
- Structure du formulaire de création enrichi et sa validation client/serveur
- Gabarit de la page mentions légales et emplacement des liens depuis CGU/confidentialité
- Modalités du rafale-test GoTrue 429

## Deferred Ideas

Aucune — la discussion est restée dans le périmètre de la phase.
