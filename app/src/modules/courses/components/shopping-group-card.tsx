import { useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { CountBadge } from '@/components/shared/module-shell';
import { Icon } from '@/components/shared/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  guessRayon,
  matchCatalogue,
  normalizeSearchText,
  sectionsForList,
  RAYONS,
  type Grouping,
  type ItemSuggestion,
  type ShoppingItem,
  type ShoppingListView,
} from '../types';
import { ShoppingItemRow } from './shopping-item-row';
import { productPhotoUrl } from '../products-api';
import type { ProductRow } from '@/types';

/**
 * Chaque rayon porte son aplat et son pictogramme, comme les en-têtes de rayon
 * de Melimelo : la couleur n'est jamais seule, le texte reste lisible.
 */
function rayonVisual(title: string): { emoji: string; tone: string } {
  if (title.startsWith('Crèmerie')) return { emoji: '🥛', tone: 'bg-sky' };
  if (title.startsWith('Viande')) return { emoji: '🍗', tone: 'bg-blush' };
  if (title.startsWith('Charcuterie')) return { emoji: '🥓', tone: 'bg-blush' };
  if (title.startsWith('Boulangerie')) return { emoji: '🥖', tone: 'bg-butter' };
  if (title.startsWith('Fruits')) return { emoji: '🥕', tone: 'bg-sage' };
  if (title.startsWith('Épicerie salée')) return { emoji: '🍝', tone: 'bg-sand' };
  if (title.startsWith('Épicerie sucrée')) return { emoji: '🍪', tone: 'bg-butter' };
  if (title.startsWith('Boissons')) return { emoji: '🧃', tone: 'bg-lilac' };
  if (title.startsWith('Surgelés')) return { emoji: '❄️', tone: 'bg-sky' };
  if (title.startsWith('Bébé')) return { emoji: '🍼', tone: 'bg-blush' };
  if (title.startsWith('Hygiène') || title.startsWith('Parapharmacie')) return { emoji: '🧴', tone: 'bg-lilac' };
  if (title.startsWith('Animalerie')) return { emoji: '🐾', tone: 'bg-sand' };
  if (title.startsWith('Entretien')) return { emoji: '🧽', tone: 'bg-sage' };
  if (title.startsWith('Maison')) return { emoji: '🏠', tone: 'bg-butter' };
  return { emoji: '🛒', tone: 'bg-sand' };
}

