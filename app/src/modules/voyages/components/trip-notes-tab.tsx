/**
 * Onglet Notes d'un voyage (phase 15, 15-03) : fourche à filtre `tripId`,
 * jamais un drop-in de la page foyer (D-09).
 *
 * - Lecture : notes `trip_id = voyage courant`.
 * - Création : `trip_id` posé, `folder_id` à NULL (`note_folders` au foyer).
 * - Catégories : choix foyer + « Voyage » par défaut, sans dossier.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { useToast } from '@/components/ui/toast';
import { data } from '@/lib/data';
import { NOTE_CATEGORIES, OTHER_CATEGORY } from '@/modules/notes/types';
import type { NoteRow } from '@/types';
import { createTripNote, fetchTripNotes } from '../api';

export const tripNotesKeys = {
  all: ['voyages', 'trip-notes'] as const,
  list: (tripId: string) => ['voyages', 'trip-notes', tripId] as const,
};

export interface TripNotesTabProps {
  tripId: string;
  householdId: string;
  currentMemberId: string | null;
  readOnly?: boolean;
}

const CATEGORY_CHOICES = [...NOTE_CATEGORIES, 'Voyage', OTHER_CATEGORY];

export function TripNotesTab({ tripId, householdId, currentMemberId, readOnly = false }: TripNotesTabProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('Voyage');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<NoteRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<NoteRow | null>(null);

  const notesQuery = useQuery({
    queryKey: tripNotesKeys.list(tripId),
    queryFn: () => fetchTripNotes(tripId),
  });
  const notes = useMemo(
    () => [...(notesQuery.data ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [notesQuery.data],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: tripNotesKeys.list(tripId) });
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setCategory('Voyage');
    setEditing(null);
  };

  const submit = async () => {
    if (saving || title.trim() === '') return;
    setSaving(true);
    try {
      if (editing) {
        await data.update('notes', editing.id, {
          title: title.trim(),
          content: content.trim(),
          category: category.trim() || 'Voyage',
          updated_at: new Date().toISOString(),
        });
        toast('Note du voyage mise à jour.');
      } else {
        await createTripNote({ tripId, householdId, title, content, category, createdBy: currentMemberId });
        toast('Note ajoutée au voyage.');
      }
      resetForm();
      refresh();
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : 'La note n’a pas pu être enregistrée.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    void (async () => {
      // L'adaptateur local n'a pas de cascade : on retire les pièces jointes.
      await data.removeWhere('note_attachments', { note_id: target.id }).catch(() => undefined);
      await data.remove('notes', target.id);
      if (editing?.id === target.id) resetForm();
      refresh();
      toast('Note du voyage supprimée.');
    })().catch((removalError: unknown) =>
      toast(removalError instanceof Error ? removalError.message : 'La note n’a pas pu être supprimée.', 'error'),
    );
  };

  if (notesQuery.isError) {
    return (
      <Panel id="trip-notes" title="Notes" description="Les notes propres à ce voyage.">
        <ErrorState
          message={notesQuery.error instanceof Error ? notesQuery.error.message : 'Les notes du voyage n’ont pas pu être chargées.'}
          onRetry={() => void notesQuery.refetch()}
        />
      </Panel>
    );
  }

  return (
    <div className="grid gap-3.5">
      {!readOnly ? (
        <Panel
          id="trip-notes-form"
          title={editing ? 'Modifier la note' : 'Ajouter une note'}
          description="La note appartient au voyage, sans dossier."
        >
          <div className="grid gap-3.5">
            <Field label="Titre">
              {(props) => (
                <Input {...props} value={title} onChange={(change) => setTitle(change.target.value)} maxLength={200} placeholder="Passeports" />
              )}
            </Field>
            <Field label="Contenu" optional>
              {(props) => (
                <Textarea {...props} value={content} onChange={(change) => setContent(change.target.value)} rows={3} placeholder="Vérifier les dates de validité…" />
              )}
            </Field>
            <Field label="Catégorie">
              {(props) => (
                <Select {...props} value={category} onChange={(change) => setCategory(change.target.value)}>
                  {CATEGORY_CHOICES.map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button icon="plus" disabled={saving || title.trim() === ''} onClick={() => void submit()}>
                {saving ? 'Enregistrement…' : editing ? 'Mettre à jour' : 'Ajouter au voyage'}
              </Button>
              {editing ? (
                <Button variant="secondary" onClick={resetForm}>
                  Annuler
                </Button>
              ) : null}
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel id="trip-notes" title="Notes du voyage" description="Celles de ce voyage seul — jamais celles du foyer.">
        {notesQuery.isLoading ? (
          <LoadingRows rows={3} />
        ) : notes.length === 0 ? (
          <EmptyState
            icon="edit"
            title="Aucune note pour ce voyage"
            description="Ajoutez la première note du voyage : elle n’apparaîtra pas dans les notes du foyer."
          />
        ) : (
          <div role="list" aria-label="Notes du voyage" className="grid gap-2.5">
            {notes.map((note) => (
              <div key={note.id} role="listitem" className="rounded-[12px] border border-border px-3.5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="m-0 min-w-[150px] flex-1 text-[13px] font-[760]">{note.title}</p>
                  <span className="rounded-full bg-bg px-2 py-0.5 text-[11px] font-semibold text-muted">{note.category}</span>
                  {!readOnly ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(note);
                          setTitle(note.title);
                          setContent(note.content);
                          setCategory(note.category);
                        }}
                        aria-label={`Modifier ${note.title}`}
                        className="grid size-11 place-items-center rounded-[9px] text-muted hover:bg-accent-faint hover:text-fg"
                      >
                        <Icon name="edit" size="sm" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(note)}
                        aria-label={`Supprimer ${note.title}`}
                        className="grid size-11 place-items-center rounded-[9px] text-muted hover:bg-coral-soft hover:text-coral"
                      >
                        <Icon name="trash" size="sm" />
                      </button>
                    </div>
                  ) : null}
                </div>
                {note.content ? <p className="mt-1.5 mb-0 text-[12px] whitespace-pre-line">{note.content}</p> : null}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Supprimer « ${pendingDelete?.title ?? ''} » ?`}
        description="La note sera retirée du voyage, avec ses pièces jointes."
        confirmLabel="Supprimer la note"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
