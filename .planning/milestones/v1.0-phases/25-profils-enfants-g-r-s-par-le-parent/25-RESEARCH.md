# Phase 25 : Profils enfants gérés par le parent — Recherche

**Réalisé :** 2026-10-25
**Domaine :** Supabase auto-hébergé (PostgreSQL 17, RLS, RPC `SECURITY DEFINER`, pg_cron) + frontend React 19 / TanStack Query — renversement d'identité : membre de foyer sans compte d'authentification.
**Confiance :** HIGH (codebase, lu en session) — les 5 exigences ENF-01…ENF-05 sont couvertes par des artefacts existants identifiés, avec un seul point de non-confirmation (D-15, voir § Assumptions).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
[Recopiées verbatim de `25-CONTEXT.md` § Decisions — D-01 à D-23.]

**Gestion des profils enfants**
- **D-01** : Tout **membre adulte** (rôles `admin` ET `membre`) peut créer, modifier et supprimer les profils enfants du foyer — pas seulement les admins. Les profils enfants sont exclus de toute opération de gestion par construction (pas de session). — *Reversibility: reversible*
- **D-02** : UI : le **members-panel existant** (`app/src/modules/parametres/components/members-panel.tsx`, badge ambre « enfant » déjà présent) est étendu avec création/édition/suppression des profils gérés. Pas de section enfants dédiée.
- **D-03** : Tout adulte peut modifier ou supprimer un profil créé par quelqu'un d'autre — pas de propriété individuelle d'une fiche partagée.
- **D-04** : À la **suppression** d'un profil enfant, les traces où il est attributaire sont **conservées** (tâches créées, complétions passées) ; seul le membre disparaît des sélecteurs. Jamais de purge d'historique.
- **D-05** : **Fiche enrichie** : nom d'usage, couleur (color_tag), date de naissance avec **âge calculé affiché**, **restrictions par module**, **photo gérée par le parent** (bucket `household-media`, chaîne avatars existante).
- **D-06** : Accès par défaut = **socle restreint** : un nouvel enfant figure uniquement dans **tâches, routines, anniversaires, menu**. Tout autre espace refuse l'attribution tant qu'il n'est pas activé sur la fiche. Sémantique : « accès » = être attributaire/mentionnable (l'enfant n'a aucune session) ; ce sont des « espaces où il peut figurer », pas des permissions de session.
- **D-07** : Statut « géré par le parent » **figé, codé en dur** : l'absence de session suffit, aucun réglage de fiche, jamais admin, opérations de rôle (`set_member_role`) réservées aux comptes réels. Suit la logique 0113 : le serveur refuse toute escalade sur un profil sans session.
- **D-08** : **Filiation intrinsèque** : tout adulte du foyer peut agir au nom de n'importe quel enfant du même foyer. Pas de champ « responsables désignés » ; la filiation auditable (ENF-03) repose sur la trace (parent acteur en base), pas sur un rattachement nominal.
- **D-09** : Aucune limite de nombre de profils enfants par foyer, noms en doublon permis (départage visuel par couleur/photo).

**Agir au nom de l'enfant**
- **D-10** : **Choix par action**, jamais un switch d'identité global : chaque point d'entrée propose explicitement « au nom de… » via le member-picker existant. Aucune ambiguïté sur la trace, pas d'état global à oublier — conforme à ENF-02 (opérations serveur explicites, pas de CRUD générique).
- **D-11** : Périmètre v1 de l'action au nom de l'enfant : **tâches** (assigner) et **routines** (cocher) uniquement.
- **D-12** : **Déviation ENF-02 assumée** : le parent **ne publie pas** au nom de l'enfant dans le Cercle. Verbatim utilisateur : « je ne veux pas que le parent puissent publier en tant que l'enfant dans le cercle, juste de la modération ». La part Cercle devient : **modération** = un adulte peut supprimer/masquer tout contenu du Cercle attribué à un profil enfant du foyer, y compris l'historique issu des anciens comptes enfant. ROADMAP.md/REQUIREMENTS.md doivent être relus à cette aune.
- **D-13** : La délégation « au nom de » s'arrête **aux enfants** : un adulte ne peut jamais agir au nom d'un autre adulte. Toute extension est une capacité transverse hors périmètre ENF.
- **D-14** : UI : l'**attributaire seul est affiché** ; l'acteur parent reste en base pour l'audit mais n'est pas montré dans l'interface. — *Reversibility: reversible*

**Conversion des comptes enfant existants**
- **D-15** : **Conversion totale en une migration** : les membres `role='enfant'` possédant un compte auth deviennent des profils gérés (sans `user_id`). Pas de coexistence durable — condition de RGDP-06.
- **D-16** : Le compte auth Supabase sous-jacent est **supprimé réellement** (voie serveur/admin), pas seulement dissocié. L'historique reste attribué au membre devenu profil géré.
- **D-17** : Verrou produit : **l'enfant ne se connecte jamais, tout passe par un adulte.** (Question utilisateur : « comment l'enfant se connecte t'il a l'application ? » — réponse : il ne le fait pas, par conception ; le besoin futur est couvert par la transition D-18.)
- **D-18** : La conversion est **à sens unique** ; aucun chemin de retour. — *one-way*
- **D-18bis** : Transition future **incluse dans cette phase** : liaison à l'invitation standard.

**Transition vers un vrai compte**
- **D-19** : **Liaison à l'invitation** : l'invitation standard crée un compte ; à l'acceptation, un adulte peut **lier** le nouveau membre au profil enfant : fusion en une opération serveur unique et irréversible (les traces basculent, la ligne profil est supprimée), même transaction.
- **D-20** : À la liaison, **toutes les traces** sont réattribuées au compte réel, sans fenêtre temporelle. — *one-way*
- **D-21** : Parcours UI **minimal** : bouton d'adulte sur la fiche enfant (« Donner accès ») qui s'appuie sur l'invitation standard.

**Multi-foyers et notifications**
- **D-22** : Un profil enfant appartient à **un seul foyer**. Pas d'entité enfant globale.
- **D-23** : Les échéances attribuées à un enfant notifient **les adultes du foyer**, via la chaîne push existante (`dispatch_messages` → `push-notify`). Aucun device enfant par définition.

### the agent's Discretion
- Détails du schéma (nullable `user_id` vs table dédiée, `birth_date`/photo, stockage des restrictions par module — candidat : réutiliser le formalisme `disabled_modules` de 0140 au niveau membre).
- Forme exacte des opérations serveur « au nom de » (RPC dédiées vs paramètre `actor_member_id` sur RPC existantes), messages d'erreur et oracles des tests négatifs.
- Détails de l'interaction Cercle (délégation interdite, modération seule) dans le cadre de D-12.
- Ordre interne des migrations et annonces produit autour de la conversion.

### Deferred Ideas (OUT OF SCOPE)
- **Argent de poche** (créditer un enfant via l'Ardoise — l'exclusion enfant/ardoise de 0113/0115 reste en v1).
- **Délégation adulte → adulte** (cocher pour le conjoint).

*Hors périmètre également (BOUNDARY) : aucun accès direct enfant à l'app (verrouillé), aucune publication au nom d'un enfant dans le Cercle, aucune refonte du parcours d'invitation, aucun budget d'enfant / Ardoise enfant.*
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Support recherché |
|----|-------------|-------------------|
| **ENF-01** | Un admin crée, modifie et supprime un profil enfant géré (aucun compte auth autonome) | `household_members` a déjà `user_id NULL` (0002:44-54) — la forme existe ; il manque les colonnes D-05 (`birth_date`, restrictions module) + 3 RPC `authenticated` (create/update/delete) + UI members-panel |
| **ENF-02** | Agir au nom de l'enfant via opérations serveur explicitement validées (`actor_member_id` vérifié côté SQL/Edge) | 2 RPC nouvelle forme (tâches via `replace_task_assignees` existant, routines via nouveau RPC) — l'écriture directe RLS actuelle **interdit** de cocher pour autrui (0007:204-213) ; c'est le fait central du phase |
| **ENF-03** | Traces gardent l'enfant comme attributaire et le parent comme acteur | Colonnes d'audit actives manquantes (`routine_completions.actor_member_id`, `tasks.assigned_by_member_id`) ; rien d'actif aujourd'hui |
| **ENF-04** | RLS stricte prouvée par tests SQL négatifs ; audit complet des politiques existantes | Audit livré dans cette recherche (§ Audit RLS) + suite `0051_enfant_perimeter.sql` comme gabarit + 4 politiques Cercle à étendre (0109) |
| **ENF-05** | L'enfant apparaît dans les sélecteurs (tâches, ardoise, messagerie, menu) comme tout membre | **Déjà satisfaite par construction** : `household_members_select` (0007:267-269) lis par appartenance, pas par compte. Seule l'option désactivée D-06 reste à ajouter côté UI |

**Incohérence texte à corriger dans le plan :** `REQUIREMENTS.md:11` dit encore « réagir dans le Cercle » et le critère de succès n°2 dit « réagit dans le Cercle ». La décision D-12 les contredit. Le plan doit proposer une tâche de correction documentaire (pas un changement de produit).
</phase_requirements>

---

## Résumé exécutif

Le renversement d'identité demandé par cette phase repose sur **une forme de schéma qui existe déjà** : `household_members.user_id` est `uuid references auth.users on delete cascade` et **nullable**, documenté explicitement pour « les profils gérés par un parent (rôle `enfant`) » (`supabase/migrations/0002_tables_identity.sql:41-54`). Le semis de démonstration (`app/src/lib/data/seed.ts:198-207`, membre `Noé Martin` avec `user_id: null, role: 'enfant'`) prouve que le client gère déjà la forme sans compte. La phase n'est donc **pas** une refonte de schéma : c'est une opération de fermeture (aucun compte enfant), d'ouverture ciblée (action « au nom de ») et de documentation (audit RLS).

Deux faits techniques dominent la planification :

