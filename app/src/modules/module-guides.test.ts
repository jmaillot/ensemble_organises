import { describe, expect, it } from 'vitest';
import { ACCUEIL_GUIDE_QUESTIONS, ACCUEIL_GUIDE_SECTIONS } from './dashboard/dashboard-guide-content';
import { TACHES_GUIDE_QUESTIONS, TACHES_GUIDE_SECTIONS } from './taches/taches-guide-content';
import { CALENDRIER_GUIDE_QUESTIONS, CALENDRIER_GUIDE_SECTIONS } from './calendrier/calendrier-guide-content';
import { NOTES_GUIDE_QUESTIONS, NOTES_GUIDE_SECTIONS } from './notes/notes-guide-content';
import { COURSES_GUIDE_QUESTIONS, COURSES_GUIDE_SECTIONS } from './courses/courses-guide-content';
import { ROUTINES_GUIDE_QUESTIONS, ROUTINES_GUIDE_SECTIONS } from './routines/routines-guide-content';
import { RECETTES_GUIDE_QUESTIONS, RECETTES_GUIDE_SECTIONS } from './recettes/recettes-guide-content';
import { ARDOISE_GUIDE_QUESTIONS, ARDOISE_GUIDE_SECTIONS } from './ardoise/ardoise-guide-content';
import { CADEAUX_GUIDE_QUESTIONS, CADEAUX_GUIDE_SECTIONS } from './cadeaux/cadeaux-guide-content';
import { ANNIVERSAIRES_GUIDE_QUESTIONS, ANNIVERSAIRES_GUIDE_SECTIONS } from './anniversaires/anniversaires-guide-content';
import { CONTACTS_GUIDE_QUESTIONS, CONTACTS_GUIDE_SECTIONS } from './contacts/contacts-guide-content';
import { ANIMAUX_GUIDE_QUESTIONS, ANIMAUX_GUIDE_SECTIONS } from './animaux/animaux-guide-content';
import { PRESTATAIRES_GUIDE_QUESTIONS, PRESTATAIRES_GUIDE_SECTIONS } from './prestataires/prestataires-guide-content';
import { FIDELITE_GUIDE_QUESTIONS, FIDELITE_GUIDE_SECTIONS } from './fidelite/fidelite-guide-content';
import { ADRESSES_GUIDE_QUESTIONS, ADRESSES_GUIDE_SECTIONS } from './adresses/adresses-guide-content';
import { CERCLE_GUIDE_QUESTIONS, CERCLE_GUIDE_SECTIONS } from './cercle/cercle-guide-content';
import { VOYAGES_GUIDE_QUESTIONS, VOYAGES_GUIDE_SECTIONS } from './voyages/voyages-guide-content';
import { MESSAGES_GUIDE_QUESTIONS, MESSAGES_GUIDE_SECTIONS } from './messages/messages-guide-content';
import { FRIGO_GUIDE_QUESTIONS, FRIGO_GUIDE_SECTIONS } from './frigo/frigo-guide-content';
import { MENU_GUIDE_QUESTIONS, MENU_GUIDE_SECTIONS } from './menu/menu-guide-content';
import { DOCUMENTS_GUIDE_QUESTIONS, DOCUMENTS_GUIDE_SECTIONS } from './documents/documents-guide-content';
import type { GuideQuestion, GuideSection } from '@/components/shared/module-guide';

/**
 * Les modes d'emploi, tous modules ensemble.
 *
 * Un seul fichier pour les dix-huit : la règle est la même partout, et
 * dix-huit fichiers quasi identiques se relisent moins bien qu'un seul qui
 * les vérifie toutes.
 *
 * CE QUE CES GARDES DISENT
 * ------------------------
 * « Complet » : chaque carte a une introduction et des fonctions, chaque
 * fonction a un titre et une explication, chaque question a sa réponse. Une
 * page à moitié remplie se remarque à l'écran, et surtout quand on la cherche.
 *
 * « Honnête » : la page décrit NOTRE application. Les fonctions Premium de la
 * référence (export PDF en fichier, suggestions de l'assistant) n'existent
 * pas ici : si quelqu'un recopie le texte de la référence, ces mots-là doivent
 * rendre le test ROUGE. Une page d'aide qui promet ce que l'application ne fait
 * pas est pire qu'une page d'aide absente (AGENTS.md §2.7 I). « frigo » a
 * quitté la liste le jour où l'espace Frigo est devenu un module réel de
 * l'application (vague 3.1).
 */

