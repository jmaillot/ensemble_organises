# Phase 25: Profils enfants gérés par le parent - Context

**Gathered:** 2026-10-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Renverser l'identité : un enfant du foyer existe comme membre d'un foyer (sélecteurs, attributions, traces) **sans jamais posséder de compte d'authentification**. Un adulte du foyer agit au nom de l'enfant par des opérations serveur explicitement validées ; la filiation adulte → enfant reste en base (auditable) mais n'est pas affichée dans l'UI. C'est le renversement d'identité du jalon v1.0 : tout ce qui change « qui peut agir » précède toute mécanique de suppression (phases 26-27).

**Hors périmètre (noté ailleurs ou interdit) :** aucun accès direct enfant à l'app (verrouillé), aucune délégation adulte → adulte, aucune publication au nom d'un enfant dans le Cercle (modération seule), aucun argent de poche / Ardoise enfant (backlog), aucune refonte du parcours d'invitation.
</domain>

<decisions>
## Implementation Decisions

### Gestion des profils enfants
- **D-01:** Tout **membre adulte** (rôles `admin` ET `membre`) peut créer, modifier et supprimer les profils enfants du foyer — pas seulement les admins. Les profils enfants sont exclus de toute opération de gestion par construction (pas de session). — **Reversibility:** reversible
- **D-02:** UI : le **members-panel existant** (`app/src/modules/parametres/components/members-panel.tsx`, badge ambre « enfant » déjà présent) est étendu avec création/édition/suppression des profils gérés. Pas de section enfants dédiée.
- **D-03:** Tout adulte peut modifier ou supprimer un profil créé par quelqu'un d'autre — pas de propriété individuelle d'une fiche partagée.
- **D-04:** À la **suppression** d'un profil enfant, les traces où il est attributaire sont **conservées** (tâches créées, complétions passées) ; seul le membre disparaît des sélecteurs. Jamais de purge d'historique.
- **D-05:** **Fiche enrichie** : nom d'usage, couleur (color_tag), date de naissance avec **âge calculé affiché**, **restrictions par module**, **photo gérée par le parent** (bucket `household-media`, chaîne avatars existante).
- **D-06:** Accès par défaut = **socle restreint** : un nouvel enfant figure uniquement dans **tâches, routines, anniversaires, menu**. Tout autre espace refuse l'attribution tant qu'il n'est pas activé sur la fiche. Sémantique : « accès » = être attributaire/mentionnable (l'enfant n'a aucune session) ; les sont des « espaces où il peut figurer », pas des permissions de session.
- **D-07:** Statut « géré par le parent » **figé, codé en dur** : l'absence de session suffit, aucun réglage de fiche, jamais admin, opérations de rôle (`set_member_role`) réservées aux comptes réels. Suit la logique 0113 : le serveur refuse toute escalade sur un profil sans session.
- **D-08:** **Filiation intrinsèque** : tout adulte du foyer peut agir au nom de n'importe quel enfant du même foyer. Pas de champ « responsables désignés » ; la filiation auditable (ENF-03) repose sur la trace (parent acteur en base), pas sur un rattachement nominal.
- **D-09:** Aucune limite de nombre de profils enfants par foyer, noms en doublon permis (départage visuel par couleur/photo).

