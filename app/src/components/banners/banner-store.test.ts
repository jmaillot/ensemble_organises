import { beforeEach, describe, expect, it } from 'vitest';
import { useBannerStore } from './banner-store';

describe('banner-store', () => {
  beforeEach(() => {
    useBannerStore.setState({ entries: [] });
  });

  it('pousse une entrée et la déduplique par kind (Pitfall 4)', () => {
    const { push } = useBannerStore.getState();
    push({ kind: 'sw-update', priority: 1 });
    push({ kind: 'sw-update', priority: 1 });
    expect(useBannerStore.getState().entries).toHaveLength(1);
  });

  it('dismiss retire l’entrée par kind', () => {
    const { push, dismiss } = useBannerStore.getState();
    push({ kind: 'sw-update', priority: 1 });
    dismiss('sw-update');
    expect(useBannerStore.getState().entries).toHaveLength(0);
  });

  it('deux kinds différents coexistent et le tri place la priorité 1 avant', () => {
    const { push } = useBannerStore.getState();
    push({ kind: 'install', priority: 5 });
    push({ kind: 'sw-update', priority: 1 });
    const sorted = useBannerStore.getState().sorted;
    expect(sorted[0].kind).toBe('sw-update');
    expect(sorted[1].kind).toBe('install');
  });
});
