import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { data } from '@/lib/data';
import { useResource } from '@/lib/data/useResource';
import { randomId } from '@/lib/utils';
import { useSessionUser } from '@/hooks/use-auth';
import type { NotificationReadRow, NotificationReadScope } from '@/types';

export const NOTIFICATION_READS_TABLE = 'notification_reads';

/** Carte `identifiant → instant ISO` de dernière lecture. */
export type ReadMap = Record<string, string>;

/** Dépendances du portage D-03, injectées pour rester prouvable hors navigateur. */
export interface LocalReadMigrationDeps {
  scope: NotificationReadScope;
  userId: string;
  storageKey: string;
  /** Lignes serveur connues au moment du portage : le max des deux gagne. */
  serverRows: Pick<NotificationReadRow, 'id' | 'user_id' | 'scope' | 'scope_id' | 'read_at'>[];
  create: (row: NotificationReadRow) => Promise<unknown>;
  update: (id: string, readAt: string) => Promise<unknown>;
  /** Effacement de la clé locale — appelé SEULEMENT après succès de chaque écriture. */
  removeLocal: (key: string) => void;
}

/**
 * Portage D-03 (one-way) : chaque entrée locale rejoint `notification_reads`
 * (création, ou mise à jour si la marque locale est PLUS récente — le serveur
 * garde le max, jamais une régression), puis la clé locale est retirée.
 * Une écriture qui échoue lève : l'appelant conserve alors la clé (repli hors
 * ligne = ne rien effacer) et reste silencieux pour l'utilisateur.
 * Rien à porter (clé absente ou vide) : aucune écriture, aucun effacement.
 */
export async function migrateLocalReads(deps: LocalReadMigrationDeps): Promise<boolean> {
  const local = readLocal(deps.storageKey);
  const entries = Object.entries(local);
  if (entries.length === 0) return false;
  for (const [scopeId, at] of entries) {
    const existing = deps.serverRows.find(
      (row) => row.scope === deps.scope && row.scope_id === scopeId && row.user_id === deps.userId,
    );
    if (!existing) {
      await deps.create({
        id: randomId('notification-read'),
        user_id: deps.userId,
        scope: deps.scope,
        scope_id: scopeId,
        read_at: at,
      });
    } else if (readTime(at) > readTime(existing.read_at)) {
      // Marque locale plus récente (typique d'une session hors ligne) : le
      // serveur monte au max. Plus ancienne : il garde la sienne.
      await deps.update(existing.id, at);
    }
  }
  deps.removeLocal(deps.storageKey);
  return true;
}

function readLocal(key: string): ReadMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    return (JSON.parse(localStorage.getItem(key) ?? '{}') ?? {}) as ReadMap;
  } catch {
    // Un cache local corrompu ne doit pas empêcher l'affichage.
    return {};
  }
}

/**
 * Clé de la marque locale, propre au **compte** : deux personnes qui se
 * partagent un navigateur ne se soldent plus mutuellement leurs lignes.
 * La clé antérieure (sans suffixe) n'est pas reprise : elle mélangeait les
 * comptes, ce qui en faisait précisément une source d'erreur.
 */
export function localReadKey(baseKey: string, userId: string | null): string {
  return `${baseKey}:${userId ?? 'anonyme'}`;
}

function writeLocal(key: string, map: ReadMap): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Stockage plein ou refusé : la lecture reste valable pour la session.
  }
}

/** Le plus récent des deux instants (chaîne vide = jamais lu). */
export function latestRead(first: string | undefined, second: string | undefined): string {
  if (!first) return second ?? '';
  if (!second) return first;
  return readTime(first) >= readTime(second) ? first : second;
}

/**
 * Instants comparés chronologiquement, jamais lexicographiquement : les
 * lignes portent des ISO avec fuseau (`+00:00`), sans fuseau (données de
 * démonstration en heure locale) ou en UTC (`Z`), et l'ordre des chaînes ne
 * vaut l'ordre du temps que dans un format unique. Une marque posée à 11h39
 * UTC restait sinon « antérieure » à un message de 10h42 locales.
 */
