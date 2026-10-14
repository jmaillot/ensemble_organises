import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { useToast } from '@/components/ui/toast';
import type { RecipeCategoryRow, RecipeTagRow } from '@/types';
import {
  createRecipeCategory,
  createRecipeTag,
  deleteRecipeCategory,
  deleteRecipeTag,
  renameRecipeCategory,
  renameRecipeTag,
} from '../api';
import { DEFAULT_RECIPE_CATEGORY } from '../types';

export interface RecipeSettingsProps {
  householdId: string;
  categories: RecipeCategoryRow[];
  tags: RecipeTagRow[];
  /** Nombre de recettes par categorie (id → total). */
  recipeCounts: Record<string, number>;
  isSaving: boolean;
  onChanged: () => Promise<void> | void;
}

/**
 * Parametres du module (R2/R4) : renommer/supprimer categories (pleine
 * re-assignee au defaut par le trigger serveur, vide en DELETE direct) et
 * tags (repercute sur les recettes via les liens). Creation reservee aux
 * roles qui ecrivent (garde canWrite + serveur). Contenu affiche dans le
 * dialogue « Catégories et étiquettes » de la page (bouton engrenage),
 * comme les types prestataires.
 */
export function RecipeSettings({ householdId, categories, tags, recipeCounts, isSaving, onChanged }: RecipeSettingsProps) {
  const toast = useToast();
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string } | null>(null);
  const [editingTag, setEditingTag] = useState<{ id: string; name: string } | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [newTag, setNewTag] = useState('');
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<RecipeCategoryRow | null>(null);
  const [pendingDeleteTag, setPendingDeleteTag] = useState<RecipeTagRow | null>(null);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      await onChanged();
      toast(success);
    } catch (actionError) {
      toast(actionError instanceof Error ? actionError.message : 'L’opération a échoué.', 'error');
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section aria-label="Catégories">
          <h3 className="m-0 mb-2 text-[13px] font-[800]">Catégories</h3>
          <ul className="m-0 grid list-none gap-0 p-0">
            {categories.map((category) => {
              const count = category.id ? (recipeCounts[category.id] ?? 0) : 0;
              const isDefault = category.name === DEFAULT_RECIPE_CATEGORY;
              return (
                <li key={category.id} className="flex min-h-11 items-center gap-2 border-t border-border py-2 first:border-t-0">
                  {editingCategory?.id === category.id ? (
                    <>
                      <Input
                        aria-label={`Nom de la catégorie ${category.name}`}
                        value={editingCategory.name}
                        onChange={(event) => setEditingCategory({ id: category.id, name: event.target.value })}
                        autoComplete="off"
                      />
                      <Button
                        variant="secondary"
                        disabled={isSaving}
                        onClick={() => {
                          const target = editingCategory;
                          setEditingCategory(null);
                          void run(() => renameRecipeCategory(target.id, target.name), 'Catégorie renommée.');
                        }}
                      >
                        OK
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 text-[13px] font-[760]">
                        {category.name}
                        <span className="ml-1.5 font-normal text-muted">
                          {count} recette{count > 1 ? 's' : ''}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingCategory({ id: category.id, name: category.name })}
                        aria-label={`Renommer la catégorie ${category.name}`}
                        className="grid size-11 place-items-center rounded-[9px] text-muted hover:bg-accent-faint hover:text-fg"
                      >
                        <Icon name="edit" size="sm" />
                      </button>
                      {!isDefault ? (
                        <button
                          type="button"
                          onClick={() => setPendingDeleteCategory(category)}
                          aria-label={`Supprimer la catégorie ${category.name}`}
                          className="grid size-11 place-items-center rounded-[9px] text-muted hover:bg-coral-soft hover:text-coral"
                        >
                          <Icon name="trash" size="sm" />
                        </button>
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const name = newCategory.trim();
              if (name === '') return;
              setNewCategory('');
              void run(() => createRecipeCategory(householdId, name), 'Catégorie créée.');
            }}
          >
            <Input
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="Nouvelle catégorie…"
              aria-label="Nom de la nouvelle catégorie"
              autoComplete="off"
            />
            <Button type="submit" icon="plus" disabled={isSaving || newCategory.trim() === ''}>
              Ajouter
            </Button>
          </form>
          {pendingDeleteCategory ? (
            <div role="alertdialog" aria-modal="true" aria-label="Supprimer cette catégorie ?" className="mt-2 rounded-[10px] border border-border bg-bg p-3">
              <p className="m-0 text-[13px]">
                Supprimer <strong>{pendingDeleteCategory.name}</strong>
                {(recipeCounts[pendingDeleteCategory.id] ?? 0) > 0
                  ? ' ? Ses recettes rejoindront « Recettes du foyer ».'
                  : ' ?'}
              </p>
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" onClick={() => setPendingDeleteCategory(null)}>
                  Annuler
                </Button>
                <Button
                  variant="danger"
                  disabled={isSaving}
                  onClick={() => {
                    const target = pendingDeleteCategory;
                    setPendingDeleteCategory(null);
                    void run(() => deleteRecipeCategory(target.id), 'Catégorie supprimée.');
                  }}
                >
                  Supprimer
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <section aria-label="Étiquettes">
          <h3 className="m-0 mb-2 text-[13px] font-[800]">Étiquettes</h3>
          <ul className="m-0 grid list-none gap-0 p-0">
            {tags.map((tag) => (
              <li key={tag.id} className="flex min-h-11 items-center gap-2 border-t border-border py-2 first:border-t-0">
                {editingTag?.id === tag.id ? (
                  <>
                    <Input
                      aria-label={`Nom de l’étiquette ${tag.name}`}
                      value={editingTag.name}
                      onChange={(event) => setEditingTag({ id: tag.id, name: event.target.value })}
                      autoComplete="off"
                    />
                    <Button
                      variant="secondary"
                      disabled={isSaving}
                      onClick={() => {
                        const target = editingTag;
                        setEditingTag(null);
                        void run(() => renameRecipeTag(target.id, target.name), 'Étiquette renommée.');
                      }}
                    >
                      OK
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 text-[13px] font-[760]">#{tag.name}</span>
                    <button
                      type="button"
                      onClick={() => setEditingTag({ id: tag.id, name: tag.name })}
                      aria-label={`Renommer l’étiquette ${tag.name}`}
                      className="grid size-11 place-items-center rounded-[9px] text-muted hover:bg-accent-faint hover:text-fg"
                    >
                      <Icon name="edit" size="sm" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteTag(tag)}
                      aria-label={`Supprimer l’étiquette ${tag.name}`}
                      className="grid size-11 place-items-center rounded-[9px] text-muted hover:bg-coral-soft hover:text-coral"
                    >
                      <Icon name="trash" size="sm" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {tags.length === 0 ? <p className="m-0 py-2 text-xs text-muted">Aucune étiquette.</p> : null}
          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const name = newTag.trim().replace(/^#+/, '');
              if (name === '') return;
              setNewTag('');
              void run(() => createRecipeTag(householdId, name), 'Étiquette créée.');
            }}
          >
            <Input
              value={newTag}
              onChange={(event) => setNewTag(event.target.value)}
              placeholder="Nouvelle étiquette…"
              aria-label="Nom de la nouvelle étiquette"
              autoComplete="off"
            />
            <Button type="submit" icon="plus" disabled={isSaving || newTag.trim() === ''}>
              Ajouter
            </Button>
          </form>
          {pendingDeleteTag ? (
            <div role="alertdialog" aria-modal="true" aria-label="Supprimer cette étiquette ?" className="mt-2 rounded-[10px] border border-border bg-bg p-3">
              <p className="m-0 text-[13px]">
                Supprimer <strong>#{pendingDeleteTag.name}</strong> de toutes les recettes ?
              </p>
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" onClick={() => setPendingDeleteTag(null)}>
                  Annuler
                </Button>
                <Button
                  variant="danger"
                  disabled={isSaving}
                  onClick={() => {
                    const target = pendingDeleteTag;
                    setPendingDeleteTag(null);
                    void run(() => deleteRecipeTag(target.id), 'Étiquette supprimée.');
                  }}
                >
                  Supprimer
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
  );
}
