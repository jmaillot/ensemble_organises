import { useQuery, useQueryClient } from '@tanstack/react-query';
import { OUTBOX_KEY, type OutboxEntry } from '@/lib/offline/outbox';
import { useSessionStore } from '@/stores/session-store';
import { useHouseholdStore } from '@/stores/household-store';

/**
 * Source unique de lecture de la file d'écriture hors-ligne (phase 34, D-03,
 * WRQ-05). La gate 32-D10, le badge « N en attente » et le panneau offline de
 * Paramètres dérivent TOUS de ce hook — aucun comptage n'est stocké à part.
 *
 * POURQUOI LA QUERYFN RETOURNE []. La file n'est JAMAIS fetchée : c'est un
 * état client persisté (D-01), écrit exclusivement par `setQueryData` —
 * enfilage par le MutationCache (plan 02), retrait au rejeu (plan 03),
 * Réessayer/Abandonner du panneau (plan 04). Une queryFn qui frapperait le
 * serveur inventerait une ressource qui n'existe pas ; le `[]` n'est pas un
 * stub, c'est la valeur initiale d'un état que d'autres canaux peuplent.
 *
 * POURQUOI LA QUERY EST RENDUE STRUCTURELLEMENT INREFETCHABLE (CR-01).
 * La queryFn historique rendait `[]` : tout refetch écraserait la file par
 * un tableau vide et détruirait les écritures pendantes — LE SEUL état que
 * la phase 34 garantit. Les déclencheurs sont ordinaires : refetchOnReconnect
 * (au moment même où le rejeu devrait partir), invalidateQueries() sans
 * filtre (bouton « Vider le cache local » du panneau), montage d'une query
 * restaurée périmée après reload. Deux ceintures structurelles : la query ne
 * peut plus devenir périmée ni partir au reconnect/focus (staleTime Infinity,
 * refetch* false), et la queryFn rend l'état ACTUEL de la file — même un
 * refetch forcé par une invalidation globale ne peut plus rien détruire.
 *
 * Le comptage est DÉRIVÉ de la liste (filter), jamais stocké (D-03) : tout
 * état parallèle divergerait de la file au premier setQueryData d'un autre
 * chemin — l'anti-pattern documenté au 34-RESEARCH.
 *
 * Le hook est INACTIF sans couple (utilisateur, foyer) établi (`enabled`) :
 * aucune query outbox n'existe hors session, le comptage rend 0.
 */
export function useOutbox(): { entries: OutboxEntry[]; pendingCount: number; failedCount: number } {
  const userId = useSessionStore((state) => state.user?.id ?? null);
  const householdId = useHouseholdStore((state) => state.householdId);
  const queryKey = [...OUTBOX_KEY, userId, householdId] as const;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey,
    enabled: Boolean(userId && householdId),
    // CR-01, ceinture 2 : même si un refetch part malgré tout (une
    // `invalidateQueries()` sans filtre refetch les queries ACTIVES même
    // fraîches — ceinture 1 ci-dessous ne l'empêche pas), la queryFn rend
    // l'état ACTUEL de la file, jamais `[]` : le refetch ne peut rien
    // détruire. Le `[]` ne sert que la toute première montée sans données.
    queryFn: () => queryClient.getQueryData<OutboxEntry[]>(queryKey) ?? [],
    // CR-01, ceinture 1 : la file ne doit JAMAIS devenir périmée ni partir
    // au refetch (reconnect, focus, retry) — structurel, pas disciplinaire.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const entries = query.data ?? [];
  const pendingCount = entries.filter((entry) => entry.status === 'pending').length;
  const failedCount = entries.filter((entry) => entry.status === 'failed').length;
  return { entries, pendingCount, failedCount };
}
