import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  total: number;
  hasMarkable: boolean;
  onMarkAllRead: () => void;
  onOpenItem: (item: NotificationItem) => void;
}

/** Centre de notifications : non lus synchronisés puis restes à faire calculés. */
export function NotificationsDialog({
  open,
  onOpenChange,
  items,
  total,
  hasMarkable,
  onMarkAllRead,
  onOpenItem,
}: NotificationsDialogProps) {
  return (
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

        {hasMarkable ? (
          <div className="mb-3 flex justify-end">
            <Button variant="secondary" size="sm" icon="check" onClick={onMarkAllRead}>
              Tout marquer comme lu
            </Button>
          </div>
        ) : null}

        {items.length === 0 ? (
          <p className="m-0 rounded-[11px] bg-bg px-3 py-4 text-xs text-muted">
            Rien à signaler. Le foyer est à jour, profitez-en.
          </p>
        ) : (
          <ul className="m-0 grid max-h-[50vh] list-none gap-1.5 overflow-auto p-0" aria-label="Notifications du foyer">
            {items.map((item) => {
              const meta = KIND_META[item.kind];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onOpenItem(item)}
                    className="flex w-full items-center gap-3 rounded-[11px] bg-bg px-3 py-2.5 text-left transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint"
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
                      {item.markable ? <span aria-hidden="true" className="size-[7px] rounded-full bg-coral" /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
