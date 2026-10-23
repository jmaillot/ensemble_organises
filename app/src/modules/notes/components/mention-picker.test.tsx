import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { NoteFormDialog } from './note-form-dialog';

/**
 * Les mentions dans l'éditeur d'une note.
 *
 * `@` propose un membre du foyer, `$` propose une autre note. L'éditeur
 * garde le focus pendant la frappe — c'est la liste qui suit le curseur —
 * et la mention choisie est INSÉRÉE dans le texte, pas écrite ailleurs.
 */
const membres = [
  { id: 'm1', display_name: 'Camille Martin' },
  { id: 'm2', display_name: 'Thomas Martin' },
];
const notes = [
  { id: 'n1', title: 'Liste de rentrée' },
  { id: 'n2', title: 'Idées de week-end' },
];

function renderDialog() {
  return renderWithProviders(
    <NoteFormDialog
      open
      onOpenChange={vi.fn()}
      note={null}
      members={membres}
      notes={notes}
      onSubmit={vi.fn()}
    />,
    { route: '/notes' },
  );
}

const contenu = () => screen.getByLabelText(/Contenu/) as HTMLTextAreaElement;

describe('les mentions dans l’éditeur d’une note', () => {
  it('propose les membres quand on tape un arobase', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(contenu(), '@Cam');

    const option = await screen.findByRole('option', { name: /Camille Martin/ });
    expect(option).toBeInTheDocument();
    // Le champ reste le point de saisie : on tape, on choisit.
    expect(contenu()).toHaveFocus();
  });

  it('insère la mention choisie dans le texte', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(contenu(), '@Cam');
    await user.click(await screen.findByRole('option', { name: /Camille Martin/ }));

    await waitFor(() => {
      expect(contenu().value).toBe('@Camille Martin');
    });
    // La liste se referme une fois la mention posée.
    expect(screen.queryByRole('listbox', { name: 'Mentions disponibles' })).not.toBeInTheDocument();
  });

  it('propose les autres notes après un dollar', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(contenu(), '$Idées');

    expect(await screen.findByRole('option', { name: /Idées de week-end/ })).toBeInTheDocument();
  });

  it('insère un lien vers la note mentionnée', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(contenu(), '$Idées');
    await user.click(await screen.findByRole('option', { name: /Idées de week-end/ }));

    await waitFor(() => {
      expect(contenu().value).toBe('[Idées de week-end](/notes?ouvrir=n2)');
    });
  });

  it('se parcourt au clavier, et Entrée choisit sans envoyer le formulaire', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <NoteFormDialog
        open
        onOpenChange={vi.fn()}
        note={null}
        members={membres}
        notes={notes}
        onSubmit={onSubmit}
      />,
      { route: '/notes' },
    );

    await user.type(contenu(), '@');
    await screen.findByRole('option', { name: /Camille Martin/ });

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(contenu().value).toBe('@Thomas Martin');
    });
    // Entrée a choisi la mention : le formulaire n'a pas été envoyé.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('referme la liste sur Échap, sans rien insérer', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(contenu(), '@Cam');
    await screen.findByRole('option', { name: /Camille Martin/ });
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox', { name: 'Mentions disponibles' })).not.toBeInTheDocument();
    expect(contenu().value).toBe('@Cam');
  });
});
