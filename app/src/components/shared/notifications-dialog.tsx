import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { CountBadge } from '@/components/shared/module-shell';
import { Icon } from '@/components/shared/icon';
import { cn } from '@/lib/utils';
import { formatListTime } from '@/modules/messages/types';
import { KIND_META, type NotificationItem } from '@/hooks/use-notifications';

export interface NotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NotificationItem[];
  /** Lus récents, sans pastille : visibles dans l'onglet « Toutes » uniquement. */
  recentRead: NotificationItem[];
  total: number;
  hasMarkable: boolean;
  onMarkAllRead: () => void;
  onOpenItem: (item: NotificationItem) => void;
  onDismissItem: (item: NotificationItem) => void;
  onClearAll: () => void;
}

type NotificationFilter = 'toutes' | 'non-lues';

/** Centre de notifications : non lus et restes à faire, puis lus récents. */
export function NotificationsDialog({
  open,
  onOpenChange,
  items,
  recentRead,
  total,
  hasMarkable,
  onMarkAllRead,
  onOpenItem,
  onDismissItem,
  onClearAll,
}: NotificationsDialogProps) {
  const [filter, setFilter] = useState<NotificationFilter>('toutes');
  const [confirmClear, setConfirmClear] = useState(false);

  // À chaque ouverture on repart sur « Toutes », sans confirmation en suspens.
  useEffect(() => {
    if (open) {
      setFilter('toutes');
      setConfirmClear(false);
    }
  }, [open ]);

  // « Non lues » = pastilles (messages/cercle non lus) + rappels à traiter.
  // Les lus récents n'y figurent jamais : ils sont déjà soldés.
  const visible = filter === 'toutes' ? [...items, ...recentRead] : items;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center justify-between gap-2.5">
              <DialogTitle>Notifications</DialogTitle>
              <CountBadge value={total} label="notifications" />
            </div>
            <DialogDescription>
              Messages et commentaires non lus, tâches et rendez-vous à ne pas manquer.
            </DialogDescription>
          </DialogHeader>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div
              role="group"
              aria-label="Filtrer les notifications"
              className="flex rounded-full border border-border bg-bg p-1"
            >
              <button
                type="button"
                aria-pressed={filter === 'toutes'}
                onClick={() => setFilter('toutes')}
                className={cn(
                  'rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors duration-[var(--duration-quick)]',
                  filter === 'toutes' ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
                )}
              >
                Toutes ({items.length + recentRead.length})
              </button>
              <button
                type="button"
                aria-pressed={filter === 'non-lues'}
                onClick={() => setFilter('non-lues')}
                className={cn(
                  'rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors duration-[var(--duration-quick)]',
                  filter === 'non-lues' ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
                )}
              >
                Non lues ({items.length})
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasMarkable ? (
                <Button variant="secondary" size="sm" icon="check" onClick={onMarkAllRead}>
                  Tout marquer comme lu
                </Button>
              ) : null}
              {items.length > 0 ? (
                <Button variant="secondary" size="sm" icon="trash" onClick={() => setConfirmClear(true)}>
                  Tout effacer
                </Button>
              ) : null}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="m-0 rounded-[11px] bg-bg px-3 py-4 text-xs text-muted">
              {filter === 'non-lues'
                ? 'Tout est lu, rien ne demande votre attention.'
                : 'Rien à signaler. Le foyer est à jour, profitez-en.'}
            </p>
          ) : (
            <ul className="m-0 grid max-h-[50vh] list-none gap-1.5 overflow-auto p-0" aria-label="Notifications du foyer">
              {visible.map((item) => (
                <NotificationRow key={item.id} item={item} onOpen={onOpenItem} onDismiss={onDismissItem} />
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Tout effacer ?"
        description="Les messages et commentaires passent en lus, les rappels restants sont masqués jusqu'à demain. Aucune donnée n'est supprimée."
        confirmLabel="Tout effacer"
        onConfirm={() => {
          onClearAll();
          setConfirmClear(false);
        }}
      />
    </>
  );
}

/** Ligne mixte : non lus et rappels à traiter (avec retrait), lus récents (sans retrait). */
function NotificationRow({
  item,
  onOpen,
  onDismiss,
}: {
  item: NotificationItem;
  onOpen: (item: NotificationItem) => void;
  onDismiss: (item: NotificationItem) => void;
}) {
  const meta = KIND_META[item.kind];
  return (
    <li className="flex items-center gap-1 rounded-[11px] bg-bg transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface text-muted">
          <Icon name={meta.icon} size="sm" />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-xs">
            {item.title}
            <span className="ml-1.5 font-semibold text-muted">{meta.label}</span>
          </strong>
          {item.detail ? (
            <small className="block truncate text-[11px] text-muted">{item.detail}</small>
          ) : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <small className={cn('text-[10px] text-muted')}>{formatListTime(item.at)}</small>
          {item.unread ? <span aria-hidden="true" className="size-[7px] rounded-full bg-coral" /> : null}
        </span>
      </button>
      {item.unread ? (
        <button
          type="button"
          onClick={() => onDismiss(item)}
          aria-label={
            item.markable ? `Marquer comme lu : ${item.title}` : `Masquer jusqu'à demain : ${item.title}`
          }
          className="mr-1 grid size-8 shrink-0 place-items-center rounded-[9px] text-muted transition-colors duration-[var(--duration-quick)] hover:bg-surface hover:text-fg"
        >
          <Icon name={item.markable ? 'check' : 'close'} size="sm" />
        </button>
      ) : null}
    </li>
  );
}
