import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationsDialog } from './notifications-dialog';
import type { NotificationItem } from '@/hooks/use-notifications';

const unreadMessage: NotificationItem = {
  id: 'message:conv-1',
  kind: 'message',
  ref: 'conv-1',
  title: 'Lina',
  detail: 'Tu as vu le nouveau parc ?',
  at: '2026-09-30T10:42:00',
  href: '/messages',
  markable: true,
  unread: true,
};

const reminder: NotificationItem = {
  id: 'tache:task-1',
  kind: 'tache',
  ref: 'task-1',
  title: 'Valider les rendez-vous',
  detail: 'Échéance aujourd’hui',
  at: '2026-09-30',
  href: '/taches',
  markable: false,
  unread: true,
};

const readMessage: NotificationItem = {
  id: 'message:conv-9',
  kind: 'message',
  ref: 'conv-9',
  title: 'Thomas',
  detail: 'Je peux prendre le pain.',
  at: '2026-09-29T09:18:00',
  href: '/messages',
  markable: false,
  unread: false,
};

const items = [unreadMessage, reminder];

function renderDialog(overrides: Partial<React.ComponentProps<typeof NotificationsDialog>> = {}) {
  const handlers = {
    onOpenChange: () => undefined,
    onMarkAllRead: vi.fn(),
    onOpenItem: vi.fn(),
    onDismissItem: vi.fn(),
    onClearAll: vi.fn(),
    ...overrides,
  };
  render(
    <NotificationsDialog
      open
      items={items}
      recentRead={[readMessage]}
      total={items.length}
      hasMarkable
      {...handlers}
    />,
  );
  return handlers;
}

describe('NotificationsDialog', () => {
  it('liste les éléments et ouvre la cible au clic', async () => {
    const user = userEvent.setup();
    const { onOpenItem, onMarkAllRead } = renderDialog();

    expect(screen.getByText('Lina')).toBeInTheDocument();
    expect(screen.getByText('Valider les rendez-vous')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /Lina/ })[0]);
    expect(onOpenItem).toHaveBeenCalledWith(unreadMessage);

    await user.click(screen.getByRole('button', { name: 'Tout marquer comme lu' }));
    expect(onMarkAllRead).toHaveBeenCalledOnce();
  });

  it('affiche un état vide soigné sans notification', () => {
    renderDialog({ items: [], recentRead: [], total: 0, hasMarkable: false });
    expect(screen.getByText('Rien à signaler. Le foyer est à jour, profitez-en.')).toBeInTheDocument();
  });

  it('ne propose pas de marquage global sans élément marquable', () => {
    renderDialog({ items: [reminder], recentRead: [], total: 1, hasMarkable: false });
    expect(screen.queryByRole('button', { name: 'Tout marquer comme lu' })).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Notifications du foyer' });
    expect(within(list).getAllByRole('button')).toHaveLength(2);
  });

  it('filtre Toutes / Non lues, lus récents exclus des Non lues', async () => {
    const user = userEvent.setup();
    renderDialog();

    // « Toutes » : non lus + lus récents.
    expect(screen.getByText('Thomas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Toutes \(3\)/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /Non lues \(2\)/ }));
    expect(screen.getByText('Lina')).toBeInTheDocument();
    expect(screen.getByText('Valider les rendez-vous')).toBeInTheDocument();
    expect(screen.queryByText('Thomas')).not.toBeInTheDocument();
  });

  it('affiche un état vide dédié quand tout est lu', async () => {
    const user = userEvent.setup();
    renderDialog({ items: [], recentRead: [readMessage], total: 0, hasMarkable: false });
    expect(screen.queryByRole('button', { name: 'Tout effacer' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Non lues \(0\)/ }));
    expect(screen.getByText('Tout est lu, rien ne demande votre attention.')).toBeInTheDocument();
    // L'onglet « Toutes » garde le lu récent.
    await user.click(screen.getByRole('button', { name: /Toutes \(1\)/ }));
    expect(screen.getByText('Thomas')).toBeInTheDocument();
  });

  it('retire un élément à la croix : lu pour le marquable, masqué pour le rappel', async () => {
    const user = userEvent.setup();
    const { onDismissItem } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Marquer comme lu : Lina' }));
    expect(onDismissItem).toHaveBeenCalledWith(unreadMessage);

    await user.click(screen.getByRole('button', { name: "Masquer jusqu'à demain : Valider les rendez-vous" }));
    expect(onDismissItem).toHaveBeenCalledWith(reminder);

    // Les lus récents n'ont pas de croix : un seul bouton (ouvrir), dans leur module ensuite.
    expect(screen.getAllByRole('button', { name: /Thomas/ })).toHaveLength(1);
  });

  it('efface tout après confirmation, sans rien supprimer', async () => {
    const user = userEvent.setup();
    const { onClearAll } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Tout effacer' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/Aucune donnée n'est supprimée/)).toBeInTheDocument();
    expect(onClearAll).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Tout effacer' }));
    expect(onClearAll).toHaveBeenCalledOnce();
  });
});
