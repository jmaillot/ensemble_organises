import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { FolderTabs, type FolderTabsProps } from './folder-tabs';

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

function renderTabs(overrides: Partial<FolderTabsProps> = {}) {
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
      {...overrides}
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

/**
 * `canDelete` est distinct de `canManage` : la politique `<dossier>_delete`
 * (0051:82-87) réserve la suppression à l'administrateur, alors que créer et
 * renommer son propre dossier est ouvert au membre.
 */
describe('FolderTabs — canDelete distinct de canManage', () => {
  const manageDialog = () => screen.findByRole('dialog', { name: 'Gérer les dossiers' });

  it('conserve exactement le rendu antérieur quand canDelete est omis', async () => {
    const user = userEvent.setup();
    renderTabs({ canManage: true });

    await user.click(screen.getByRole('button', { name: 'Gérer les dossiers' }));
    expect(await manageDialog()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renommer Week-end' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supprimer Week-end' })).toBeInTheDocument();
  });

  it('propose Renommer mais pas Supprimer pour un membre (canManage vrai, canDelete faux)', async () => {
    const user = userEvent.setup();
    renderTabs({ canManage: true, canDelete: false });

    // Un membre gère ses propres dossiers : création et renommage restent.
    expect(screen.getByRole('button', { name: 'Nouveau dossier' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Gérer les dossiers' }));
    expect(await manageDialog()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renommer Week-end' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer Week-end' })).not.toBeInTheDocument();
  });

  it('rétablit la corbeille quand canDelete est vrai', async () => {
    const user = userEvent.setup();
    renderTabs({ canManage: true, canDelete: true });

    await user.click(screen.getByRole('button', { name: 'Gérer les dossiers' }));
    expect(await manageDialog()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supprimer Week-end' })).toBeInTheDocument();
  });
});
