# Phase 33 — Discussion Log

**Date :** 2026-11-04
**Mode :** default (interactive)
**Areas selected :** Persistance & namespacing, Allowlist & maxAge, Bandeau stale, Purge déconnexion (les 4)

## Areas

### Persistance & namespacing
| Q | Options presented | Selected |
|---|---|---|
| Mécanisme de persistance | persistQueryClient + createAsyncStoragePersister / persister par query (experimental) | persistQueryClient |
| Namespacing (OFFR-04) | clé (user_id, household_id) / clé user seul | user + foyer |
| Périmètre persisté | allowlist seulement / tout le cache | Allowlist seulement |
| Purge changement de foyer | purge systématique / rétention inter-foyers | Toujours purger |
| Support de stockage | IndexedDB / localStorage | IndexedDB |

### Allowlist & maxAge
| Q | Options presented | Selected |
|---|---|---|
| Emplacement allowlist | dans query-policy.ts / fichier dédié | Dans query-policy |
| Granularité maxAge | par famille / par table | Par famille |
| maxAge dépassé hors ligne | cache ignoré (état vide honnête) / rendu + avertissement | Cache ignoré |
| Familles annexes | incluses (household_members, profiles) / strictement Tier 1 | Oui, incluses |

### Bandeau stale
| Q | Options presented | Selected |
|---|---|---|
| Emplacement | slot bannières hauts (banner-store 32-02) / inline par vue | Slot global |
| Horodatage | MIN des dataUpdatedAt / MAX | Min (le plus prudent) |
| Visibilité | hors ligne seulement / toujours si stale | Hors ligne seulement |

### Purge déconnexion
| Q | Options presented | Selected |
|---|---|---|
| Ordonnancement | await dans signOut() avant navigation / fire-and-forget | Await dans signOut |
| Preuve OFFR-04 | fake-indexeddb automatisé / UAT manuel | fake-indexeddb |

## Deferred ideas
None — discussion stayed within phase scope.

## Agent's discretion (not discussed)
- Forme du contrôle statique OFFR-05 (denylist SW prouvée sur un cas qui doit échouer)
- Valeurs précises de maxAge par famille (ordre de grandeur : 24 h données vivantes, 7 j annexes)
- Choix du package IndexedDB (idb-keyval vs wrapper maison)
