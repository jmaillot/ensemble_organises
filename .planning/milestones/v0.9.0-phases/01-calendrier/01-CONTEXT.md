# Phase 01: calendrier - Context

**Gathered:** 2026-10-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Calendriers Commun/Perso par membre adulte, catégories Repas/Médical/École/Sport + customs,
vues Liste/Jour/Semaine/Mois avec FilterBar cumulable, couches fériés/vacances en lecture
seule toujours visibles, refresh via Edge cron (janv + sept, Europe/Paris). Pas de récurrence
d'événements, pas de partage d'événement hors foyer, pas d'invitations/RSVP — hors phase.

</domain>

<decisions>
## Implementation Decisions

### Calendriers Commun vs Perso
- **D-01:** Perso invisible total : ni lecture ni écriture pour les autres membres, même admin.
  — **Reversibility:** costly — la RLS et les tests négatifs inter-foyer sont écrits contre
  l'invisibilité ; ouvrir la lecture admin impose de nouvelles politiques + preuves.
- **D-02:** Un Perso par membre adulte, créé avec le foyer, plus le Commun partagé. Pas de
  création libre de calendriers.
- **D-03:** Nouvel événement : choix explicite du calendrier à la création, jamais de
  rattachement silencieux. (Le défaut 0048 Commun-assignment reste un filet serveur, pas l'UX.)
- **D-04:** L'auteur déplace son événement librement Commun↔Perso, avec confirmation
  Perso→Commun (sortie du secret).
- **D-05:** Enfants : pas de Perso, leurs événements vivent dans le Commun.

### Catégories
- **D-06:** Seed Repas/Médical/École/Sport + customs créés par tout membre adulte ; les enfants
  taguent sans créer.
- **D-07:** La catégorie colore l'événement ; la couleur membre reste sur avatars et vues
  filtrées par membre. En cas de conflit catégorie gagne (surcharge D-03-calendrier-couleur-membre).
- **D-08:** Renommage/suppression interdits si des événements utilisent la catégorie ; sinon
  libres pour un adulte (seed inclus).

### Filtres et vues
- **D-09:** FilterBar tout cumulable : calendriers + catégories + membres + couches
  fériés/vacances.
- **D-10:** Fériés et vacances toujours visibles, en fond non cliquable, jamais masquables ni
  modifiables.
- **D-11:** Création depuis la grille par tap-and-hold (date pré-remplie, calendrier explicite) ;
  le bouton + reste l'autre entrée.
- **D-12:** Vue Mois par défaut avec pastilles, Jour au clic sur une date, Semaine et Liste en
  onglets.

### Refresh fériés/vacances
- **D-13:** Sources officielles : data.gouv (fériés) + Éducation nationale (vacances par zone),
  mises en cache en base (tables 0047).
- **D-14:** Cron janvier (année en cours) + septembre (rentrée), Europe/Paris, via Edge
  `refresh-calendrier-ref`.
- **D-15:** API en panne au refresh : ancien cache conservé et affiché, sans erreur bloquante,
  retry au prochain passage.
- **D-16:** Zone scolaire auto-détectée avec override manuel en paramètres du foyer.

### the agent's Discretion
Forme exacte de la FilterBar, libellés des confirmations de déplacement, détail du rendu
pastille catégorie.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase et produit
- `.planning/PHASES/01-calendrier.md` — spec de phase (migrations, RLS, Edge cron, UI, critères 11 fériés / vacances par zone / perso invisible / toggles lecture seule)
- `.planning/ROADMAP.md` — Phase 1 : calendriers Commun/Perso, catégories, 4 vues, cache fériés/vacances + zone A/B/C
- `AGENTS.md` §2 — stack (Dexie, Storage privé, Edge), §2.6 RLS, §2.7 chaîne de vérification, §6 tuiles/couleurs membres/actions destructrices

### Code à réutiliser
- `app/src/modules/calendrier/calendrier-page.tsx` — 4 vues existantes (mois/semaine/jour/liste), à étendre (FilterBar, tap-and-hold, couche ref)
- `app/src/modules/calendrier/api.ts` — requêtes event_calendars / event_categories / events / holidays
- `app/src/modules/calendrier/types.ts` — toCalendarEvent, CalendarEvent (calendarId, categoryId, categoryName)
- `app/src/modules/calendrier/hooks/use-ref-days.ts`, `use-school-zone.ts`, `lib/zone-resolver.ts` — fériés/vacances/zone existants
- `app/src/modules/calendrier/components/calendar-grid.tsx`, `agenda-list.tsx`, `event-form-dialog.tsx` — base UI à étendre
- `supabase/migrations/0047_calendrier.sql`, `0048_calendrier_default.sql`, `0049_calendrier_realtime.sql`, `0052_folders_triggers_seed.sql`, `0054_create_household_seeds.sql` — fondation SQL déjà appliquée
- `supabase/functions/ardoise-invite/`, `supabase/functions/gift-list-invite/` — pattern Edge HMAC + rate-limit + fail-closed à mirroring pour refresh-calendrier-ref

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Grille + agenda + dialogue événement existants : ajouter FilterBar, pastille catégorie, couche jours fériés, SchoolZoneSelect
- Hooks use-ref-days / use-school-zone / zone-resolver : logique fériés/vacances à brancher sur le cache refreshé
- Pattern Edge invite (HMAC dédié, rate-limit mémoire, 500 explicite si secret absent) : à réutiliser pour le cron secret-seul

### Established Patterns
- RLS foyer + tests négatifs inter-foyer sur chaque table (0047 + tests existants)
- Europe/Paris pour les dates ; seed + backfill + NOT NULL vers l'avant
- Photos/buckets privés ; secrets HMAC jamais en base ni en clair
- Tap-and-hold et swipe = actions supplémentaires, jamais uniques (alternative bouton/clavier requise)

### Integration Points
- `events.calendar_id` → event_calendars ; `events.category_id` → event_categories (0047, backfill 0048)
- `households.school_zone` → vacances par zone (D-16)
- Tables cache fériés/vacances (0047) ← Edge refresh-calendrier-ref ← pg_cron janv+sept
- Verrou surprise D-07 phase 05 : le Perso invisible total suit la même doctrine (barrière serveur)

</code>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-calendrier*
*Context gathered: 2026-10-06*