/** Les fonctions de la référence que cette application n'a pas. */
const FONCTIONS_ABSENTES = ['premium', 'melia', 'export pdf', 'fichier pdf'];

interface Guide {
  module: string;
  sections: GuideSection[];
  questions: GuideQuestion[];
}

const GUIDES: Guide[] = [
  { module: 'accueil', sections: ACCUEIL_GUIDE_SECTIONS, questions: ACCUEIL_GUIDE_QUESTIONS },
  { module: 'taches', sections: TACHES_GUIDE_SECTIONS, questions: TACHES_GUIDE_QUESTIONS },
  { module: 'calendrier', sections: CALENDRIER_GUIDE_SECTIONS, questions: CALENDRIER_GUIDE_QUESTIONS },
  { module: 'notes', sections: NOTES_GUIDE_SECTIONS, questions: NOTES_GUIDE_QUESTIONS },
  { module: 'courses', sections: COURSES_GUIDE_SECTIONS, questions: COURSES_GUIDE_QUESTIONS },
  { module: 'routines', sections: ROUTINES_GUIDE_SECTIONS, questions: ROUTINES_GUIDE_QUESTIONS },
  { module: 'recettes', sections: RECETTES_GUIDE_SECTIONS, questions: RECETTES_GUIDE_QUESTIONS },
  { module: 'ardoise', sections: ARDOISE_GUIDE_SECTIONS, questions: ARDOISE_GUIDE_QUESTIONS },
  { module: 'cadeaux', sections: CADEAUX_GUIDE_SECTIONS, questions: CADEAUX_GUIDE_QUESTIONS },
  { module: 'anniversaires', sections: ANNIVERSAIRES_GUIDE_SECTIONS, questions: ANNIVERSAIRES_GUIDE_QUESTIONS },
  { module: 'contacts', sections: CONTACTS_GUIDE_SECTIONS, questions: CONTACTS_GUIDE_QUESTIONS },
  { module: 'animaux', sections: ANIMAUX_GUIDE_SECTIONS, questions: ANIMAUX_GUIDE_QUESTIONS },
  { module: 'prestataires', sections: PRESTATAIRES_GUIDE_SECTIONS, questions: PRESTATAIRES_GUIDE_QUESTIONS },
  { module: 'fidelite', sections: FIDELITE_GUIDE_SECTIONS, questions: FIDELITE_GUIDE_QUESTIONS },
  { module: 'adresses', sections: ADRESSES_GUIDE_SECTIONS, questions: ADRESSES_GUIDE_QUESTIONS },
  { module: 'cercle', sections: CERCLE_GUIDE_SECTIONS, questions: CERCLE_GUIDE_QUESTIONS },
  { module: 'voyages', sections: VOYAGES_GUIDE_SECTIONS, questions: VOYAGES_GUIDE_QUESTIONS },
  { module: 'messages', sections: MESSAGES_GUIDE_SECTIONS, questions: MESSAGES_GUIDE_QUESTIONS },
  { module: 'frigo', sections: FRIGO_GUIDE_SECTIONS, questions: FRIGO_GUIDE_QUESTIONS },
  { module: 'menu', sections: MENU_GUIDE_SECTIONS, questions: MENU_GUIDE_QUESTIONS },
  { module: 'documents', sections: DOCUMENTS_GUIDE_SECTIONS, questions: DOCUMENTS_GUIDE_QUESTIONS },
];

