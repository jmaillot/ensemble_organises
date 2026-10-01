import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationsDialog } from './notifications-dialog';
import type { NotificationItem } from '@/hooks/use-notifications';

const items: NotificationItem[] = [
  {
    id: 'message:conv-1',
    kind: 'message',
    ref: 'conv-1',
    title: 'Lina',
    detail: 'Tu as vu le nouveau parc ?',
    at: '2026-09-30T10:42:00',
    href: '/messages',
    markable: true,
  },
  {
    id: 'tache:task-1',
    kind: 'tache',
    ref: 'task-1',
    title: 'Valider les rendez-vous',
    detail: 'Échéance aujourd’hui',
    at: '2026-09-30',
    href: '/taches',
    markable: false,
  },
];

describe('NotificationsDialog', () => {
  it('liste les éléments et ouvre la cible au clic', async () => {
    const user = userEvent.setup();
    const onOpenItem = vi.fn();
    const onMarkAllRead = vi.fn();
    render(
      <NotificationsDialog
        open
        onOpenChange={() => undefined}
        items={items}
        total={2}
        hasMarkable
        onMarkAllRead={onMarkAllRead}
        onOpenItem={onOpenItem}
      />,
    );

    expect(screen.getByText('Lina')).toBeInTheDocument();
    expect(screen.getByText('Valider les rendez-vous')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Lina/ }));
    expect(onOpenItem).toHaveBeenCalledWith(items[0]);

    await user.click(screen.getByRole('button', { name: 'Tout marquer comme lu' }));
    expect(onMarkAllRead).toHaveBeenCalledOnce();
  });

  it('affiche un état vide soigné sans notification', () => {
    render(
      <NotificationsDialog
        open
        onOpenChange={() => undefined}
        items={[]}
        total={0}
        hasMarkable={false}
        onMarkAllRead={() => undefined}
        onOpenItem={() => undefined}
      />,
    );
    expect(screen.getByText('Rien à signaler. Le foyer est à jour, profitez-en.')).toBeInTheDocument();
  });

  it('ne propose pas de marquage global sans élément marquable', () => {
    render(
      <NotificationsDialog
        open
        onOpenChange={() => undefined}
        items={[items[1]]}
        total={1}
        hasMarkable={false}
        onMarkAllRead={() => undefined}
        onOpenItem={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Tout marquer comme lu' })).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Notifications du foyer' });
    expect(within(list).getAllByRole('button')).toHaveLength(1);
  });
});
