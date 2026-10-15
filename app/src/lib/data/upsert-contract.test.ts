import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Preuve de contrat d'`upsert` (escalade 1, `deferred-items.md` §1).
 *
 * Le défaut d'origine n'était pas dans l'écriture mais dans sa **décision** :
 * `setWidgetOrder` lisait `dashboard_widgets` puis choisissait `create` ou
 * `update`. Quand la lecture n'avait pas abouti — ou avait échoué — `rows`
 * valait `[]` et **chaque** préférence passait par `create` : en mode Supabase
 * l'insertion heurtait `dashboard_widgets_member_type_key` (`23505`), et en mode
 * démo elle ajoutait une seconde ligne sous un `id` déterministe différent de
 * la ligne semée. Le contrat testé ici est celui qui supprime la décision :
 * l'écriture porte sa cible de conflit, et c'est la base qui fusionne.
 *
 * Comme `remove-contract.test.ts`, ce fichier utilise le module **réel**
 * `@/lib/data` (avec `isSupabaseConfigured` simulé à `true`) : le faux client
 * capture la chaîne `.from().upsert().select().single()` et compte séparément
 * les `insert`, pour que « un upsert n'est jamais un insert » soit vérifié au
 * lieu d'être supposé.
 */

interface FakeUpsertResult {
  data: unknown | null;
  error: { message: string } | null;
}

const fake = vi.hoisted(() => {
  const state: {
    result: FakeUpsertResult;
    upserts: { table: string; payload: Record<string, unknown>; onConflict: string }[];
    inserts: number;
  } = { result: { data: null, error: null }, upserts: [], inserts: 0 };
  return state;
});

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabaseUrl: 'https://api.exemple.fr',
  supabasePublishableKey: 'pk_test',
  supabaseFunctionsBase: 'https://api.exemple.fr/functions/v1',
  supabase: {
    from: (table: string) => ({
      upsert: (payload: Record<string, unknown>, options: { onConflict: string }) => {
        fake.upserts.push({ table, payload, onConflict: options.onConflict });
        return {
          select: () => ({
            single: async () => fake.result,
          }),
        };
      },
      insert: () => {
        fake.inserts += 1;
        throw new Error('upsert ne doit jamais passer par insert');
      },
    }),
  },
}));

import { data, DataError } from '@/lib/data';
import { getLocalAdapter } from '@/lib/data/local-adapter';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import type { Row } from '@/types';

const CLIENT_ERROR = { message: 'duplicate key value violates unique constraint' };

/** Cible réelle : `dashboard_widgets_member_type_key unique (member_id, widget_type)`. */
const WIDGET_CONFLICT = 'member_id,widget_type';

const widgetValues = (memberId: string, width: number) => ({
  household_id: DEMO_HOUSEHOLD_ID,
  member_id: memberId,
  widget_type: 'calendrier',
  position_x: 0,
  position_y: 0,
  width,
  height: 1,
});

beforeEach(() => {
  fake.result = { data: { id: 'widget-42' }, error: null };
  fake.upserts.length = 0;
  fake.inserts = 0;
});

describe('Contrat d’écriture — SupabaseAdapter (escalade 1)', () => {
  it('fusionne sur la cible déclarée, sans jamais émettre un insert ni injecter d’id', async () => {
    await data.upsert('dashboard_widgets', widgetValues('membre-1', 1), { onConflict: WIDGET_CONFLICT });
    await data.upsert('dashboard_widgets', widgetValues('membre-1', 0), { onConflict: WIDGET_CONFLICT });

    // Deux écritures successives sur la même cible : deux `upsert`, zéro
    // `insert`. C'est la différence qui rend la seconde idempotente.
    expect(fake.inserts).toBe(0);
    expect(fake.upserts).toHaveLength(2);
    expect(fake.upserts.map((call) => call.table)).toEqual(['dashboard_widgets', 'dashboard_widgets']);
    expect(fake.upserts.map((call) => call.onConflict)).toEqual([WIDGET_CONFLICT, WIDGET_CONFLICT]);
    // La cible est adressable : le payload porte bien ses colonnes.
    expect(fake.upserts[0].payload).toMatchObject({ member_id: 'membre-1', widget_type: 'calendrier' });
    // Aucun `id` : `dashboard_widgets.id` a un défaut, et un `id` étranger à la
    // ligne existante ferait échouer la fusion sur la clé primaire.
    expect(fake.upserts.some((call) => 'id' in call.payload)).toBe(false);
  });

  it('rend la ligne écrite et remonte l’erreur du client avec sa cause', async () => {
    await expect(data.upsert('dashboard_widgets', widgetValues('membre-1', 1), { onConflict: WIDGET_CONFLICT })).resolves.toEqual({
      id: 'widget-42',
    });

    fake.result = { data: null, error: CLIENT_ERROR };
    const error = await data
      .upsert('dashboard_widgets', widgetValues('membre-1', 1), { onConflict: WIDGET_CONFLICT })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).cause).toBe(CLIENT_ERROR);
  });
});

describe('Contrat d’écriture — LocalAdapter (symétrie du mode démo)', () => {
  const adapter = getLocalAdapter();
  const upsertWidget = (memberId: string, width: number) =>
    adapter.upsert<Row>('dashboard_widgets', widgetValues(memberId, width), { onConflict: WIDGET_CONFLICT });

  it('deux écritures successives laissent une seule ligne par (member_id, widget_type)', async () => {
    const first = await upsertWidget('membre-upsert', 1);
    const second = await upsertWidget('membre-upsert', 0);

    const rows = await adapter.list<Row>('dashboard_widgets', { member_id: 'membre-upsert' });
    expect(rows).toHaveLength(1);
    // La ligne est mise à jour, pas dupliquée : même clé, même `id`.
    expect(second.id).toBe(first.id);
    expect(rows[0].id).toBe(first.id);
    expect(rows[0].width).toBe(0);
  });

  it('fusionne sur la ligne semée du membre, sans ajouter de doublon', async () => {
    // La ligne semée porte un `id` (`widget-1`) que l'appelant ne connaît pas :
    // c'est exactement le cas qui produisait la seconde série en mode démo.
    await upsertWidget(DEMO_MEMBERS.camille, 0);

    const rows = await adapter.list<Row>('dashboard_widgets', {
      member_id: DEMO_MEMBERS.camille,
      widget_type: 'calendrier',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('widget-1');
    expect(rows[0].width).toBe(0);
  });

  it('crée quand aucune ligne ne porte la cible', async () => {
    const created = await upsertWidget('membre-nouveau', 2);

    expect(typeof created.id).toBe('string');
    const rows = await adapter.list<Row>('dashboard_widgets', { member_id: 'membre-nouveau' });
    expect(rows).toHaveLength(1);
    expect(rows[0].width).toBe(2);
  });
});