describe('les modes d’emploi des espaces', () => {
  it('couvre tous les espaces du foyer', () => {
    // Vingt-et-un : l'accueil et les vingt du catalogue, documents compris —
    // son mode d'emploi manquait depuis la vague 3.2 (retour du 23 octobre
    // 2026 : le bouton ⓘ pointait vers une page qui n'existait pas). Un
    // module sans mode d'emploi serait un trou, pas un détail.
    expect(GUIDES).toHaveLength(21);
    expect(new Set(GUIDES.map((guide) => guide.module)).size).toBe(GUIDES.length);
  });

  it('donne à chaque carte une introduction et des fonctions', () => {
    for (const guide of GUIDES) {
      expect(guide.sections.length, `${guide.module} : aucune carte`).toBeGreaterThan(0);
      for (const section of guide.sections) {
        expect(section.title.length, `${guide.module} : titre de carte vide`).toBeGreaterThan(0);
        expect(section.intro.length, `${guide.module} : introduction trop courte`).toBeGreaterThan(40);
        expect(section.features.length, `${guide.module} : carte sans fonction`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('donne à chaque fonction un titre et une explication', () => {
    for (const guide of GUIDES) {
      for (const section of guide.sections) {
        for (const feature of section.features) {
          expect(feature.title.length, `${guide.module} : fonction sans titre`).toBeGreaterThan(0);
          expect(feature.text.length, `${guide.module} : fonction « ${feature.title} » sans explication`).toBeGreaterThan(40);
        }
      }
    }
  });

  it('donne à chaque question une réponse, et ne pose pas deux fois la même', () => {
    for (const guide of GUIDES) {
      expect(guide.questions.length, `${guide.module} : pas assez de questions`).toBeGreaterThanOrEqual(5);
      const questions = guide.questions.map((question) => question.question);
      expect(new Set(questions).size, `${guide.module} : question en double`).toBe(questions.length);
      for (const question of guide.questions) {
        expect(question.question.endsWith('?'), `${guide.module} : « ${question.question} » n'est pas une question`).toBe(true);
        expect(question.answer.length, `${guide.module} : « ${question.question} » sans réponse`).toBeGreaterThan(20);
      }
    }
  });

  it('n’annonce aucune fonction que l’application n’a pas', () => {
    for (const guide of GUIDES) {
      const texte = [
        ...guide.sections.flatMap((section) => [
          section.title,
          section.intro,
          ...section.features.flatMap((feature) => [feature.title, feature.text]),
        ]),
        ...guide.questions.flatMap((question) => [question.question, question.answer]),
      ]
        .join(' ')
        .toLowerCase();
      for (const interdite of FONCTIONS_ABSENTES) {
        expect(texte, `${guide.module} : la page annonce « ${interdite} », que l'application n'a pas`).not.toContain(interdite);
      }
    }
  });

  it('n’écrit que du français', () => {
    // Un caractère d'une autre écriture s'est glissé dans un premier jet
    // («不属于 »), et rien ne l'aurait signalé : le texte reste lisible, la
    // page est seulement fausse. Le contrôle compare le texte à ce que le
    // français autorise — accents, ponctuation typographique, symboles.
    const autorise = new Set(
      [
        ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
        ..."ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞß",
        ..."àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿŒœ",
        ..."0123456789",
        ..." .,;:!?'\u2019\u00AB\u00BB()[]{}<>-–—…·/%&@#*+=_",
        ..."\u20AC\u00B0\u00D7\u2192\u2190\u2191\u2193\u2713\u2717\u2022\u00A7\u00A0",
      ].join(""),
    );
    for (const guide of GUIDES) {
      const texte = [
        ...guide.sections.flatMap((section) => [
          section.title,
          section.intro,
          ...section.features.flatMap((feature) => [feature.title, feature.text]),
        ]),
        ...guide.questions.flatMap((question) => [question.question, question.answer]),
      ].join(' ');
      const fautif = [...texte].filter((caractere) => !autorise.has(caractere));
      expect(fautif, `${guide.module} : caractères hors français`).toEqual([]);
    }
  });
});
