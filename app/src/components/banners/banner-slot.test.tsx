import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BannerSlot } from './banner-slot';
import { useBannerStore } from './banner-store';

describe('BannerSlot', () => {
  beforeEach(() => {
    useBannerStore.setState({ entries: [], sorted: [] });
  });

  it('ne rend rien quand le store est vide', () => {
    const { container } = render(<BannerSlot />);
    expect(container).toBeEmptyDOMElement();
  });

  it('rend les bandeaux actifs triés par priorité', () => {
    useBannerStore.getState().push({ kind: 'sw-update', priority: 1 });
    render(<BannerSlot />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('ignore un kind inconnu', () => {
    useBannerStore.getState().push({ kind: 'inconnu', priority: 1 });
    const { container } = render(<BannerSlot />);
    expect(container).toBeEmptyDOMElement();
  });
});
