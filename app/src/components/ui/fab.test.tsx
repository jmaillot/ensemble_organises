import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Fab } from './fab';

describe('Fab', () => {
  it('rend un bouton de type button, libellé accessible obligatoire, sans texte visible', () => {
    render(<Fab icon="plus" label="Ajouter une dépense" />);

    const fab = screen.getByRole('button', { name: 'Ajouter une dépense' });
    expect(fab).toHaveAttribute('type', 'button');
    expect(fab).not.toHaveTextContent('Ajouter une dépense');
  });

  it('déclenche l’action et laisse passer les props du bouton', async () => {
    const onClick = vi.fn();
    render(<Fab icon="plus" label="Ajouter" onClick={onClick} disabled />);

    const fab = screen.getByRole('button', { name: 'Ajouter' });
    expect(fab).toBeDisabled();
    await userEvent.click(fab);
    expect(onClick).not.toHaveBeenCalled();
  });
});
