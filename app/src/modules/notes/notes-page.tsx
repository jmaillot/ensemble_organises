import { useState } from 'react';
import { ModuleShell, MetricRow, SectionHeading } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { Icon } from '@/components/shared/icon';
import { FolderTabs } from '@/components/shared/folder-tabs';
import { formatBytes, isImageMime } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { useMembers } from '@/stores/household-store';
import { NoteFormDialog } from './components/note-form-dialog';
import { useNotes } from './hooks/use-notes';
import {
  formatClockTime,
  memberFirstName,
  noteCategoryTone,
  noteExcerpt,
  noteVisibilityLabels,
  type Note,
  type NoteTone,
} from './types';

const toneDot: Record<NoteTone, string> = {
  accent: 'bg-accent',
  coral: 'bg-coral',
  amber: 'bg-amber',
  muted: 'bg-fg',
};

export default function NotesPage() {
  const toast = useToast();
  const members = useMembers();
  const {
    notes,
    visibleNotes,
    categories,
    folders,
    activeFolderId,
    setActiveFolderId,
    canWrite,
    createFolder,
    renameFolder,
    deleteFolder,
    total,
    categoryCount,
    shared,
    latest,
    filters,
    setFilters,
    resetFilters,
    isLoading,
    isError,
    error,
    isMutating,
    refetch,
    addNote,
    editNote,
    removeNote,
  } = useNotes();
  const [dialog, setDialog] = useState<{ open: boolean; note: Note | null }>({ open: false, note: null });
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);

  const openCreate = () => setDialog({ open: true, note: null });
  const openEdit = (note: Note) => setDialog({ open: true, note });
  const closeDialog = () => setDialog((current) => ({ ...current, open: false }));

  const latestAuthor = latest?.authorId
    ? memberFirstName(members.find((member) => member.id === latest.authorId)?.display_name ?? '')
    : '';

  return (
    <ModuleShell
      module="notes"
      actions={
        canWrite ? (
          <Button icon="plus" onClick={openCreate}>
            Créer une note
          </Button>
        ) : null
      }
    >
      <MetricRow
        items={[
          { label: 'Notes', value: total, caption: 'dans votre espace' },
          { label: 'Catégories', value: categoryCount, caption: 'pour les ranger facilement' },
          { label: 'Partagées', value: shared, caption: 'avec le foyer' },
          {
            label: 'Dernière mise à jour',
            value: latest ? formatClockTime(latest.updatedAt) : '—',
            caption: latest ? `par ${latestAuthor}` : 'aucune note',
          },
        ]}
      />

      <div className="mb-4">
        <FolderTabs
          folders={folders}
          activeId={activeFolderId}
          onSelect={setActiveFolderId}
          onCreate={async (name, visibility) => {
            await createFolder(name, visibility);
            toast('Dossier créé.');
          }}
          onRename={async (id, name) => {
            try {
              await renameFolder(id, name);
              toast('Dossier renommé.');
            } catch (folderError) {
              toast(folderError instanceof Error ? folderError.message : 'Le dossier n’a pas pu être renommé.', 'error');
              throw folderError;
            }
          }}
          onDelete={async (folder) => {
            try {
              await deleteFolder(folder.id);
              toast('Dossier supprimé, contenu rangé dans Général.');
            } catch (folderError) {
              toast(folderError instanceof Error ? folderError.message : 'Le dossier n’a pas pu être supprimé.', 'error');
              throw folderError;
            }
          }}
          canManage={canWrite}
          label="Dossiers de notes"
        />
      </div>

      <SectionHeading
        title="Vos pensées, au même endroit"
        description="Une note peut rester privée ou devenir un point de repère partagé."
        action={
          <SearchInput
            aria-label="Rechercher une note"
            placeholder="Rechercher une note"
            value={filters.query}
            onChange={(event) => setFilters({ query: event.target.value })}
            containerClassName="w-[220px] max-[650px]:w-full"
          />
        }
      />

      {categories.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtrer par catégorie">
          <button
            type="button"
            aria-pressed={filters.category === ''}
            onClick={() => setFilters({ category: '' })}
            className={cn(
              'min-h-9 rounded-full border px-3 text-[11px] font-extrabold transition-colors duration-[var(--duration-quick)]',
              filters.category === ''
                ? 'border-transparent bg-accent-soft text-accent-strong'
                : 'border-border bg-surface text-muted hover:border-accent hover:text-fg',
            )}
          >
            Toutes
          </button>
          {categories.map((category) => {
            const active = filters.category === category;
            return (
              <button
                key={category}
                type="button"
                aria-pressed={active}
                onClick={() => setFilters({ category: active ? '' : category })}
                className={cn(
                  'inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-[11px] font-extrabold transition-colors duration-[var(--duration-quick)]',
                  active
                    ? 'border-transparent bg-accent-soft text-accent-strong'
                    : 'border-border bg-surface text-muted hover:border-accent hover:text-fg',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn('size-2 rounded-full', toneDot[noteCategoryTone(category)])}
                />
                {category}
              </button>
            );
          })}
        </div>
      ) : null}

      {isError ? (
        <ErrorState
          message={error?.message ?? 'Les notes du foyer n’ont pas pu être chargées.'}
          onRetry={refetch}
        />
      ) : isLoading ? (
        <LoadingRows rows={3} />
      ) : notes.length === 0 ? (
        <EmptyState
          icon="edit"
          title="Aucune note pour le moment"
          description="Une idée, une information ou une mémoire à garder : la première note peut rester privée, ou devenir un repère pour le foyer."
          actionLabel={canWrite ? 'Créer une note' : undefined}
          onAction={canWrite ? openCreate : undefined}
        />
      ) : visibleNotes.length === 0 ? (
        <EmptyState
          icon="search"
          title="Aucune note ne correspond à votre recherche."
          description="Essayez un autre mot-clé, ou affichez de nouveau toutes les catégories."
          secondaryActionLabel="Réinitialiser les filtres"
          onSecondaryAction={resetFilters}
        />
      ) : (
        <>
          <p className="sr-only" role="status">
            {`${visibleNotes.length} note${visibleNotes.length > 1 ? 's' : ''} affichée${visibleNotes.length > 1 ? 's' : ''}.`}
          </p>
          <div className="grid grid-cols-3 gap-[13px] max-[650px]:grid-cols-1">
            {visibleNotes.map((note, index) => {
              const featured = index === 0;
              return (
                <article
                  key={note.id}
                  className={cn(
                    'panel-surface flex min-h-[170px] flex-col rounded-[16px] p-[17px]',
                    featured && 'border-accent/20 bg-accent-faint',
                  )}
                >
                  <div className="flex items-center justify-between gap-2 text-[10px] font-extrabold tracking-[0.08em] text-muted uppercase">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className={cn('size-2 shrink-0 rounded-full', toneDot[noteCategoryTone(note.category)])}
                      />
                      <span className="truncate">{note.category}</span>
                    </span>
                    <span className="shrink-0">{featured ? 'Épinglée' : note.ageLabel}</span>
                  </div>

                  <h3 className="mt-[15px] mb-1.5 font-display text-[17px] tracking-[-0.035em]">{note.title}</h3>
                  <p className="mb-4 text-xs leading-[1.55] text-muted">{noteExcerpt(note.content)}</p>

                  {note.attachments.length > 0 ? (
                    <ul className="m-0 mb-3 grid list-none gap-1.5 p-0" aria-label={`Fichiers joints à ${note.title}`}>
                      {note.attachments.map((attachment) => (
                        <li key={attachment.id}>
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 rounded-[9px] bg-bg px-2.5 py-2 text-xs transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint"
                          >
                            {isImageMime(attachment.mime) ? (
                              <img
                                src={attachment.url}
                                alt={`Aperçu de ${attachment.fileName}`}
                                className="size-8 shrink-0 rounded-[7px] border border-border object-cover"
                              />
                            ) : (
                              <span className="grid size-8 shrink-0 place-items-center rounded-[7px] border border-border bg-surface text-muted">
                                <Icon name="receipt" size="sm" />
                              </span>
                            )}
                            <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
                            <span className="shrink-0 text-[10px] text-muted">{formatBytes(attachment.size)}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mt-auto flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span>{noteVisibilityLabels[note.visibility]}</span>
                    {canWrite ? (
                      <span className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-[9px] hover:bg-coral-soft hover:text-coral"
                          aria-label={`Supprimer ${note.title}`}
                          onClick={() => setPendingDelete(note)}
                        >
                          <Icon name="trash" size="sm" />
                        </Button>
                        <button
                          type="button"
                          className="inline-flex min-h-11 items-center gap-1.5 px-1 text-[11px] font-extrabold text-accent-strong transition-colors duration-[var(--duration-quick)] hover:text-accent-deep"
                          onClick={() => openEdit(note)}
                        >
                          Modifier
                          <Icon name="arrow" size="sm" />
                        </button>
                      </span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      <NoteFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        note={dialog.note}
        initialFolderId={activeFolderId}
        folders={folders}
        isSaving={isMutating}
        onSubmit={async (values, files, removedAttachmentIds) => {
          const editing = dialog.note;
          try {
            if (editing) await editNote(editing, values, files, removedAttachmentIds);
            else await addNote(values, files);
            closeDialog();
            toast(editing ? 'Note mise à jour.' : 'Note enregistrée dans votre espace.');
          } catch (submissionError) {
            toast(
              submissionError instanceof Error
                ? submissionError.message
                : 'La note n’a pas pu être enregistrée.',
              'error',
            );
          }
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Supprimer « ${pendingDelete?.title ?? ''} » ?`}
        description="Cette note disparaîtra de l’espace du foyer. Cette action est définitive."
        confirmLabel="Supprimer la note"
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (!target) return;
          void removeNote(target)
            .then(() => toast('Note supprimée.'))
            .catch((removalError: unknown) =>
              toast(
                removalError instanceof Error ? removalError.message : 'La note n’a pas pu être supprimée.',
                'error',
              ),
            );
        }}
      />
    </ModuleShell>
  );
}
