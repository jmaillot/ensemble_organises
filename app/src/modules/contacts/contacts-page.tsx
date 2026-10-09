import { useMemo, useState } from 'react';
import { ModuleShell, MetricRow, Panel } from '@/components/shared/module-shell';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { Icon } from '@/components/shared/icon';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows, OfflineEmptyState } from '@/components/ui/empty-state';
import { useOnline } from '@/hooks/use-online';
import { DataError } from '@/lib/data';
import { SearchInput } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { cn, pluralize } from '@/lib/utils';
import { ContactFormDialog } from './components/contact-form-dialog';
import { useHouseholdStore } from '@/stores/household-store';
import { useContacts } from './hooks/use-contacts';
import { formatFrDate } from './types';
import type { Contact } from './types';

export default function ContactsPage() {
  const toast = useToast();
  const { lists, contacts, contactsOfList, isLoading, isError, error, refetch, isMutating, saveContact, removeContact, moveToFamily } =
    useContacts();
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; contact: Contact | null }>({ open: false, contact: null });
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);
  const [pendingMove, setPendingMove] = useState<Contact | null>(null);

  // La liste « Famille » partagée est proposée par défaut.
  const effectiveListId = activeListId ?? lists.find((list) => list.isShared)?.id ?? lists[0]?.id ?? null;
  const activeList = lists.find((list) => list.id === effectiveListId) ?? null;
  const familyList = lists.find((list) => list.isShared) ?? null;
  const listsById = useMemo(() => new Map(lists.map((list) => [list.id, list])), [lists]);

  /**
   * Déplacement vers Famille (D-04) : proposé sur les fiches des listes
   * personnelles du membre connecté uniquement — jamais sur un contact
   * Famille, jamais sur la liste d'un autre membre.
   */
  const canMoveToFamily = (contact: Contact) => {
    if (!familyList) return false;
    const list = listsById.get(contact.listId);
    return list !== undefined && !list.isShared && list.ownerMemberId === currentMemberId;
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = contactsOfList(effectiveListId);
    if (needle === '') return rows;
    return rows.filter((contact) => contact.name.toLowerCase().includes(needle));
  }, [contactsOfList, effectiveListId, query]);

  const withDates = useMemo(() => contacts.filter((contact) => contact.birthDate !== null).length, [contacts]);

  const openCreate = () => setDialog({ open: true, contact: null });
  const openEdit = (contact: Contact) => setDialog({ open: true, contact });
  const online = useOnline();
  // Cache vide hors ligne (D-07, 09-05) : même prédicat que le motif 09-03,
  // adopté au niveau de la page (listes + fiches : rien en cache du tout).
  const isEmptyCacheOffline =
    !online && lists.length === 0 && contacts.length === 0 && (isLoading || isError);

  return (
    <ModuleShell
      module="contacts"
      actions={
        <Button icon="plus" onClick={openCreate}>
          Ajouter un contact
        </Button>
      }
    >
      <MetricRow
        items={[
          { label: 'Listes', value: lists.length, caption: 'famille + personnelles' },
          { label: 'Fiches', value: contacts.length, caption: 'dans le foyer' },
          { label: 'Avec date', value: withDates, caption: 'suivies en anniversaires' },
          {
            label: 'Recherche',
            value: query.trim() === '' ? 'Inactive' : pluralize(visible.length, 'résultat'),
            caption: activeList?.name ?? 'aucune liste',
          },
        ]}
      />

      {isEmptyCacheOffline ? (
        <OfflineEmptyState onRetry={refetch} />
      ) : isError ? (
        <ErrorState message={error?.message ?? 'Les contacts du foyer n’ont pas pu être chargés.'} onRetry={refetch} />
      ) : (
        <Panel
          id="contact-list-panel"
          title="Contacts du foyer"
          description="Famille partagée et listes personnelles, au même endroit."
          action={
            <SearchInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un contact"
              aria-label="Rechercher un contact"
              containerClassName="w-[200px]"
              className="min-h-10"
            />
          }
        >
          {isLoading ? (
            <LoadingRows rows={4} />
          ) : lists.length === 0 ? (
            <EmptyState
              icon="people"
              title="Aucune liste de contacts."
              description="Les listes Famille et personnelles sont créées automatiquement à l’arrivée d’un membre."
              actionLabel="Recharger"
              onAction={refetch}
            />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Choisir une liste de contacts">
                {lists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => setActiveListId(list.id)}
                    aria-pressed={list.id === effectiveListId}
                    className={cn(
                      'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-xs font-extrabold transition-colors duration-[var(--duration-quick)]',
                      list.id === effectiveListId
                        ? 'border-accent-strong bg-accent-faint text-accent-strong'
                        : 'border-border bg-surface text-muted hover:border-accent hover:text-fg',
                    )}
                  >
                    {list.isShared ? <Icon name="people" size="sm" /> : null}
                    {list.isShared ? 'Famille' : list.name}
                    {list.isShared ? null : (
                      <span className="font-normal text-muted">· perso</span>
                    )}
                  </button>
                ))}
              </div>

              {visible.length === 0 ? (
                query.trim() === '' ? (
                  <EmptyState
                    icon="plus"
                    title={`Aucun contact dans « ${activeList?.name ?? 'cette liste'} ».`}
                    description="Ajoutez une première fiche : une date de naissance l’ajoute aux anniversaires."
                    actionLabel="Ajouter un contact"
                    onAction={openCreate}
                  />
                ) : (
                  <p className="m-0 text-xs text-muted" role="status">
                    Aucun contact ne correspond à « {query.trim()} ».
                  </p>
                )
              ) : (
                <div className="grid" role="list" aria-label="Liste des contacts">
                  {visible.map((contact) => (
                    <div
                      key={contact.id}
                      role="listitem"
                      className="flex items-center gap-3 border-t border-border py-3.5 first:border-t-0 first:pt-0"
                    >
                      {contact.photoUrl ? (
                        <img
                          src={contact.photoUrl}
                          alt={`Photo de ${contact.name}`}
                          className="size-11 shrink-0 rounded-full border border-border object-cover"
                        />
                      ) : (
                        <MemberAvatar member={contact.linkedMember} name={contact.name} size="lg" />
                      )}
                      <div className="min-w-0 flex-1">
                        <strong className="block text-[13px]">{contact.name}</strong>
                        <small className="text-[11px] text-muted">
                          {contact.birthDate ? `Né(e) le ${formatFrDate(contact.birthDate)}` : 'Sans date de naissance'}
                          {contact.linkedMember ? ` · ${contact.linkedMember.display_name}` : ''}
                        </small>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {canMoveToFamily(contact) ? (
                          <button
                            type="button"
                            onClick={() => setPendingMove(contact)}
                            aria-label={`Déplacer la fiche de ${contact.name} vers Famille`}
                            title="Déplacer vers Famille"
                            className="grid min-h-[44px] min-w-[44px] place-items-center rounded-[9px] border border-border bg-surface text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint hover:text-fg"
                          >
                            <Icon name="send" size="sm" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openEdit(contact)}
                          aria-label={`Modifier la fiche de ${contact.name}`}
                          className="grid min-h-[44px] min-w-[44px] place-items-center rounded-[9px] border border-border bg-surface text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint hover:text-fg"
                        >
                          <Icon name="edit" size="sm" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(contact)}
                          aria-label={`Supprimer la fiche de ${contact.name}`}
                          className="grid min-h-[44px] min-w-[44px] place-items-center rounded-[9px] border border-border bg-surface text-muted transition-colors duration-[var(--duration-quick)] hover:border-coral hover:bg-coral-soft hover:text-coral"
                        >
                          <Icon name="trash" size="sm" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Panel>
      )}

      <ContactFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        contact={dialog.contact}
        lists={lists}
        existingContacts={contacts}
        isSaving={isMutating}
        onSubmit={async (values) => {
          const editing = dialog.contact;
          try {
            await saveContact(editing?.id ?? null, values);
            setDialog({ open: false, contact: null });
            toast(editing ? 'Modification enregistrée.' : 'Contact ajouté au foyer.');
          } catch (error) {
            // Mise en file hors ligne (D-07) : promesse de rejeu, jamais d'erreur.
            if (error instanceof DataError && error.queuedForSync) {
              setDialog({ open: false, contact: null });
              toast('Contact ajouté — il sera synchronisé au retour du réseau.');
              return;
            }
            toast(error instanceof Error ? error.message : 'Le contact n’a pas pu être enregistré.', 'error');
          }
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Supprimer la fiche de ${pendingDelete?.name ?? ''} ?`}
        description="La fiche sera retirée de sa liste, et son anniversaire miroir sera supprimé lui aussi."
        confirmLabel="Supprimer"
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (!target) return;
          void removeContact(target.id)
            .then(() => toast('Contact supprimé.'))
            .catch((error: unknown) =>
              toast(error instanceof Error ? error.message : 'Le contact n’a pas pu être supprimé.', 'error'),
            );
        }}
      />

      <ConfirmDialog
        open={pendingMove !== null}
        onOpenChange={(open) => {
          if (!open) setPendingMove(null);
        }}
        title={`Déplacer « ${pendingMove?.name ?? ''} » vers Famille ?`}
        description="La fiche sera visible par tout le foyer, et son anniversaire sera partagé avec tous les membres."
        confirmLabel="Déplacer vers Famille"
        destructive={false}
        onConfirm={() => {
          const target = pendingMove;
          setPendingMove(null);
          if (!target) return;
          void moveToFamily(target.id)
            .then(() => toast('Contact visible par tout le foyer.'))
            .catch((error: unknown) =>
              toast(error instanceof Error ? error.message : 'Le contact n’a pas pu être déplacé.', 'error'),
            );
        }}
      />
    </ModuleShell>
  );
}
