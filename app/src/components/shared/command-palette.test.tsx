import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { DEMO_MEMBERS } from '@/lib/data/seed';
import { CommandPalette } from './command-palette';

function renderPalette(onOpenChange = vi.fn()) {
  const result = renderWithProviders(
    <Routes>
      <Route path="/" element={<CommandPalette open onOpenChange={onOpenChange} />} />
      <Route path="/courses" element={<h1>Courses ouvertes</h1>} />
      <Route path="/fidelite" element={<h1>Fidélité ouverte</h1>} />
      <Route path="/taches" element={<h1>Tâches ouvertes</h1>} />
    </Routes>,
    { route: '/' },
  );
  return { ...result, onOpenChange };
}

describe('CommandPalette', () => {
  it('liste les espaces dès l’ouverture, sans lire les données du foyer', async () => {
    renderPalette();
    expect(screen.getByRole('combobox', { name: /rechercher un espace/i })).toBeInTheDocument();
    expect(screen.getByText('Espaces')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /fidélité/i })).toBeInTheDocument();
    expect(screen.queryByText('Dans le foyer')).not.toBeInTheDocument();
  });

  it('filtre les espaces sans accent', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByRole('combobox'), 'fidelite');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAccessibleName(/fidélité/i);
  });

  it('ouvre l’espace actif avec Entrée', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByRole('combobox'), 'fidelite');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Fidélité ouverte' })).toBeInTheDocument();
  });

  it('navigue dans les résultats au clavier et garde la sélection annoncée', async () => {
    const user = userEvent.setup();
    renderPalette();
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id);
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1].id);
    await user.keyboard('{ArrowUp}');
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id);
  });

  it('trouve une entrée du foyer et dit où elle vit', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByRole('combobox'), 'yaour');
    const option = await screen.findByRole('option', { name: /yaourts/i }, { timeout: 8000 });
    // La ligne porte nature et détail sur une seule ligne (« Course · à
    // acheter ») : l'assertion porte sur ce texte rendu, pas sur des
    // fragments que l'écran ne sépare pas.
    expect(within(option).getByText('Course · à acheter')).toBeInTheDocument();
  });

  it('ouvre le module de l’entrée choisie', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByRole('combobox'), 'yaour');
    const option = await screen.findByRole('option', { name: /yaourts/i }, { timeout: 8000 });
    await user.click(option);
    expect(await screen.findByRole('heading', { name: 'Courses ouvertes' })).toBeInTheDocument();
  });

  it('cherche aussi dans le contenu des notes', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByRole('combobox'), 'gourdes');
    // « gourdes » n'apparaît que dans le CONTENU de la note de rentrée : la
    // recherche porte bien sur le texte annexe, pas seulement sur le titre.
    const option = await screen.findByRole('option', { name: /liste de rentrée/i }, { timeout: 8000 });
    expect(within(option).getByText('Note · Maison')).toBeInTheDocument();
  });

  it('ne bouge pas la sélection quand aucun résultat ne correspond', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByRole('combobox'), 'zzzz');
    // La lecture du foyer est encore en cours : le vide ne s'annonce qu'une
    // fois la recherche terminée, sinon « aucun résultat » mentirait sur un
    // simple délai.
    await expect(await screen.findByText(/Aucun résultat/)).toBeInTheDocument();
    // Une liste vide ne se parcourt pas : la sélection reste sur rien, et
    // l'option annoncée ne doit pas pointer vers un index qui n'existe pas.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-activedescendant');
  });

  it('garde la sélection sur une ligne qui existe quand les entrées du foyer arrivent', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByRole('combobox'), 'yaour');
    const option = await screen.findByRole('option', { name: /yaourts/i }, { timeout: 8000 });
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-activedescendant', option.id);
  });

  it('demande la fermeture à Échap', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderPalette();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('cache les espaces hors périmètre au rôle enfant', async () => {
    renderPalette();
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.noe });
    await waitFor(() => expect(screen.queryByRole('option', { name: /cadeaux/i })).not.toBeInTheDocument());
    expect(screen.getByRole('option', { name: /courses/i })).toBeInTheDocument();
  });
});
