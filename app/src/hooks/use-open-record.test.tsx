import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useOpenRecord } from './use-open-record';
import { OPEN_RECORD_PARAM } from '@/lib/record-paths';

/**
 * Le lien profond d'une recherche : l'URL demande une FICHE, la page
 * l'ouvre.
 *
 * Ce que le crochet doit garantir, et que la chaîne se voit à l'écran :
 * la fiche s'ouvre UNE fois (les enregistrements arrivent en différé, et
 * l'effet se rejoue à chaque rendu) ; une fiche INCONNUE n'ouvre rien ; et
 * la fiche demandée s'ouvre même quand elle arrive APRÈS le premier rendu.
 */

interface Fiche {
  id: string;
  nom: string;
}

function Fictif({ fiches }: { fiches: Fiche[] }) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  useOpenRecord(fiches, (fiche) => setOuvert(fiche.nom));
  return <p>{ouvert ? `ouverte : ${ouvert}` : 'rien'}</p>;
}

function renderFictif(route: string, fiches: Fiche[]) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/" element={<Fictif fiches={fiches} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('useOpenRecord', () => {
  it('ouvre la fiche demandée par l’URL', async () => {
    renderFictif(`/?${OPEN_RECORD_PARAM}=fiche-2`, [
      { id: 'fiche-1', nom: 'Première' },
      { id: 'fiche-2', nom: 'Deuxième' },
    ]);
    await waitFor(() => {
      expect(screen.getByText('ouverte : Deuxième')).toBeInTheDocument();
    });
  });

  it('n’ouvre rien quand la fiche demandée n’existe pas', async () => {
    renderFictif(`/?${OPEN_RECORD_PARAM}=inconnue`, [{ id: 'fiche-1', nom: 'Première' }]);
    await waitFor(() => {
      expect(screen.getByText('rien')).toBeInTheDocument();
    });
  });

  it('n’ouvre rien sans paramètre', async () => {
    renderFictif('/', [{ id: 'fiche-1', nom: 'Première' }]);
    await waitFor(() => {
      expect(screen.getByText('rien')).toBeInTheDocument();
    });
  });

  it('n’ouvre pas la fiche une seconde fois quand les enregistrements changent', async () => {
    const user = userEvent.setup();
    function Parent() {
      const [fiches, setFiches] = useState<Fiche[]>([{ id: 'fiche-1', nom: 'Première' }]);
      return (
        <>
          <Fictif fiches={fiches} />
          <button type="button" onClick={() => setFiches((current) => [...current, { id: 'fiche-2', nom: 'Deuxième' }])}>
            ajouter
          </button>
        </>
      );
    }
    render(
      <MemoryRouter initialEntries={[`/?${OPEN_RECORD_PARAM}=fiche-1`]}>
        <Routes>
          <Route path="/" element={<Parent />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('ouverte : Première')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'ajouter' }));
    // La fiche reste ouverte UNE fois : le verrou retient l'identifiant traité.
    expect(screen.getAllByText('ouverte : Première')).toHaveLength(1);
  });
});
