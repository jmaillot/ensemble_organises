import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { Checkbox } from '@/components/ui/primitives';
import type { RecipeStep } from '../types';
import { StepPhoto } from './step-photo';

export interface RecipeStepsProps {
  steps: RecipeStep[];
  /** Faux pour le rôle `enfant` : saisie et drag masques, cases conservees. */
  readOnly?: boolean;
  isSaving?: boolean;
  /** URL affichables des photos d'étape, par identifiant d'étape (D-06). */
  photoUrls?: Record<string, string | null>;
  onAdd: (content: string) => Promise<void> | void;
  onUpdate: (step: RecipeStep, content: string) => Promise<void> | void;
  onDelete: (step: RecipeStep) => Promise<void> | void;
  onReorder: (orderedIds: string[]) => Promise<void> | void;
  /**
   * Photo d'une étape (D-11, D-12) : présents seulement quand le membre peut
   * écrire. Absents en lecture seule (`enfant`), aucune commande de photo
   * n'est alors rendue — la RLS reste la barrière finale côté serveur (§2.6).
   */
  onAddPhoto?: (step: RecipeStep, file: File) => Promise<void> | void;
  onReplacePhoto?: (step: RecipeStep, file: File) => Promise<void> | void;
  onRemovePhoto?: (step: RecipeStep) => Promise<void> | void;
}

/**
 * Etapes numerotees reliees (D-11) : la bulle numero EST la poignee de
 * drag (dnd-kit, clavier via `sortableKeyboardCoordinates`) + boutons
 * monter/descendre ≥ 44px ; cases cuisson en etat local seul (D-12).
 */
