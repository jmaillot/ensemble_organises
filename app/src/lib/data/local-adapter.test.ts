import { beforeEach, describe, expect, it, vi } from 'vitest';
import { data } from '@/lib/data';
import { getDatabase } from '@/lib/data/dexie';
import { getLocalAdapter } from '@/lib/data/local-adapter';

/**
 * L'invariant d'amorçage du magasin local : « marquée comme amorcée » doit
 * vouloir dire « écrite ».
 *
 * Une table marquée AVANT son écriture rend une passe échouée invisible : la
 * lecture suivante saute la table, la graine est perdue, et rien ne le dit —
 * c'est le pire des succès muets (§2.7 F). Le foyer se retrouve alors sans
 * tâches, sans assignations, sans messages, sans que rien n'ait signalé
 * d'erreur : la seule trace est un écran vide, qui se lit comme « il n'y a
 * rien », jamais comme « l'amorçage a échoué ».
 *
 * Les deux gardes tiennent les deux faces de l'invariant, et chacune peut
 * échouer seule :
 *
 * - G11 : une passe qui ÉCHOUE est reprise intégralement à la lecture suivante ;
 * - G12 : une passe qui RÉUSSIT n'est pas recopiée à la suivante.
 *
 * La base est vidée et le cache d'amorçage invalidé avant chaque cas, comme
 * `src/test/setup.ts` le fait après chacun : les comptes assertés portent donc
 * sur une base vide, et « non vide » y dit bien « amorcée par cette passe ».
 */
beforeEach(async () => {
  await getDatabase().rows.clear();
  getLocalAdapter().invalidateSeedCache();
});

describe('amorçage du magasin local', () => {
  it('(G11) rejoue intégralement une passe qui a échoué', async () => {
    const db = getDatabase();
    // Une seule écriture échoue : c'est la passe entière qui échoue, puisque
    // l'amorçage écrit toutes ses tables d'un seul `bulkPut`.
    vi.spyOn(db.rows, 'bulkPut').mockRejectedValueOnce(new Error('écriture refusée'));

    await expect(data.list('tasks')).rejects.toThrow();

    // Reprise : rien n'a été écrit, donc rien ne doit être marqué comme écrit.
    const tasks = await data.list('tasks');
    const assignees = await data.list('task_assignees');

    expect(tasks.length).toBeGreaterThan(0);
    expect(assignees.length).toBeGreaterThan(0);
  });

  it('(G12) ne recopie pas une graine déjà écrite quand la passe est refaite', async () => {
    const db = getDatabase();

    // Amorçage réussi, avant l'observation.
    await data.list('tasks');
    const bulkPut = vi.spyOn(db.rows, 'bulkPut');

    // Seconde passe FORCÉE. Elle est indispensable : `ensureSeeded` mémorise
    // `seedPromise`, donc une simple lecture suivante ne rappellerait jamais
    // `seedNow` — et cette garde serait verte même si le court-circuit
    // `already > 0` avait disparu, c'est-à-dire si chaque lecture réécrivait
    // toute la graine (un `put` écrase sans erreur : aucun autre test ne le
    // verrait). C'est exactement ce que `src/test/setup.ts` provoque après
    // chaque test.
    getLocalAdapter().invalidateSeedCache();
    await data.list('tasks');

    expect(bulkPut).not.toHaveBeenCalled();
  });
});
