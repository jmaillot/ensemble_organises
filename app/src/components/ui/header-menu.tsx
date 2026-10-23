import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/components/shared/icon';
import { Button } from './button';

export interface HeaderMenuItem {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * Menu « ⋯ » des en-têtes de module (critique UI 2026-10-23, P1) : melimelo
 * tient chacun de ses écrans à UN SEUL bouton plein ; les actions de deuxième
 * rang (scanner, catalogue, imprimer…) y basculent au lieu de s'empiler en
 * pilules concurrentes. Le déclencheur est une icône seule : le libellé est
 * donc obligatoire et porté par `aria-label`, comme la Fab.
 */
export function HeaderMenu({ items, label = 'Plus d’actions' }: { items: HeaderMenuItem[]; label?: string }) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <Button variant="secondary" size="icon" aria-label={label}>
          <Icon name="more" />
        </Button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="end"
          sideOffset={6}
          className="z-60 min-w-[210px] rounded-[14px] border border-border/70 bg-surface p-1.5 shadow-[var(--shadow-lg)]"
        >
          {items.map((item) => (
            <DropdownMenuPrimitive.Item
              key={item.label}
              disabled={item.disabled}
              onSelect={() => item.onSelect()}
              className={cn(
                'flex min-h-10 cursor-default items-center gap-2.5 rounded-[10px] px-3 text-[13.5px] outline-none select-none',
                'data-[highlighted]:bg-accent-faint data-[highlighted]:text-fg data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
              )}
            >
              {item.icon ? <Icon name={item.icon} size="sm" /> : null}
              {item.label}
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
