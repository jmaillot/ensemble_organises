import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import type { FolderVisibility } from '@/types';

/** Forme minimale d'un dossier, commune aux trois modules. */
export interface FolderLike {
  id: string;
  name: string;
  visibility: FolderVisibility;
  is_default: boolean;
  owner_member_id: string;
}

export interface FolderTabsProps {
  folders: readonly FolderLike[];
  /** `null` = Général (items sans dossier). */
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (name: string, visibility: FolderVisibility) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (folder: FolderLike) => Promise<void>;
  /** Faux pour le rôle `enfant` (lecture seule) : masque création/gestion. */
  canManage: boolean;
  label: string;
}

/**
 * Onglets Général + dossiers : `tablist` accessible, pastille 🔒 sur les
 * persos, création/renommage/suppression avec confirmation (la suppression
 * range le contenu dans Général, elle ne le détruit pas).
 */
export function FolderTabs({ folders, activeId, onSelect, onCreate, onRename, onDelete, canManage, label }: FolderTabsProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  // Le bouton « Général » ci-dessous couvre les items sans dossier (`null`) :
  // la ligne seedée `is_default` de même nom ne doit ni doubler l'onglet, ni
  // apparaître dans « Gérer » (le trigger `guard_folder_default` refuse toute
  // modification, les boutons n'y produiraient que des erreurs).
  const sorted = [...folders].filter((folder) => !folder.is_default).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-1.5">
        <button
          type="button"
          role="tab"
          aria-selected={activeId === null}
          onClick={() => onSelect(null)}
          className={
            activeId === null
              ? 'rounded-full bg-accent px-3.5 py-2 text-[12px] font-extrabold text-white'
              : 'rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-bold text-muted hover:text-fg'
          }
        >
          Général
        </button>
        {sorted.map((folder) => (
          <button
            key={folder.id}
            type="button"
            role="tab"
            aria-selected={activeId === folder.id}
            onClick={() => onSelect(folder.id)}
            className={
              activeId === folder.id
                ? 'rounded-full bg-accent px-3.5 py-2 text-[12px] font-extrabold text-white'
                : 'rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-bold text-muted hover:text-fg'
            }
          >
            {folder.name}
            {folder.visibility === 'perso' ? ' (perso)' : ''}
          </button>
        ))}
      </div>
      {canManage ? (
        <>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-label="Nouveau dossier"
            className="rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-bold text-muted hover:text-fg"
          >
            + Dossier
          </button>
          {sorted.length > 0 ? (
            <button
              type="button"
              onClick={() => setManageOpen(true)}
              aria-label="Gérer les dossiers"
              className="rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-bold text-muted hover:text-fg"
            >
              Gérer
            </button>
          ) : null}
        </>
      ) : null}
      <FolderCreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={onCreate} />
      <FolderManageDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        folders={sorted}
        onRename={onRename}
        onDelete={onDelete}
      />
    </div>
  );
}

function FolderCreateDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, visibility: FolderVisibility) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<FolderVisibility>('foyer');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    void onCreate(name, visibility)
      .then(() => {
        onOpenChange(false);
        setName('');
        setVisibility('foyer');
      })
      .catch((createError: unknown) =>
        setError(createError instanceof Error ? createError.message : 'Le dossier n’a pas pu être créé.'),
      )
      .finally(() => setIsSaving(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau dossier</DialogTitle>
          <DialogDescription>Rangez vos éléments par thème. Un dossier perso n’est visible que par vous.</DialogDescription>
        </DialogHeader>
        <form noValidate className="grid gap-3.5" onSubmit={submit}>
          <Field label="Nom du dossier" error={error ?? undefined}>
            {(props) => (
              <Input {...props} value={name} onChange={(change) => setName(change.target.value)} maxLength={80} autoComplete="off" />
            )}
          </Field>
          <Field label="Visibilité">
            {(props) => (
              <Select {...props} value={visibility} onChange={(change) => setVisibility(change.target.value as FolderVisibility)}>
                <option value="foyer">Foyer — tout le monde voit</option>
                <option value="perso">Perso — seul vous voyez</option>
              </Select>
            )}
          </Field>
          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="plus" disabled={isSaving || name.trim() === ''}>
              Créer le dossier
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FolderManageDialog({
  open,
  onOpenChange,
  folders,
  onRename,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: readonly FolderLike[];
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (folder: FolderLike) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<FolderLike | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const startRename = (folder: FolderLike) => {
    setEditingId(folder.id);
    setDraft(folder.name);
  };

  const submitRename = (id: string) => {
    setIsSaving(true);
    void onRename(id, draft)
      .then(() => setEditingId(null))
      .finally(() => setIsSaving(false));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gérer les dossiers</DialogTitle>
            <DialogDescription>Renommez ou supprimez un dossier. Le Général ne se modifie pas.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2.5">
            {folders.map((folder) => (
              <div key={folder.id} className="flex items-center gap-2 rounded-[11px] border border-border px-3 py-2.5">
                {editingId === folder.id ? (
                  <>
                    <Input
                      aria-label={`Renommer ${folder.name}`}
                      value={draft}
                      onChange={(change) => setDraft(change.target.value)}
                      maxLength={80}
                      autoComplete="off"
                    />
                    <Button variant="secondary" disabled={isSaving || draft.trim() === ''} onClick={() => submitRename(folder.id)}>
                      OK
                    </Button>
                  </>
                ) : (
                  <>
                    <strong className="min-w-0 flex-1 truncate text-[13px]">
                      {folder.name}
                      {folder.visibility === 'perso' ? ' 🔒' : ''}
                    </strong>
                    <button
                      type="button"
                      onClick={() => startRename(folder)}
                      aria-label={`Renommer ${folder.name}`}
                      className="grid size-[30px] place-items-center rounded-[9px] border border-border bg-surface text-muted hover:text-fg"
                    >
                      <Icon name="edit" size="sm" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(folder)}
                      aria-label={`Supprimer ${folder.name}`}
                      className="grid size-[30px] place-items-center rounded-[9px] border border-border bg-surface text-muted hover:text-coral"
                    >
                      <Icon name="trash" size="sm" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null);
        }}
        title={`Supprimer « ${pendingDelete?.name ?? ''} » ?`}
        description="Son contenu retombera dans Général, il ne sera pas perdu."
        confirmLabel="Supprimer le dossier"
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (!target) return;
          void onDelete(target).then(() => onOpenChange(false));
        }}
      />
    </>
  );
}
