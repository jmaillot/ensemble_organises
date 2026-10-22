import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ModuleGuide } from './module-guide';

/**
 * La page « mode d'emploi » : deux cartes de fonctions, et les questions
 * fréquentes.
 *
 * Ce qui est vérifié ici est STRUCTUREL — les titres, les questions, et le
 * fait que la réponse est là quand on la demande. Que le texte dise vrai sur
 * l'application est une affaire de relecture (voir
 * `courses-guide-content.test.ts`, qui garde la page honnête).
 */

const sections = [
  {
    icon: 'receipt' as const,
    title: 'La liste de courses, partagée par le foyer',
    intro: 'Tout le foyer partage les mêmes listes.',
    features: [
      { icon: 'plus' as const, title: 'Ajout en quelques secondes', text: 'Tapez le nom et validez.' },
      { icon: 'grid' as const, title: 'Regroupement par rayon', text: 'Un sélecteur range la liste.' },
    ],
  },
  {
    icon: 'grid' as const,
    title: 'Le catalogue de produits',
    intro: 'Ce que le foyer rachète souvent.',
    features: [{ icon: 'scan' as const, title: 'Scanner un code-barres', text: 'Sur mobile.' }],
  },
];

const questions = [
  { question: 'La liste est-elle partagée avec tout le foyer ?', answer: 'Oui, et en temps réel.' },
  { question: 'Les quantités sont-elles obligatoires ?', answer: 'Non.' },
];

function renderGuide() {
  return render(
    <MemoryRouter>
      <ModuleGuide
        module="courses"
        title="Comment ça marche"
        description="La liste partagée et le catalogue."
        sections={sections}
        questions={questions}
        backTo="/courses"
        backLabel="Retour aux listes"
      />
    </MemoryRouter>,
  );
}

describe('ModuleGuide', () => {
  it('affiche le titre, les deux cartes et leurs fonctions', () => {
    renderGuide();
    expect(screen.getByRole('heading', { level: 1, name: 'Comment ça marche' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'La liste de courses, partagée par le foyer' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Le catalogue de produits' })).toBeInTheDocument();
    expect(screen.getByText('Ajout en quelques secondes')).toBeInTheDocument();
    expect(screen.getByText('Scanner un code-barres')).toBeInTheDocument();
  });

  it('nffiche pas la réponse d’une question tant qu’elle n’est pas demandée', () => {
    renderGuide();
    expect(screen.queryByText('Oui, et en temps réel.')).not.toBeInTheDocument();
  });

  it('ouvre la réponse d’une question au clic, et la referme', async () => {
    const user = userEvent.setup();
    renderGuide();
    const trigger = screen.getByRole('button', { name: 'La liste est-elle partagée avec tout le foyer ?' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Oui, et en temps réel.')).toBeInTheDocument();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('garde chaque question dans son propre repli', () => {
    renderGuide();
    // Un repli par question, tous fermés au départ : le lecteur ouvre ce
    // qu'il cherche, sans que la page entière se déplie.
    const triggers = screen.getAllByRole('button', { expanded: false });
    expect(triggers).toHaveLength(questions.length);
  });
});
