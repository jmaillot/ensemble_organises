import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/shared/icon';
import { catalogueModules, moduleMap, modulePath, type ModuleEntry } from '@/lib/modules';
import { searchModules, searchRecords, type SearchRecord } from '@/lib/global-search';
import { useGlobalSearch } from '@/hooks/use-global-search';
import { useCurrentMember } from '@/stores/household-store';
import { cn } from '@/lib/utils';

/**
 * Palette de commandes (Ctrl/Cmd + K).
 *
 * Elle répond au problème que posent dix-sept espaces : retrouver « Fidélité »
 * sans traverser un menu. Les **espaces** sont filtrés sur place ; les
 * **entrées du foyer** (tâches, notes, contacts…) demandent deux signes avant
 * d'être lues, pour ne pas charger onze tables à chaque frappe.
 *
 * Le choix d'un résultat ouvre **l'espace**, pas la fiche : les modules n'ont
 * pas de route profonde, et un lien qui prétendrait le contraire mentirait.
 * La ligne dit donc où aller (« Tâche · À faire · 24/10 »), et la navigation
 * est le contrat.
 */

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PaletteItem =
  | { kind: 'space'; entry: ModuleEntry }
  | { kind: 'record'; record: SearchRecord };

const itemId = (index: number) => `global-search-option-${index}`;

