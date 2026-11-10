/**
 * Tests de l'instrumentation de démarrage (phase 42, COLD-01).
 *
 * Points imposés par la Validation Architecture RESEARCH :
 * - total borne à borne (`boot:done − boot:entry:debut`), PAS la somme des
 *   quatre segments (Pattern 2 : segments chevauchants) ;
 * - dernier passage gagne (Pitfall 2 : StrictMode double-monte en dev) ;
 * - fin sans début préalable tolérée (Pitfall 3 : activation SW absente ou
 *   à 0 ms au cold start hors ligne) ;
 * - garde PD-02 : boot-marks.ts ne contient aucune écriture IndexedDB —
 *   l'instrumentation ne doit pas fausser la mesure qu'elle prend.
 *
 * Les bornes sont contrôlées par espion sur `performance.now` (§2.7 D :
 * assertions bornées, aucune tautologie) ; chaque scenario repose sur un
 * passage réinitialisé explicitement.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { marquerSegmentDebut, marquerSegmentFin, useBootMarks } from './boot-marks';

// Horloge contrôlée : `t` est la valeur renvoyée par chaque lecture de
// `performance.now()` ; les marks devtools sont des no-ops dont l'appel est
// observable via l'espion (preuve que `boot:done` est posé, §2.7 F).
let t = 0;
let markSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  t = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => t);
  markSpy = vi.spyOn(performance, 'mark').mockImplementation(
    ((name: string) => ({ name, entryType: 'mark', startTime: t }) as unknown as PerformanceMark) as typeof performance.mark,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('boot-marks — total borne à borne (Pattern 2)', () => {
  it('le total vaut boot:done − boot:entry:debut, jamais la somme des segments chevauchants', () => {
    marquerSegmentDebut('entry'); // t = 0
    t = 50;
    marquerSegmentFin('entry');
    t = 60;
    marquerSegmentDebut('idb');
    t = 160;
    marquerSegmentFin('idb');
    t = 200;
    marquerSegmentFin('auth');

    const etat = useBootMarks.getState();
    // Chaque assertion borne sa portée (§2.7 D.2) : valeurs contrôlées par
    // l'horloge espionnée, jamais des inégalités non bornées.
    expect(etat.entry).toBe(50);
    expect(etat.idb).toBe(100);
    expect(etat.auth).toBe(200);
    expect(etat.totalMs).toBe(200);
    expect(etat.totalMs).toBeGreaterThan(0);
    // Pattern 2 : l'idb est imbriqué dans auth, donc la somme des segments
    // dépasse la fenêtre réelle — le total ne doit JAMAIS être cette somme.
    const sommeSegments = 50 + 100 + 200;
    expect(etat.totalMs).not.toBe(sommeSegments);
    // Le mark de fin de démarrage est posé exactement une fois, à la fin auth.
    expect(markSpy).toHaveBeenCalledWith('boot:done');
  });
});

describe('boot-marks — dernier passage gagne (Pitfall 2)', () => {
  it('un second passage complet écrase toutes les valeurs du premier', () => {
    // Premier passage (premier montage StrictMode).
    marquerSegmentDebut('entry'); // t = 0
    t = 40;
    marquerSegmentFin('entry');
    t = 90;
    marquerSegmentFin('auth');
    expect(useBootMarks.getState().totalMs).toBe(90);

    // Second passage : `marquerSegmentDebut('entry')` réinitialise tout.
    t = 0;
    marquerSegmentDebut('entry');
    t = 25;
    marquerSegmentFin('entry');

    const etat = useBootMarks.getState();
    expect(etat.entry).toBe(25);
    expect(etat.auth).toBeNull();
    expect(etat.idb).toBeNull();
    expect(etat.totalMs).toBeNull();
  });
});

describe('boot-marks — fin sans début préalable (Pitfall 3)', () => {
  it('fin du segment sw sans début propre : mesure depuis la borne entry, sans lever', () => {
    marquerSegmentDebut('entry'); // t = 0
    t = 30;
    expect(() => marquerSegmentFin('sw')).not.toThrow();
    expect(useBootMarks.getState().sw).toBe(30);
  });

  it('fin posée sans AUCUNE borne préalable : 0 ms sur borne unique, jamais un crash', async () => {
    // Module frais : aucun `debut` n'a jamais été posé dans ce passage —
    // la seule borne disponible est celle du `fin` lui-même (Pitfall 3).
    vi.resetModules();
    const frais = await import('./boot-marks');
    t = 500;
    expect(() => frais.marquerSegmentFin('sw')).not.toThrow();
    expect(frais.useBootMarks.getState().sw).toBe(0);
  });
});

describe('boot-marks — garde PD-02 (aucune écriture IndexedDB)', () => {
  // L'assertion lit le CODE comme texte (§2.7 D.4 : instrument faible mais
  // le seul disponible ici) — elle vise des IDENTIFIANTS précis, jamais un
  // préfixe ambigu comme « persist » qui croiserait les commentaires
  // français (« persisté », « persistance ») du même fichier.
  // `import.meta.url`/`dirname` n'ont pas un schéma `file` sous vitest :
  // le chemin est résolu depuis le CWD — `npm test` s'exécute toujours
  // depuis `app/` (le répertoire du package).
  const source = readFileSync(resolve('src/lib/boot-marks.ts'), 'utf8');

  it('le source ne contient aucun identifiant d\'écriture IndexedDB', () => {
    expect(source).not.toContain('persistQueryClientSave');
    expect(source).not.toContain('persistQueryClientPersist');
    expect(source).not.toContain('idb-keyval');
    expect(source).not.toContain('createStore');
    expect(source).not.toContain('openDB');
    expect(source).not.toContain('dexie');
  });

  it('le source n\'importe rien d\'autre que zustand (surface minimale)', () => {
    const imports = source.match(/^import .+ from '.+';$/gm) ?? [];
    expect(imports).toHaveLength(1);
    expect(imports[0]).toContain("from 'zustand'");
  });
});
