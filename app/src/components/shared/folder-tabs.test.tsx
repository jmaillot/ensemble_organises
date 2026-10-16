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

/**
 * D-06 : un rejet de `onRename` ou `onDelete` se traite là où il naît. Les
 * appelants (`notes-page`, `taches-page`, `routines`) affichent le message en
 * toast PUIS relancent l'erreur ; le composant doit donc porter un `catch` qui
 * la constate. Sans lui, la promesse rejetée traverse le `finally` et reste
 * orpheline — c'est exactement ce que `unhandledRejection` observe ici, et
 * c'est le défaut que ce `describe` verrouille.
 */
describe('FolderTabs — un rejet de promesse est traité là où il naît (D-06)', () => {
  /**
   * Écoute les rejets non traités pendant le corps du test. Node les signale sur
   * la macrotâche suivante, donc un tour de boucle (`setTimeout 0`) suffit à les
   * voir. Le `finally` retire l'écouteur pour ne pas fuir d'un test à l'autre.
   */
  async function withRejectionSpy(run: () => Promise<void>): Promise<unknown[]> {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', listener);
    try {
      await run();
      await new Promise((resolve) => setTimeout(resolve, 0));
      return unhandled;
    } finally {
      process.off('unhandledRejection', listener);
    }
  }

  it('renommage refusé : aucun rejet non traité, l’édition reste ouverte', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockRejectedValue(new Error('Renommage refusé.'));
    renderTabs({ onRename });

    const unhandled = await withRejectionSpy(async () => {
      await user.click(screen.getByRole('button', { name: 'Gérer les dossiers' }));
      await user.click(screen.getByRole('button', { name: 'Renommer Week-end' }));
      const field = screen.getByRole('textbox', { name: 'Renommer Week-end' });
      await user.clear(field);
      await user.type(field, 'Week-ends');
      await user.click(screen.getByRole('button', { name: 'OK' }));
    });

    expect(unhandled).toHaveLength(0);
    expect(onRename).toHaveBeenCalledWith('folder-weekend', 'Week-ends');
    // L'édition n'est pas refermée sur un échec : le champ est toujours rendu.
    expect(screen.getByRole('textbox', { name: 'Renommer Week-end' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OK' })).toBeEnabled();
  });

  it('suppression refusée : aucun rejet non traité, le dialogue de gestion reste ouvert', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockRejectedValue(new Error('Suppression refusée.'));
    renderTabs({ onDelete });

    const unhandled = await withRejectionSpy(async () => {
      await user.click(screen.getByRole('button', { name: 'Gérer les dossiers' }));
      await user.click(screen.getByRole('button', { name: 'Supprimer Week-end' }));
      await user.click(await screen.findByRole('button', { name: 'Supprimer le dossier' }));
    });

    expect(unhandled).toHaveLength(0);
    expect(onDelete).toHaveBeenCalledOnce();
    // Un échec ne donne pas l'impression que le dossier a été supprimé : le
    // dialogue de gestion reste ouvert (la fermeture n'est que dans le `then`).
    expect(screen.getByRole('dialog', { name: 'Gérer les dossiers' })).toBeInTheDocument();
  });
});