/** Deux signes : en dessous, la lecture de onze tables coûterait plus qu'elle ne rend. */
const RECORD_QUERY_MIN_LENGTH = 2;

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const isChild = useCurrentMember()?.role === 'enfant';
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const trimmed = query.trim();
  const spaces = useMemo(() => searchModules(catalogueModules, trimmed, { isChild }), [trimmed, isChild]);
  const recordsEnabled = open && trimmed.length >= RECORD_QUERY_MIN_LENGTH;
  const { records, failedModules, isLoading, isError, refetch } = useGlobalSearch(recordsEnabled);
  const { results, matched } = useMemo(() => searchRecords(records, trimmed), [records, trimmed]);

  const items = useMemo<PaletteItem[]>(
    () => [
      ...spaces.map((entry): PaletteItem => ({ kind: 'space', entry })),
      ...results.map((record): PaletteItem => ({ kind: 'record', record })),
    ],
    [spaces, results],
  );

  // Une nouvelle saisie remet le curseur sur le premier résultat. Sans cela,
  // taper après avoir descendu la liste laisserait la sélection sur une ligne
  // qui n'existe plus.
  useEffect(() => {
    setActiveIndex(0);
  }, [trimmed]);

  // Ouverture : la palette repart d'une page blanche, sinon la saisie
  // précédente réapparaît dans un contexte qui n'est plus le sien.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
  }, [open]);

  // Le résultat actif reste visible quand on parcourt au clavier.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`#${itemId(activeIndex)}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  // Les entrées du foyer arrivent APRÈS la frappe : la liste s'allonge pendant
  // que l'index actif est choisi. Un index qui dépasse la liste ferait
  // sélectionner une ligne qui n'existe plus — et Entrée n'ouvrirait plus rien.
  useEffect(() => {
    if (items.length === 0) {
      if (activeIndex !== 0) setActiveIndex(0);
      return;
    }
    if (activeIndex > items.length - 1) setActiveIndex(items.length - 1);
  }, [items.length, activeIndex]);

  const activeItem = items[activeIndex];

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    onOpenChange(false);
    navigate(modulePath(item.kind === 'space' ? item.entry.key : item.record.module));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (items.length > 0) setActiveIndex((index) => (index + 1) % items.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length > 0) setActiveIndex((index) => (index - 1 + items.length) % items.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      choose(activeItem);
    }
  };

  let index = -1;
  const nextIndex = () => {
    index += 1;
    return index;
  };

  const showSpacesHeader = spaces.length > 0;
  const showRecordsHeader = results.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[9vh] max-h-[min(74dvh,640px)] w-[calc(100vw-32px)] max-w-[620px] translate-y-0 overflow-hidden p-0 max-[650px]:top-[8vh] max-[650px]:bottom-auto max-[650px]:max-h-[80dvh]"
        hideClose
      >
        <DialogTitle className="sr-only">Rechercher dans l’application</DialogTitle>
        <DialogDescription className="sr-only">
          Tapez le nom d’un espace, d’une tâche, d’une note ou d’un contact. Entrée ouvre le premier résultat.
        </DialogDescription>

        <div className="flex items-center gap-3 border-b border-border px-4">
          <Icon name="search" size="sm" className="shrink-0 text-muted" />
          <input
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeItem ? itemId(activeIndex) : undefined}
            aria-label="Rechercher un espace ou une entrée du foyer"
            placeholder="Rechercher un espace, une tâche, une note…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-muted"
          />
          <kbd className="hidden shrink-0 rounded-[6px] border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-[650] text-muted min-[400px]:block">
            esc
          </kbd>
        </div>

        <div className="max-h-[min(54dvh,480px)] overflow-y-auto px-2 py-2">
          {isError ? (
            <div className="px-3 py-6 text-center">
              <p className="m-0 text-sm text-fg">La recherche n’a pas pu lire le foyer.</p>
              <p className="mt-1 mb-0 text-xs text-muted">Les espaces restent accessibles ci-dessus.</p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-3 min-h-11 rounded-full border border-border bg-surface px-4 text-xs font-[650] text-fg transition-colors hover:border-accent hover:bg-accent-faint"
              >
                Réessayer
              </button>
            </div>
          ) : null}

          {!isError && items.length === 0 && !isLoading ? (
            <p className="m-0 px-3 py-8 text-center text-sm text-muted">
              Aucun résultat pour « {trimmed} ».
            </p>
          ) : null}

          {isLoading && trimmed.length >= RECORD_QUERY_MIN_LENGTH ? (
            <p className="m-0 px-3 pt-2 pb-1 text-[11px] text-muted" role="status">
              Recherche dans le foyer…
            </p>
          ) : null}

          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Résultats de recherche"
            className="m-0 list-none p-0"
          >
            {showSpacesHeader ? (
              <li role="presentation" className="px-3 pt-2 pb-1 text-[10px] font-[760] tracking-[0.14em] text-muted uppercase">
                Espaces
              </li>
            ) : null}
            {spaces.map((entry) => {
              const optionIndex = nextIndex();
              const active = optionIndex === activeIndex;
              return (
                <li
                  key={`space:${entry.key}`}
                  id={itemId(optionIndex)}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIndex(optionIndex)}
                  onClick={() => choose({ kind: 'space', entry })}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2 text-[13.5px] transition-colors',
                    active ? 'bg-accent-faint text-fg' : 'text-fg',
                  )}
                >
                  <Icon name={entry.icon} size="sm" className="shrink-0 text-muted" />
                  <span className="truncate font-[650]">{entry.navLabel ?? entry.label}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted">{entry.detail}</span>
                </li>
              );
            })}

            {showRecordsHeader ? (
              <li role="presentation" className="px-3 pt-3 pb-1 text-[10px] font-[760] tracking-[0.14em] text-muted uppercase">
                Dans le foyer
              </li>
            ) : null}
            {results.map((record) => {
              const optionIndex = nextIndex();
              const active = optionIndex === activeIndex;
              return (
                <li
                  key={`record:${record.id}`}
                  id={itemId(optionIndex)}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIndex(optionIndex)}
                  onClick={() => choose({ kind: 'record', record })}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2 text-[13.5px] transition-colors',
                    active ? 'bg-accent-faint text-fg' : 'text-fg',
                  )}
                >
                  <Icon name={moduleMap[record.module].icon} size="sm" className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-[650]">{record.label}</span>
                    <span className="block truncate text-[11px] text-muted">{record.hint}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{moduleMap[record.module].label}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2 text-[10.5px] text-muted">
          <span>
            <kbd className="font-[650]">↑↓</kbd> naviguer
          </span>
          <span>
            <kbd className="font-[650]">↵</kbd> ouvrir l’espace
          </span>
          <span className="ml-auto">
            {trimmed.length >= RECORD_QUERY_MIN_LENGTH && results.length > 0
              ? `${results.length} sur ${matched} résultat${matched > 1 ? 's' : ''}`
              : `${spaces.length} espace${spaces.length > 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Une lecture partielle est dite : masquer un espace en échec ferait
            croire qu'il ne contient rien. */}
        {failedModules.length > 0 ? (
          <p className="m-0 border-t border-border px-4 py-2 text-[10.5px] text-coral" role="status">
            Non lus : {failedModules.map((key) => moduleMap[key].label).join(', ')}.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
