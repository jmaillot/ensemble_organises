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

function readLocal(key: string): ReadMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    return (JSON.parse(localStorage.getItem(key) ?? '{}') ?? {}) as ReadMap;
  } catch {
    // Un cache local corrompu ne doit pas empêcher l'affichage.
    return {};
  }
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
 * dédiée par portée) sert d'écriture optimiste et de repli hors ligne :
 * l'interface réagit aussitôt, même sans réseau, et le maximum des deux
 * gagne à la lecture. Un échec réseau n'est jamais remonté à l'utilisateur :
 * la marque sera reprise au prochain marquage.
 */
export function useSyncedReads(scope: NotificationReadScope, localKey: string): SyncedReads {
  const queryClient = useQueryClient();
  const user = useSessionUser();
  const userId = user?.id ?? null;
  const [localMap, setLocalMap] = useState<ReadMap>(() => readLocal(localKey));
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

  // `resource.rows` vaut un nouveau `[]` à chaque rendu tant que la requête
  // n'a rien ramené (`query.data ?? []`) : le lire via une ref garde
  // `markRead` stable, sinon l'effet qui marque à l'ouverture reboucle.
  const rowsRef = useRef(resource.rows);
  rowsRef.current = resource.rows;

  const markRead = useCallback(
    (id: string) => {
      const at = new Date().toISOString();
      setLocalMap((current) => {
        if (current[id] !== undefined && current[id] >= at) return current;
        const next = { ...current, [id]: at };
        writeLocal(localKey, next);
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
    [localKey, refresh, scope, userId],
  );

  return { readMap, markRead, isLoading: resource.isLoading };
}
