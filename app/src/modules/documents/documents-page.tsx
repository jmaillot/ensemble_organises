import { useMemo, useState } from 'react';
import { ModuleShell, Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { Fab } from '@/components/ui/fab';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, LoadingRows } from '@/components/ui/empty-state';
import { Icon } from '@/components/shared/icon';
import { SearchInput } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useCurrentMember } from '@/stores/household-store';
import { useDocuments } from './hooks/use-documents';
import { DocumentDialog } from './components/document-dialog';
import { DocumentFolderDialog } from './components/document-folder-dialog';
import { documentExpiryLabels, documentExpiryStateOf, documentExpiryToneClass, documentFolderColorClasses, documentKindOf, formatDocumentSize, type Document, type DocumentFolder, type DocumentFolderFormValues, type DocumentFormValues } from './types';
import { formatIsoDateFr } from '@/modules/frigo/types';

interface DialogState {
  open: boolean;
  document: Document | null;
}

/**
 * Documents du foyer (vague 3.2) : les papiers du foyer — factures,
 * contrats, ordonnances — rassemblés en dossiers colorés, photo ou PDF,
 * avec échéances et notes. Les données vivent dans `documents` (0143).
 */
export default function DocumentsPage() {
  const documents = useDocuments();
  const toast = useToast();
  const canWrite = useCurrentMember()?.role !== 'enfant';
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<DialogState>({ open: false, document: null });
  /** null = création, sinon édition du dossier (id). */
  const [folderDialog, setFolderDialog] = useState<{ open: boolean; folder: DocumentFolder | null }>({ open: false, folder: null });
  const [activeFolderId, setActiveFolderId] = useState<string | 'tous' | 'racine'>('tous');
  const [toRemove, setToRemove] = useState<Document | null>(null);
  const [folderToRemove, setFolderToRemove] = useState<DocumentFolder | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return documents.sortedDocuments
      .filter((document) =>
        activeFolderId === 'tous'
          ? true
          : activeFolderId === 'racine'
            ? document.folderId === null
            : document.folderId === activeFolderId,
      )
      .filter((document) =>
        needle === '' ? true : document.name.toLowerCase().includes(needle) || (document.notes ?? '').toLowerCase().includes(needle),
      );
  }, [documents.sortedDocuments, query, activeFolderId]);

  const openCreate = () => setDialog({ open: true, document: null });
  const openEdit = (document: Document) => setDialog({ open: true, document });

  const handleSave = async (values: DocumentFormValues) => {
    try {
      await documents.saveDocument(dialog.document?.id ?? null, values);
      toast(dialog.document ? 'Document mis à jour.' : 'Document ajouté.');
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : 'Enregistrement impossible.', 'error');
      throw saveError;
    }
  };

  const handleSaveFolder = async (values: DocumentFolderFormValues) => {
    try {
      await documents.saveFolder(folderDialog.folder?.id ?? null, values);
      toast(folderDialog.folder ? 'Dossier mis à jour.' : 'Dossier créé.');
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : 'Enregistrement impossible.', 'error');
      throw saveError;
    }
  };

  const handleRemoveFolder = async () => {
    if (!folderToRemove) return;
    try {
      await documents.removeFolder(folderToRemove.id);
      // Les documents retombent à la racine (0143) : si le dossier filtré
      // disparaît, on revient à la vue complète.
      if (activeFolderId === folderToRemove.id) setActiveFolderId('tous');
      toast(`Dossier « ${folderToRemove.name} » supprimé. Ses documents sont à la racine.`);
    } catch (removeError) {
      toast(removeError instanceof Error ? removeError.message : 'Suppression impossible.', 'error');
    } finally {
      setFolderToRemove(null);
    }
  };

  const handleRemove = async () => {
    if (!toRemove) return;
    try {
      await documents.removeDocument(toRemove);
      toast(`« ${toRemove.name} » retiré du foyer.`);
    } catch (removeError) {
      toast(removeError instanceof Error ? removeError.message : 'Suppression impossible.', 'error');
    } finally {
      setToRemove(null);
    }
  };

  return (
    <ModuleShell
      module="documents"
      infoTo="/documents/aide"
      actions={
        canWrite ? (
          <>
            <Button variant="secondary" icon="archive" onClick={() => setFolderDialog({ open: true, folder: null })}>
              Nouveau dossier
            </Button>
            <Button icon="plus" onClick={openCreate} className="max-[650px]:hidden">
              Ajouter un document
            </Button>
          </>
        ) : (
          <span className="text-[11px] text-muted">Lecture seule pour les profils enfant</span>
        )
      }
    >
      <Panel
        id="documents-panel"
        title="Les documents"
        description="Factures, contrats, ordonnances : la boîte à papiers du foyer."
        action={
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un document"
            aria-label="Rechercher un document du foyer"
            containerClassName="w-[190px]"
            className="min-h-10"
          />
        }
      >
        {/* Pastilles de dossiers : « Tous », « Racine » puis chaque dossier
            coloré avec son comptage. Créer / gérer reste accessible via
            l'en-tête du module. */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveFolderId('tous')}
            aria-pressed={activeFolderId === 'tous'}
            className={
              activeFolderId === 'tous'
                ? 'rounded-full bg-accent px-3.5 py-1.5 text-[12px] font-[700] text-white'
                : 'rounded-full border border-border bg-surface px-3.5 py-1.5 text-[12px] font-[600] text-muted transition-colors hover:border-accent hover:text-fg'
            }
          >
            Tous ({documents.sortedDocuments.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFolderId('racine')}
            aria-pressed={activeFolderId === 'racine'}
            className={
              activeFolderId === 'racine'
                ? 'rounded-full bg-accent px-3.5 py-1.5 text-[12px] font-[700] text-white'
                : 'rounded-full border border-border bg-surface px-3.5 py-1.5 text-[12px] font-[600] text-muted transition-colors hover:border-accent hover:text-fg'
            }
          >
            Sans dossier ({documents.countByFolder(null)})
          </button>
          {documents.folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => setActiveFolderId(folder.id)}
              aria-pressed={activeFolderId === folder.id}
              className={
                activeFolderId === folder.id
                  ? 'flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[12px] font-[700] text-white'
                  : 'flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[12px] font-[600] text-muted transition-colors hover:border-accent hover:text-fg'
              }
            >
              <span className={`size-2.5 rounded-full ${documentFolderColorClasses[folder.color]}`} aria-hidden="true" />
              {folder.name} ({documents.countByFolder(folder.id)})
            </button>
          ))}
        </div>
        {documents.isError ? (
          <EmptyState
            icon="archive"
            title="Les documents n'ont pas pu être chargés."
            description={documents.error?.message ?? 'Réessayez dans un instant.'}
            actionLabel="Recharger"
            onAction={documents.refetch}
          />
        ) : documents.isLoading ? (
          <LoadingRows rows={4} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="archive"
            title={query.trim() !== '' ? 'Aucun document ne correspond.' : activeFolderId !== 'tous' ? 'Ce dossier est vide.' : 'La boîte à papiers est vide.'}
            description={
              query.trim() !== ''
                ? 'Essayez un autre mot, ou ajoutez le document s’il manque.'
                : 'Photographiez un papier ou déposez un PDF : il sera à portée de main, pour tout le foyer.'
            }
            actionLabel={canWrite && query.trim() === '' && activeFolderId === 'tous' ? 'Ajouter un document' : undefined}
            onAction={canWrite && query.trim() === '' && activeFolderId === 'tous' ? openCreate : undefined}
          />
        ) : (
          <ul className="m-0 grid list-none gap-1 p-0">
            {visible.map((document) => (
              <DocumentRow key={document.id} document={document} today={documents.today} canWrite={canWrite} onEdit={openEdit} onRemove={setToRemove} />
            ))}
          </ul>
        )}
      </Panel>

      <DocumentDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((state) => ({ ...state, open }))}
        document={dialog.document}
        onSave={handleSave}
      />
      <DocumentFolderDialog
        open={folderDialog.open}
        onOpenChange={(open) => setFolderDialog((state) => ({ ...state, open }))}
        folder={folderDialog.folder}
        onSave={handleSaveFolder}
      />
      <ConfirmDialog
        open={folderToRemove !== null}
        onOpenChange={(open) => (!open ? setFolderToRemove(null) : undefined)}
        title={`Supprimer le dossier « ${folderToRemove?.name ?? ''} » ?`}
        description="Les documents qu'il contenait retombent à la racine : rien n'est détruit. Le dossier, lui, disparaît."
        confirmLabel="Supprimer le dossier"
        onConfirm={() => void handleRemoveFolder()}
      />
      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(open) => (!open ? setToRemove(null) : undefined)}
        title={`Retirer « ${toRemove?.name ?? ''} » du foyer ?`}
        description="Le papier disparaît du foyer, ainsi que son fichier. Cette action est définitive."
        confirmLabel="Retirer"
        onConfirm={() => void handleRemove()}
      />

      {/* L'action principale à portée de pouce sur tactile ; l'en-tête la
          porte déjà au-delà de 650 px, le secondaire reste visible partout. */}
      {canWrite ? (
        <Fab icon="plus" label="Ajouter un document" onClick={openCreate} className="min-[651px]:hidden" />
      ) : null}
    </ModuleShell>
  );
}

