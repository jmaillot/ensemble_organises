import { describe, expect, it } from 'vitest';
import { COURSES_GUIDE_QUESTIONS, COURSES_GUIDE_SECTIONS } from './courses-guide-content';

/**
 * Le mode d'emploi doit être COMPLET et HONNÊTE.
 *
 * « Complet » : chaque carte a une introduction et des fonctions, chaque
 * fonction a un titre et un texte, chaque question a sa réponse. Une page
 * d'aide à moitié remplie se remarque à l'écran, et se remarque surtout
 * quand on cherche dedans.
 *
 * « Honnête » : la page décrit NOTRE application. Les fonctions Premium de
 * la référence (frigo, export PDF en fichier, suggestions de l'assistant)
 * n'existent pas ici : si quelqu'un recopie le texte de la référence, ces
 * mots-là doivent rendre le test ROUGE. Une page d'aide qui promet ce que
 * l'application ne fait pas est pire qu'une page d'aide absente
 * (AGENTS.md §2.7 I).
 */

/** Les fonctions de la référence que ce module n'a pas. */
const FONCTIONS_ABSENTES = [
  'premium',
  'frigo',
  'melia',
  'export pdf',
  'fichier pdf',
];

describe('mode d’emploi des listes de courses', () => {
  it('a deux cartes, chacune avec une introduction et des fonctions', () => {
    expect(COURSES_GUIDE_SECTIONS).toHaveLength(2);
    for (const section of COURSES_GUIDE_SECTIONS) {
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.intro.length).toBeGreaterThan(40);
      expect(section.features.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('donne à chaque fonction un titre et une explication', () => {
    for (const section of COURSES_GUIDE_SECTIONS) {
      for (const feature of section.features) {
        expect(feature.title.length).toBeGreaterThan(0);
        expect(feature.text.length).toBeGreaterThan(40);
      }
    }
  });

  it('donne à chaque question une réponse', () => {
    expect(COURSES_GUIDE_QUESTIONS.length).toBeGreaterThanOrEqual(6);
    for (const question of COURSES_GUIDE_QUESTIONS) {
      expect(question.question.endsWith('?')).toBe(true);
      expect(question.answer.length).toBeGreaterThan(20);
    }
  });

  it('n’annonce aucune fonction que l’application n’a pas', () => {
    const texte = [
      ...COURSES_GUIDE_SECTIONS.flatMap((section) => [
        section.title,
        section.intro,
        ...section.features.flatMap((feature) => [feature.title, feature.text]),
      ]),
      ...COURSES_GUIDE_QUESTIONS.flatMap((question) => [question.question, question.answer]),
    ]
      .join(' ')
      .toLowerCase();
    for (const interdite of FONCTIONS_ABSENTES) {
      expect(texte, `la page annonce « ${interdite} », que l'application n'a pas`).not.toContain(interdite);
    }
  });

  it('ne répète pas la même question', () => {
    const questions = COURSES_GUIDE_QUESTIONS.map((question) => question.question);
    expect(new Set(questions).size).toBe(questions.length);
  });
});
