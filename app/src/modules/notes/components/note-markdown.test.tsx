import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NoteMarkdown } from './note-markdown';

describe('NoteMarkdown', () => {
  it('met en forme le Markdown de la note', () => {
    const { container } = render(
      <NoteMarkdown content={'# Rentrée\n\n**Préparer** les *cartables* et :\n\n- gourdes\n- goûters'} />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Rentrée' })).toBeInTheDocument();
    expect(screen.getByText('Préparer', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('cartables', { selector: 'em' })).toBeInTheDocument();
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('ne rend aucun élément du HTML écrit dans la note', () => {
    // Sans `rehype-raw`, react-markdown ne construit pas de nœud à partir du
    // HTML source : il ne reste ni script, ni attribut d'événement.
    const { container } = render(
      <NoteMarkdown content={'Bonjour <script>alert(1)</script>\n\n<img src=x onerror="alert(2)">'} />,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    // Le HTML reste du TEXTE affiché, pas une balise neutralisée en silence :
    // c'est la formulation exacte promise par le commentaire du composant.
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('n’ouvre pas de lien exécutable et sort les liens externes dans un onglet', () => {
    const { container } = render(
      <NoteMarkdown content={'[piège](javascript:alert(1)) [site](https://exemple.fr) [notes](/notes)'} />,
    );

    const links = [...container.querySelectorAll('a')];
    expect(links).toHaveLength(3);

    // Protocole refusé : l'adresse sort vidée, donc sans cible exécutable.
    const trap = screen.getByText('piège').closest('a') as HTMLAnchorElement;
    expect(trap.getAttribute('href') ?? '').toBe('');

    const external = screen.getByText('site').closest('a') as HTMLAnchorElement;
    expect(external).toHaveAttribute('href', 'https://exemple.fr');
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noreferrer noopener');

    // Une route de l’application se navigue sur place : pas de nouvel onglet.
    const internal = screen.getByText('notes').closest('a') as HTMLAnchorElement;
    expect(internal).toHaveAttribute('href', '/notes');
    expect(internal).not.toHaveAttribute('target');
  });

  it('fait défiler un tableau large dans son propre cadre', () => {
    const { container } = render(
      <NoteMarkdown content={'| Plat | Invité |\n| --- | --- |\n| Tarte | Léa |'} />,
    );

    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    expect(table?.parentElement).toHaveClass('overflow-x-auto');
  });
});
