import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { FolderTabs } from './folder-tabs';

const generalSeed = {
  id: 'folder-general',
  name: 'Général',
  visibility: 'foyer',
  is_default: true,
  owner_member_id: 'm-alice',
} as const;
const customFolder = {
  id: 'folder-weekend',
  name: 'Week-end',
  visibility: 'foyer',
  is_default: false,
  owner_member_id: 'm-alice',
} as const;

function renderTabs() {
  return renderWithProviders(
    <FolderTabs
      folders={[generalSeed, customFolder]}
      activeId={null}
      onSelect={vi.fn()}
      onCreate={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      canManage
      label="Dossiers de notes"
    />,
  );
}

describe('FolderTabs', () => {
  it('n’affiche qu’un seul onglet Général malgré la ligne seedée', () => {
    renderTabs();
    expect(screen.getAllByRole('tab', { name: 'Général' })).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Week-end' })).toBeInTheDocument();
  });

  it('exclut le Général de « Gérer » (non modifiable côté serveur)', async () => {
    const user = userEvent.setup();
    renderTabs();
    await user.click(screen.getByRole('button', { name: 'Gérer les dossiers' }));
    const dialog = await screen.findByRole('dialog', { name: 'Gérer les dossiers' });
    expect(dialog).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Renommer Général' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer Général' })).not.toBeInTheDocument();
  });
});
