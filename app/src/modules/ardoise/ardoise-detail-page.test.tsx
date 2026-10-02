import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { formatEuro } from '@/lib/utils';
import { DEMO_MEMBERS } from '@/lib/data/seed';
import ArdoiseDetailPage from './ardoise-detail-page';
import type { ArdoiseServerSettlement } from './api';

const { mockInvoke, mockRpc } = vi.hoisted(() => ({ mockInvoke: vi.fn(), mockRpc: vi.fn() }));

// Frontière client : snapshots sur l'adaptateur local, `expense-settlement`
// sur le stub, et le RPC d'écriture rejoué en local (même contrat que le
// serveur : UNE écriture dépense + parts). Le code réel de `api.ts` est exercé.
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>();
  const { getLocalAdapter } = await import('@/lib/data/local-adapter');
  return { ...actual, data: getLocalAdapter(), isLocalMode: true };
});

function renderDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/ardoise/:id" element={<ArdoiseDetailPage />} />
    </Routes>,
    { route: '/ardoise/ardoise-foyer' },
  );
}

/** Total des quatre dépenses du foyer de démonstration. */
const seedTotal = 84.5 + 62.3 + 8.5 + 34;
/** Thomas : (essence 62,30 − sa part 31,15) + cinéma 34,00 entièrement pour lui − part des courses. */
const seedThomas = 62.3 - 31.15 + 34 - 34 - 28.17;
/** Camille : courses 84,50 − sa part 28,17 − part de l'essence. */
const seedCamille = 84.5 - 28.17 - 31.15;

/** `formatEuro` insère une espace insécable : on la normalise avant de comparer. */
const plain = (value: string) => value.replace(/ /g, ' ');

const expectAmount = (testId: string, amount: number) =>
  expect(plain(screen.getByTestId(testId).textContent ?? '')).toContain(plain(formatEuro(amount)));
const balanceOf = (memberId: string) => `balance-row-membre:${memberId}`;

/** Soldes volontairement différents du calcul local : la provenance se voit. */
const serverPayload: ArdoiseServerSettlement = {
  ardoise_id: 'ardoise-foyer',
  household_id: 'household-demo',
  balances: [
    { kind: 'membre', participant_id: DEMO_MEMBERS.camille, display_name: 'Camille Martin', amount: 100 },
    { kind: 'membre', participant_id: DEMO_MEMBERS.thomas, display_name: 'Thomas Martin', amount: -50 },
    { kind: 'membre', participant_id: DEMO_MEMBERS.lina, display_name: 'Lina Martin', amount: -50 },
    { kind: 'membre', participant_id: DEMO_MEMBERS.noe, display_name: 'Noé Martin', amount: 0 },
  ],
  settlements: [
    {
      from_kind: 'membre',
      from_id: DEMO_MEMBERS.thomas,
      from_name: 'Thomas Martin',
      to_kind: 'membre',
      to_id: DEMO_MEMBERS.camille,
      to_name: 'Camille Martin',
      amount: 50,
    },
  ],
  generated_at: '2026-09-30T10:00:00.000Z',
};