### Agir au nom de l'enfant
- **D-10:** **Choix par action**, jamais un switch d'identité global : chaque point d'entrée propose explicitement « au nom de… » via le member-picker existant. Aucune ambiguïté sur la trace, pas d'état global à oublier — conforme à ENF-02 (opérations serveur explicites, pas de CRUD générique).
- **D-11:** Périmètre v1 de l'action au nom de l'enfant : **tâches** (assigner) et **routines** (cocher) uniquement.
- **D-12:** **Déviation ENF-02 assumée** : le parent **ne publie pas** au nom de l'enfant dans le Cercle. Verbatim utilisateur : « je ne veux pas que le parent puissent publier en tant que l'enfant dans le cercle, juste de la modération ». La part Cercle d'ENF-02 et du critère de succès n°2 devient : **modération** = un adulte peut supprimer/masquer tout contenu du Cercle (post, commentaire, réaction) attribué à un profil enfant du foyer, y compris l'historique issu des anciens comptes enfant. ROADMAP.md/REQUIREMENTS.md doivent être relus à cette aune par le planificateur — le texte stocké mentionne encore « réagit dans le Cercle ».
- **D-13:** La délégation « au nom de » s'arrête **aux enfants** : un adulte ne peut jamais agir au nom d'un autre adulte. Toute extension (cocher pour le conjoint) est une capacité transverse hors périmètre ENF.
- **D-14:** UI : l'**attributaire seul est affiché** (l'enfant apparaît comme cochée/assigné) ; l'acteur parent reste en base pour l'audit mais n'est pas montré dans l'interface. — **Reversibility:** reversible (ajout d'affichage ultérieur sans changement de schéma)

### Conversion des comptes enfant existants
- **D-15:** **Conversion totale en une migration** : les membres `role='enfant'` possédant un compte auth deviennent des profils gérés (sans `user_id`). Pas de coexistence durable des deux formes — c'est la condition de RGDP-06 (purge enfant avec le parent, phase 27).
- **D-16:** Le compte auth Supabase sous-jacent est **supprimé réellement** (voie serveur/admin), pas seulement dissocié : plus aucune session possible, preuve forte du critère n°4. L'historique reste attribué au membre devenu profil géré.
- **D-17:** Verrou produit : **l'enfant ne se connecte jamais, tout passe par un adulte.** (Question utilisateur : « comment l'enfant se connecte t'il a l'application ? » — réponse : il ne le fait pas, par conception ; le besoin futur est couvert par la transition D-18.)
- **D-18:** La conversion est **à sens unique** ; aucun chemin de retour profil géré → compte dans cette phase. — **Reversibility:** one-way — migration unique supprimant les comptes auth enfant ; un retour exigerait de recréer des identités (impossible sans refonte) ; le rattrapage est la liaison D-18bis
- **D-18bis:** Transition future **incluse dans cette phase** : la liaison à l'invitation standard — voir catégorie Transition.

### Transition vers un vrai compte (enfant qui grandit)
- **D-19:** **Liaison à l'invitation** : l'invitation standard du foyer (token existant) crée un compte ; à l'acceptation, un adulte peut **lier** le nouveau membre au profil enfant : fusion en une opération serveur unique et irréversible (les traces basculent, la ligne profil est supprimée), même transaction.
- **D-20:** À la liaison, **toutes les traces** du profil (tâches, complétions, contenus restants) sont réattribuées au compte réel, sans fenêtre temporelle — l'historique complet suit l'identité. — **Reversibility:** one-way — fusion définitive : UPDATE massif de réattribution + suppression de la ligne profil dans une transaction ; aucune réversibilité prévue
- **D-21:** Parcours UI **minimal** : un bouton d'adulte sur la fiche enfant (« Donner accès ») qui s'appuie sur l'invitation standard — pas d'assistant dédié, pas de refonte du parcours d'invitation.

### Multi-foyers et notifications
- **D-22:** Un profil enfant appartient à **un seul foyer** (ligne `household_members`). Un enfant de deux foyers = deux profils indépendants. Pas d'entité enfant globale — ce qui préserve la purge par foyer de RGDP-06 et évite d'interagir avec la définition « à qui correspond la donnée » de la phase 26.
- **D-23:** Les échéances attribuées à un enfant (tâche en retard, routine du jour) notifient **les adultes du foyer**, via la chaîne push existante (`dispatch_messages` → `push-notify`). Aucun device enfant par définition.

### the agent's Discretion
- Détails du schéma (nullable `user_id` vs table dédiée, `birth_date`/photo, stockage des restrictions par module — candidat : réutiliser le formalisme `disabled_modules` de 0140 au niveau membre) — le chercheur et le planificateur tranchent, les migrations 0113-0116 à re-diligencier guident le choix le moins invasif.
- Forme exacte des opérations serveur « au nom de » (RPC dédiées vs paramètre `actor_member_id` sur RPC existantes), messages d'erreur et oracles des tests négatifs.
- Détails de la modération Cercle (suppression vs masquage) dans le cadre de D-12.
- Ordre interne des migrations et annonces produit autour de la conversion.

