import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { Icon } from '@/components/shared/icon';
import { formatFrDate, findLikelyDuplicates, normalizeContactName, type Contact, type ContactList } from '../types';
import { VCARD_MAX_BYTES, parseVcf, type VcardPerson } from '../vcard';

/**
 * Import de contacts depuis un fichier vCard (.vcf).
 *
 * Trois garde-fous avant toute écriture : le fichier est limité en taille,
 * le contenu est lu puis montré (nom, date, marque de doublon), et rien
 * n'est créé avant le geste explicite. Une fiche de structure (société) ou
 * illisible est comptée et annoncée, jamais perdue en silence.
 */

export interface ContactImportSummary {
  imported: number;
  skippedDuplicates: number;
}

export interface ContactImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lists: ContactList[];
  existingContacts: Contact[];
  isImporting: boolean;
  /** Crée les fiches transmises dans la liste choisie, rend le compte créé. */
  onImport: (listId: string, people: VcardPerson[]) => Promise<number>;
}

/** Marque de doublon probable, même règle que le formulaire (D-04). */
interface PreviewRow {
  person: VcardPerson;
  duplicateOf: string | null;
  /** Doublon d'une autre fiche du même fichier (export en double). */
  duplicateInFile: boolean;
}

export function ContactImportDialog({
  open,
  onOpenChange,
  lists,
  existingContacts,
  isImporting,
  onImport,
}: ContactImportDialogProps) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ organizations: 0, invalid: 0, truncated: false });
  const [listId, setListId] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [fileName, setFileName] = useState('');

  // La liste par défaut dépend des listes chargées en asynchrone : posée dès
  // qu'elles sont là, sans jamais écraser un choix explicite.
  useEffect(() => {
    if (listId === '' && lists.length > 0) setListId(lists.find((list) => list.isShared)?.id ?? lists[0].id);
  }, [listId, lists]);

  const reset = () => {
    setRows(null);
    setFileError(null);
    setCounts({ organizations: 0, invalid: 0, truncated: false });
    setFileName('');
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    if (file.size > VCARD_MAX_BYTES) {
      setRows(null);
      setFileError('Fichier trop volumineux (512 Ko maximum) : ce n’est probablement pas un carnet d’adresses familial.');
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseVcf(text);
      // Marque de doublon : fiche existante du foyer, ou fiche antérieure du
      // même fichier (les exports en double existent). La clé est la même
      // garde de fusion que le formulaire (D-04, nom normalisé + mois-jour).
      const seenInFile = new Map<string, string>();
      const preview = parsed.people.map((person) => {
        const external = findLikelyDuplicates(
          { name: person.name, birthDate: person.birthDate },
          existingContacts,
        );
        const key = `${normalizeContactName(person.name)}|${person.birthDate?.slice(5) ?? ''}`;
        const inFile = seenInFile.get(key) ?? null;
        if (inFile === null) seenInFile.set(key, person.name);
        return {
          person,
          duplicateOf: external[0]?.name ?? inFile,
          duplicateInFile: inFile !== null,
        };
      });
      setRows(preview);
      setCounts({ organizations: parsed.organizations, invalid: parsed.invalid, truncated: parsed.truncated });
      setFileName(file.name);
    } catch {
      setRows(null);
      setFileError('Le fichier n’a pas pu être lu. Attendu : un carnet d’adresses exporté en .vcf.');
    }
  };

  const duplicates = rows?.filter((row) => row.duplicateOf !== null) ?? [];
  const toImport = rows?.filter((row) => !(skipDuplicates && row.duplicateOf !== null)) ?? [];
  const canImport = rows !== null && toImport.length > 0 && listId !== '';

  const runImport = async () => {
    if (!canImport) return;
    try {
      const imported = await onImport(
        listId,
        toImport.map((row) => row.person),
      );
      const skippedDuplicates = skipDuplicates ? duplicates.length : 0;
      toast(
        imported === 1
          ? 'Une fiche importée.'
          : `${imported} fiches importées.` +
              (skippedDuplicates > 0 ? ` ${skippedDuplicates} doublon(s) probable(s) ignoré(s).` : ''),
        'success',
      );
      reset();
      onOpenChange(false);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'L’import n’a pas pu aboutir.', 'error');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Contacts</p>
          <DialogTitle>Importer un carnet d’adresses</DialogTitle>
          <DialogDescription>
            Un fichier .vcf exporté de votre téléphone ou de Google Contacts. Le nom et la date de
            naissance sont repris ; une date crée aussi l anniversaire.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3.5">
          <div className="grid gap-2">
            <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-border bg-bg px-3.5 text-xs font-extrabold text-fg">
              <Icon name="send" size="sm" />
              {rows === null ? 'Choisir un fichier .vcf' : `Changer de fichier (${fileName})`}
              <input
                ref={fileRef}
                type="file"
                accept=".vcf,text/vcard,text/x-vcard"
                className="sr-only"
                aria-label="Fichier vCard à importer"
                onChange={(event) => {
                  void onPickFile(event.target.files?.[0]);
                  // Reprendre le même fichier doit relire : la valeur est vidée.
                  event.target.value = '';
                }}
              />
            </label>
            {fileError ? (
              <p role="alert" className="m-0 rounded-[11px] border border-coral/25 bg-coral-soft px-3.5 py-3 text-xs text-fg">
                {fileError}
              </p>
            ) : null}
          </div>

          {rows !== null && rows.length === 0 ? (
            <div className="rounded-[11px] border border-border bg-bg px-3.5 py-4 text-xs text-muted" role="status">
              <p className="m-0 mb-1.5 font-extrabold text-fg">Aucune fiche exploitable dans ce fichier.</p>
              {counts.organizations > 0 ? (
                <p className="m-0">
                  {counts.organizations} fiche(s) de structure (société) ignorée(s) : cet espace porte des personnes.
                </p>
              ) : (
                <p className="m-0">Vérifiez que le fichier est bien un carnet d’adresses exporté (.vcf), pas un export CSV.</p>
              )}
            </div>
          ) : null}

          {rows !== null && rows.length > 0 ? (
            <>
              <p className="m-0 text-xs text-muted" role="status">
                <strong className="font-extrabold text-fg">
                  {rows.length} fiche(s) lue(s).
                </strong>{' '}
                {counts.organizations > 0 ? `${counts.organizations} structure(s) ignorée(s). ` : ''}
                {counts.invalid > 0 ? `${counts.invalid} fiche(s) sans nom ignorée(s). ` : ''}
                {counts.truncated ? 'Fichier tronqué à la lecture (300 fiches maximum). ' : ''}
              </p>

              <Field label="Importer dans" error={undefined}>
                {(props) => (
                  <Select {...props} value={listId} onChange={(event) => setListId(event.target.value)}>
                    {lists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.isShared ? 'Famille (partagée)' : list.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <div className="max-h-64 overflow-y-auto rounded-[11px] border border-border" role="list" aria-label="Fiches à importer">
                {rows.map((row, index) => {
                  const excluded = skipDuplicates && row.duplicateOf !== null;
                  return (
                    <div
                      key={`${row.person.name}-${index}`}
                      role="listitem"
                      className={
                        'flex min-h-11 items-center gap-2.5 border-b border-border px-3 py-2 text-xs last:border-b-0 ' +
                        (excluded ? 'opacity-50' : '')
                      }
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-strong">
                        <Icon name="people" size="sm" />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-extrabold text-fg">{row.person.name}</span>
                      {row.person.birthDate ? (
                        <span className="shrink-0 text-muted">{formatFrDate(row.person.birthDate)}</span>
                      ) : (
                        <span className="shrink-0 text-muted/70">sans date</span>
                      )}
                      {row.duplicateOf !== null ? (
                        <span
                          className="shrink-0 rounded-full bg-coral-soft px-2 py-0.5 text-[11px] font-extrabold text-coral-text"
                          title={`Fiche proche existante : ${row.duplicateOf}`}
                        >
                          doublon ?
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 text-xs text-fg">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(event) => setSkipDuplicates(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent-strong)]"
                />
                <span>
                  Ne pas importer les doublons probables
                  {duplicates.length > 0 ? ` (${duplicates.length} dans ce fichier)` : ''}
                </span>
              </label>
            </>
          ) : null}
        </div>

        <DialogActions>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" icon="check" disabled={!canImport || isImporting} onClick={() => void runImport()}>
            {isImporting
              ? 'Import en cours…'
              : toImport.length === 1
                ? 'Importer la fiche'
                : `Importer ${toImport.length} fiches`}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