export function readTime(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

/** Vrai si `at` est strictement postérieur à la référence de lecture. */
export function isUnseen(at: string | undefined, readAt: string | undefined): boolean {
  if (!readAt) return true;
  return readTime(at) > readTime(readAt);
}

export interface SyncedReads {
  /** Lecture effective par objet : max(serveur, local). */
  readMap: ReadMap;
  /** Marque un objet comme lu, localement aussitôt et côté serveur au mieux. */
  markRead: (id: string) => void;
  isLoading: boolean;
}

/**
 * États de lecture synchronisés entre appareils pour une portée
 * (`conversation`, `post`).
 *
 * Le serveur est la source de vérité partagée ; le `localStorage` (clé
 * dédiée par portée **et par compte**, voir `localReadKey`) sert d'écriture
 * optimiste et de repli hors ligne : l'interface réagit aussitôt, même sans
 * réseau, et le maximum des deux gagne à la lecture. Un échec réseau n'est
 * jamais remonté à l'utilisateur : la marque sera reprise au prochain
 * marquage.
 */
export function useSyncedReads(scope: NotificationReadScope, localKey: string): SyncedReads {
  const queryClient = useQueryClient();
  const user = useSessionUser();
  const userId = user?.id ?? null;
  const storageKey = useMemo(() => localReadKey(localKey, userId), [localKey, userId]);
  const [localMap, setLocalMap] = useState<ReadMap>(() => readLocal(storageKey));

  // Changement de compte dans le même navigateur : on relit la marque du
  // nouveau compte. Sans cela, les lignes soldées par le précédent le
  // resteraient pour lui, et le nouveau ne verrait jamais les siennes.
  const storageKeyRef = useRef(storageKey);
  useEffect(() => {
    if (storageKeyRef.current === storageKey) return;
    storageKeyRef.current = storageKey;
    setLocalMap(readLocal(storageKey));
  }, [storageKey]);
  const resource = useResource<NotificationReadRow>(NOTIFICATION_READS_TABLE, {
    scoped: false,
    enabled: Boolean(userId),
  });

  const serverMap = useMemo(() => {
    const map: ReadMap = {};
    for (const row of resource.rows) {
      if (row.scope !== scope || row.user_id !== userId) continue;
      map[row.scope_id] = latestRead(map[row.scope_id], row.read_at);
    }
    return map;
  }, [resource.rows, scope, userId]);

  const readMap = useMemo(() => {
    const merged: ReadMap = { ...localMap };
    for (const [id, at] of Object.entries(serverMap)) {
      merged[id] = latestRead(merged[id], at);
    }
    return merged;
  }, [localMap, serverMap]);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [NOTIFICATION_READS_TABLE] }),
    [queryClient],
  );

  // Temps réel : un marquage sur un autre appareil rejoint celui-ci.
  useEffect(() => {
    if (!userId) return;
    const unsubscribe = data.subscribe(NOTIFICATION_READS_TABLE, refresh);
    return unsubscribe;
  }, [refresh, userId]);

  // `resource.rows` change d'identité quand la requête rend de nouvelles
  // données : le lire via une ref garde `markRead` stable, sinon l'effet qui
  // marque à l'ouverture reboucle. Quand la requête est désactivée, `rows` est
  // `NO_ROWS` (constante de module, `lib/data/useResource.ts:72`) — ce n'est
  // donc plus un `[]` frais à chaque rendu, comme on l'a écrit ici jusqu'au
  // 2026-10-17.
  const rowsRef = useRef(resource.rows);
  rowsRef.current = resource.rows;

  /**
   * Portage D-03 (one-way) : au premier chargement avec une clé locale non
   * vide, les horodatages rejoignent le serveur, puis la clé part — SEULEMENT
   * après succès. Un échec ne touche à rien et ne crie jamais : les badges
   * 1/0 existants restent la borne inférieure honnête. Une fois le portage
   * réussi, la clé n'est plus réécrite : le serveur devient la seule
   * référence persistée (la carte en mémoire continue de fusionner les deux).
   */
  const migratedKeysRef = useRef(new Set<string>());
  const inFlightKeysRef = useRef(new Set<string>());
  useEffect(() => {
    if (!userId || resource.isLoading) return;
    const key = storageKey;
    if (migratedKeysRef.current.has(key) || inFlightKeysRef.current.has(key)) return;
    const local = readLocal(key);
    if (Object.keys(local).length === 0) return;
    inFlightKeysRef.current.add(key);
    void (async () => {
      try {
        await migrateLocalReads({
          scope,
          userId,
          storageKey: key,
          serverRows: rowsRef.current,
          create: (row) => data.create<NotificationReadRow>(NOTIFICATION_READS_TABLE, row),
          update: (id, readAt) =>
            data.update<NotificationReadRow>(NOTIFICATION_READS_TABLE, id, { read_at: readAt }),
          removeLocal: (k) => localStorage.removeItem(k),
        });
        migratedKeysRef.current.add(key);
        void refresh();
      } catch {
        // Repli silencieux (UI-SPEC copie D-03) : clé conservée, un essai
        // ultérieur reprendra le portage. Jamais de message d'erreur visible
        // pour une migration technique.
        inFlightKeysRef.current.delete(key);
      }
    })();
  }, [refresh, resource.isLoading, scope, storageKey, userId]);

  const markRead = useCallback(
    (id: string) => {
      const at = new Date().toISOString();
      // Après le portage D-03, la clé locale ne revit plus : l'optimisme
      // reste en mémoire, la persistance appartient au serveur (one-way).
      const persistLocal = !migratedKeysRef.current.has(storageKey);
      setLocalMap((current) => {
        if (current[id] !== undefined && current[id] >= at) return current;
        const next = { ...current, [id]: at };
        if (persistLocal) writeLocal(storageKey, next);
        return next;
      });
      if (!userId) {
        void refresh();
        return;
      }
      void (async () => {
        try {
          const existing = rowsRef.current.find(
            (row) => row.scope === scope && row.scope_id === id && row.user_id === userId,
          );
          if (existing) {
            await data.update<NotificationReadRow>(NOTIFICATION_READS_TABLE, existing.id, { read_at: at });
          } else {
            await data.create<NotificationReadRow>(NOTIFICATION_READS_TABLE, {
              id: randomId('notification-read'),
              user_id: userId,
              scope,
              scope_id: id,
              read_at: at,
            });
          }
          await refresh();
        } catch {
          // Le miroir local fait déjà foi pour l'interface ; la
          // synchronisation sera reprise au prochain marquage.
        }
      })();
    },
    [refresh, scope, storageKey, userId],
  );

  return { readMap, markRead, isLoading: resource.isLoading };
}
