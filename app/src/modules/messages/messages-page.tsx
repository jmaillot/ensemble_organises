import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { MetricRow, ModuleShell } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useIsAdmin, useMembers } from '@/stores/household-store';
import { ChatPanel } from './components/chat-panel';
import { ConversationList } from './components/conversation-list';
import { AddMembersDialog, ConversationFormDialog } from './components/conversation-form-dialog';
import { useMessagesFeed, useMessagesRealtime, useThreadPage } from './hooks/use-messages';

export default function MessagesPage() {
  const feed = useMessagesFeed();
  const members = useMembers();
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingArchive, setPendingArchive] = useState<string | null>(null);
  const [pendingLeave, setPendingLeave] = useState<string | null>(null);
  const [pendingArchiveRemoval, setPendingArchiveRemoval] = useState<string | null>(null);
  const [listVisible, setListVisible] = useState(true);
  const { markRead } = feed;
  const isAdmin = useIsAdmin();

  useMessagesRealtime();

  const conversations = feed.conversations;
  const archivedConversations = feed.archivedConversations;
  const active =
    conversations.find((conversation) => conversation.id === selectedId) ??
    archivedConversations.find((conversation) => conversation.id === selectedId) ??
    conversations[0] ??
    null;
  const activeId = active?.id ?? null;
  const isArchived = active?.isArchived ?? false;

  // Ouvrir une conversation la marque comme lue (mise à jour optimiste).
  useEffect(() => {
    if (activeId) markRead(activeId);
  }, [activeId, markRead]);

  // Le fil ouvert est paginé par conversation (D-05) ; son compte de
  // non-lus exact remplace le signal d'aperçu dans le total affiché.
  const thread = useThreadPage(activeId);
  const unreadTotal = feed.unreadTotal - (active?.unread ?? 0) + thread.unread;

  // Départ volontaire : le registre déclaré arbitre (jamais le repli
  // expéditrices), et le dernier membre restant ne peut pas quitter — bouton
  // désactivé avec copie explicative plutôt qu'un refus serveur.
  const declaredIds = activeId ? (feed.memberIdsByConversation.get(activeId) ?? []) : [];
  const iAmDeclaredMember = declaredIds.includes(feed.currentMemberId);
  const leaveDisabledReason = !iAmDeclaredMember
    ? null
    : declaredIds.length > 1
      ? null
      : 'Vous êtes le dernier membre de cette conversation : archivez-la (admin) pour la figer.';
  // Fil solo (D-11) : un seul membre actif dans le registre déclaré — signalé
  // au compositeur comme indication, jamais comme blocage d'envoi. Même
  // source que le bouton Quitter (pierres exclues), aucune requête ajoutée ;
  // les archives n'ont pas de compositeur, donc pas d'avis.
  const isSolo = !isArchived && activeId !== null && declaredIds.length === 1;
  const leavingTitle = active?.title ?? 'cette conversation';

  if (feed.isError) {
    return (
      <ModuleShell module="messages">
        <ErrorState
          message={feed.error?.message ?? 'La messagerie est momentanément inaccessible.'}
          onRetry={feed.refetch}
        />
      </ModuleShell>
    );
  }

  if (conversations.length === 0 && archivedConversations.length === 0) {
    return (
      <ModuleShell module="messages">
        {feed.isLoading ? <LoadingRows rows={4} /> : (
          <EmptyState
            icon="message"
            title="Aucune conversation"
            description="Les échanges de votre foyer apparaîtront ici dès qu’une conversation sera ouverte. Les messages privés restent dans le périmètre du foyer."
            actionLabel="Démarrer une conversation"
            onAction={() => setCreateOpen(true)}
          />
        )}
        <ConversationFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          members={members}
          currentMemberId={feed.currentMemberId}
          isSaving={feed.isCreating}
          onSubmit={async (values) => {
            try {
              const id = await feed.createConversation(values);
              setCreateOpen(false);
              setSelectedId(id);
              toast('Conversation démarrée.');
            } catch (error) {
              toast(error instanceof Error ? error.message : 'La conversation n’a pas pu être créée.', 'error');
            }
          }}
        />
      </ModuleShell>
    );
  }

  const eligible = members.filter(
    (member) => active && !isArchived && !active.participants.some((participant) => participant.id === member.id),
  );

  return (
    <ModuleShell
      module="messages"
      actions={
        <Button icon="edit" onClick={() => setCreateOpen(true)}>
          Nouveau message
        </Button>
      }
    >
      <MetricRow
        items={[
          { label: 'Messages', value: thread.total, caption: 'dans ce fil' },
          { label: 'Non lus', value: unreadTotal, caption: 'dans vos conversations' },
          { label: 'Membres', value: members.length, caption: 'dans le foyer' },
          { label: 'Synchronisation', value: 'Direct', caption: 'temps réel' },
        ]}
      />

      <div className="grid min-h-[520px] grid-cols-[290px_minmax(0,1fr)] gap-3.5 max-[920px]:min-h-0 max-[920px]:grid-cols-1">
        <ConversationList
          conversations={conversations}
          archivedConversations={archivedConversations}
          activeId={activeId}
          isLoading={feed.isLoading}
          onSelect={(conversationId) => {
            setSelectedId(conversationId);
            setListVisible(false);
          }}
          className={cn(
            'panel-surface rounded-[16px] p-2.5 max-[920px]:max-h-[260px] max-[920px]:overflow-auto',
            listVisible ? '' : 'max-[650px]:hidden',
          )}
        />
        <ChatPanel
          conversation={active}
          messages={thread.messages}
          isSending={feed.isSending}
          readOnly={isArchived}
          showSoloNotice={isSolo}
          onRemoveArchived={isArchived && active ? () => setPendingArchiveRemoval(active.id) : undefined}
          pageInfo={
            active
              ? {
                  hasMoreBefore: thread.hasMoreBefore,
                  remainingBefore: thread.remainingBefore,
                  loaded: thread.loaded,
                  total: thread.total,
                }
              : undefined
          }
          isLoadingMore={thread.isLoadingMore}
          onLoadMore={thread.loadMore}
          onSend={(content) => {
            if (!active || isArchived) return;
            void feed.send(active.id, content).catch((error: unknown) => {
              toast(error instanceof Error ? error.message : 'Message non envoyé.', 'error');
            });
          }}
          onSendMedia={
            active && !isArchived
              ? (content, image) => {
                  void feed.sendMedia(active.id, content, image).catch((error: unknown) => {
                    toast(error instanceof Error ? error.message : 'Image non envoyée.', 'error');
                  });
                }
              : undefined
          }
          onAddMember={active && !isArchived ? () => setAddOpen(true) : undefined}
          onArchiveConversation={active && isAdmin ? () => setPendingArchive(active.id) : undefined}
          onEditMessage={
            active && !isArchived
              ? (messageId, content) => {
                  void feed
                    .editMessage(active.id, messageId, content)
                    .then(() => toast('Message modifié.'))
                    .catch((error: unknown) => {
                      toast(error instanceof Error ? error.message : 'Le message n’a pas pu être modifié.', 'error');
                    });
                }
              : undefined
          }
          onDeleteMessage={
            active && !isArchived
              ? (messageId) => {
                  void feed
                    .deleteMessage(active.id, messageId)
                    .then(() => toast('Message supprimé.'))
                    .catch((error: unknown) => {
                      toast(error instanceof Error ? error.message : 'Le message n’a pas pu être supprimé.', 'error');
                    });
                }
              : undefined
          }
          onLeaveConversation={active && !isArchived && iAmDeclaredMember ? () => setPendingLeave(active.id) : undefined}
          leaveDisabledReason={leaveDisabledReason}
          onBackToList={() => setListVisible(true)}
          className={cn(
            'flex min-h-[460px] flex-col overflow-hidden rounded-[16px] border border-border bg-surface',
            listVisible ? 'max-[650px]:hidden' : '',
          )}
        />
      </div>

      <ConversationFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        members={members}
        currentMemberId={feed.currentMemberId}
        isSaving={feed.isCreating}
        onSubmit={async (values) => {
          try {
            const id = await feed.createConversation(values);
            setCreateOpen(false);
            setSelectedId(id);
            toast('Conversation démarrée.');
          } catch (error) {
            toast(error instanceof Error ? error.message : 'La conversation n’a pas pu être créée.', 'error');
          }
        }}
      />
      {active ? (
        <AddMembersDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          eligible={eligible}
          conversationTitle={active.title}
          isSaving={feed.isCreating}
          onSubmit={async (memberIds) => {
            try {
              await feed.addMembers(active.id, memberIds);
              setAddOpen(false);
              toast('Membre ajouté à la conversation.');
            } catch (error) {
              toast(error instanceof Error ? error.message : 'Ajout impossible.', 'error');
            }
          }}
        />
      ) : null}

      <ConfirmDialog
        open={pendingArchive !== null}
        onOpenChange={(open) => {
          if (!open) setPendingArchive(null);
        }}
        title="Archiver cette conversation ?"
        description="Le fil sera figé et restera visible dans les anciennes conversations de tous les membres, en lecture seule — plus personne ne pourra y écrire, vous compris."
        confirmLabel="Archiver"
        onConfirm={() => {
          const target = pendingArchive;
          setPendingArchive(null);
          if (!target) return;
          // La sélection reste sur le fil : il bascule dans les archives,
          // lecture seule, au lieu de disparaître.
          void feed
            .archiveConversation(target)
            .then(() => toast('Conversation archivée : elle reste dans vos anciennes conversations.'))
            .catch((error: unknown) =>
              toast(error instanceof Error ? error.message : 'La conversation n’a pas pu être archivée.', 'error'),
            );
        }}
      />

      <ConfirmDialog
        open={pendingLeave !== null}
        onOpenChange={(open) => {
          if (!open) setPendingLeave(null);
        }}
        title={`Quitter « ${leavingTitle} » ?`}
        description="La conversation restera dans vos anciennes conversations, figée à votre départ, en lecture seule. Vos messages restent visibles pour les autres membres."
        confirmLabel="Quitter la conversation"
        onConfirm={() => {
          const target = pendingLeave;
          setPendingLeave(null);
          if (!target) return;
          // La sélection reste sur le fil : il bascule dans les archives,
          // lecture seule, au lieu de disparaître.
          void feed
            .leaveConversation(target)
            .then(() => toast('Conversation quittée : elle reste dans vos anciennes conversations.'))
            .catch((error: unknown) =>
              toast(error instanceof Error ? error.message : 'Le départ n’a pas pu être enregistré.', 'error'),
            );
        }}
      />

      <ConfirmDialog
        open={pendingArchiveRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingArchiveRemoval(null);
        }}
        title="Retirer de vos archives ?"
        description="Ce fil disparaîtra de vos anciennes conversations. Les autres membres le conservent ; cette action ne supprime la conversation pour personne d’autre."
        confirmLabel="Retirer de mes archives"
        onConfirm={() => {
          const target = pendingArchiveRemoval;
          setPendingArchiveRemoval(null);
          if (!target) return;
          if (selectedId === target) {
            const fallback =
              conversations.find((conversation) => conversation.id !== target) ??
              archivedConversations.find((conversation) => conversation.id !== target) ??
              null;
            setSelectedId(fallback?.id ?? null);
          }
          void feed
            .removeArchivedConversation(target)
            .then(() => toast('Fil retiré de vos archives.'))
            .catch((error: unknown) =>
              toast(error instanceof Error ? error.message : 'Le retrait n’a pas pu être enregistré.', 'error'),
            );
        }}
      />
    </ModuleShell>
  );
}