function DocumentRow({
  document,
  today,
  canWrite,
  onEdit,
  onRemove,
}: {
  document: Document;
  today: string;
  canWrite: boolean;
  onEdit: (document: Document) => void;
  onRemove: (document: Document) => void;
}) {
  const state = documentExpiryStateOf(document.expiresOn, today);
  const kind = documentKindOf(document.mime);
  return (
    <li className="flex min-h-[56px] min-w-0 items-center gap-3 rounded-[14px] px-2.5 py-1.5 transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint">
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-strong">
        <Icon name={kind === 'image' ? 'image' : 'receipt'} size="sm" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[13.5px] font-[650] text-fg">{document.name}</strong>
        <span className="block truncate text-[11px] text-muted">
          {kind === 'image' ? 'Image' : 'PDF'}
          {document.size ? ` · ${formatDocumentSize(document.size)}` : ''}
          {document.notes ? ` · ${document.notes}` : ''}
        </span>
      </span>
      {document.expiresOn ? (
        <span className="hidden shrink-0 text-[11px] text-muted min-[651px]:inline">{formatIsoDateFr(document.expiresOn)}</span>
      ) : null}
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-[700] ${documentExpiryToneClass[state]}`}>
        {documentExpiryLabels[state]}
      </span>
      {canWrite ? (
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onEdit(document)}
            aria-label={`Modifier ${document.name}`}
            className="grid size-8 place-items-center rounded-full border border-border/70 bg-surface text-muted transition-colors hover:border-accent hover:text-fg"
          >
            <Icon name="edit" size="sm" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(document)}
            aria-label={`Retirer ${document.name}`}
            className="grid size-8 place-items-center rounded-full border border-border/70 bg-surface text-muted transition-colors hover:border-coral hover:text-coral"
          >
            <Icon name="trash" size="sm" />
          </button>
        </div>
      ) : null}
    </li>
  );
}
