import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { fetchServerSettlement } from '../api';

export const ardoiseKeys = {
  all: ['ardoise'] as const,
  snapshot: (householdId: string | null) => ['ardoise', householdId] as const,
};

/**
 * Soldes de référence calculés en base (`expense-settlement`).
 *
 * Requête partagée par la page Ardoise et le résumé de l'accueil : même clé,
 * donc un seul appel réseau. Désactivée en mode local — les consommateurs
 * basculent alors sur le calcul local de `types.ts` (démo, hors ligne).
 * `retry: 1` seulement : au-delà, c'est le repli local qui prend le relais,
 * jamais un écran d'erreur pour des soldes.
 */
export function useServerSettlement(householdId: string | null) {
  return useQuery({
    queryKey: [...ardoiseKeys.all, 'settlement', householdId ?? ''] as const,
    enabled: Boolean(householdId) && isSupabaseConfigured,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: () => fetchServerSettlement(householdId as string),
  });
}
