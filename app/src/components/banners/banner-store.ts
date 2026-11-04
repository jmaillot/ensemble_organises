import { create } from 'zustand';

/**
 * Bandeau haut empilable (D-04). La déduplication par `kind` est obligatoire
 * (Pitfall 4 du 32-RESEARCH.md) : `onNeedRefresh` peut être déclenché
 * plusieurs fois, et le bandeau `sw-update` ne doit jamais apparaître en
 * double dans le slot.
 */
export interface BannerEntry {
  kind: string;
  /** Priorité croissante : 1 = rendu au-dessus des autres. */
  priority: number;
  payload?: unknown;
}

interface BannerState {
  entries: BannerEntry[];
  push: (entry: BannerEntry) => void;
  dismiss: (kind: string) => void;
  /** Entrées triées par priorité croissante (référence stable entre rendus). */
  sorted: BannerEntry[];
}

export const useBannerStore = create<BannerState>()((set) => ({
  entries: [],
  sorted: [],
  push: (entry) =>
    set((state) => ({
      // Un kind déjà présent est remplacé, jamais dupliqué. Le tableau trié
      // est recalculé ICI, à l'écriture — pas à la lecture : un sélecteur
      // qui trierait à chaque appel créerait une référence neuve et
      // re-rendrait le slot en boucle.
      entries: [...state.entries.filter((e) => e.kind !== entry.kind), entry],
      sorted: [...state.entries.filter((e) => e.kind !== entry.kind), entry].sort(
        (a, b) => a.priority - b.priority,
      ),
    })),
  dismiss: (kind) =>
    set((state) => {
      const entries = state.entries.filter((e) => e.kind !== kind);
      return { entries, sorted: [...entries].sort((a, b) => a.priority - b.priority) };
    }),
}));
