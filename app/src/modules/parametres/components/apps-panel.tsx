import { useState } from 'react';
import { Panel } from '@/components/shared/module-shell';
import { Icon } from '@/components/shared/icon';
import { Switch } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { catalogueModules, type ModuleKey } from '@/lib/modules';
import { useHouseholdStore, useIsAdmin } from '@/stores/household-store';
import { saveDisabledModules } from '../api';

/**
 * Menu des applications du foyer (migration 0140) : un interrupteur par
 * espace du catalogue. Éteindre un espace le retire de la navigation, des
 * tuiles de l'accueil, de la recherche et des routes — pour tous les membres
 * — sans toucher à une seule donnée : le foyer qui réactive « Animaux »
 * retrouve son carnet tel qu'il l'avait laissé.
 *
 * L'AUTORITÉ n'est pas ici : la RLS `households_update` (0007) réserve
 * l'écriture de la ligne foyer aux administrateurs, et la contrainte 0140
 * refuse une clé hors format. Le panneau n'est que la présentation de ce que
 * la base arbitre déjà — un non-admin voyant l'interrupteur serait de toute
 * façon refusé par la RLS.
 *
 * Le store est la source affichée (`disabledModules`, porté par
 * `household-store`) : basculer un interrupteur n'écrit le store qu'après un
 * enregistrement réussi — un échec laisse l'interrupteur où il était, sans
 * mensonge optimiste.
 */
export function AppsPanel() {
  const toast = useToast();
  const isAdmin = useIsAdmin();
  const householdId = useHouseholdStore((state) => state.householdId);
  const members = useHouseholdStore((state) => state.members);
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);
  const disabledModules = useHouseholdStore((state) => state.disabledModules);
  const setHousehold = useHouseholdStore((state) => state.setHousehold);
  const [pendingKey, setPendingKey] = useState<ModuleKey | null>(null);

  const toggleModule = async (key: ModuleKey, label: string, enabled: boolean) => {
    if (!householdId || pendingKey) return;
    const next = enabled
      ? disabledModules.filter((disabled) => disabled !== key)
      : [...disabledModules, key];
    setPendingKey(key);
    try {
      const updated = await saveDisabledModules(householdId, next);
      // La barre latérale, le tiroir, la palette et les routes lisent le
      // store : une seule mise à jour propage l'état partout.
      setHousehold(updated, members, currentMemberId);
      toast(enabled ? `« ${label} » est de nouveau affiché.` : `« ${label} » est masqué du foyer.`);
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : 'Enregistrement impossible.', 'error');
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <Panel
      title="Sections du foyer"
      description="Choisissez les espaces affichés à tous les membres. Éteindre une section masque son accès, sans supprimer aucune donnée."
      action={isAdmin ? null : <span className="text-[11px] text-muted">Lecture seule</span>}
    >
      <ul className="m-0 grid list-none gap-1 p-0">
        {catalogueModules.map((entry) => {
          const enabled = !disabledModules.includes(entry.key);
          return (
            <li
              key={entry.key}
              className="flex items-center gap-3 rounded-[14px] px-2.5 py-2 transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-strong">
                <Icon name={entry.icon} size="sm" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-[13.5px] font-[650] text-fg">{entry.label}</strong>
                <span className="block truncate text-[11px] text-muted">{entry.detail}</span>
              </span>
              <Switch
                checked={enabled}
                disabled={!isAdmin || pendingKey === entry.key}
                onCheckedChange={(checked) => void toggleModule(entry.key, entry.label, checked)}
                aria-label={`${enabled ? 'Masquer' : 'Afficher'} l'espace ${entry.label}`}
              />
            </li>
          );
        })}
      </ul>
      {!isAdmin ? (
        <p className="mt-2.5 mb-0 text-[11px] text-muted">Seul un administrateur peut modifier les sections du foyer.</p>
      ) : null}
    </Panel>
  );
}
