import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { MetricRow, ModuleShell } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useMembers } from '@/stores/household-store';
import { ChatPanel } from './components/chat-panel';
import { ConversationList } from './components/conversation-list';
import { useMessagesFeed, useMessagesRealtime } from './hooks/use-messages';

export default function MessagesPage() {
  const feed = useMessagesFeed();
  const members = useMembers();
  const toast = useToast();
  const composerRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listVisible, setListVisible] = useState(true);
  const { markRead } = feed;

  useMessagesRealtime();

  const conversations = feed.conversations;
  const active = conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0] ?? null;
  const activeId = active?.id ?? null;

  // Ouvrir une conversation la marque comme lue (mise à jour optimiste).
  useEffect(() => {
    if (activeId) markRead(activeId);
  }, [activeId, markRead]);

  const thread = activeId ? (feed.messagesByConversation.get(activeId) ?? []) : [];

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

  if (conversations.length === 0) {
    return (
      <ModuleShell module="messages">
        {feed.isLoading ? <LoadingRows rows={4} /> : (
          <EmptyState
            icon="message"
            title="Aucune conversation"
            description="Les échanges de votre foyer apparaîtront ici dès qu’une conversation sera ouverte. Les messages privés restent dans le périmètre du foyer."
          />
        )}
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      module="messages"
      actions={
        <Button
          icon="edit"
          onClick={() => {
            if (!active) {
              toast('Choisissez d’abord une conversation.');
              return;
            }
            composerRef.current?.focus();
          }}
        >
          Nouveau message
        </Button>
      }
    >
      <MetricRow
        items={[
          { label: 'Messages', value: feed.totalMessages, caption: 'échanges récents' },
          { label: 'Non lus', value: feed.unreadTotal, caption: 'dans vos conversations' },
          { label: 'Membres', value: members.length, caption: 'dans le foyer' },
          { label: 'Synchronisation', value: 'Direct', caption: 'temps réel' },
        ]}
      />

      <div className="grid min-h-[520px] grid-cols-[290px_minmax(0,1fr)] gap-3.5 max-[920px]:min-h-0 max-[920px]:grid-cols-1">
        <ConversationList
          conversations={conversations}
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
          messages={thread}
          isSending={feed.isSending}
          onSend={(content) => {
            if (!active) return;
            void feed.send(active.id, content).catch((error: unknown) => {
              toast(error instanceof Error ? error.message : 'Message non envoyé.', 'error');
            });
          }}
          onBackToList={() => setListVisible(true)}
          composerRef={composerRef}
          className={cn(
            'flex min-h-[460px] flex-col overflow-hidden rounded-[16px] border border-border bg-surface',
            listVisible ? 'max-[650px]:hidden' : '',
          )}
        />
      </div>
    </ModuleShell>
  );
}
