import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { createTestQueryClient, seedHouseholdStore } from '@/test/render';
import { useSessionStore } from '@/stores/session-store';
import { demoUser } from '@/hooks/use-auth';
import { catalogueModules, modulePath } from '@/lib/modules';
import { AppRoutes } from './router';

function renderAt(path: string) {
  // `BrowserRouter` lit l'URL du document : c'est elle qui décide de la route.
  window.history.pushState({}, '', path);
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/**
 * Un bouton de navigation ne vaut que s'il mène à une page. Sans ce test, le
 * catalogue peut afficher une catégorie dont la route n'existe pas : chaque
 * entrée est donc rattachée à son écran, pas seulement à un lien.
 */
describe('Routes du foyer', () => {
  it.each(catalogueModules)('affiche la page $key à la route /$key', async (entry) => {
    seedHouseholdStore();
    useSessionStore.setState({ status: 'authenticated', user: demoUser });
    renderAt(modulePath(entry.key));

    // Le premier amorçage du cache local d'un module peut dépasser le délai
    // par défaut de `waitFor`.
    const page = await waitFor(
      () => {
        const found = document.querySelector(`[data-module="${entry.key}"]`);
        expect(found, `la route ${modulePath(entry.key)} ne rend aucun espace`).not.toBeNull();
        return found!;
      },
      { timeout: 5000 },
    );

    // Un module se reconnaît à son en-tête : « Cette page n'existe pas »
    // porterait un autre titre et aucun attribut `data-module`.
    expect(page.querySelector('h1')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Cette page n’existe pas' })).not.toBeInTheDocument();
    expect(page.getAttribute('data-module')).toBe(entry.key);
  });
});