export function RecipeSteps({ steps, readOnly = false, isSaving = false, photoUrls = {}, onAdd, onUpdate, onDelete, onReorder, onAddPhoto, onReplacePhoto, onRemovePhoto }: RecipeStepsProps) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<RecipeStep | null>(null);
  const [pendingPhotoRemoval, setPendingPhotoRemoval] = useState<RecipeStep | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = steps.map((step) => step.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]);
    void onReorder(next);
  };

  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= steps.length) return;
    const next = steps.map((step) => step.id);
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved!);
    void onReorder(next);
  };

  const toggleChecked = (id: string) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitAdd = async () => {
    const content = draft.trim();
    if (content === '') return;
    await onAdd(content);
    setDraft('');
  };

  const list = (
    <ol className="m-0 grid list-none gap-0 p-0" aria-label="Étapes de la recette">
      {steps.map((step, index) => (
        <StepRow
          key={step.id}
          step={step}
          number={index + 1}
          isLast={index === steps.length - 1}
          checked={checked.has(step.id)}
          onToggleChecked={() => toggleChecked(step.id)}
          readOnly={readOnly}
          isSaving={isSaving}
          photoUrl={photoUrls[step.id] ?? null}
          isEditing={editingId === step.id}
          editContent={editContent}
          onEditContentChange={setEditContent}
          onStartEdit={() => {
            setEditingId(step.id);
            setEditContent(step.content);
          }}
          onCancelEdit={() => setEditingId(null)}
          onSubmitEdit={() => {
            if (editContent.trim() === '') return;
            const content = editContent.trim();
            setEditingId(null);
            void onUpdate(step, content);
          }}
          onMoveUp={() => move(index, -1)}
          onMoveDown={() => move(index, 1)}
          onDelete={() => setPendingDelete(step)}
          onAddPhoto={onAddPhoto}
          onReplacePhoto={onReplacePhoto}
          onRemovePhoto={() => setPendingPhotoRemoval(step)}
        />
      ))}
    </ol>
  );

  return (
    <section aria-label="Étapes">
      {steps.length === 0 ? (
        <p className="m-0 py-3 text-xs text-muted">Aucune étape pour l’instant.</p>
      ) : readOnly ? (
        list
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map((step) => step.id)} strategy={verticalListSortingStrategy}>
            {list}
          </SortableContext>
        </DndContext>
      )}

      {!readOnly ? (
        <form
          className="mt-2 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submitAdd();
          }}
        >
          <label className="grid gap-1 text-[11px] font-[700] text-muted" htmlFor="recette-etape-nouvelle">
            Nouvelle étape
          </label>
          <Textarea
            id="recette-etape-nouvelle"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            placeholder="Ex. Faire fondre le beurre à feu doux."
          />
          <div>
            <Button type="submit" icon="plus" disabled={isSaving || draft.trim() === ''}>
              Ajouter une étape
            </Button>
          </div>
        </form>
      ) : null}

      {pendingDelete ? (
        <div role="alertdialog" aria-modal="true" aria-label="Supprimer cette étape ?" className="mt-2 rounded-[10px] border border-border bg-bg p-3">
          <p className="m-0 text-[13px]">
            Supprimer l’étape <strong>« {pendingDelete.content.slice(0, 60)} »</strong> ?
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

      {pendingPhotoRemoval ? (
        <div role="alertdialog" aria-modal="true" aria-label="Retirer cette photo ?" className="mt-2 rounded-[10px] border border-border bg-bg p-3">
          <p className="m-0 text-[13px]">
            Retirer la photo de l’étape <strong>« {pendingPhotoRemoval.content.slice(0, 60)} »</strong> ?
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={() => setPendingPhotoRemoval(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={isSaving}
              onClick={() => {
                const targetRemoval = pendingPhotoRemoval;
                setPendingPhotoRemoval(null);
                void onRemovePhoto?.(targetRemoval);
              }}
            >
              Retirer
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

interface StepRowProps {
  step: RecipeStep;
  number: number;
  isLast: boolean;
  checked: boolean;
  onToggleChecked: () => void;
  readOnly: boolean;
  isSaving: boolean;
  photoUrl: string | null;
  isEditing: boolean;
  editContent: string;
  onEditContentChange: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onAddPhoto?: (step: RecipeStep, file: File) => Promise<void> | void;
  onReplacePhoto?: (step: RecipeStep, file: File) => Promise<void> | void;
  onRemovePhoto: () => void;
}

function StepRow(props: StepRowProps) {
  const { step, number, isLast, checked, onToggleChecked, readOnly } = props;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
    disabled: readOnly,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative flex gap-3 py-3 first:pt-0 last:pb-0', isDragging && 'opacity-50')}
    >
      <span className="flex flex-col items-center">
        {readOnly ? (
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-[800] text-accent-strong">
            {number}
          </span>
        ) : (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Réordonner : étape ${number}`}
            title="Glisser pour réordonner"
            className="grid size-11 shrink-0 cursor-grab place-items-center rounded-full bg-accent-soft text-[13px] font-[800] text-accent-strong transition-colors hover:text-fg active:cursor-grabbing"
          >
            {number}
          </button>
        )}
        {!isLast ? <span aria-hidden="true" className="mt-1 w-px flex-1 bg-border" /> : null}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <Checkbox
            checked={checked}
            onCheckedChange={onToggleChecked}
            aria-label={`Marquer l’étape ${number} comme faite`}
            className="relative mt-0.5 shrink-0 after:absolute after:-inset-3 after:content-['']"
          />
          <div className="min-w-0 flex-1">
            {props.isEditing ? (
              <span className="grid gap-2">
                <Textarea
                  aria-label={`Contenu de l’étape ${number}`}
                  value={props.editContent}
                  onChange={(event) => props.onEditContentChange(event.target.value)}
                  rows={3}
                />
                <span className="flex gap-2">
                  <Button variant="secondary" disabled={props.isSaving} onClick={props.onCancelEdit}>
                    Annuler
                  </Button>
                  <Button disabled={props.isSaving || props.editContent.trim() === ''} onClick={props.onSubmitEdit}>
                    Enregistrer
                  </Button>
                </span>
              </span>
            ) : (
              <p className={cn('m-0 text-[13px]', checked && 'text-muted line-through')}>{step.content}</p>
            )}
            <StepPhoto
              url={props.photoUrl}
              alt={`Photo de l’étape ${number}`}
              onSelectPhoto={
                readOnly
                  ? undefined
                  : (file) => {
                      // Le remplacement est direct, sans étape intermédiaire (D-14).
                      if (props.photoUrl) void props.onReplacePhoto?.(step, file);
                      else void props.onAddPhoto?.(step, file);
                    }
              }
            />
          </div>
        </div>
        {!readOnly && !props.isEditing ? (
          <div className="mt-1.5 flex items-center gap-1">
            <button
              type="button"
              onClick={props.onMoveUp}
              disabled={number <= 1}
              aria-label={`Monter l’étape ${number}`}
              className="grid size-11 place-items-center rounded-[9px] text-muted transition-colors hover:bg-accent-faint hover:text-fg disabled:opacity-40"
            >
              <Icon name="chevronDown" size="sm" className="rotate-180" />
            </button>
            <button
              type="button"
              onClick={props.onMoveDown}
              aria-label={`Descendre l’étape ${number}`}
              className="grid size-11 place-items-center rounded-[9px] text-muted transition-colors hover:bg-accent-faint hover:text-fg"
            >
              <Icon name="chevronDown" size="sm" />
            </button>
            <button
              type="button"
              onClick={props.onStartEdit}
              aria-label={`Modifier l’étape ${number}`}
              className="grid size-11 place-items-center rounded-[9px] text-muted transition-colors hover:bg-accent-faint hover:text-fg"
            >
              <Icon name="edit" size="sm" />
            </button>
            {step.photoPath ? (
              <button
                type="button"
                onClick={props.onRemovePhoto}
                aria-label={`Retirer la photo de l’étape ${number}`}
                className="grid size-11 place-items-center rounded-[9px] text-muted transition-colors hover:bg-coral-soft hover:text-coral"
              >
                <Icon name="close" size="sm" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={props.onDelete}
              aria-label={`Supprimer l’étape ${number}`}
              className="grid size-11 place-items-center rounded-[9px] text-muted transition-colors hover:bg-coral-soft hover:text-coral"
            >
              <Icon name="trash" size="sm" />
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
