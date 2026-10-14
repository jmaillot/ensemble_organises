import { useState } from 'react';
import { agreeUnit, closestServingsStep, formatQuantity, scaleQuantity, SERVINGS_STEPS, type RecipeIngredient } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';

export interface IngredientListProps {
  ingredients: RecipeIngredient[];
  /** Personnes de reference de la recette. */
  baseServings: number;
  /** Faux pour le rôle `enfant` : saisie masquee. */
  readOnly?: boolean;
  isSaving?: boolean;
  onAdd: (input: { name: string; quantity: number | null; unit: string | null }) => Promise<void> | void;
  onUpdate: (ingredient: RecipeIngredient, input: { name: string; quantity: number | null; unit: string | null }) => Promise<void> | void;
  onDelete: (ingredient: RecipeIngredient) => Promise<void> | void;
}

/**
 * Ingredients + curseur personnes (D-04, D-06, D-07) : le curseur demarre
 * a la reference arrondie au pair, pas de 2 sur 2–12 ; recalcul decimal +
 * accord d'unite ; lignes sans nombre affichees telles quelles (R8).
 */
export function IngredientList({ ingredients, baseServings, readOnly = false, isSaving = false, onAdd, onUpdate, onDelete }: IngredientListProps) {
  const [target, setTarget] = useState(() => closestServingsStep(baseServings));
  const [draft, setDraft] = useState({ name: '', quantity: '', unit: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: '', quantity: '', unit: '' });
  const [pendingDelete, setPendingDelete] = useState<RecipeIngredient | null>(null);

  const parseQuantity = (raw: string): number | null => {
    const normalized = raw.replace(',', '.').trim();
    if (normalized === '') return null;
    const value = Number(normalized);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };

  const submitAdd = async () => {
    const name = draft.name.trim();
    if (name === '') return;
    await onAdd({ name, quantity: parseQuantity(draft.quantity), unit: draft.unit.trim() === '' ? null : draft.unit.trim() });
    setDraft({ name: '', quantity: '', unit: '' });
  };

  const startEdit = (ingredient: RecipeIngredient) => {
    setEditingId(ingredient.id);
    setEditDraft({
      name: ingredient.name,
      quantity: ingredient.quantity === null ? '' : String(ingredient.quantity),
      unit: ingredient.unit ?? '',
    });
  };

  const submitEdit = async (ingredient: RecipeIngredient) => {
    const name = editDraft.name.trim();
    if (name === '') return;
    await onUpdate(ingredient, {
      name,
      quantity: parseQuantity(editDraft.quantity),
      unit: editDraft.unit.trim() === '' ? null : editDraft.unit.trim(),
    });
    setEditingId(null);
  };

  return (
    <section aria-label="Ingrédients">
      <div className="grid gap-2">
        <label htmlFor="recette-personnes" className="text-[12px] font-[760]">
          Pour {target} personne{target > 1 ? 's' : ''} <span className="font-normal text-muted">(référence : {baseServings})</span>
        </label>
        <input
          id="recette-personnes"
          type="range"
          min={2}
          max={12}
          step={2}
          value={target}
          onChange={(event) => setTarget(Number(event.target.value))}
          list="recette-personnes-ticks"
          className="w-full accent-[var(--color-accent-strong)]"
        />
        <datalist id="recette-personnes-ticks">
          {SERVINGS_STEPS.map((step) => (
            <option key={step} value={step} label={String(step)} />
          ))}
        </datalist>
      </div>

      {ingredients.length === 0 ? (
        <p className="m-0 py-3 text-xs text-muted">Aucun ingrédient pour l’instant.</p>
      ) : (
        <ul className="m-0 grid list-none gap-0 p-0">
          {ingredients.map((ingredient) => {
            const scaled = scaleQuantity(ingredient.quantity, baseServings, target);
            const display = formatQuantity(scaled);
            const unit = agreeUnit(ingredient.unit, scaled);
            return (
              <li
                key={ingredient.id}
                className="flex min-h-11 items-center gap-2.5 border-t border-border py-2.5 first:border-t-0"
              >
                <span className="min-w-0 flex-1 text-[13px]">
                  <strong className="font-[760]">{ingredient.name}</strong>{' '}
                  <span className="text-muted">
                    {display === null ? (ingredient.unit ?? 'au goût') : `${display}${unit ? ` ${unit}` : ''}`}
                  </span>
                </span>
                {!readOnly ? (
                  <span className="flex shrink-0 items-center gap-1">
                    {editingId === ingredient.id ? (
                      <>
                        <Input
                          aria-label={`Nom de l’ingrédient ${ingredient.name}`}
                          value={editDraft.name}
                          onChange={(event) => setEditDraft((current) => ({ ...current, name: event.target.value }))}
                          className="w-28"
                        />
                        <Input
                          aria-label="Quantité"
                          inputMode="decimal"
                          value={editDraft.quantity}
                          onChange={(event) => setEditDraft((current) => ({ ...current, quantity: event.target.value }))}
                          placeholder="500"
                          className="w-20"
                        />
                        <Input
                          aria-label="Unité"
                          value={editDraft.unit}
                          onChange={(event) => setEditDraft((current) => ({ ...current, unit: event.target.value }))}
                          placeholder="g"
                          className="w-20"
                        />
                        <Button variant="secondary" disabled={isSaving} onClick={() => void submitEdit(ingredient)}>
                          OK
                        </Button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(ingredient)}
                          aria-label={`Modifier ${ingredient.name}`}
                          className="grid size-11 place-items-center rounded-[9px] text-muted hover:bg-accent-faint hover:text-fg"
                        >
                          <Icon name="edit" size="sm" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(ingredient)}
                          aria-label={`Supprimer ${ingredient.name}`}
                          className="grid size-11 place-items-center rounded-[9px] text-muted hover:bg-coral-soft hover:text-coral"
                        >
                          <Icon name="trash" size="sm" />
                        </button>
                      </>
                    )}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {!readOnly ? (
        <form
          className="mt-2 grid grid-cols-[minmax(0,1fr)_90px_90px_auto] items-end gap-2 max-[650px]:grid-cols-1"
          onSubmit={(event) => {
            event.preventDefault();
            void submitAdd();
          }}
        >
          <label className="grid gap-1 text-[11px] font-[700] text-muted">
            Ingrédient
            <Input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Farine"
              autoComplete="off"
            />
          </label>
          <label className="grid gap-1 text-[11px] font-[700] text-muted">
            Nombre <span className="font-normal">(vide = au goût)</span>
            <Input
              value={draft.quantity}
              onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))}
              placeholder="500"
              inputMode="decimal"
              autoComplete="off"
            />
          </label>
          <label className="grid gap-1 text-[11px] font-[700] text-muted">
            Unité
            <Input
              value={draft.unit}
              onChange={(event) => setDraft((current) => ({ ...current, unit: event.target.value }))}
              placeholder="g"
              autoComplete="off"
            />
          </label>
          <Button type="submit" icon="plus" disabled={isSaving || draft.name.trim() === ''}>
            Ajouter
          </Button>
        </form>
      ) : null}

      {pendingDelete ? (
        <div role="alertdialog" aria-modal="true" aria-label={`Supprimer ${pendingDelete.name} ?`} className="mt-2 rounded-[10px] border border-border bg-bg p-3">
          <p className="m-0 text-[13px]">
            Supprimer <strong>{pendingDelete.name}</strong> des ingrédients ?
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={isSaving}
              onClick={() => {
                const targetDelete = pendingDelete;
                setPendingDelete(null);
                void onDelete(targetDelete);
              }}
            >
              Supprimer
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