1. **L'écriture directe interdit la délégation.** Les politiques « tables foyer » de 0007 appliquent, sur les colonnes d'auteur, `is null or %I = private.current_member_id(household_id)` — générées pour `routine_completions.completed_by`, `posts.author_id`, `post_comments.author_id`, `post_reactions.author_id` (0007:181-201 + 204-213). Un parent ne peut donc **pas** cocher une routine au nom de son enfant par un simple `update` PostgREST : `completed_by = enfant ≠ current_member_id` échoue silencieusement à 0 ligne (pas de `raise`). C'est pourquoi ENF-02 exige des **RPC `SECURITY DEFINER`**, et pourquoi l'attribution de tâches via `task_assignees` fonctionne déjà (sa politique d'insertion n'a pas de garde d'auteur : `can_write_task AND member_in_household`, 0007:361-368).
2. **La notification des enfants n'existe pas.** `private.push_reminder_notifications` filtre déjà `and m.user_id is not null` sur chaque source (0019:111, 174, 181, 202, 220), et son propre commentaire dit : « Un membre `enfant` sans compte n'est jamais destinataire » (0019:38-39). Une tâche attribuée **uniquement** à un enfant ne notifie personne (le `coalesce` bascule sur `t.created_by`, 0019:178). D-23 demande exactement l'inverse : notifier **les adultes du foyer**. C'est la seule modification d'une définition effective hors du périmètre des nouveaux RPC.

**Recommandation principale :** 3 migrations vers l'avant dans cet ordre — (1) schéma + invariant `(user_id is null) = (role = 'enfant')` ; (2) conversion des comptes enfant existants **en un RPC de service_role appelé par la migration** (donc testable dans la transaction annulée de `test-db.sh`) ; (3) comportement (RPC « au nom de », garde de module, modération Cercle, notifications adultes). Aucun nouveau paquet, aucune nouvelle Edge Function, aucun nouveau composant UI générique (contraintes UI-SPEC vérifiées).

---

## Map des responsabilités architecturales

| Capacité | Tier principal | Tier secondaire | Justification |
|----------|----------------|-----------------|---------------|
| Existance du profil enfant (ENF-01) | API / Backend (PostgreSQL) | — | La forme `user_id NULL` est une contrainte de base ; le client n'a rien à décider |
| Fermeture des portes d'authentification | API / Backend | — | La RLS + l'absence de session sont la frontière ; aucune logique navigateur |
| Action « au nom de » (ENF-02, D-11) | API / Backend (RPC `SECURITY DEFINER`) | Browser (choix dans le picker) | L'identité de l'acteur ne peut pas être déclarée par le client ; `actor = auth.uid()` seul (précédent 0036/0041) |
| Filiation auditable (ENF-03) | API / Backend | — | Les colonnes d'acteur sont écrites par la base, jamais par le client |
| Sélecteurs (ENF-05) | Browser / Client | API / Backend | La lecture passe par la RLS existante ; le client ne filtre que l'option désactivée D-06 |
| Restrictions par module (D-06) | API / Backend | Browser | Le serveur refuse l'attribution dans un espace non activé ; le client grisait seulement |
| Modération Cercle (D-12) | API / Backend | Browser | Politique de suppression étendue côté SQL (0109) |
| Notifications adultes (D-23) | API / Backend (pg_cron) | — | `dispatch_messages` → `push-notify` existe déjà ; seule la résolution des destinataires change |
| Conversion des comptes (D-15/D-16) | API / Backend (migration + RPC service_role) | — | La suppression d'`auth.users` est une action d'administrateur de base, jamais client |
| UI fiche enfant, « Donner accès », picker | Browser / Client | — | Assemblage des composants first-party existants (UI-SPEC § Design System) |

**Sens de flux unique :** toutes les écritures métier passent par un RPC `SECURITY DEFINER` (ou un `authenticated` direct borné par la RLS) ; aucune écriture « au nom de » ne traverse une écriture directe PostgREST — c'est la définition littérale d'ENF-02.

---

## Stack standard

**Aucun nouveau paquet.** La phase ne touche aucun fournisseur de dépendance : pas de `package.json` modifié côté `app/` ni côté `supabase/`. Le registre de versions référencé dans AGENTS.md §2.1 (React 19.3, Vite 8.3, TanStack Query v5, Zod v4, date-fns v4, Vitest 5, Playwright) n'est pas concerné. Les versions locales vérifiées en session : `date-fns 4.4.0` et `@date-fns/tz 1.5.0` dans `app/package.json:19,50` — suffisants pour l'âge calculé (D-05), via `differenceInYears`/`differenceInMonths`. [VERIFIED: app/package.json]

| Écart | Version | Usage | Commentaire |
|-------|---------|-------|-------------|
| Aucun | — | — | Phase purement interne (SQL + TypeScript existing) |

**Scripts de build vérifiés (`app/package.json:11-16`) :**
- `"build": "tsc --noEmit && vite build"`
- `"typecheck": "tsc --noEmit"`
- `"test": "vitest run"`
- `"test:e2e": "playwright test"`

---

## Audit de légitimité des paquets

**Aucun paquet externe n'est installé par cette phase** — la section est déclarée vide par construction, pas par omission. Le registre des scripts du dépôt (`test-db.sh`, `check-sql-statique.py`, `test-check-sql-statique.py`, `build-app.sh`, `deploy-functions.sh`) reste inchangé.

*« Aucun paquet retiré (SLOP) » ; « Aucun paquet signalé (SUS) ». Aucun `checkpoint:human-verify` n'est requis pour l'installation.*

---

## Patterns d'architecture

### Diagramme du système (flux demandé par la phase)

```
        Choix « au nom de » (member-picker, choix par action D-10)
                                 │
                                 ▼
┌─────────────── Browser ───────────────┐        ┌──────────────────── API / Backend ─────────────────────┐
│  members-panel (CRUD fiche) ──────────┼──RPC──►│ public.* (SECURITY DEFINER, actor = auth.uid(),        │
│  sélecteurs tâches/routines/menu ─────┼──RPC──►│   EXECUTE à authenticated seul)                         │
│  Cercle (modération) ─────────────────┼──DELETE►│ RLS étendue : auteur = profil géré du même foyer      │
│  paramètres « Donner accès » ─────────┼──RPC──►│ liaison invitation ↔ profil enfant (D-19)              │
└───────────────────────────────────────┘        │                                                          │
     ▲ lecture (sélecteurs ENF-05)               │   garde de module D-06 : managed_child_allowed(m,k)     │
     │                                           │        ▲                                                     │
  RLS : household_members_select                 │        │                                                     │
         = is_household_member                    │   task_assignees / routine_assignees /                     │
     (enfant sans compte inclus — 0007:267-269)  │   meal_entries.member_ids / birthdays / conversations     │
                                                 └──────────┬──────────────────────────────────────────────────┘
                                                            │ pg_cron (jour)
                                                            ▼
                                              dispatch_messages (0019/0129/0130)
                                                → adultes du foyer uniquement (D-23)
                                                            │
                                                            ▼
                                                        push-notify
```

La ligne pointillée « lecture RLS » est le premier endroit que l'on vérifie : les **enfants sans compte y sont déjà visibles** dès qu'un adulte appartient au foyer, donc ENF-05 tombe par construction, pas par travail.

### Structure de projet recommandée (aucun nouveau fichier de module)

```
supabase/migrations/
  0144_managed_child_schema.sql       # colonnes birth_date / managed_modules + CHECK d'invariant
  0145_convert_managed_children.sql   # RPC de conversion service_role, appelé par la migration elle-même
  0146_child_behavior_guards.sql      # garde de module, RPC « au nom de », modération Cercle, notifications adultes
supabase/tests/
  0144_managed_child_schema.sql       # invariant, refus d'écriture directe, socle restreint par défaut
  0145_convert_managed_children.sql   # conversion + purge auth + traces conservées (D-04, D-16)
  0146_child_behavior_guards.sql      # délégation « au nom de », refus inter-foyer, refus adulte→adulte,
                                      #   modération Cercle, notification adulte
app/src/modules/parametres/
  components/members-panel.tsx        # étendu : fiche enfant (D-02), âge calculé (D-05), « Donner accès » (D-21)
  api.ts                              # createManagedChild / updateManagedChild / deleteManagedChild / linkManagedChild
app/src/modules/taches/api.ts         # pas de nouveau paquet ; la délégation passe par le RPC existant enrichi
app/src/modules/routines/api.ts       # markOccurrenceDone → nouvelle signature (actor) via RPC serveur
```

*Le plan peut regrouper `0144-0146` ; l'ordre d'application est contraint, pas le nombre de fichiers.*

### Pattern 1 : RPC « au nom de » — `actor = auth.uid()`, jamais un paramètre

Toutes les opérations serveur du dépôt résolvent l'acteur de la même façon. Le modèle à suivre est `set_member_role` (`0036_set_member_role.sql:21-63`) et `create_conversation` (`0041_conversation_lifecycle.sql:28-101`) :

```sql
-- Source: supabase/migrations/0036_set_member_role.sql:21-52 (lu en session)
create or replace function public.set_member_role(
  p_member_id text,
  p_role text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  ...
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  ...
  perform private.assert_household_admin(v_household_id, v_actor);
```

et la clôture de privilèges correspondante (0036:69-82) :

```sql
-- Source: supabase/migrations/0036_set_member_role.sql:69-82 (lu en session)
revoke all on function public.set_member_role(text, text) from public, anon;
grant execute on function public.set_member_role(text, text) to authenticated;
```

**Recommandation prescriptive :** les nouvelles opérations prennent le **membre cible** (`p_member_id`) comme paramètre, jamais l'acteur. L'acteur est `auth.uid()` résolu vers `private.current_member_id(household_id)`. Trois raisons, toutes tirées du dépôt :
- `set_member_role` (0036) et `create_conversation` (0041) l'ont tranché ;
- un paramètre `p_actor_id` appelle en `service_role` (sans JWT), et le dépôt a déjà documenté que `auth.uid()` y vaut NULL et « fermerait tout » (motif 0058, cité dans 0113:486-488) ;
- la session vérifiée est la seule source d'identité qui ne peut pas être déclarée par le client (ENF-02 littérale).

La forme de la clause « au nom de » devient alors :

```sql
-- Recommandation (forme dérivée du modèle 0036 + 0113, pas du code existant)
perform private.assert_household_writer(p_household_id, v_actor);            -- adulte (admin ou membre)
perform private.assert_managed_child(p_household_id, p_member_id);           -- D-13 : cible = enfant géré
perform private.assert_child_module_allowed(p_member_id, 'routines');        -- D-06
-- Écrire la trace : attributaire = enfant, acteur = parent (ENF-03)
```

Avec les deux helpers recommandés :

```sql
-- Recommandation (nouveaux helpers private, sécurité alignée sur 0006:20-117)
create or replace function private.is_managed_child(p_member_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
     where m.id = p_member_id
       and m.user_id is null                       -- pas de session (D-07)
       and m.role = 'enfant'
  );
$$;

create or replace function private.managed_child_module_allowed(p_member_id text, p_module_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(m.managed_modules, '{}'::text[]) @> array[p_module_key]
    from public.household_members m
   where m.id = p_member_id;
$$;
```

Les deux noms de fonction ci-dessus sont **proposés** (ils n'existent pas) ; le plan les confirmera. Les conditions qu'ils expriment — `user_id is null`, `role = 'enfant'`, `managed_modules @> array[...]` — reposent sur les colonnes réelles vérifiées ci-dessous.

### Pattern 2 : l'invariant « enfant ⟺ sans session », porté par la base

Le statique « jamais de compte enfant » (D-07/D-15/D-17) ne se prouve pas par une assertion ; il se déclare. La table actuelle autorise les deux formes :

```sql
-- Source: supabase/migrations/0002_tables_identity.sql:44-54 (lu en session, verbatim)
create table public.household_members (
  id text primary key default private.new_id('member'),
  household_id text not null references public.households (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  avatar_url text,
  color_tag text not null default 'accent' check (private.is_member_color(color_tag)),
  role text not null default 'membre' check (role in ('admin', 'membre', 'enfant')),
  created_at timestamptz not null default now(),
  constraint household_members_user_household_key unique (household_id, user_id)
);
```

Note verbatim importante : `role in ('admin', 'membre', 'enfant')` (ligne 51) — trois valeurs, aucune quatrième ; le `CHILD_HIDDEN_MODULES` côté client et le commentaire « `user_id` est nullable pour les profils gérés par un parent (rôle `enfant`) » (ligne 42) confirment que la forme est prévue, pas inventée par cette phase.

Recommandation :

```sql
-- Recommandation (après la conversion, même migration que la conversion)
alter table public.household_members
  add constraint household_members_child_session_check
  check ( (user_id is null) = (role = 'enfant') );
```

Cette contrainte **ferme les deux directions** : aucun membre adulte sans compte (pas de fantôme), aucun enfant avec session (pas de régression de la conversion). Elle rend D-07/0113/D-17 structurellement maintenables sans test. Les conséquences directes — et elles doivent figurer dans le plan :

| Surface qui crée un enfant avec compte | Fichier | Action nécessaire |
|----------------------------------------|---------|-------------------|
| `redeem_household_invite_token` — `v_role := case when p_role in ('enfant') then 'enfant' else 'membre' end;` (0006:403-405, verbatim lu) | 0006_security_helpers.sql | Refuser `p_role = 'enfant'` (un token ne crée jamais un enfant) |
| `set_member_role` — accepte `p_role in ('admin','membre','enfant')` (0036:39) | 0036_set_member_role.sql | Refuser la cible `'enfant'` (0113-style, D-07) |
| `invitations.role` check `in ('admin','membre','enfant')` (0002:92) | 0002 | Invoquer (hors périmètre : invitations ciblées) ; documenter que `'enfant'` n'est plus assignable |
| Insertion directe `household_members` par un admin (0007:274-279) | 0007 | La CHECK ci-dessus la borne déjà : un admin ne peut insérer qu'un enfant avec `user_id NULL` ou un adulte avec `user_id` |

### Pattern 3 : restrictions par module — réutiliser le formalisme 0140

Le formalisme existant est `households.disabled_modules text[]` avec la garde de forme immuable `private.has_valid_module_keys` (0140:42-51, lu en session) :

```sql
-- Source: supabase/migrations/0140_household_disabled_modules.sql:42-51 (verbatim, lu)
create or replace function private.has_valid_module_keys(keys text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(k ~ '^[a-z][a-z_]{1,39}$'), true)
     and coalesce(count(*) = count(distinct k), true)
    from pg_catalog.unnest(keys) as t (k);
$$;
```

Le verbatim des droits d'exécution (0140:62-63) est la contrainte la plus subtile à respecter :

```sql
-- Source: supabase/migrations/0140_household_disabled_modules.sql:62-63 (verbatim, lu)
revoke execute on function private.has_valid_module_keys(text[]) from public, anon;
grant execute on function private.has_valid_module_keys(text[]) to authenticated, service_role;
```

C'est voulu : une contrainte `CHECK` s'évalue avec le rôle qui écrit la ligne, donc sans `EXECUTE` à `authenticated` chaque écriture échouerait. La colonne membre recommandée suit exactement cette forme :

```sql
-- Recommandation
alter table public.household_members
  add column if not exists managed_modules text[] not null
    default '{taches,routines,anniversaires,menu}'::text[]
    check (private.has_valid_module_keys(managed_modules));
```

Le défaut est le **socle restreint** de D-06 — jamais `{}` (qui signifierait « tout activé » dans la sémantique négative de 0140) ni `'{}'`. Les 4 clés du socle sont vérifiées verbatim dans `app/src/lib/modules.ts:72-87` : `'taches'`, `'routines'`, `'anniversaires'`, `'menu'` (clé `ModuleKey`, même vocabulaire que `disabled_modules`, donc la garantie de format maison porte sur les deux).

**Liste fermée des espaces activables.** Le périmètre « argent de poche / Ardoise enfant » est backlogué (CONTEXT § Deferred) et l'exclusion enfant/ardoise de 0113/0115 reste en v1. Le socle activable est donc le catalogue moins les 5 modules hors périmètre — verbatim :

```ts
// Source: app/src/lib/modules.ts:116 (verbatim, lu)
export const CHILD_HIDDEN_MODULES: ModuleKey[] = ['ardoise', 'cadeaux', 'fidelite', 'prestataires', 'animaux'];
```

Soit 15 clés activables (`courses, calendrier, notes, taches, routines, recettes, contacts, cercle, voyages, messages, frigo, menu, documents` moins les doublons). La **base** ne connaît pas le catalogue (0140:22-24 le dit) : la validité sémantique reste au client ; le serveur ne porte que la forme + le refus d'attribution dans un espace dont la porte 0113 refuse déjà l'enfant.

### Pattern 4 : attribution — où la RLS couvre, où un trigger est nécessaire

L'audit des surfaces d'attribution produit deux catégories distinctes. Cette distinction détermine si un trigger est nécessaire :

| Surface | Colonne d'attributaire | Politique existante | Le `WITH CHECK` couvre-t-il la restriction enfant ? |
|---------|------------------------|---------------------|-----------------------------------------------------|
| Tâches | `task_assignees.member_id` (0003:94-98) | `task_assignees_insert` : `can_write_task AND member_in_household` (0007:361-368) | Non — le `WITH CHECK` ne porte pas de test de module → ajouter la clause **ou** le garder dans `replace_task_assignees` (recommandé : le RPC est la seule écriture réelle) |
| Routines | `routine_assignees.member_id` (0003:124-128) | `routine_assignees_insert` (0007:400-407) — même forme | Idem |
| Complétions | `routine_completions.completed_by` (0003:147) | Garde d'auteur 0007:204-213 (`= current_member_id`) | **Refuse aujourd'hui la délégation** — c'est l'endroit où un RPC est obligatoire |
| Anniversaires | `birthdays.linked_member_id` (0004:108) | Insertion « tables foyer » (0007) sans garde d'auteur | Non → clause à ajouter |
| Menu | `meal_entries.member_ids text[]` (0142:46, 56) | Insertion « tables foyer » sans colonne de référence (0007 exclut `meal_entries` de la liste générée) | **Ni politique ni colonne unique** → un trigger est indispensable ici |
| Messages | `conversation_members.member_id` | `create_conversation` vérifie `member_in_household` (0041:86-89) | Non → clause à ajouter dans le RPC |
| Ardoise | `expense_participants.member_id` / `ardoise_members.member_id` | Fermetures 0113/0115 en place | **Reste refusé** en v1 (backlog « argent de poche ») — ne pas toucher |
| Cercle | `posts.author_id`, `post_comments.author_id`, `post_reactions.author_id` | Garde d'auteur 0007 + `guard_author_immutable` (0081) + `guard_cercle_content_author` (0109) | Ne pas toucher pour la délégation (D-12 interdit la publication « au nom de ») ; **étendre les 3 politiques DELETE** (ci-dessous) |

**Le seul trigger réellement nécessaire est donc sur `meal_entries.member_ids`** : c'est la seule colonne d'attributaire qui est un tableau libre, sans politique de référence, et qui n'est écrite par aucun RPC (`meal_entries` est hors de la liste générée de 0007:181-201). Pattern existant à suivre : `guard_gift_item_reserve` (0113:256-316), qui vérifie avant de `raise exception ... using errcode = '42501'`.

### Pattern 5 : modération Cercle (D-12) — étendre le DELETE, ne pas toucher le garde d'auteur

La règle actuelle est « auteur ou admin » sur les trois tables :

```sql
-- Source: supabase/migrations/0109_cercle_author_guards.sql:70-88 (verbatim partiel, lu)
create policy posts_delete_admin on public.posts
  for delete using (
    author_id = private.current_member_id(household_id)
    or private.is_household_admin(household_id)
  );
```

La forme recommandée ajoute une troisième branche, sans altérer `guard_cercle_content_author` (0109:33-54) ni `guard_author_immutable` (0081) :

```sql
-- Recommandation
create policy posts_delete_admin on public.posts
  for delete using (
    author_id = private.current_member_id(household_id)
    or private.is_household_admin(household_id)
    or (private.can_write_household(household_id)
        and private.is_managed_child(author_id))          -- D-12 : adulte du même foyer modère un enfant
  );
```

Ceci couvre **automatiquement** l'historique issu des anciens comptes enfant : après la conversion, la ligne `household_members` du compte supprimé a `user_id NULL` et `role 'enfant'`, donc `is_managed_child(author_id)` renvoie vrai pour tous les posts qu'il avait émis. La modération est donc identique avant et après la conversion — c'est le critère que D-12 vise (« y compris l'historique issu des anciens comptes enfant »).

Note sur l'UI-SPEC : la modération propose « supprimer ou masquer » ; le schéma n'a pas de colonne `is_hidden`. Le plan doit trancher : soit **suppression dure unique** (aligné sur `posts_delete_admin`, aucune colonne neuve), soit une colonne `is_hidden boolean not null default false` + `hidden_by_member_id`. La suppression dure seule est la seule forme sans colonne neuve et sans vue à maintenir ; l'UI-SPEC §Copywriting décrit la suppression seule (« Ce contenu ne sera plus visible dans le Cercle. »), donc c'est la lecture cohérente.

### Pattern 6 : notifications adultes (D-23) — modifier la définition **effective**

Les fonctions de résolution de destinataires (définitions effectives, mesurées) :
- `private.push_birthday_notifications` — définition effective `0019_push_dispatch.sql:74`
- `private.push_reminder_notifications` — définition effective `0023_qualify_final_projection.sql:45` (0022/0023 remplacent le corps de 0019:123)

**Attention au piège de 0116** : `0115_enfant_perimeter_settlements.sql` contient la leçon verbatim (0116:1-8, lu en session) — « toute redefinition DOIT partir de la definition effective (la derniere), jamais d'une version d'origine ». Les définitions effectives de ces fonctions vivent dans `0023_qualify_final_projection.sql:45` (reminder) et `0019_push_dispatch.sql:74` (birthday) — `0129`/`0130` ne touchent que la cadence du cron et `dispatch_message_notifications`. Le plan doit lire les définitions effectives avant d'écrire les nouveaux corps.

La règle de D-23, appliquée à chaque source (les lignes de 0019 citées sont verbatim) :
- **Tâches** : actuellement `left join lateral (... and assignee.user_id is not null ...)` puis `join household_members m on m.id = coalesce(assigned.member_id, t.created_by)` + `m.user_id is not null` (0019:169-181). Une tâche dont le seul assignataire est un enfant ne notifie personne. Correction : si aucun assignataire doté d'un compte, notifier **les adultes du foyer** (join sur `household_members` avec `user_id is not null` et `role in ('admin','membre')`).
- **Routines** : actuellement `join household_members m on m.household_id = r.household_id and m.user_id is not null` + `(r.created_by is null or m.id = r.created_by)` (0019:220-222). Une routine assignée à un enfant (via `routine_assignees`, non lue par la source !) ne notifie que le créateur. Correction : inclure les adultes du foyer.
- **Anniversaires** : `join ... on ((a.linked_member_id is not null and m.id = a.linked_member_id) or a.linked_member_id is null)` + `m.user_id is not null` (0019:108-113). Un anniversaire lié à un enfant produit **zéro** destinataire. Correction : `linked_member_id` enfant → adultes du foyer.
- **Événements** : pas d'attributaire (toute la source rejoint `e.created_by`) ; l'enfant n'y figure pas. Aucun changement.

Les chaînes en aval — `dispatch_messages` → Edge Function `push-notify` (référencée dans `.planning/STATE.md` § Accumulated Context et dans `supabase/functions/push-notify/`) — ne changent pas : `push_subscriptions` filtre par `user_id` (`0018_push_subscriptions.sql:65`, verbatim), et un enfant n'a plus de ligne.

### Pattern 7 : conversion (D-15/D-16) — RPC de service_role appelé par la migration

L'audit des FK vers `auth.users` est la contrainte déterminante. Tout ce que le dépôt référence (verbatims lus) :

| FK | Migration : ligne | Action sur suppression d'un compte enfant |
|----|-------------------|-------------------------------------------|
| `household_members.user_id ... on delete cascade` | 0002:47 | **Doit être mis à NULL avant** — sinon la ligne membre disparaît et l'historique tombe (D-04 violé) |
| `profiles.id primary key references auth.users on delete cascade` | 0002:15 | Cascade → le profil disparaît. Acceptable : la ligne membre porte déjà `display_name`, `avatar_url`, `color_tag` |
| `households.created_by ... on delete set null` | 0002:33 | `set null` — un enfant ne crée pas de foyer, sans risque |
| `household_invite_tokens.created_by ... on delete cascade` | 0002:71 | `cascade` — un enfant ne peut pas créer de token après 0113, mais **avant** la phase 14 il pouvait ; vérifier l'état réel |
| `push_subscriptions.user_id ... on delete cascade` | 0018:65 | `cascade` → le device disparaît (attendu) |
| `notification_reads.user_id ... on delete cascade` | 0046:22 | `cascade` → attendu |
| `gift_list_invites.created_by ... on delete cascade` | 0079:42 | `cascade` — **risque de perte** : avant 0113 un enfant propriétaire d'une liste pouvait créer un code ; vérifier ou réattacher avant suppression |
| `trip_…created_by ... on delete cascade` | 0118:109 | `cascade` — un enfant ne crée pas de voyage seul ; vérifier |
| `recipe_share(s?) created_by ... on delete cascade` | 0122:140 | `cascade` — idem |

Recommandation prescriptive :

```sql
-- Recommandation : la conversion est une fonction testable, appelée par la migration
create or replace function public.convert_managed_children_to_profiles()
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  -- 1. Rupture des FK cascade AVANT de toucher auth.users
  update public.household_members set user_id = null
   where role = 'enfant' and user_id is not null;
  -- 2. Réattacher/nulifier les FK résiduelles (gift_list_invites.created_by, ...)
  -- 3. Suppression réelle des comptes (D-16)
  delete from auth.users where id in ( ... les anciens user_id enfant ... );
  -- 4. Le CHECK d'invariant (pattern 2) ferme la porte pour la suite
end;
$$;
```

Les `EXECUTE` : `service_role` seul (comme les RPCs 0006) — la suppression de `auth.users` n'est pas une action d'utilisateur. **La migration appelle elle-même la fonction**, ce qui rend la conversion testable dans la transaction annulée de `test-db.sh` (sinon aucun test ne pourrait l'observer — cf. AGENTS.md §2.7 A : `create function` n'exécute pas le corps).

La suppression de `auth.users` à partir d'une migration s'exécute en tant que propriétaire (`postgres`) du conteneur `db` via `scripts/migrate.sh` — la même voie que l'API admin de Supabase. Aucun autre endroit du dépôt ne supprime actuellement d'utilisateur (`grep "delete from auth.users" supabase/` : aucun résultat). Voir § Assumptions.

### Pattern 8 : liaison invitation ↔ profil (D-19/D-20)

Forme recommandée, à côté de la liaison D-18bis déjà incluse dans la phase : un RPC `authenticated` unique, en une transaction, qui (1) vérifie que l'acteur est adulte du foyer, (2) localise la ligne `household_members` du nouveau compte réel **et** la ligne profil enfant, (3) réattribue l'ensemble des traces du profil vers le nouveau membre (`update ... set member_id = new_id where member_id = old_id` sur chaque table qui porte `member_id`), (4) `delete` la ligne profil, (5) `return jsonb` de rapport. La liste des tables à parcourir est exactement l'inventaire de l'audit FK/`member_id` de § Runtime State Inventory ; c'est la même boucle que la suppression RGPD de phase 27, donc la fonction doit être écrite de façon réutilisable par RGDP-06.

L'opération est **irréversible** (D-20, verbatim dans CONTEXT) ; le rapport renvoyé doit être lisible pour l'annonce produit (D-21, toast « Tout son historique suit. »).

---

## Audit RLS (livraison ENF-04)

| Module | Politique(s) concernée(s) | État actuel enfant | Action demandée |
|--------|---------------------------|--------------------|-----------------|
| Tâches | `tasks_select/insert/update_household`, `tasks_delete_admin`, `task_assignees_*` (0007) | Écrivain refusé (`can_write_household` = admin/membre, 0006:77-85) ; **lecture et attribution conservées** | Ajouter la clause de module D-06 dans `replace_task_assignees` (pas dans la politique) |
| Routines | `routines_*`, `routine_assignees_*`, `routine_completions_*` (0007) | Idem + `completed_by` gelé à `current_member_id` | Nouveau RPC pour `completed_by = enfant` ; garde de module dans `replace_routine_assignees` |
| Courses | `shopping_lists`, `shopping_list_items` (0007:181-182) | Écrivain refusé ; `added_by` gelé à l'auteur | Aucun changement — l'attribution enfant n'est pas dans le socle v1 (non activable : `courses` hors socle, activable après) |
| Cercle | `posts`, `post_comments`, `post_reactions` (0007 + 0109) | Lecture possible, écriture `create_conversation`/posts ouverte aux enfants **avec compte** (0041:17-24) ; sans compte, aucune écriture possible par construction | Étendre les 3 politiques DELETE (pattern 5) ; ne **pas** étendre INSERT/UPDATE |
| Cadeaux | `gift_lists/items/shares/ideas` (0113:128-154) | Refus enfant prouvé (entorse 0033 documentée) | Aucun changement — hors périmètre (0113 conservé) |
| Anniversaires | `birthdays` + `household_birthday_alerts` | Écrivain refusé, lecture membre | Ajouter la clause de module sur `linked_member_id` |
| Messages | `conversations`, `conversation_members`, `messages` (0004 + 0041 + 0099-0109) | Ouvert aux enfants avec compte (0041 « enfants inclus ») ; sans compte, aucune lecture ni écriture par construction | Ajouter la clause de module dans `create_conversation` et `can_join_conversation` |
| Menu | `meal_entries` (0142) | Hors liste générée 0007 → aucune porte membre | **Trigger nouveau** (pattern 4) |
| Ardoise | `ardoises`, `expense_participants`, RPC soldes (0113/0114/0115) | Refus enfant prouvé, oracle 42501 invariants | **Aucun changement** — backlog « argent de poche » |
| Voyages | `trips` + `trip_members_manage` (0118-0120) | Écrivain refusé | Vérifier `0120_trip_members_manage` avant de laisser ajouter un enfant |
| Notes, Calendrier, Contacts, Recettes, Frigo, Documents | Tableaux « foyer plat » (0007) + 0122/0134/0141/0143 | Écrivain refusé (`can_write_household`) | Aucun changement de politique ; si activables, la clause D-06 s'ajoute dans les RPCs qui existent déjà |
| `household_members` | `*_select/insert/update/delete` (0007:267-293) | Lecture par appartenance ; écriture admin-seule | La CHECK d'invariant borne l'insertion ; pas de politique neuve |
| `household_invite_tokens` | Aucune politique (0007:334-335) | Invisible client, prouvé | Aucun changement |

**La forme de test négatif à suivre** est `supabase/tests/0051_enfant_perimeter.sql` : 79 appels `testkit.count` / `testkit.eq` (compté en session), avec fixation de session via `set_config('request.jwt.claims', ...)` puis `set local role authenticated` (`_setup.sql:272-278` verbatim). Les nouveaux tests suivront la même discipline : bornage par foyer, marques reconnaissables dans les données d'essai (AGENTS.md §2.7 D).

---

## Ne pas réinventer

| Problème | Ne pas construire | Utiliser plutôt | Pourquoi |
|----------|-------------------|-----------------|----------|
| Résolution de l'acteur « qui agit » | Paramètre `p_actor_id` | `auth.uid()` + `assert_household_*` | Précedent 0036/0041 ; une Edge compromise devient inoffensive ; ENF-02 littérale |
| Rôles/permissions enfant | Nouvelle table de permissions | `household_members.managed_modules` (formalisme 0140) | Une permission de session signifierait un accès ; D-06 = « être attributaire », pas « pouvoir lire » |
| Garde de forme des clés de module | `check (array_length(...) > 0)` ad hoc | `private.has_valid_module_keys` (0140) | Rejoue format maison `[a-z][a-z_]{1,39}` + doublon ; le dépôt a déjà documenté le besoin |
| Suppression d'un membre sans compte | `delete` direct via l'API | RPC `authenticated` + CHECK | `household_members_delete` est admin-seule (0007:288-293) ; D-01 veut adulte ; RPC requis |
| Cocher une routine pour l'enfant | `update` PostgREST direct | Nouveau RPC `SECURITY DEFINER` | La RLS actuelle (0007:204-213) renvoie 0 ligne en silence — ni erreur ni effet ; ENF-02 interdit le CRUD générique |
| Suppression d'un compte enfant | Appel client | `delete from auth.users` dans un RPC `service_role` | Frontière serveur ; la session supprimée est le critère n°4 |
| Notification enfant | Nouveau `push_*` fonction | Étendre les définitions effectives : reminder = 0023:45, birthday = 0019:74 (0129/0130 ne touchent que cadence + dispatch) | Une deuxième source dupliquerait les rappels (le dépôt a déjà corrigé un tel doublon en 0130) |
| Âge calculé | Nouveau formulaire de date | `date-fns` (déjà en 4.4.0) | `differenceInYears`/`differenceInMonths` ; la charte UI-SPEC fixe les seuils (3 ans / 1 an) |
| Formulaire de fiche enfant | Nouveau composant générique | Dialog + Field + Input + Select existants | UI-SPEC : « Aucun nouveau composant UI générique » |
| Sélecteur d'enfants | Nouveau composant « member-picker » | Les listes `household_members` existantes | ENF-05 déjà vraie par la RLS 0007:267-269 |

**Insight clé :** la frontière d'autorisation de ce dépôt est la **résolution de l'acteur côté base**, pas l'écriture directe. Tout ce que la phase ajoute est un RPC qui vérifie l'acteur ; tout ce qui passe par `data.create`/`data.update` direct reste borné à l'acteur lui-même.

---

## Inventaire d'état d'exécution

> Phase de conversion : les fichiers changés ne suffisent pas. Questions posées catégoriellement.

| Catégorie | État trouvé | Action requise |
|-----------|-------------|-----------------|
| **Données stockées** | Lignes `household_members` avec `role='enfant'` et `user_id NOT NULL` en production (v0.9.0 permettait les comptes enfants via invitation) ; traces associées dans toutes les tables qui portent `member_id` (tâches, assignataires, complétions, anniversaires liés, conversation membres, parts d'ardoise, recettes/voyages) | **Migration de données** (la conversion D-15) + **édition de code** (les nouvelles écritures passent par RPC, jamais par direct) |
| **État enregistré par l'OS** | Aucun — le dépôt ne référence aucun registre OS (`grep` sur `cron.job.command`, Vault : les secrets restent par nom, AGENTS.md §2.7 H) | Aucune |
| **Config de service en ligne** | `auth.users` / `auth.sessions` / `auth.refresh_tokens` / `auth.identities` (schema `auth`, hors git) ; pas de nom de service ni de webhook à renommer ; `pg_cron` jobs référencés par nom (0004/0129) — les noms ne changent pas | Patch SQL (la conversion) — pas de reconfiguration Docker/Traefik |
| **Secrets et variables d'env** | Aucun nom de secret ne contient « enfant » ; `INVITE_TOKEN_HMAC_SECRET` reste en place, rotation non requise par cette phase | Aucune |
| **Artefacts de build / paquets installés** | Aucun artefact versionné ne porte le terme ; `node_modules` (non versionné), image Docker figée par digest mais **rebuild requis** après migration pour resynchroniser le typecheck du frontend (types `HouseholdMemberRow` étendus) | Rebuild du conteneur frontend (`scripts/build-app.sh`) |
| **Seed de démonstration** | `app/src/lib/data/seed.ts:198-207` — membre `Noé Martin` déjà `user_id: null, role: 'enfant'` : la forme cible existe déjà côté démo | Ajouter `birth_date` + `managed_modules` au seed pour qu'UAT/Playwright voie la fiche complète |
| **Tests SQL** | `supabase/tests/0051_enfant_perimeter.sql` simule des enfants **avec** compte via `set_config('request.jwt.claims', ...)` ; la conversion rend cet état impossible en production | Ajouter des tests qui simulent un ancien `user_id` supprimé (`set local role authenticated` avec un `sub` absent de `auth.users`) pour prouver « ni session ni moyen d'agir » (critère n°4) |

**La question canonique :** *après que tout fichier du dépôt est à jour, quels systèmes d'exécution portent encore le compte enfant ?* — réponse : `auth.users` (+ `auth.sessions`, `auth.refresh_tokens`, `auth.identities`, `push_subscriptions`, `notification_reads`) via le schéma `auth`, et **uniquement** par la conversion de cette phase. Après conversion, un JWT enfant qui serait encore en circulation devient inutile : la RLS résout l'appartenance par `household_members.user_id = auth.uid()` (0006:20-33), qui vaut `NULL` — la fermeture est immédiate en base, l'expiration du JWT reste cosmétique (`JWT_EXPIRY=3600`, AGENTS.md §8.4).

---

## Disponibilité de l'environnement

| Dépendance | Requête par | Disponible | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Docker / Compose (service `db`) | `sh scripts/test-db.sh`, migrations | ✓ | — | — |
| Node.js | `npm run typecheck/test/build` | ✓ | v24.21.0 | — |
| npm | Install (aucun paquet nouveau) | ✓ | — | — |
| `scripts/migrate.sh` | Appliquer les migrations via le service `db` | ✓ | — | — |
| `scripts/check-sql-statique.py` + son test | Contrôle statique SQL avant commit | ✓ | — | — |
| Edge `push-notify` + abonnement réel | Valider D-23 (attribution → adulte) | ✗ (nécessite un appareil abonné) | — | `test-dispatch-push.sh` le dit — l'absence n'est pas un échec, elle doit être **dite** (AGENTS.md §2.7) |
| pg_net / Vault | Appel réel du dispatch | ✗ hors machine de prod | — | Frontière HTTP non couverte par `test-db.sh` ; passage obligatoire avant de déclarer le SQL validé |

**Dépendance manquante sans fallback :** aucune.

---

## Pièges courants

### Piège 1 — Redéfinir une fonction depuis une version dépassée
**Ce qui casse :** le corps 0113 de `redeem_gift_list_invite` écrasait le corps 0082 et perdit le surclassement `lecture → reservation` ; attrapé par 0027. Leçon verbatim (0116:7-8) : « toute redefinition DOIT partir de la definition effective (la derniere), jamais d'une version d'origine ».
**Pourquoi :** le dépôt ne versionne pas les corps ; la définition effective est la **dernière** dans l'ordre lexicographique.
**Comment éviter :** pour `private.push_reminder_notifications` et `push_birthday_notifications`, les définitions effectives vivent dans **`0023_qualify_final_projection.sql:45`** (reminder) et **`0019_push_dispatch.sql:74`** (birthday) — 0129/0130 ne touchent que la cadence et `dispatch_message_notifications`, pas ces fonctions. Citer la définition effective dans le commentaire de la nouvelle migration.
**Signes d'alerte :** le test qui devient vert sans que le corps lu existe ; deux migrations définissent la même fonction et on ne sait pas laquelle gagne.

### Piège 2 — La RLS ne fait qu'annuler silencieusement à 0 ligne
**Ce qui casse :** écrire `completed_by = enfant` en écriture directe ne soulève pas d'exception ; elle ne met simplement pas à jour la ligne. L'UI semble réussir.
**Pourquoi :** les politiques `USING`/`WITH CHECK` sont des filtres de lignes, pas des assertions (documenté à de multiples reprises dans le dépôt, cf. AGENTS.md §2.7 D).
**Comment éviter :** toute mutation « au nom de » passe par un RPC qui `raise exception ... using errcode = '42501'` ; les tests utilisent `testkit.expect_denied` (0113:278), pas un comptage à 0.
**Signes d'alerte :** un test qui passe en comptant des lignes au lieu d'exiger un `raise`.

### Piège 3 — Oublier `search_path = ''` et référencer une table sans schéma
**Ce qui casse :** `household_members` résolu dans le schéma courant d'un appelant malveillant, ou un CTE du même nom joint à lui-même (AGENTS.md §2.7 A).
**Pourquoi :** `set search_path = ''` ne résout **aucun** nom.
**Comment éviter :** chaque nouveau helper/RPC porte `security definer set search_path = ''` et référence `public.household_members`, `public.auth.users`, etc. explicitement. `scripts/check-sql-statique.py` vérifie les 8 formes.
**Signes d'alerte :** le contrôle statique est rouge mais le corps semble innocent.

### Piège 4 — La contrainte `CHECK` évaluée avec le rôle qui écrit
**Ce qui casse :** une colonne `managed_modules` avec une `CHECK` qui appelle une fonction privée sans `EXECUTE` à `authenticated` — chaque écriture de membre échoue en production, mais non en test (test-db.sh tourne souvent en `postgres`).
**Pourquoi :** une `CHECK` s'évalue dans le contexte de l'écriture, pas dans celui de la définition (documenté verbatim 0140:56-61).
**Comment éviter :** `grant execute on function private.has_valid_module_keys(text[]) to authenticated, service_role;` — la même ligne que 0140:63.
**Signes d'alerte :** un test vert en `postgres`, un refus en `authenticated`.

### Piège 5 — La suppression cascade de `household_members.user_id` avant la mise à NULL
**Ce qui casse：** `delete from auth.users` **supprime la ligne membre** (0002:47 `on delete cascade`), et avec elle l'historique entier (D-04 violé, ENF-03 violé). Le compte enfant disparaît effectivement, mais plus personne n'existe dans le foyer.
**Pourquoi :** la FK cascade existe pour la suppression de compte RGPD de phase 27, pas pour la dissociation.
**Comment éviter :** `update household_members set user_id = null` **avant** le `delete`, dans la même transaction ; la CHECK d'invariant (pattern 2) rend l'ordre vérifiable.
**Signes d'alerte :** un test de conversion qui compte les membres avant/après — le comptage doit rester inchangé.

### Piège 6 — Laisser une porte ouverte qui recrée un enfant avec compte
**Ce qui casse :** `redeem_household_invite_token` (0006:403-405) accepte encore `p_role = 'enfant'` et crée une ligne avec compte ; `set_member_role` (0036:39) accepte la cible `'enfant'`. La conversion est complète mais un foyer peut **récréer** un compte enfant en un token.
**Pourquoi :** la conversion est une migration, pas une règle d'écriture.
**Comment éviter :** la CHECK d'invariant `(user_id is null) = (role = 'enfant')` rend ces deux écritures **impossibles** (elles produiraient `enfant` avec `user_id NOT NULL`) ; mais les oracles doivent rester lisibles : refuser explicitement sous `22023`/`42501` avant de laisser la CHECK lever un message de contrainte.
**Signes d'alerte :** un test de conversion vert qui ne rejoue pas une invitation avec `role='enfant'`.

### Piège 7 — Confondre « attribuable » et « a accès »
**Ce qui casse :** activer « ardoise » ou « messages » sur la fiche d'un enfant et penser que l'enfant agit ; ou croire que désactiver « tâches » empêche l'enfant de figurer.
**Pourquoi :** D-06 dit explicitement « accès = être attributaire/mentionnable (l'enfant n'a aucune session) » ; les sont des espaces où il peut figurer, pas des permissions de session.
**Comment éviter :** n'écrire jamais de permission de session dans `managed_modules` ; un test qui tente `set local role authenticated` avec un `sub` supprimé doit prouver zéro ligne lue, quelque soit la fiche.
**Signes d'alerte :** une clause de `managed_modules` dans une politique de `SELECT`.

### Piège 8 — Écrire une assertion sans borne par foyer en `postgres`
**Ce qui casse :** un `count(*)` global sur `routine_completions` échoue pour une raison qui n'a rien à voir avec la délégation (AGENTS.md §2.7 D, verbatim lu).
**Pourquoi :** en `postgres` la RLS est court-circuitée, la table entière est visible ; en `authenticated` elle est bornée par foyer.
**Comment éviter :** borner chaque assertion par foyer (marque reconnaissable dans les données d'essai), comme 0051 le fait.
**Signes d'alerte :** un test vert qui ne passe qu'avec une base vide.

---

## Exemples de code

### Le verbatim de référence de l'écriture directe qui **doit** rester interdite

```sql
-- Source: supabase/migrations/0007_rls_policies.sql:204-213 (verbatim, lu en session)
    -- Les colonnes d'auteur doivent être nulles ou désigner le membre courant :
    -- impossible d'écrire au nom d'un autre membre du foyer.
    if coalesce(cardinality(r.ref_columns), 0) > 0 then
      v_ref_cond := ' and (' || array_to_string(
        array(
          select format('%I is null or %I = private.current_member_id(household_id)', c, c)
            from unnest(r.ref_columns) as c
        ),
        ' and '
      ) || ')';
```

C'est la raison structurelle pour laquelle un `update` direct ne peut pas servir à la délégation, et donc pour laquelle ENF-02 exige des opérations serveur explicites. Ne pas modifier ce générateur pour la phase 25 : une exception ici ouvrirait la délégation sur les 4 colonnes d'auteur (`routine_completions.completed_by`, `posts.author_id`, `post_comments.author_id`, `post_reactions.author_id`) à la fois, contredisant D-12.

### Le verbatim du refus enfant 42501 (0113)

```sql
-- Source: supabase/migrations/0113_enfant_perimeter.sql:276-279 (verbatim, lu)
  if auth.uid() is not null
     and private.household_role(private.gift_list_household_id(NEW.list_id)) = 'enfant' then
    raise exception 'réserve enfant refusée : voie attribuée uniquement' using errcode = '42501';
```

C'est la forme d'oracle à réutiliser : message en français sans donnée, `errcode = '42501'` (l'Edge traduit en 403 « Accès refusé », 0115:3-8). Les nouveaux refus (`actrice` non adulte, enfant hors foyer, module non activé, adulte cible) suivent cette forme.

### Le verbatim de l'ouverture enfant à la création de conversation (à ne pas toucher)

```sql
-- Source: supabase/migrations/0041_conversation_lifecycle.sql:14-24 (verbatim, lu)
--   * l'appartenance exigée est `assert_household_member`, PAS écrivain :
--     les enfants créent et écrivent (décision) ;
```

Après conversion cette décision devient inopérante par construction (pas de session), mais elle reste vraie pour les adultes qui créent des conversations. La vérification de module D-06 s'ajoute **dans** la fonction, pas dans une politique, pour rester dans la même transaction d'insertion conversation + membres (0041:78-93).

---

## Validation architecture

### Cadre de test

| Propriété | Valeur |
|-----------|--------|
| Cadre SQL | `supabase/tests/*.sql` exécuté par `sh scripts/test-db.sh` (transaction par fichier, annulée en sortie) |
| Aide de test | `supabase/tests/_setup.sql` → schéma `testkit` (fixtures, `testkit.eq`, `testkit.count`, `testkit.expect_denied`) |
| Cadre UI / hook | Vitest 5 + React Testing Library (`npm run test`), MSW pour le réseau, `fake-indexeddb` pour Dexie |
| E2E | Playwright (`npm run test:e2e`) |
| Contrôle statique SQL | `python3 scripts/check-sql-statique.py` puis `python3 scripts/test-check-sql-statique.py` |
| Chaîne avant commit | `cd app && npm run typecheck && npm test && npm run build` → `npm run test:e2e` → statique SQL → `sh scripts/test-db.sh` → `sh scripts/test-dispatch-push.sh` (si appareil abonné) |

### Phase Requirements → Tests

| Req ID | Comportement | Type | Commande automatisée | Fichier existe ? |
|--------|--------------|------|----------------------|------------------|
| ENF-01 | Création/édition/suppression d'un profil enfant sans compte | SQL + Vitest + E2E | `sh scripts/test-db.sh 0144` ; `npm run test -- parametres` | ❌ Wave 0 |
| ENF-02 | Assigner une tâche et cocher une routine « au nom de » un enfant ; actor ≠ membre courant | SQL (RPC) | `sh scripts/test-db.sh 0146` | ❌ Wave 0 |
| ENF-02 (négatif) | Écriture directe PostgREST de `completed_by = enfant` → 0 ligne, jamais de `raise` | SQL | `testkit.count` = 0 sur la ligne cible | ❌ Wave 0 |
| ENF-02 (D-13) | Un adulte ne peut pas agir au nom d'un autre adulte | SQL | `testkit.expect_denied` | ❌ Wave 0 |
| ENF-02 (D-12) | Un adulte ne peut pas insérer un post/commentaire/réaction avec `author_id = enfant` | SQL | Politique inchangée + `expect_denied` | ❌ Wave 0 |
| ENF-03 | `completed_by = enfant`, `actor_member_id = parent`, trace lisible après conversion | SQL | `testkit.eq` sur les 2 colonnes | ❌ Wave 0 |
| ENF-04 | RLS : ni session ni moyen d'agir pour un profil géré | SQL négatif | `set local role authenticated` avec `sub` supprimé → 0 ligne partout | ❌ Wave 0 |
| ENF-04 | Audit des politiques (tâches, routines, courses, cercle, cadeaux, anniversaires, messages) | SQL | Suite complète 0051 rejouée sans régression | ✅ (0051) |
| ENF-04 (D-12) | Un adulte du même foyer supprime un post/commentaire/réaction d'un enfant | SQL | Insertion → DELETE → `count = 0` | ❌ Wave 0 |
| ENF-04 (D-12) | Un adulte ne peut pas supprimer un post d'un **autre adulte** | SQL | `expect_denied` / 0 ligne | ❌ Wave 0 |
| ENF-05 | L'enfant figure dans les sélecteurs de tâches, routines, menu, anniversaires, messages | Vitest (composant) + SQL (lecture RLS) | `npm run test -- components/shared` | ✅ (composants existants) |
| ENF-05 (D-06) | Espace non activé → option désactivée côté client et refus serveur côté base | SQL + Vitest | `testkit.expect_denied` + test du picker | ❌ Wave 0 |
| D-23 | Échéance attribuée à un enfant → adultes du foyer destinataires | SQL (fonction pure) | `testkit.count` sur `push_reminder_notifications(now)` | ❌ Wave 0 |
| D-23 | Renvoyé à un enfant seulement → **zéro** destinataire enfant | SQL | `count = 0` sur `user_id IS NULL` | ❌ Wave 0 |
| D-15/D-16 | Conversion : compte supprimé, ligne membre conservée, rôles inchangés | SQL | `count(auth.users where id=...) = 0` + `count(household_members)=N` | ❌ Wave 0 |
| D-07 | Impossible de recréer un enfant avec compte (token ou `set_member_role`) | SQL | `expect_denied` sur les deux chemins | ❌ Wave 0 |
| D-19/D-20 | Liaison : toutes les traces réattribuées, ligne profil supprimée | SQL | `count` sur chaque table portant `member_id` | ❌ Wave 0 |
| UI fiche enfant | Âge calculé, photo, badge ambre, tri `roleOrder` | Vitest + Playwright | `npm run test -- members-panel` | ❌ Wave 0 |

### Taux d'échantillonnage

- **Par commit de tâche :** `sh scripts/test-db.sh <numéro>` + `cd app && npm run test`
- **Par fusion de vague :** `cd app && npm run typecheck && npm test && npm run build` → `python3 scripts/check-sql-statique.py` → `sh scripts/test-db.sh`
- **Porte de phase :** chaîne complète verte + `test-dispatch-push.sh` déclaré exécuté ou **déclaré non exécutable** (absence d'appareil abonné n'est pas un échec ; elle doit être dite).

### Gap Wave 0

- [ ] `supabase/tests/0144_managed_child_schema.sql` — invariant, socle par défaut, refus de CHECK (ENF-01, D-06)
- [ ] `supabase/tests/0145_convert_managed_children.sql` — conversion, purge `auth.users`, traces conservées (D-15/D-16/D-04)
- [ ] `supabase/tests/0146_child_behavior_guards.sql` — délégation, refus D-13, modération D-12, notification D-23, liaison D-19 (ENF-02/03/04)
- [ ] Tests Vitest : `members-panel` (fiche enfant, âge, suppression), picker « au nom de » (option désactivée), modération Cercle (bouton visible seulement pour un auteur enfant)
- [ ] Fixture Playwright : foyer avec au moins un profil enfant créé en phase 25 et un foyer avec un compte enfant **converti** (pour D-15/D-16)
- [ ] Aucun changement de `app/src/lib/data/seed.ts` requis au-delà des nouvelles colonnes (D-05)

---

## Domaines de sécurité

*`security_enforcement` non désactivé dans `.planning/config.json` → section requise.*

### Catégories ASVS applicables

| Catégorie ASVS | S'applique | Contrôle standard |
|----------------|-----------|-------------------|
| V2 Authentification | oui | Supabase Auth auto-hébergé ; aucune couche maison ; `EXECUTE` borné à `authenticated`/`service_role` |
| V3 Gestion de session | oui | Suppression réelle des comptes (D-16) ; `JWT_EXPIRY=3600` ; la RLS résout l'appartenance par `user_id`, donc un JWT orphelin ne lit rien |
| V4 Contrôle d'accès | oui | RLS + RPC `SECURITY DEFINER` ; `search_path = ''` ; aucune politique d'insertion sur `household_invite_tokens` |
| V5 Validation d'entrée | oui | `CHECK` de forme maison ; validation RPC côté base (22023) ; Zod v4 côté formulaire ; `btrim` + bornes de longueur |
| V6 Cryptographie | oui | HMAC invite (`INVITE_TOKEN_HMAC_SECRET`, non réutilisé pour autre chose) ; pas de chiffrement maison |
| V10 Gestion des secrets | oui | Aucun secret dans `cron.job.command` (AGENTS.md §2.7 H) ; clés publiable côté client uniquement |
| V11 Fail-safe | oui | Les nouveaux refus portent `errcode 42501`/`22023`/`28000` (oracle invariant, cf. 0113/0115) |
| V15 Configuration de sécurité | oui | `functions` Edge avec `auth: 'publishable'`/`'user'`/`'secret'`/`'none'` ; `FUNCTIONS_VERIFY_JWT=false` + vérification côté fonction |

### Menaces connues pour la stack de cette phase

| Motif | STRIDE | Mitigation standard |
|-------|--------|---------------------|
| Déclencher une opération « au nom de » pour autrui en déclarant `actor_member_id` côté client | Escalade de privilèges | `actor = auth.uid()` dans un RPC `SECURITY DEFINER` ; aucun paramètre d'acteur (ENF-02) |
| ROLLLBACK de l'invariant : enfant avec compte récréé | Escalade de privilèges | `CHECK ((user_id is null) = (role = 'enfant'))` + refus explicite dans les 2 chemins (0006, 0036) |
| Suppression cascade d'un compte enfant détruit l'historique | Perte d'intégrité (D-04 violé) | `update ... set user_id = null` avant `delete from auth.users`, même transaction ; test de comptage membre inchangé |
| Le client affirme être un enfant géré pour contourner la modération Cercle | Spoofing | Le DELETE porte `private.current_member_id(household_id)` (résolu en base), jamais un paramètre |
| Le client lit une fiche enfant d'un autre foyer | Fuite d'information | `household_members_select` = `is_household_member` (0007:267-269) ; aucun endpoint de lecture hors foyer |
| Un RPC expose une donnée d'un enfant d'un autre foyer dans son rapport | Fuite d'information | Oracles sans donnée ; les nouvelles fonctions renvoient un comptage de foyer, jamais une liste (motif 0113 « jamais de donnée dans un refus ») |
| L'Edge `push-notify` reçoit une destination enfant | Contournement d'accès | `push_subscriptions` ne porte que des `user_id` ; plus de ligne → plus de destination |
| Le contrôle statique SQL ne regarde rien | Non-détection (AGENTS.md §2.7 B) | Le contrôler sur un cas qui doit échouer ; `scripts/test-check-sql-statique.py` rejoué |

---

## État de l'art

| Ancienne approche | Approche actuelle | Quand changé | Impact |
|--------------------|-------------------|--------------|--------|
| Compte enfant autonome avec session (v0.9.0) + périmètre refusé en lecture/écriture (0113-0116) | Profil enfant **sans** compte, parent acteur, traces attribuées | v1.0 (cette phase) | La délégation devient une opération serveur explicite ; la RLS d'écriture ne s'applique plus à l'enfant (il n'a pas de session), donc les refus enfant 0113 deviennent défensifs |
| Refus enfant dans les politiques à la main (0113, clause `IS DISTINCT FROM 'enfant'`) | Un invariant structurel `CHECK` + des garde-par-membre | Après la conversion | Le périmètre devient impossible à contourner, pas seulement refusé |
| Notifications résolues sur le destinataire attribué | Notifications adultes du foyer si l'attributaire n'a pas de compte | Phase 25 | Une tâche attribuée à un enfant est visible par les adultes — c'était le trou de la phase 08 |
| « Modifier le rôle » par RPC admin | Le rôle `enfant` n'est plus assignable depuis une session réelle | Phase 25 | `set_member_role` refuse `'enfant'` ; `redeem_household_invite_token` aussi |

**Dépassé / obsolète :**
- Les contrats enfants 0113-0116 ne sont **pas** supprimés : ils restent dans le dépôt et racontent ce qui s'est passé (AGENTS.md §2.7 A) ; ils deviennent la protection résiduelle pour un éventuel compte orphelin.
- `CHILD_HIDDEN_MODULES` côté client (modules.ts:116) garde son rôle de présentation (tuile/navigation) ; il ne définit plus le périmètre serveur (la fiche `managed_modules` le définit à présent par foyer).
- Le champ `role = 'enfant'` dans `invitations.role` (0002:92) reste dans le `CHECK` pour la compatibilité, mais aucun chemin ne peut plus l'écrire vers un compte réel.

---

## Journal des hypothèses

> Les affirmations marquées `[ASSUMED]` dans cette recherche. À confirmer avant qu'elles deviennent des décisions verrouillées.

| # | Affirmation | Section | Risque si fausse |
|---|-------------|---------|-----------------|
| A1 | `delete from auth.users` peut être exécuté depuis une migration appelée par `scripts/migrate.sh` (rôle `postgres` propriétaire, sans FK résiduelle non-cascade dans les schémas `auth`/`storage`/`realtime`) | Pattern 7 ; Inventaire | La conversion échoue au milieu de la migration ; il faudrait découpler en RPC appelé via l'API admin (Supabase Admin `DELETE /admin/users/{id}`) au lieu d'un SQL direct. Le plan doit prévoir la variante RPC-first si la migration échoue |
| A2 | L'ordre recommandé `update ... set user_id = null` puis `delete from auth.users` ne rencontre aucune FK `NOT NULL` résiduelle (par ex. une table avec `user_id not null references auth.users`) pour les enfants | Pattern 7 | Une contrainte non-cascade bloque la suppression ; il faut lister les FK à réattacher avant de supprimer |
| A3 | Les noms de helpers proposés (`is_managed_child`, `managed_child_module_allowed`, `assert_child_module_allowed`) ne collisionnent pas avec une définition effective existante | Pattern 1 | Le `create or replace` écraserait une définition que quelqu'un d'autre a écrite plus tard (piège 1). Vérifier par `grep` avant d'écrire |
| A4 | L'âge calculé « 2 ans, 3 mois » sous 3 ans et « 10 mois » avant 1 an (UI-SPEC § Typography) correspond aux fonctions `date-fns` disponibles en 4.4.0 | Pattern 8 | Implémentation légèrement différente (arrondi inclus/exclu) ; à valider par un test unitaire sur les bornes |
| A5 | La liste des clés activables = catalogue moins `CHILD_HIDDEN_MODULES` (15 clés) — le socle D-06 ne permet pas d'activer l'ardoise | Pattern 3 | Si l'utilisateur veut pouvoir activer l'ardoise enfant en v1, la fiche doit exposer 16 clés et la fermeture 0113 doit être rouverte (contraire au backlog « argent de poche »). Déjà tranché par D-24/CONTEXT § Deferred, donc [CITED] |
| A6 | Aucun test SQL existant ne suppose qu'un enfant possédant un compte existe en production permanente | Inventaire | 0051 rejoue la forme avec-compte via `set_config` — elle reste valide car le test kit crée ses propres comptes ; mais les tests E2E de login enfant doivent être retirés |

---

## Questions ouvertes

1. **Suppression dure vs masquage Cercle (D-12)** `(RÉSOLUE : suppression dure)` — l'UI-SPEC décrit la suppression seule (« Ce contenu ne sera plus visible ») mais D-12 dit « supprimer/masquer ». Le schéma n'a pas de colonne `is_hidden`.
   - Ce que l'on sait : `posts_delete_admin` (0109:70-88) est la seule voie de suppression ; aucun `hidden_by` n'existe.
   - Ce qui n'est pas clair : si le produit veut réellement un état « masqué » distinct de « supprimé » (historique conservé mais non visible), il faut une colonne et une vue.
   - Résolution : **suppression dure** dans v1 (la plus simple, alignée sur l'UI-SPEC et sans colonne neuve) ; le masquage est noté dans la liste des évolutions si le produit l'exige plus tard.

2. **Colonne d'acteur sur les tâches** `(RÉSOLUE : colonnes en text)` — ENF-03 exige « l'enfant comme attributaire et le parent comme acteur ». Pour les tâches, l'attribution est déjà possible sans RPC spécial (`task_assignees_insert`).
   - Ce que l'on sait : `tasks.created_by` (0003:89) capture le créateur, pas le dernier attributeur.
   - Ce qui n'est pas clair : faut-il une colonne `tasks.assigned_by_member_id` (dernier attributeur) ou une table d'audit append-only ?
   - Résolution : colonnes nullables **en `text`** (types réels des identifiants membres) — `tasks.assigned_by_member_id` écrite par `replace_task_assignees` et `routine_completions.actor_member_id` écrite par `complete_routine_occurrence`, à chaque appel (uniformité, coût négligeable) ; posées en 0146, elles rendent ENF-03 vérifiable sur les deux surfaces de D-11 sans double sémantique.

3. **Texte REQUIREMENTS.md / ROADMAP.md « réagir dans le Cercle »** `(RÉSOLUE : plan 25-06)` — D-12 contredit explicitement ce texte (verbatim dans CONTEXT : « ROADMAP.md/REQUIREMENTS.md doivent être relus à cette aune par l'agent »).
   - Résolution : plan documentaire **25-06** (wave 1, indépendant) : « réagir/réagit dans le Cercle » → « modérer/modère le Cercle » dans REQUIREMENTS.md (ENF-02) et ROADMAP.md (critère #2), et correction étendue au critère #3 (sélecteurs alignés sur le socle D-06, retrait d'« ardoise » et de « messagerie »).

4. **Règle du premier foyer à un enfant multi-foyers** `(RÉSOLUE : foyer courant uniquement)` — D-22 fixe « un seul foyer ». Mais l'invitation standard permet à un adulte d'accepter dans deux foyers.
   - Résolution : non traité dans cette phase (D-22 couvre déjà le cas ; pas de conflit de schéma). La fusion D-19/D-20 (`link_managed_child`, 0148) réattribue les traces **du foyer courant uniquement** (les deux lignes doivent partager le même foyer, refus 22023 sinon) — la limite est documentée en tête du RPC pour RGDP-06.

5. **Test de conversion sur une base de développement** `(RÉSOLUE : conversion observable en transaction)` — `test-db.sh` annule chaque fichier ; un test de conversion qui supprime réellement des lignes `auth.users` est annulé, donc **inobservable** côté production après rejeu.
   - Résolution : la migration 0145 **appelle elle-même** `convert_managed_children_to_profiles()` — la conversion s'exécute dans la transaction rollée de test-db.sh et son effet (user_id null, profiles/auth.users purgés, tâche assignée intacte) est asserté en transaction, la même discipline que `testkit.expect_denied` pour une écriture censée échouer.

---

## Sources

### Primaires (HAUTE confiance, lues en session)

- `supabase/migrations/0002_tables_identity.sql:14-108` — définition de `household_members` (colonne `user_id` nullable, `role` 3 valeurs), `profiles`, `households`, `household_invite_tokens`, `invitations`
- `supabase/migrations/0006_security_helpers.sql:20-145, 262-478` — helpers `is_household_member`, `household_role`, `current_member_id`, `is_household_admin`, `can_write_household`, `assert_household_admin`, `redeem_household_invite_token`
- `supabase/migrations/0007_rls_policies.sql:170-244, 247-335, 357-394` — générateur de politiques, gardes d'auteur, politiques foyer/membre, `task_assignees`
- `supabase/migrations/0019_push_dispatch.sql:30-228` — sources de notification, filtres `user_id is not null`
- `supabase/migrations/0036_set_member_role.sql:21-84` — modèle RPC `authenticated` à suivre
- `supabase/migrations/0041_conversation_lifecycle.sql:1-108` — `create_conversation`, modèle « acteur = auth.uid() »
- `supabase/migrations/0003_tables_daily.sql:81-152` — `tasks`, `task_assignees`, `routines`, `routine_assignees`, `routine_completions`
- `supabase/migrations/0004_tables_shared.sql:108, 214-282, 273-282` — `birthdays.linked_member_id`, `posts`, `post_comments`, `post_reactions`, `conversations`, `conversation_members`
- `supabase/migrations/0109_cercle_author_guards.sql:1-88` — gardes auteur/admin, politiques DELETE Cercle
- `supabase/migrations/0113_enfant_perimeter.sql:1-1187` — périmètre enfants complet, refus `42501`, formes d'oracle, RPC `p_actor_id`
- `supabase/migrations/0114_enfant_perimeter_complement.sql:1-18` — leçon de classe, resserrement dans le helper
- `supabase/migrations/0115_enfant_perimeter_settlements.sql:1-25` — soldes enfant 42501, leçon de surcharge d'appel
- `supabase/migrations/0116_enfant_perimeter_redeem_restore.sql:1-40` — **leçon de redéfinition depuis la définition effective**
- `supabase/migrations/0133_replace_sets.sql:1-60` — `replace_task_assignees`, choix d'autorisation, piège `is not true`
- `supabase/migrations/0140_household_disabled_modules.sql:1-75` — formalisme `disabled_modules`, `has_valid_module_keys`, droits `EXECUTE` pour les CHECK
- `supabase/migrations/0142_meal_entries.sql:21-56` — `meal_entries.member_ids text[]`
- `supabase/tests/_setup.sql:1, 130, 263-293` — aide de test, `set local role authenticated`, fixation de session
- `supabase/tests/0051_enfant_perimeter.sql` — suite de référence (79 assertions `testkit.count`/`eq`)
- `app/src/modules/parametres/components/members-panel.tsx:1-249` — surface UI cible D-02
- `app/src/modules/parametres/api.ts:1-202` — modèles RPC côté client (`set_member_role`, `saveDisabledModules`)
- `app/src/modules/routines/api.ts:100-180` — écriture directe des complétions (à remplacer par RPC)
- `app/src/modules/taches/api.ts:1-55` — `replaceSet('task_assignees', ...)`
- `app/src/lib/modules.ts:38-160` — catalogue des clés de module, `CHILD_HIDDEN_MODULES`
- `app/src/lib/data/seed.ts:198-207` — enfant de démonstration déjà `user_id: null`
- `app/package.json:11-19, 50` — scripts et versions `date-fns`
- `scripts/test-db.sh:1-40` — déroulé des tests SQL
- `.planning/STATE.md`, `.planning/REQUIREMENTS.md`, `.planning/phases/25-.../25-CONTEXT.md`, `.planning/phases/25-.../25-UI-SPEC.md`, `AGENTS.md`

### Secondaires (MOYENNE confiance)

- Aucune recherche web nécessaire : aucune dépendance externe, aucun paquet nouveau, aucune décision de produit ouverte qui ne soit déjà tranchée dans CONTEXT.md.

### Tertiaires (BAISE confiance)

- A1, A2 du journal des hypothèses — à confirmer par une sonde SQL à la première application réelle de la migration 0145 sur la base de développement.

---

## Métadonnées

**Analyse de la confiance :**
- Standard Stack : HAUTE — aucune dépendance externe ; les versions locales sont vérifiées dans le dépôt.
- Architecture : HAUTE — chaque RPC, helper, politique et trigger référencés sont lus verbatim en session ; les deux points d'hypothèse (A1/A2) concernent le moteur PostgreSQL, pas la conception.
- Pièges : HAUTE — chaque piège est ancré sur une migration réelle du dépôt (0113/0115/0116/0133/0140/0007) ou sur une règle documentée d'AGENTS.md §2.7.
- Sécurité : HAUTE — la frontière d'autorisation du dépôt (RLS + RPC) est entièrement connue ; l'audit des 12 modules est livré.

**Date de la recherche :** 2026-10-25
**Valable jusqu'à :** ~2026-11-25 (le dépôt évolue activement entre les phases ; les définitions effective doivent être relues avant chaque rédaction de migration)
