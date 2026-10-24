import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/shared/icon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/primitives';
import { itemStateLabel, quantityLabel, type ShoppingItem } from '../types';

export interface ShoppingItemRowProps {
  item: ShoppingItem;
  /** Lecture seule (rôle `enfant`) : ni poignée, ni case, ni actions. */
  readOnly?: boolean;
  onToggle: (item: ShoppingItem) => void;
  onEdit: (item: ShoppingItem) => void;
  onDelete: (item: ShoppingItem) => void;
}

/**
 * Un article d'une liste de courses.
 *
 * La POIGNÉE est un vrai bouton utilisable au clavier : Espace saisit
 * l'article, les flèches le déplacent, Espace le dépose, Échap annule. Elle
 * n'apparaît qu'aux membres qui peuvent écrire — un enfant lit la liste, il
 * ne la réordonne pas.
 */
export function ShoppingItemRow({ item, readOnly = false, onToggle, onEdit, onDelete }: ShoppingItemRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: readOnly,
  });

  return (
    <li
      ref={setNodeRef}
      className={cn(
        'group flex min-h-[56px] items-center gap-2.5 rounded-[14px] px-2 transition-colors hover:bg-accent-faint',
        item.checked && 'done',
        isDragging && 'opacity-50',
      )}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {!readOnly ? (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Réordonner : ${item.name}`}
          title="Glisser pour réordonner"
          className="relative grid size-6 shrink-0 cursor-grab place-items-center rounded-[8px] text-muted transition-colors duration-[var(--duration-quick)] hover:text-fg active:cursor-grabbing after:absolute after:-inset-2 after:content-['']"
        >
          <Icon name="drag" size="sm" />
        </button>
      ) : null}
      <Checkbox
        checked={item.checked}
        disabled={readOnly}
        onCheckedChange={() => onToggle(item)}
        aria-label={`${item.checked ? 'Rouvrir' : 'Terminer'} ${item.name}`}
        className="size-6 rounded-[7px]"
      />
      <span className={cn('min-w-0 flex-1 text-[14px] font-medium', item.checked && 'text-muted line-through')}>
        {item.name}
      </span>
      <small className="truncate text-[11px] text-muted max-[650px]:max-w-[96px]">
        {quantityLabel(item) ? `${quantityLabel(item)} · ${item.rayon}` : item.rayon}
      </small>
      {/* 11px : état fonctionnel de l'article, pas un micro-label décoratif
          (audit du 24/10/2026 — le 10px reste réservé au section-kicker). */}
      <span
        className={cn(
          'text-[11px] font-semibold whitespace-nowrap max-[650px]:hidden',
          item.checked ? 'text-accent-strong' : 'text-muted',
        )}
      >
        {itemStateLabel(item.checked)}
      </span>
      {readOnly ? null : (
        <span className="flex items-center gap-1 opacity-0 transition-opacity duration-[var(--duration-quick)] group-hover:opacity-100 group-focus-within:opacity-100 max-[650px]:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            icon="edit"
            className="size-8 min-h-8 hover:bg-accent-faint hover:text-fg"
            aria-label={`Modifier ${item.name}`}
            onClick={() => onEdit(item)}
          />
          <Button
            variant="ghost"
            size="icon"
            icon="trash"
            className="size-8 min-h-8 hover:bg-coral-soft hover:text-coral-text"
            aria-label={`Supprimer ${item.name}`}
            onClick={() => onDelete(item)}
          />
        </span>
      )}
    </li>
  );
}