### Folded Todos
*Aucun todo plié — aucun todo en attente n'a matché la phase (`todo_count: 0`).*
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contrats enfants v0.9.0 (à re-diligencier dans cette phase)
- `supabase/migrations/0113_enfant_perimeter.sql` — fermeture serveur des 5 modules au rôle `enfant` ; forme exacte des portes RLS (helper `can_write_household`, entorse `can_read_gift_list` prouvée par 0033), RPC service_role résolvant le rôle depuis `p_actor_id`
- `supabase/migrations/0114_enfant_perimeter_complement.sql` — complément du périmètre
- `supabase/migrations/0115_enfant_perimeter_settlements.sql` — Ardoise/settlements (l'exclusion enfant reste telle quelle, cf. D-24/backlog)
- `supabase/migrations/0116_enfant_perimeter_redeem_restore.sql` — échange/réserve, oracles d'erreur invariants

### Schéma & helpers existants
- `supabase/migrations/0002_tables_identity.sql` — `household_members.role` check (`admin`/`membre`/`enfant`), source du type Role
- `supabase/migrations/0036_set_member_role.sql` — RPC de changement de rôle (à maintenir réservée aux comptes réels, D-07)
- `supabase/migrations/0140_household_disabled_modules.sql` — formalisme `disabled_modules` (candidat pour les restrictions par module D-06)

### Chaînes réutilisables
- Chaîne push `dispatch_messages` → `push-notify` — pour D-23 (notifications échéances enfant aux adultes) ; voir STATE.md § Accumulated Context
- `.planning/STATE.md` — décisions héritées v0.9.0, frontières tranchées par la recherche (portes dures du jalon)
- `.planning/research/SUMMARY.md` — enfant = renversement d'identité, audit RLS exhaustif attendu (tâches, routines, cercle, cadeaux, anniversaires, messages)

### Exigences verrouillées (texte à relire, cf. D-12)
- `.planning/REQUIREMENTS.md` § Profils enfants — ENF-01…ENF-05
- `.planning/ROADMAP.md` § Phase 25 — objectif et critères de succès n°1-4
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/modules/parametres/components/members-panel.tsx` — liste des membres avec badges de rôle (badge ambre « enfant » déjà rendu) ; point d'extension unique pour création/édition/suppression de profils gérés (D-02)
- `app/src/modules/parametres/api.ts` — RPC `set_member_role` déjà isolée côté serveur ; modèle à suivre pour les nouvelles opérations serveur enfant
- Member-picker / `member-avatar.tsx` (`app/src/components/shared/`) — sélecteurs de membres déjà centralisés ; les profils gérés y arrivent sans nouveau composant (ENF-05)
- Chaîne avatars/media `household-media` — pour la photo de fiche gérée par le parent (D-05)

### Established Patterns
- Écritures métier toujours via RPC serveur avec vérification d'acteur (jamais écriture directe client) — les opérations « au nom de » suivent ce motif avec `actor_member_id` vérifié côté SQL/Edge
- RLS : helper `can_write_household` (admin/membre), refus enfant prouvé par tests négatifs 0002/0009/0024/0048/0050 — l'audit exigé par ENF-04 prolonge ces suites
- Corrections vers l'avant uniquement : jamais de migration appliquée retouchée ; oracles d'erreur RPC inchangés (0113)
- Frontend : TanStack Query + adaptateurs `app/src/lib/data` (Supabase direct) ; modules structurés `components/`, `hooks/`, `api.ts`, `types.ts`

### Integration Points
- `household_members` (0002) — la table porte déjà le rôle `enfant` ; la conversion (D-15) et le champ de gestion s'y jouent
- Vue du jour, sélecteurs de tâches/routines/menu/anniversaires/messagerie/ardoise — points où l'enfant doit apparaître (ENF-05) et où le socle restreint (D-06) s'applique
- Cercle (`posts`, `post_comments`, `post_reactions`) — surface de modération D-12 ; plusieurs politiques existantes devront auditer la clause « adulte du même foyer »
- Chaîne notifications/rappels existante — branchement D-23

</code_context>

<specifics>
## Specific Ideas

- Verbatim structurant : « je ne veux pas que le parent puissent publier en tant que l'enfant dans le cercle, juste de la modération » (D-12) — la seule interaction Cercle/enfant admise est la modération des contenus attribués à un enfant.
- Verbatim : « suppression du compte, par contre comment l'enfant se connecte t'il a l'application ? » (D-16/D-17) — l'utilisateur a validé que l'enfant ne se connecte plus jamais ; l'accès futur passe par la liaison à l'invitation (D-19).
- Socle enfant v1 = tâches, routines, anniversaires, menu (D-06) — volontairement plus étroit que « tout le foyer ».
</specifics>

<deferred>
## Deferred Ideas

- **Argent de poche** — créditer un enfant via l'Ardoise (l'exclusion enfant/ardoise de 0113/0115 reste en v1). Idée notée pour le backlog roadmap, capacité à part entière.
- **Délégation adulte → adulte** (cocher pour le conjoint) — capacité transverse hors périmètre ENF, à rediscuter dans un jalon ultérieur si le besoin revient.

### Reviewed Todos (not folded)
*Aucun todo examiné — aucun en attente.*
</deferred>

---

*Phase: 25-Profils enfants gérés par le parent*
*Context gathered: 2026-10-25*
