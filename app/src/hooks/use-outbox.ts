import { useQuery } from '@tanstack/react-query';
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
  const query = useQuery({
    queryKey: [...OUTBOX_KEY, userId, householdId],
    enabled: Boolean(userId && householdId),
    queryFn: () => [] as OutboxEntry[], // cf. commentaire ci-dessus : état client, jamais fetché
  });
  const entries = query.data ?? [];
  const pendingCount = entries.filter((entry) => entry.status === 'pending').length;
  const failedCount = entries.filter((entry) => entry.status === 'failed').length;
  return { entries, pendingCount, failedCount };
}
