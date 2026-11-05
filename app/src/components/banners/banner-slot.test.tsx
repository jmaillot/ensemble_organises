import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { buildQueryClient } from '@/lib/query-policy';
import { BannerSlot } from './banner-slot';
import { useBannerStore } from './banner-store';

// Depuis la 34 (D-03), la gate des bandeaux lit la file outbox via useOutbox
// (une query TanStack) : chaque rendu du slot a donc besoin du provider —
// même quand aucun bandeau outbox n'est poussé, UpdateBanner passe par la gate.
function renderSlot() {
  const client = buildQueryClient({ queries: { retry: false } });
  return render(
    <QueryClientProvider client={client}>
      <BannerSlot />
    </QueryClientProvider>,
  );
}

describe('BannerSlot', () => {
  beforeEach(() => {
    useBannerStore.setState({ entries: [], sorted: [] });
  });

  it('ne rend rien quand le store est vide', () => {
    const { container } = renderSlot();
    expect(container).toBeEmptyDOMElement();
  });

  it('rend les bandeaux actifs triés par priorité', () => {
    useBannerStore.getState().push({ kind: 'sw-update', priority: 1 });
    renderSlot();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('ignore un kind inconnu', () => {
    useBannerStore.getState().push({ kind: 'inconnu', priority: 1 });
    const { container } = renderSlot();
    expect(container).toBeEmptyDOMElement();
  });
});
