# Contrat de développement frontend — `app/`

Ce document est la source de vérité pour tous les modules de l'application
`Ensemble & Organisés`. Il est normatif : ne pas le contourner, le compléter par
une décision documentée si nécessaire.

- Référentiel produit et technique : `../AGENTS.md`
- Contrat visuel : `../DESIGN-HANDOFF.md` + `../design-export/` (export d'origine)
- Tokens, composants partagés, data layer : déjà en place, ne pas les modifier.

## 1. Stack (déjà installée, versions épinglées)

React 19.3 · React Router 8.4 (imports depuis `react-router`) · TypeScript 7
(verbeux : `verbatimModuleSyntax`, `noUnusedLocals`, `strict`) · Vite 8.3 ·
Tailwind CSS 4 (CSS-first) · TanStack Query 5 · Zustand 5 · React Hook Form 7 +
Zod 4 · Radix UI (primitives WAI-ARIA) · dnd-kit (modulaire) · date-fns 4 ·
rrule · Dexie 4 · @supabase/supabase-js 2.

## 2. Arborescence d'un module

```
src/modules/<module>/
  <module>-page.tsx      # export par défaut, rendu complet du module
  api.ts                 # accès aux données du module (fonctions async)
  types.ts               # types métier camelCase + mappers depuis les lignes SQL
  components/            # composants spécifiques (optionnel)
  hooks/                 # hooks spécifiques (optionnel)
  <module>-page.test.tsx # un test RTL minimal par module
```

Le fichier de page est déjà référencé par `src/app/router.tsx` : le nom de
l'export par défaut est imposé par le routeur (voir §4).

## 3. Tokens de design (ne jamais introduire d'autres couleurs/rayons/typos)

Tous les tokens sont définis dans `src/styles/app.css` (port fidèle de
`design-export/src/styles.css`).

| Rôle | Classe Tailwind | Token |
|---|---|---|
| Fond | `bg-bg` | `oklch(98% 0.004 240)` |
| Surface | `bg-surface` / `border-border` | blanc / `oklch(90% 0.006 240)` |
| Texte | `text-fg` / `text-muted` | `oklch(20% 0.02 240)` / `oklch(50% 0.018 240)` |
| Accent | `text-accent-strong`, `bg-accent`, `bg-accent-soft`, `bg-accent-faint` | pétrole |
| Alerte | `bg-coral-soft`, `text-coral` | corail |
| Attention | `bg-amber-soft`, `text-amber` | ambre |
| Rayons | `rounded-[10px]` (sm), `rounded-[16px]` (md, cartes), `rounded-[22px]` (lg), `rounded-[11px]` (contrôles) |
| Ombres | `shadow-[var(--shadow-sm)]`, `shadow-[var(--shadow-md)]` |
| Titres | `font-display` avec tracking négatif | idem export |
| Corps | `font-body`, 15px / 1.45 | idem export |

Utilitaires personnalisés : `eyebrow`, `lede`, `tile-overlay`,
`trip-overlay`, `coupon-ring`, `pulse-ring`, `barcode-stripes`,
`topbar-surface`, `panel-surface`, `safe-bottom`, `scrollbar-slim`.

Correspondances export → Tailwind (à respecter) :

| Export | Tailwind |
|---|---|
| `.panel`, `.side-card`, `.widget-card`, `.routine-card`, `.note-card`, `.gift-card`, `.provider-card`, `.loyalty-card`, `.place-card`, `.post` | `panel-surface rounded-[16px] p-[19px]` |
| `.widget-card` | idem + `min-h-[190px] overflow-hidden relative` |
| `.metric-card` | `rounded-[16px] border border-border bg-surface px-4 py-[15px]` |
| `.count-badge` | `CountBadge` |
| `.priority.high/.normal/.low` | `PriorityTag` |
| `.check-button` | `Checkbox` |
| `.input`, `.select`, `.textarea` | `Input`, `Select`, `Textarea` |
| `.button*` | `Button` (`variant`: primary/secondary/quiet/danger/ghost, `size`: sm/default/lg/icon) |
| `.modal-backdrop` + `.modal-card` | `Dialog` + `DialogContent` |
| `.empty-state` | `EmptyState` |
| `.progress-track` + `.progress-value` | `Progress` |
| `.barcode` | `barcode-stripes` |
| `.module-tile` | `ModuleTile` |
| `.icon / .icon-sm / .icon-lg` | `<Icon size="md" | "sm" | "lg" />` |
| `.section-kicker` | `text-[10px] font-extrabold tracking-[0.14em] uppercase text-muted` |
| `.tab` | `TabsTrigger` |
| `.switch` | `Switch` |

Points de rupture de l'export à conserver : `1180px` (barre latérale 218px),
`920px` (barre latérale 76px, colonnes qui s'empilent), `650px` (navigation
basse, colonne unique, titres 34px). Aucun débordement horizontal de 360px à
1920px.

## 4. Routes et pages imposées

| Route | Fichier à fournir (export par défaut) |
|---|---|
| `/taches` | `src/modules/taches/taches-page.tsx` |
| `/calendrier` | `src/modules/calendrier/calendrier-page.tsx` |
| `/notes` | `src/modules/notes/notes-page.tsx` |
| `/courses` | `src/modules/courses/courses-page.tsx` |
| `/routines` | `src/modules/routines/routines-page.tsx` |
| `/recettes` | `src/modules/recettes/recettes-page.tsx` |
| `/ardoise` | `src/modules/ardoise/ardoise-page.tsx` |
| `/cadeaux` | `src/modules/cadeaux/cadeaux-page.tsx` |
| `/anniversaires` | `src/modules/anniversaires/anniversaires-page.tsx` |
| `/animaux` | `src/modules/animaux/animaux-page.tsx` |
| `/prestataires` | `src/modules/prestataires/prestataires-page.tsx` |
| `/fidelite` | `src/modules/fidelite/fidelite-page.tsx` |
| `/adresses` | `src/modules/adresses/adresses-page.tsx` |
| `/cercle` | `src/modules/cercle/cercle-page.tsx` |
| `/voyages` | `src/modules/voyages/voyages-page.tsx` |
| `/messages` | `src/modules/messages/messages-page.tsx` |
| `/parametres` | `src/modules/parametres/parametres-page.tsx` |
| `/accueil` | `src/modules/dashboard/dashboard-page.tsx` |

Une page rend `ModuleShell` (ou `ModuleHeader` si la mise en page diffère) avec
`module="<clé>"` : le retour, le sur-titre, le titre et l'accroche viennent
automatiquement du catalogue.

## 5. API disponible (ne pas réécrire)

```ts
// Données : CRUD générique, cache + mutation optimiste
import { useResource, useLinkedRows, useDataAdapter, queryKeys } from '@/lib/data/useResource';
import { data, isLocalMode } from '@/lib/data';   // adaptateur actif (PostgREST ou IndexedDB)

const { rows, isLoading, isError, error, refetch, create, update, remove, mutate, isMutating } =
  useResource<TaskRow>('tasks', { filter: { status: 'a_faire' } });
```

`useResource` filtre automatiquement sur `household_id` (le foyer courant du
store) sauf si vous passez `scoped: false`. Il invalide le cache après chaque
écriture. `mutate(id | null, values)` fait création ou mise à jour avec
rollback en cas d'erreur.

Tables de jointure **sans `id`** (`task_assignees`, `routine_assignees`,
`conversation_members`, `gift_list_shares`…) : utilisez `useLinkedRows` :

```ts
const { rows: assignees, add: addAssignee, remove: removeAssignee } =
  useLinkedRows<TaskAssigneeRow>('task_assignees', { task_id: taskId });
await addAssignee({ task_id: taskId, member_id: memberId });
await removeAssignee({ task_id: taskId, member_id: memberId });
```

Requêtes composées (jointures) : `useQuery` + `data.list(...)` + invalidation
via `queryClient.invalidateQueries({ queryKey: queryKeys.tableAll('table') })`.

```ts
// Store du foyer
import { useHouseholdStore, useMembers, useCurrentMember, useIsAdmin, useMemberName } from '@/stores/household-store';

// Utilitaires
import { cn, formatEuro, formatEuroCompact, formatMediumDate, formatLongDate, formatShortDate,
         formatMonthLabel, formatWeekday, todayIso, toIsoDate, toLocalDate, addDays, daysBetween,
         relativeDayLabel, pluralize, clamp, initials, formatEuro } from '@/lib/utils';

// UI
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea, SearchInput } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogActions } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Switch, Checkbox, Tabs, TabsList, TabsTrigger, TabsContent, Badge, Progress } from '@/components/ui/primitives';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

// Partagés
import { ModuleShell, ModuleHeader, Panel, MetricRow, SectionHeading, CountBadge, PriorityTag } from '@/components/shared/module-shell';
import { MemberAvatar, memberTagClass } from '@/components/shared/member-avatar';
import { ModuleTile } from '@/components/shared/module-tile';
import { QrCode } from '@/components/shared/qr-code';
import { Icon } from '@/components/shared/icon';
import { useCalendarGrid } from '@/hooks/use-calendar';
import { useFrenchHolidays } from '@/hooks/use-french-holidays';
import { assetUrl, moduleMap, modules, type ModuleKey } from '@/lib/modules';
import type { TaskRow, EventRow, ... } from '@/types';   // lignes SQL, cf. §6
```

`Field` s'utilise ainsi (le libellé est lié automatiquement au contrôle) :

```tsx
<Field label="Nom de la tâche" error={errors.name?.message} hint=" facultatif">
  {(props) => <Input {...props} {...register('name')} />}
</Field>
```

## 6. Lignes SQL disponibles (`src/types/database.ts`)

`households`, `household_members`, `profiles`, `household_invite_tokens`,
`invitations`, `shopping_lists`, `shopping_list_items`, `events`,
`event_reminders`, `notes`, `tasks`, `task_assignees`, `task_reminders`,
`routines`, `routine_assignees`, `routine_reminders`, `routine_completions`,
`recipes`, `expenses`, `expense_participants`, `external_participants`,
`gift_lists`, `gift_items`, `gift_list_shares`, `birthdays`, `pets`,
`pet_records`, `provider_types`, `providers`, `loyalty_cards`, `places`,
`posts`, `post_media`, `post_comments`, `post_reactions`, `trips`,
`conversations`, `conversation_members`, `messages`, `dashboard_widgets`.

`push_subscriptions` en est volontairement **absente** : la table n'a ni politique
RLS ni privilège pour `authenticated`, et le frontend ne lit ni n'écrit d'y. Le
type `PushDevice` de `database.ts` décrit la réponse de l'Edge Function
`push-subscribe`, pas une ligne PostgREST. Un module qui.mapperait un `select`
sur cette table casserait à l'exécution, pas au type-check.

Les clés sont en `snake_case`, identiques aux colonnes PostgreSQL. Chaque module
expose dans son `types.ts` un type métier camelCase + une fonction de mapping
(`toTask(row: TaskRow): Task`). Les libellés français de l'export
(`'a_faire'`, `'Haute'`, …) sont traduits dans ces types, pas dans l'UI.

## 7. Jeu de démonstration

`src/lib/data/seed.ts` contient le foyer Martin (Camille, Thomas, Lina, Noé,
Maya) avec les données et les libellés exacts de l'export de design, recalés sur
la date du jour. Ne pas le modifier : s'appuyer dessus pour les états réels.
Photos : `/assets/<fichier>.jpg` (voir `src/lib/modules.ts` → `assetUrl`).

## 8. Règles UX et accessibilité (AGENTS.md §6)

1. Zones tactiles ≥ 44px, `<button>` / `<a>` réels : jamais de `div` cliquable.
2. Toute suppression passe par `ConfirmDialog`.
3. États vides soignés : `EmptyState` avec texte d'invitation + action.
4. Formulaires longs en sections repliables (`@radix-ui/react-collapsible`).
5. Le code couleur par membre est cohérent (avatar, tâche assignée, événement).
6. Focus visible (`:focus-visible` global), libellés `aria-label` sur les
   boutons icônes, `aria-live` sur les zones dynamiques.
7. Formulaires : React Hook Form + Zod, validation côté client, `Field` pour les
   erreurs ; `noValidate` sur le `<form>`.
8. Texte français : espaces insécables avant `: ; ! ? »`, apostrophes `’`,
   accents obligatoires. Jamais de contenu marketing générique : conserver les
   libellés de l'export.
9. Aucune dépendance supplémentaire : tout est déjà installé. Les paquets
   `workbox-*` sont des `devDependencies` épinglés, utilisés **uniquement** par
   `src/sw.ts` : le service worker est en `injectManifest` parce que
   `generateSW` ne permet d'ajouter aucun écouteur, et l'API Push en exige deux.
10. `tsc --noEmit` doit passer sans erreur ni avertissement. `npm test` couvre
    aussi `supabase/functions/**/*.test.ts` : le chiffrement Web Push n'utilise
    que WebCrypto et se vérifie donc sans Deno ni stack.

## 9. Vérification attendue

```bash
cd app && npx tsc --noEmit && npx vitest run src/modules/<module>
```

Un test RTL par module, rendu avec le helper :

```tsx
import { renderWithProviders } from '@/test/render';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

Le test doit couvrir un comportement métier réel (création, validation,
filtre, suppression confirmée, état vide…), pas un simple rendu.
