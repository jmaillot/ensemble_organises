import { useState } from 'react';
import { ModuleHeader } from '@/components/shared/module-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { HouseholdForm } from './components/household-form';
import { InvitationsPanel } from './components/invitations-panel';
import { MembersPanel } from './components/members-panel';
import { NotificationsPanel } from './components/notifications-panel';
import { OfflinePanel } from './components/offline-panel';
import { ProfileForm } from './components/profile-form';
import { settingsTabs, type SettingsTab } from './types';

/**
 * Préférences du foyer. Cette page n'a pas d'équivalent dans l'export de
 * design : elle est bâtie avec le système existant (cartes, rayons, tokens,
 * typographie) et les libellés français du projet.
 *
 * `ModuleHeader` est utilisé directement : le catalogue `src/lib/modules.ts`
 * ne déclare pas encore l'espace `parametres`, donc `ModuleShell` n'a pas
 * d'intitulé à afficher ici.
 */
export default function ParametresPage() {
  const [tab, setTab] = useState<SettingsTab>('profil');

  return (
    <section className="mx-auto w-full max-w-[1180px]" data-module="parametres">
      <ModuleHeader
        module="parametres"
        kicker="Préférences"
        title="Paramètres du foyer"
        description="Votre profil, votre foyer, vos invitations et le fonctionnement de l’application."
      />
      <Tabs value={tab} onValueChange={(value) => setTab(value as SettingsTab)}>
        <TabsList aria-label="Sections des paramètres">
          {settingsTabs.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value}>
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="profil">
          <ProfileForm />
        </TabsContent>
        <TabsContent value="foyer">
          <div className="grid gap-[18px]">
            <HouseholdForm />
            <MembersPanel />
          </div>
        </TabsContent>
        <TabsContent value="invitations">
          <InvitationsPanel />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsPanel />
        </TabsContent>
        <TabsContent value="application">
          <OfflinePanel />
        </TabsContent>
      </Tabs>
    </section>
  );
}
