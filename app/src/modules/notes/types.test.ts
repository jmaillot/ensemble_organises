import { describe, expect, it } from 'vitest';
import { mentionAt, mentionCandidates, noteExcerpt, noteMentionText, notePlainText, pickCover } from './types';

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

/** Pièce jointe minimale pour les règles de couverture. */
const attachment = (id: string, mime: string) => ({
  id,
  noteId: 'n',
  url: `https://exemple.fr/${id}`,
  storedUrl: `foyer/${id}`,
  fileName: id,
  mime,
  size: 1,
  createdAt: '2026-10-02T10:00:00.000Z',
});

describe('pickCover (0136)', () => {
  it('prend la photo désignée quand elle existe encore', () => {
    const attachments = [attachment('a', 'image/jpeg'), attachment('b', 'image/png')];
    expect(pickCover(attachments, 'b')?.id).toBe('b');
  });

  it('retombe sur la première image quand rien n’est désigné, ou quand la désignation est morte', () => {
    const attachments = [attachment('pdf', 'application/pdf'), attachment('a', 'image/jpeg')];
    expect(pickCover(attachments, null)?.id).toBe('a');
    // Couverture supprimée côté base : le FK a mis `NULL`, mais un aperçu démo
    // peut encore porter un identifiant absent — jamais d'image morte.
    expect(pickCover(attachments, 'disparue')?.id).toBe('a');
  });

  it('ne propose pas un PDF comme couverture', () => {
    expect(pickCover([attachment('pdf', 'application/pdf')], 'pdf')).toBeNull();
  });
});


/**
 * LES MENTIONS : `@` pour un membre, `$` pour une autre note.
 *
 * Le déclencheur doit OUVRIR un mot : « e-mail@ » n'est pas une mention.
 * Et la frappe s'arrête à l'espace : on ne saisit pas un nom complet à la
 * main, on le choisit dans la liste.
 */
describe('mentionAt', () => {
  it('reconnaît un membre après un arobase', () => {
    const texte = 'Demander à @Cam';
    const found = mentionAt(texte, texte.length);
    expect(found?.kind).toBe('membre');
    expect(found?.query).toBe('Cam');
    expect(found?.start).toBe(texte.indexOf('@'));
  });

  it('reconnaît une note après un dollar', () => {
    const texte = 'Voir $Liste';
    const found = mentionAt(texte, texte.length);
    expect(found?.kind).toBe('note');
    expect(found?.query).toBe('Liste');
  });

  it('ne prend pas un arobase au milieu d’un mot', () => {
    const texte = 'écrire à e-mail@domaine';
    expect(mentionAt(texte, texte.length)).toBeNull();
  });

  it('s’arrête à l’espace : un nom complet ne se saisit pas à la main', () => {
    const texte = '@Camille Martin';
    // Le curseur juste après « Camille » : la frappe en cours.
    const found = mentionAt(texte, texte.indexOf(' '));
    expect(found?.query).toBe('Camille');
    // Un espace ferme la mention : le nom se CHOISIT dans la liste, il ne se
    // saisit pas à la main.
    expect(mentionAt(texte, texte.indexOf(' ') + 1)).toBeNull();
    expect(mentionAt(texte, texte.length)).toBeNull();
  });

  it('ne propose rien sans déclencheur', () => {
    expect(mentionAt('une note ordinaire', 18)).toBeNull();
    expect(mentionAt('', 0)).toBeNull();
  });
});

describe('mentionCandidates', () => {
  const membres = [
    { id: 'm1', display_name: 'Camille Martin' },
    { id: 'm2', display_name: 'Thomas Martin' },
  ];
  const notes = [
    { id: 'n1', title: 'Liste de rentrée' },
    { id: 'n2', title: 'Idées de week-end' },
  ];

  it('propose les membres pour un arobase', () => {
    const candidats = mentionCandidates('membre', 'cam', membres, notes, null);
    expect(candidats.map((c) => c.label)).toEqual(['Camille Martin']);
    expect(candidats[0].text).toBe('@Camille Martin');
  });

  it('propose les notes pour un dollar, jamais la note en cours', () => {
    const candidats = mentionCandidates('note', '', membres, notes, 'n1');
    expect(candidats.map((c) => c.label)).toEqual(['Idées de week-end']);
    // La mention d'une note est un lien vers son lien profond.
    expect(candidats[0].text).toBe('[Idées de week-end](/notes?ouvrir=n2)');
  });

  it('échappe les crochets d’un titre, pour ne pas casser le lien', () => {
    expect(noteMentionText('n3', 'Liste [du] marché')).toBe('[Liste du marché](/notes?ouvrir=n3)');
  });
});
