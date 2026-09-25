import { useState } from 'react';
import { cn } from '@/lib/utils';
import { CountBadge } from '@/components/shared/module-shell';
import { Icon } from '@/components/shared/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/primitives';
import {
  itemStateLabel,
  quantityLabel,
  sectionsForList,
  type Grouping,
  type ItemSuggestion,
  type ShoppingItem,
  type ShoppingListView,
} from '../types';

/** Sur-titre de rayon : même traitement que `.section-kicker` de l'export. */
const kickerClass = 'mb-1 mt-3 text-[10px] font-extrabold tracking-[0.14em] text-muted uppercase';

export interface ShoppingGroupCardProps {
  list: ShoppingListView;
  grouping: Grouping;
  suggestions: ItemSuggestion[];
  disabled?: boolean;
  onToggle: (item: ShoppingItem) => void;
  onQuickAdd: (listId: string, name: string) => void;
  onDelete: (item: ShoppingItem) => void;
  onDeleteList: (list: ShoppingListView) => void;
}

/**
 * Un groupe de l'export (`shopping-group`) : en-tête avec compteur
 * « cochés/total », ajout rapide validé sur Entrée, puis les articles en lignes
 * de 44 px minimum avec une case à cocher large.
 */
export function ShoppingGroupCard({
  list,
  grouping,
  suggestions,
  disabled = false,
  onToggle,
  onQuickAdd,
  onDelete,
  onDeleteList,
}: ShoppingGroupCardProps) {
  const [draft, setDraft] = useState('');
  const sections = sectionsForList(list.items, grouping);
  const inputId = `quick-add-${list.id}`;

  const submitDraft = () => {
    const name = draft.trim();
    if (!name) return;
    onQuickAdd(list.id, name);
    setDraft('');
  };

  return (
    <section className="grid grid-cols-1 gap-2" aria-labelledby={`list-title-${list.id}`}>
      <div className="flex items-center justify-between gap-3">
        {/* Le compteur reste hors du titre : l'étiquette du groupe doit rester
            égale au nom de la liste pour les lecteurs d'écran. */}
        <h3 id={`list-title-${list.id}`} className="m-0 flex items-center gap-2 font-display text-[15px]">
          {list.name}
        </h3>
        <div className="flex items-center gap-1.5">
          <CountBadge
            value={`${list.checkedCount}/${list.items.length}`}
            label={`articles dans la liste ${list.name}`}
          />
        <Button
          variant="ghost"
          size="icon"
          icon="trash"
          className="size-8 min-h-8 text-muted hover:bg-coral-soft hover:text-coral"
          aria-label={`Supprimer la liste ${list.name}`}
          onClick={() => onDeleteList(list)}
        />
        </div>
      </div>

      {/* Ajout rapide : validation sur la touche Entrée. */}
      <div>
        <label htmlFor={inputId} className="sr-only">
          {`Ajouter un article à la liste ${list.name}`}
        </label>
        <div className="flex gap-2">
          <Input
            id={inputId}
            value={draft}
            disabled={disabled}
            placeholder="Ajouter un article puis Entrée"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitDraft();
              }
            }}
          />
          <Button
            icon="plus"
            disabled={disabled || !draft.trim()}
            onClick={submitDraft}
            aria-label={`Ajouter l’article à la liste ${list.name}`}
          >
            Ajouter
          </Button>
        </div>

        {suggestions.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-extrabold tracking-[0.08em] text-muted uppercase">Habitudes</span>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.name}
                type="button"
                disabled={disabled}
                onClick={() => onQuickAdd(list.id, suggestion.name)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 text-[11px] text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint hover:text-accent-strong disabled:opacity-55"
              >
                <Icon name="plus" size="sm" />
                {suggestion.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {list.items.length === 0 ? (
        <p className="m-0 py-3 text-xs text-muted">Cette liste est vide : ajoutez le premier article.</p>
      ) : (
        sections.map((section, sectionIndex) => (
          <div key={section.key}>
            {section.title ? <p className={cn(kickerClass, sectionIndex === 0 && 'mt-0')}>{section.title}</p> : null}
            <ul className="m-0 grid list-none gap-0 p-0">
              {section.items.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    'group flex min-h-11 items-center gap-2.5 border-t border-border first:border-t-0',
                    item.checked && 'done',
                  )}
                >
                  <Checkbox
                    checked={item.checked}
                    disabled={disabled}
                    onCheckedChange={() => onToggle(item)}
                    aria-label={`${item.checked ? 'Rouvrir' : 'Terminer'} ${item.name}`}
                    className="size-6"
                  />
                  <span className={cn('min-w-0 flex-1 text-[13px]', item.checked && 'text-muted line-through')}>
                    {item.name}
                  </span>
                  <small className="text-[10px] text-muted">
                    {quantityLabel(item) ? `${quantityLabel(item)} · ${item.rayon}` : item.rayon}
                  </small>
                  <span
                    className={cn(
                      'text-[10px] font-semibold whitespace-nowrap',
                      item.checked ? 'text-accent-strong' : 'text-muted',
                    )}
                  >
                    {itemStateLabel(item.checked)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      icon="trash"
                      className="size-8 min-h-8 hover:bg-coral-soft hover:text-coral"
                      aria-label={`Supprimer ${item.name}`}
                      onClick={() => onDelete(item)}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <p className="mt-1 mb-0 flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
        <span>
          <strong className="text-fg">{list.checkedCount}</strong> dans le panier
        </span>
        <span>
          {list.items.length > 0 && list.pendingCount === 0 ? 'Liste complète' : `${list.pendingCount} à acheter`}
        </span>
      </p>
    </section>
  );
}
