import { describe, expect, it } from 'vitest';
import { noteExcerpt, notePlainText } from './types';

describe('notePlainText', () => {
  it('retire les repères Markdown en gardant le texte qu’ils portaient', () => {
    expect(notePlainText('**Préparer** les *cartables* et les ~~gourdes~~')).toBe(
      'Préparer les cartables et les gourdes',
    );
    expect(notePlainText('# Rentrée\n> Penser au goûter\n- cartables\n1. chaussures')).toBe(
      'Rentrée Penser au goûter cartables chaussures',
    );
    expect(notePlainText('Voir [la liste](https://exemple.fr/liste) et ![le plan](plan.png)')).toBe(
      'Voir la liste et le plan',
    );
    expect(notePlainText('---')).toBe('');
  });

  it('laisse le contenu du code intact, soulignés compris', () => {
    expect(notePlainText('`snake_case` reste tel quel')).toBe('snake_case reste tel quel');
    expect(notePlainText('```ts\nconst snake_case = 1\n```')).toBe('const snake_case = 1');
  });

  it('ne prend pas un identifiant ou une multiplication pour de l’italique', () => {
    expect(notePlainText('snake_case_name')).toBe('snake_case_name');
    // Les étoiles entourées d’espaces ne sont pas des marqueurs d’emphase.
    expect(notePlainText('2 * 3 = 6')).toBe('2 * 3 = 6');
  });

  it('ramène le texte sur une ligne, sans espaces superflus', () => {
    expect(notePlainText('  une ligne\n\n  puis une autre  ')).toBe('une ligne puis une autre');
  });
});

describe('noteExcerpt', () => {
  it('tronque le texte nu, pas la syntaxe', () => {
    const excerpt = noteExcerpt('**' + 'a'.repeat(200) + '**', 10);
    expect(excerpt).toBe('aaaaaaaaa…');
    expect(excerpt).toHaveLength(10);
  });

  it('rend le contenu court tel quel', () => {
    expect(noteExcerpt('Cartables et gourdes')).toBe('Cartables et gourdes');
  });
});