describe('ArdoiseDetailPage', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    // Par défaut : le serveur ne répond pas, le calcul local prend le relais.
    mockInvoke.mockRejectedValue(new Error('offline'));
    // RPC d'écriture rejoué en local : dépense + parts en une fois.
    mockRpc.mockReset();
    mockRpc.mockImplementation(async (fn: string, payload: Record<string, unknown>) => {
      const { getLocalAdapter } = await import('@/lib/data/local-adapter');
      const adapter = getLocalAdapter();
      if (fn === 'create_expense') {
        const row = (await adapter.create('expenses', {
          household_id: payload.p_household_id,
          ardoise_id: payload.p_ardoise_id,
          title: payload.p_title,
          amount: payload.p_amount,
          paid_by: payload.p_paid_by,
          paid_by_guest: payload.p_paid_by_guest,
          expense_date: payload.p_expense_date,
          split_type: payload.p_split_type,
        } as never)) as { id: string };
        for (const part of (payload.p_parts ?? []) as Record<string, unknown>[]) {
          await adapter.create('expense_participants', { expense_id: row.id, ...part } as never);
        }
        return { data: row, error: null };
      }
      if (fn === 'update_expense') {
        const row = await adapter.update('expenses', payload.p_expense_id as string, {
          title: payload.p_title,
          amount: payload.p_amount,
          paid_by: payload.p_paid_by,
          paid_by_guest: payload.p_paid_by_guest,
          expense_date: payload.p_expense_date,
          split_type: payload.p_split_type,
        } as never);
        const oldParts = (await adapter.list('expense_participants', { expense_id: payload.p_expense_id as string })) as { id: string }[];
        await Promise.all(oldParts.map((part) => adapter.remove('expense_participants', part.id)));
        for (const part of (payload.p_parts ?? []) as Record<string, unknown>[]) {
          await adapter.create('expense_participants', { expense_id: payload.p_expense_id, ...part } as never);
        }
        return { data: row, error: null };
      }
      return { data: null, error: new Error(`RPC inconnue : ${fn}`) };
    });
  });

  it('ajouter une dépense met à jour le total et la ligne « Qui doit quoi ? »', async () => {
    const user = userEvent.setup();
    renderDetail();

    expect(await screen.findByText('Courses du samedi')).toBeInTheDocument();
    expectAmount('balance-total', seedTotal);
    await user.click(screen.getByRole('tab', { name: 'Répartition' }));
    expectAmount(balanceOf(DEMO_MEMBERS.thomas), seedThomas);
    await user.click(screen.getByRole('tab', { name: 'Dépenses' }));

    await user.click(screen.getAllByRole('button', { name: 'Ajouter une dépense' })[0]);
    const dialog = await screen.findByRole('dialog');
    // Maya (foyer, hors ardoise) n’est proposée ni en payeur ni en partage.
    expect(within(dialog).queryByRole('checkbox', { name: /Maya/ })).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Libellé/), 'Pizza du soir');
    await user.type(within(dialog).getByLabelText(/Montant/), '20');
    // Partage limité à Camille et Thomas (seuls inscrits cochés : Lina décochée,
    // Maya n’est pas dans l’ardoise donc absente du formulaire).
    await user.click(within(dialog).getByRole('checkbox', { name: /Lina/ }));

    expect(plain(within(dialog).getByText(/par personne/).textContent ?? '')).toContain('10,00');

    await user.click(within(dialog).getByRole('button', { name: 'Ajouter la dépense' }));

    expect(await screen.findByText('Pizza du soir')).toBeInTheDocument();
    await waitFor(() => expectAmount('balance-total', seedTotal + 20));
    // La fermeture du dialogue suit le rafraîchissement : on l'attend avant
    // de cliquer dans le fond (sinon le fond est aria-hidden pour Radix).
    await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0));
    await user.click(screen.getByRole('tab', { name: 'Répartition' }));
    // Camille avance 20 €, Thomas n'en reprend que 10 €.
    expectAmount(balanceOf(DEMO_MEMBERS.thomas), seedThomas - 10);
    expectAmount(balanceOf(DEMO_MEMBERS.camille), seedCamille + 20 - 10);
  });

  it('modifier une dépense pré-remplit le dialogue et recalcule les soldes', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Modifier Café du marché' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Modifier la dépense')).toBeInTheDocument();
    // Pré-remplissage : le libellé et le montant de la dépense visée.
    expect(within(dialog).getByLabelText(/Libellé/)).toHaveValue('Café du marché');
    expect(within(dialog).getByLabelText(/Montant/)).toHaveValue(8.5);

    await user.clear(within(dialog).getByLabelText(/Montant/));
    await user.type(within(dialog).getByLabelText(/Montant/), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expectAmount('balance-total', seedTotal - 8.5 + 10));
    expect(screen.getByText('Café du marché')).toBeInTheDocument();
  });

  it('supprimer une dépense demande confirmation', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Supprimer Café du marché' }));
    const confirmation = await screen.findByRole('alertdialog');
    expect(within(confirmation).getByText(/Supprimer « Café du marché »/)).toBeInTheDocument();

    await user.click(within(confirmation).getByRole('button', { name: 'Annuler' }));
    expect(screen.getByText('Café du marché')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Supprimer Café du marché' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer la dépense' }));

    await waitFor(() => expect(screen.queryByText('Café du marché')).not.toBeInTheDocument());
    await waitFor(() => expectAmount('balance-total', seedTotal - 8.5));
  });

  it('affiche les soldes et transferts du serveur', async () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValueOnce({ data: serverPayload, error: null });
    renderDetail();

    await screen.findByText('Courses du samedi');
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Répartition' }));
    expectAmount(balanceOf(DEMO_MEMBERS.camille), 100);
    expect(screen.getByText(/Thomas Martin → Camille Martin/)).toBeInTheDocument();
  });

  it('réaffiche le code mémorisé après navigation (remontage)', async () => {
    const code = 'CODE-MEMOIRE-1234567890';
    localStorage.setItem('eo:ardoise-code:ardoise-foyer', code);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ardoiseId: 'ardoise-foyer',
          isActive: true,
          hasCode: true,
          expiresAt: null,
          maxUses: null,
          useCount: 0,
        }),
      }),
    );
    try {
      const user = userEvent.setup();
      const first = renderDetail();
      await user.click(screen.getByRole('tab', { name: 'Paramètres' }));
      expect(await screen.findByText(code)).toBeInTheDocument();
      first.unmount();

      renderDetail();
      await user.click(screen.getByRole('tab', { name: 'Paramètres' }));
      expect(await screen.findByText(code)).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
      localStorage.clear();
    }
  });
});
