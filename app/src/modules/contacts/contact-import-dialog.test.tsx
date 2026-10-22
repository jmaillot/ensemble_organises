import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import ContactsPage from './contacts-page';

const list = () => screen.findByRole('list', { name: 'Liste des contacts' });

const ouvrirImport = async (user: ReturnType<typeof userEvent.setup>) => {
  await within(await list()).findByText('Maya Martin');
  await user.click(screen.getByRole('button', { name: 'Importer un vCard' }));
  return screen.findByRole('dialog');
};

const choisirFichier = async (user: ReturnType<typeof userEvent.setup>, contenu: string) => {
  const dialogue = screen.getByRole('dialog');
  const input = within(dialogue).getByLabelText('Fichier vCard à importer') as HTMLInputElement;
  const fichier = new File([contenu], 'contacts.vcf', { type: 'text/vcard' });
  await user.upload(input, fichier);
  return dialogue;
};

describe('ContactImportDialog', () => {
  it('lit le fichier, montre l aperçu, importe les fiches et les fait apparaître', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactsPage />, { route: '/contacts' });

    const dialogue = await ouvrirImport(user);
    await choisirFichier(
      user,
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Nova Perrin',
        'BDAY:1995-03-14',
        'END:VCARD',
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Théo Perrin',
        'END:VCARD',
        'BEGIN:VCARD',
        'FN:Boulangerie du Coin',
        'ORG:Boulangerie du Coin',
        'X-ABShowAs:COMPANY',
        'END:VCARD',
      ].join('\n'),
    );

    // L'aperçu montre les deux personnes et dit la structure ignorée.
    expect(await within(dialogue).findByText('Nova Perrin')).toBeInTheDocument();
    expect(within(dialogue).getByText('Théo Perrin')).toBeInTheDocument();
    expect(within(dialogue).getByText(/1 structure\(s\) ignorée\(s\)/)).toBeInTheDocument();
    // La date est déjà affichée en JJ/MM/AAAA (D-02).
    expect(within(dialogue).getByText('14/03/1995')).toBeInTheDocument();

    await user.click(within(dialogue).getByRole('button', { name: 'Importer 2 fiches' }));

    // Les fiches importées arrivent dans la liste (Famille par défaut),
    // et le compteur « Fiches » passe de 5 à 7.
    await within(await list()).findByText('Nova Perrin');
    expect(within(await list()).getByText('Théo Perrin')).toBeInTheDocument();
    expect(screen.getByText('Fiches').closest('div')).toHaveTextContent('7');
  });

  it('marque les doublons probables et les exclut par défaut', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactsPage />, { route: '/contacts' });

    const dialogue = await ouvrirImport(user);
    await choisirFichier(
      user,
      ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Maya Martin', 'BDAY:1992-10-07', 'END:VCARD'].join('\n'),
    );

    // Maya Martin existe déjà au jeu de démo (07/10/1992) : la ligne est
    // marquée, le bouton n'annonce rien à importer tant qu'elle est exclue.
    const ligne = await within(dialogue).findByText('Maya Martin');
    expect(ligne).toBeInTheDocument();
    expect(within(dialogue).getByText('doublon ?')).toBeInTheDocument();
    expect(within(dialogue).getByRole('button', { name: 'Importer 0 fiches' })).toBeDisabled();

    // Décocher la case réintègre la fiche, sans bloquer : les homonymes
    // existent (D-04), c'est un choix explicite.
    await user.click(within(dialogue).getByRole('checkbox', { name: /doublons probables/ }));
    expect(within(dialogue).getByRole('button', { name: 'Importer la fiche' })).toBeEnabled();
  });

  it('dit clairement qu un fichier sans fiche exploitable n a rien donné', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactsPage />, { route: '/contacts' });

    const dialogue = await ouvrirImport(user);
    await choisirFichier(user, 'ceci n est pas un vcard');

    expect(await within(dialogue).findByText(/Aucune fiche exploitable/)).toBeInTheDocument();
    expect(within(dialogue).getByRole('button', { name: 'Importer 0 fiches' })).toBeDisabled();
  });
});