export interface ShoppingGroupCardProps {
  list: ShoppingListView;
  grouping: Grouping;
  suggestions: ItemSuggestion[];
  /** Catalogue du foyer pour la correspondance à la frappe. */
  catalogue: ProductRow[];
  /** Photos affichables du catalogue (chemins re-signés à la lecture, D-01). */
  photoUrls: Record<string, string>;
  disabled?: boolean;
  /**
   * Rôle `enfant` : la liste se lit, elle ne se réordonne pas. Le serveur
   * refuserait l'écriture de toute façon — mais une poignée qui ne peut pas
   * faire son geste ne doit pas s'afficher.
   */
  readOnly?: boolean;
  onToggle: (item: ShoppingItem) => void;
  onQuickAdd: (listId: string, name: string, options?: { quantity?: string | null; rayon?: string | null }) => void;
  onQuickAddProduct: (listId: string, productId: string) => void;
  onUpdateQuantity: (item: ShoppingItem, quantity: string) => void;
  onDelete: (item: ShoppingItem) => void;
  onEdit: (item: ShoppingItem) => void;
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
  catalogue,
  photoUrls,
  disabled = false,
  readOnly = false,
  onToggle,
  onQuickAdd,
  onQuickAddProduct,
  onUpdateQuantity,
  onDelete,
  onEdit,
  onDeleteList,
}: ShoppingGroupCardProps) {
  const [draft, setDraft] = useState('');
  const [match, setMatch] = useState<
    | null
    | { kind: 'duplicate'; name: string; item: ShoppingItem; quantity: string }
    | { kind: 'details'; name: string; quantity: string; rayon: (typeof RAYONS)[number] }
  >(null);
  // Autocomplétion live sur le catalogue local (pas de quota réseau) :
  // visible pendant la frappe dès 2 caractères, fermée par Échap.
  const [dropOpen, setDropOpen] = useState(false);
  const liveHits = draft.trim().length >= 2 && dropOpen ? matchCatalogue(catalogue, draft) : [];
  const sections = sectionsForList(list.items, grouping);
  const inputId = `quick-add-${list.id}`;

  const resetMatch = () => {
    setMatch(null);
    setDropOpen(false);
    setDraft('');
  };

  const submitDraft = () => {
    const name = draft.trim();
    if (!name) return;
    // Doublon : l'article est déjà dans la liste → proposer la quantité.
    const dupe = list.items.find((item) => normalizeSearchText(item.name) === normalizeSearchText(name));
    if (dupe) {
      setDropOpen(false);
      setMatch({
        kind: 'duplicate',
        name,
        item: dupe,
        quantity: dupe.quantity === null ? '' : String(dupe.quantity),
      });
      return;
    }
    // Correspondance exacte : ajout lié direct. Sinon, mini-formulaire de
    // création (le « Créer » du dropdown y mène aussi) : taper « Marss »
    // quand « Mars » existe crée bien « Marss », jamais Mars à la place.
    const exact = catalogue.find((product) => normalizeSearchText(product.name) === normalizeSearchText(name));
    setDropOpen(false);
    if (exact) {
      pickProduct(exact.id);
      return;
    }
    setMatch({ kind: 'details', name, quantity: '', rayon: guessRayon(name) });
  };

  const submitDuplicate = () => {
    if (match?.kind !== 'duplicate') return;
    onUpdateQuantity(match.item, match.quantity);
    resetMatch();
  };

  const submitDetails = () => {
    if (match?.kind !== 'details') return;
    onQuickAdd(list.id, match.name, { quantity: match.quantity, rayon: match.rayon });
    resetMatch();
  };

  const pickProduct = (productId: string) => {
    onQuickAddProduct(list.id, productId);
    resetMatch();
  };

  return (
    <section className="grid grid-cols-1 gap-2" aria-labelledby={`list-title-${list.id}`}>
      <div className="flex items-center justify-between gap-3">
        {/* Le compteur reste hors du titre : l'étiquette du groupe doit rester
            égale au nom de la liste pour les lecteurs d'écran. */}
        <h3 id={`list-title-${list.id}`} className="m-0 flex items-center gap-2 font-display text-[20px] font-semibold tracking-[-0.02em]">
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
          className="size-8 min-h-8 text-muted hover:bg-coral-soft hover:text-coral-text"
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
            placeholder="Ajouter dans ta liste…"
            role="combobox"
            aria-expanded={liveHits.length > 0}
            aria-controls={`catalogue-matches-${list.id}`}
            aria-autocomplete="list"
            className="min-h-12 rounded-full border-transparent bg-bg pl-4 text-[14px] focus-visible:bg-surface"
            onChange={(event) => {
              setDraft(event.target.value);
              setMatch(null);
              setDropOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitDraft();
              }
              if (event.key === 'Escape') {
                setDropOpen(false);
              }
            }}
          />
          <Button
            icon="plus"
            disabled={disabled || !draft.trim()}
            onClick={submitDraft}
            aria-label={`Ajouter l’article à la liste ${list.name}`}
            className="shrink-0"
          >
            Ajouter
          </Button>
        </div>

        {liveHits.length > 0 ? (
          <ul
            id={`catalogue-matches-${list.id}`}
            role="listbox"
            aria-label="Produits du catalogue correspondants"
            className="mt-1.5 grid gap-1 rounded-[11px] border border-border bg-surface p-1.5"
          >
            {liveHits.map((product) => (
              <li key={product.id} role="option" aria-selected="false">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => pickProduct(product.id)}
                  onMouseDown={(event) => event.preventDefault()}
                  className="flex w-full min-h-9 items-center gap-2 rounded-[9px] px-2 py-1.5 text-left transition-colors hover:bg-accent-faint disabled:opacity-55"
                >
                  {productPhotoUrl(product, photoUrls) ? (
                    <img src={productPhotoUrl(product, photoUrls) as string} alt="" aria-hidden="true" className="size-7 shrink-0 rounded-[7px] object-cover" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{product.name}</span>
                </button>
              </li>
            ))}
            <li role="option" aria-selected="false">
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setDropOpen(false);
                  setMatch({ kind: 'details', name: draft.trim(), quantity: '', rayon: guessRayon(draft) });
                }}
                onMouseDown={(event) => event.preventDefault()}
                className="flex w-full min-h-9 items-center gap-2 rounded-[9px] px-2 py-1.5 text-left text-[13px] font-semibold text-muted transition-colors hover:bg-accent-faint hover:text-fg disabled:opacity-55"
              >
                Créer « {draft.trim()} »
              </button>
            </li>
          </ul>
        ) : null}

        {match?.kind === 'duplicate' ? (
          <div className="mt-2.5 grid gap-2 rounded-[11px] border border-border bg-bg p-2.5">
            <p className="m-0 text-[11px] font-bold">
              « {match.name} » est déjà dans la liste
              {match.item.quantity !== null ? ` (quantité ${match.item.quantity})` : ''} — modifier ?
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-[11px] font-extrabold text-muted">
                Quantité
                <input
                  value={match.quantity}
                  disabled={disabled}
                  inputMode="decimal"
                  placeholder="Ex. 3"
                  onChange={(change) => setMatch({ ...match, quantity: change.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      submitDuplicate();
                    }
                  }}
                  className="min-h-9 w-28 rounded-[9px] border border-border bg-surface px-2 text-[12px] font-semibold text-fg"
                />
              </label>
              <Button icon="check" disabled={disabled} onClick={submitDuplicate}>
                Mettre à jour
              </Button>
              <Button variant="secondary" onClick={resetMatch}>
                Annuler
              </Button>
            </div>
          </div>
        ) : null}

        {match?.kind === 'details' ? (
          <div className="mt-2.5 grid gap-2 rounded-[11px] border border-border bg-bg p-2.5">
            <p className="m-0 text-[11px] font-bold">« {match.name} » n’est pas au catalogue — précisez :</p>
            <div className="grid grid-cols-2 gap-2 max-[650px]:grid-cols-1">
              <label className="grid gap-1 text-[11px] font-extrabold text-muted">
                Rayon
                <select
                  value={match.rayon}
                  disabled={disabled}
                  onChange={(change) =>
                    setMatch({ ...match, rayon: change.target.value as (typeof RAYONS)[number] })
                  }
                  className="min-h-9 rounded-[9px] border border-border bg-surface px-2 text-[12px] font-semibold text-fg"
                >
                  {RAYONS.map((rayon) => (
                    <option key={rayon} value={rayon}>
                      {rayon}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-[11px] font-extrabold text-muted">
                Quantité
                <input
                  value={match.quantity}
                  disabled={disabled}
                  inputMode="decimal"
                  placeholder="Ex. 3"
                  onChange={(change) => setMatch({ ...match, quantity: change.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      submitDetails();
                    }
                  }}
                  className="min-h-9 rounded-[9px] border border-border bg-surface px-2 text-[12px] font-semibold text-fg"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <Button
                icon="plus"
                disabled={disabled}
                onClick={submitDetails}
                aria-label={`Confirmer l’ajout de ${match.name}`}
              >
                Ajouter
              </Button>
              <Button variant="secondary" onClick={resetMatch}>
                Annuler
              </Button>
            </div>
          </div>
        ) : null}

        {suggestions.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-extrabold tracking-[0.08em] text-muted uppercase">Habitudes</span>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.name}
                type="button"
                disabled={disabled}
                onClick={() => onQuickAdd(list.id, suggestion.name)}
                title={suggestion.rayon}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 text-[11px] text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint hover:text-accent-strong disabled:opacity-55"
              >
                {suggestion.photoUrl ? (
                  <img
                    src={suggestion.photoUrl}
                    alt=""
                    aria-hidden="true"
                    className="size-5 rounded-full object-cover"
                  />
                ) : (
                  <Icon name="plus" size="sm" />
                )}
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
            {section.title ? (
              <div className={cn('mb-2 flex items-center gap-2.5', sectionIndex === 0 ? 'mt-0' : 'mt-5')}>
                <span
                  aria-hidden="true"
                  className={cn('grid size-9 shrink-0 place-items-center rounded-full text-[16px]', rayonVisual(section.title).tone)}
                >
                  {rayonVisual(section.title).emoji}
                </span>
                <h4 className="m-0 font-display text-[20px] leading-tight font-semibold tracking-[-0.02em]">{section.title}</h4>
              </div>
            ) : null}
            {/* Le geste se fait À L'INTÉRIEUR du groupe : dans la vue « par
                rayon », un article reste dans son rayon ; dans la vue « l'ordre
                du foyer », la liste est à plat. */}
            <SortableContext items={section.items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <ul className="m-0 grid list-none gap-0.5 p-0">
                {section.items.map((item) => (
                  <ShoppingItemRow
                    key={item.id}
                    item={item}
                    readOnly={readOnly}
                    onToggle={onToggle}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            </SortableContext>
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
