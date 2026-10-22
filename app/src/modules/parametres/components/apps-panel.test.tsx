// Menu des applications du foyer (migration 0140).
//
// Pourquoi chaque cas :
// - Le catalogue ENTIER est proposé (17 espaces) : un espace absent du menu
//   serait un espace impossible à réactiver — le menu est l'unique surface
//   où la configuration se voit et se change.
// - L'état des interrupteurs suit `households.disabled_modules` : le store
//   est la source affichée, jamais un état local parallèle.
// - L'AUTORITÉ reste la RLS (`households_update`, admin-seul) : le panneau
//   la présente, il ne la remplace pas — un non-admin voit des interrupteurs
//   inertes, et la fonction n'est jamais appelée pour lui.
// - L'écriture porte la liste SUIVANTE (sans la clé activée, avec la clé
//   désactivée) : c'est le contrat que la base attend, et la liste vide dit
//   « tout activé ».
// - Un échec d'enregistrement ne change RIEN au store : basculer
//   l'interrupteur avant une écriture réussie mentirait sur l'état réel du
//   foyer pour tous les autres membres.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS, demoHousehold } from '@/lib/data/seed';
import { catalogueModules } from '@/lib/modules';
import { AppsPanel } from './apps-panel';

const { saveDisabledModulesMock } = vi.hoisted(() => ({ saveDisabledModulesMock: vi.fn() }));

// Mock PARTIEL : `fetchHousehold` et le reste du module restent réels ; seul
// l'appel réseau du menu est sous contrôle.
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, saveDisabledModules: saveDisabledModulesMock };
});

describe('AppsPanel — menu des applications du foyer', () => {
  beforeEach(() => {
    saveDisabledModulesMock.mockReset();
    renderWithProviders(<AppsPanel />);
    useHouseholdStore.setState({ disabledModules: [] });
  });

  it('propose le catalogue entier : un interrupteur par espace du foyer', () => {
    expect(screen.getAllByRole('switch')).toHaveLength(catalogueModules.length);
    for (const entry of catalogueModules) {
      expect(screen.getByText(entry.label)).toBeInTheDocument();
    }
  });

  it('reflète la configuration du foyer : un espace éteint est décoché, les autres cochés', () => {
    // `act` : React 19 ne flush pas une mise à jour de store posée après le
    // rendu — sans lui, la requête lirait le DOM du rendu précédent.
    act(() => {
      useHouseholdStore.setState({ disabledModules: ['ardoise'] });
    });

    expect(screen.getByRole('switch', { name: /Afficher l'espace Ardoise/ })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /Masquer l'espace Courses/ })).toBeChecked();
  });

  it("un administrateur désactive un espace : l'écriture porte la liste suivante et le store suit", async () => {
    const user = userEvent.setup();
    saveDisabledModulesMock.mockResolvedValue({ ...demoHousehold, disabled_modules: ['courses'] });

    await user.click(screen.getByRole('switch', { name: /Masquer l'espace Courses/ }));

    expect(saveDisabledModulesMock).toHaveBeenCalledWith(DEMO_HOUSEHOLD_ID, ['courses']);
    await screen.findByText('« Courses » est masqué du foyer.');
    expect(useHouseholdStore.getState().disabledModules).toEqual(['courses']);
  });

  it("un administrateur réactive un espace éteint : la liste rendue est vide (« tout activé »)", async () => {
    act(() => {
      useHouseholdStore.setState({ disabledModules: ['ardoise'] });
    });
    const user = userEvent.setup();
    saveDisabledModulesMock.mockResolvedValue({ ...demoHousehold, disabled_modules: [] });

    await user.click(screen.getByRole('switch', { name: /Afficher l'espace Ardoise/ }));

    expect(saveDisabledModulesMock).toHaveBeenCalledWith(DEMO_HOUSEHOLD_ID, []);
    await screen.findByText('« Ardoise » est de nouveau affiché.');
    expect(useHouseholdStore.getState().disabledModules).toEqual([]);
  });

  it('un membre (non admin) voit la configuration mais ne peut pas la changer', async () => {
    act(() => {
      useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.thomas, disabledModules: ['ardoise'] });
    });
    const user = userEvent.setup();

    expect(screen.getByRole('switch', { name: /Afficher l'espace Ardoise/ })).toBeDisabled();
    await user.click(screen.getByRole('switch', { name: /Afficher l'espace Ardoise/ }));

    expect(saveDisabledModulesMock).not.toHaveBeenCalled();
    expect(useHouseholdStore.getState().disabledModules).toEqual(['ardoise']);
  });

  it('un échec d’enregistrement laisse le store inchangé et le dit', async () => {
    const user = userEvent.setup();
    saveDisabledModulesMock.mockRejectedValue(new Error('Enregistrement impossible pour le moment.'));

    await user.click(screen.getByRole('switch', { name: /Masquer l'espace Courses/ }));

    await screen.findByText('Enregistrement impossible pour le moment.');
    expect(useHouseholdStore.getState().disabledModules).toEqual([]);
  });
});
