import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import type { ConversationMemberRow, MessageRow } from '@/types';
import { useHouseholdStore } from '@/stores/household-store';
import MessagesPage from './messages-page';

describe('Messages', () => {
  it('ouvre la conversation de Lina et y ajoute un message', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    const lina = await screen.findByRole('button', { name: /^Lina/ });
    await user.click(lina);

    const log = await screen.findByRole('log', { name: /Messages de Lina/ });
    expect(within(log).getByText('Tu as vu le nouveau parc ?')).toBeInTheDocument();
    expect(within(log).getByText('Pas encore, tu me donneras l’adresse ?')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Écrire un message'), 'Je passe ce soir avec les pizzas');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));

    // L'envoi est optimiste puis confirmé par une relecture : le fil peut être
    // remplacé pendant la requête, on réévalue le journal à chaque tour.
    await waitFor(
      () => {
        expect(within(screen.getByRole('log')).getByText('Je passe ce soir avec les pizzas')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    // Le champ se vide dès l'envoi ; la confirmation arrive ensuite.
    await waitFor(() => expect(screen.getByLabelText('Écrire un message')).toHaveValue(''), { timeout: 4000 });
  });

  it('affiche toutes les bulles en fond clair, texte sombre', async () => {
    // Écriture sombre sur fond blanc des deux côtés : seul l'alignement
    // distingue envoyés et reçus. RTL ne voit pas les contrastes : on
    // verrouille l'absence de tout fond sombre dans le fil.
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    const lina = await screen.findByRole('button', { name: /^Lina/ });
    await user.click(lina);
    const log = await screen.findByRole('log', { name: /Messages de Lina/ });

    const received = within(log).getByText('Tu as vu le nouveau parc ?').closest('div');
    expect(received?.className).toMatch(/bg-surface/);

    await user.type(screen.getByLabelText('Écrire un message'), 'Je passe ce soir');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    // La bulle optimiste est remplacée par la confirmée au retour du réseau :
    // on réévalue depuis le journal à chaque tour, jamais sur un nœud périmé.
    await waitFor(() => {
      const text = within(log).getByText('Je passe ce soir');
      const current = text.closest('div');
      expect(current?.className).toMatch(/bg-surface/);
      expect(within(current as HTMLElement).getByText('Camille Martin :')).toBeInTheDocument();
    });
    expect(log.querySelectorAll('.bg-fg').length).toBe(0);
  });

  it('expose la conversation active et le fil de discussion de façon accessible', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    const lina = await screen.findByRole('button', { name: /^Lina/ });
    await user.click(lina);
    expect(lina).toHaveAttribute('aria-current', 'true');

    const log = screen.getByRole('log', { name: /Messages de Lina/ });
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByLabelText('Écrire un message')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument();
  });

  it('crée un échange privé avec un membre et le sélectionne', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);
    await screen.findByRole('button', { name: /^Lina/ });

    await user.click(screen.getByRole('button', { name: 'Nouveau message' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Inviter Thomas Martin' }));
    await user.click(within(dialog).getByRole('button', { name: 'Démarrer' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Le direct avec Thomas apparaît dans la liste et devient actif.
    expect(await screen.findByRole('log', { name: 'Messages de Thomas' })).toBeInTheDocument();
  });

  it('exige un titre pour un groupe', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);
    await screen.findByRole('button', { name: /^Lina/ });

    await user.click(screen.getByRole('button', { name: 'Nouveau message' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Groupe' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Inviter Thomas Martin' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Inviter Lina Martin' }));
    await user.click(within(dialog).getByRole('button', { name: 'Démarrer' }));

    expect(await within(dialog).findByText('Un groupe exige un titre.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Titre du groupe/), 'Projet cabane');
    await user.click(within(dialog).getByRole('button', { name: 'Démarrer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('log', { name: 'Messages de Projet cabane' })).toBeInTheDocument();
  });

  it('fait entrer un membre manquant, enfant compris', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    await user.click(await screen.findByRole('button', { name: /^Lina/ }));
    await user.click(await screen.findByRole('button', { name: /Ajouter un membre/ }));
    const dialog = await screen.findByRole('dialog');
    // Noé est enfant : il converse comme les autres, y compris ici.
    await user.click(within(dialog).getByRole('checkbox', { name: 'Ajouter Noé Martin' }));
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('joint une image au message et l’affiche dans le fil', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:testapercu',
      revokeObjectURL: () => undefined,
    });
    renderWithProviders(<MessagesPage />);

    await user.click(await screen.findByRole('button', { name: /^Lina/ }));
    const file = new File(['pixels'], 'parc.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Joindre une image', { selector: 'input' }), file);
    expect(await screen.findByText(/parc\.png/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Écrire un message'), 'La photo du parc');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));

    const log = await screen.findByRole('log', { name: /Messages de Lina/ });
    await waitFor(() => expect(within(log).getByText('La photo du parc')).toBeInTheDocument(), { timeout: 5000 });
    expect(within(log).getByRole('link', { name: /Ouvrir l’image/ })).toBeInTheDocument();
  });

  it('laisse Noé, enfant, joindre une image et l’envoyer', async () => {
    // D-01, verrou UI : le dépôt client ne regarde pas le rôle, seule la
    // porte serveur (0099, prouvée par 0038) arbitre. Le fil est ouvert sous
    // l'identité admin puis l'envoi part de Noé, via le chemin dégradé
    // (aperçu local, Supabase non configuré sous Vitest).
    const user = userEvent.setup();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:apercu-noe',
      revokeObjectURL: () => undefined,
    });
    // Noé rejoint le fil (membre actif) AVANT le montage : le dépôt prouvé
    // par 0038 exige l'appartenance au fil, et la liste ne montre que les
    // fils rejoints — une écriture en cours de test ferait clignoter la vue.
    await data.create<ConversationMemberRow>('conversation_members', {
      conversation_id: 'conversation-1',
      member_id: DEMO_MEMBERS.noe,
      left_at: null,
    });
    renderWithProviders(<MessagesPage />);

    // Noé membre, le direct à trois s'intitule dans un ordre de registre
    // (ici « Noé, Lina ») : on matche sans ancre, Lina n'apparaît qu'ici.
    await user.click(await screen.findByRole('button', { name: /Lina/ }));
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.noe });

    const file = new File(['pixels'], 'cabane.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Joindre une image', { selector: 'input' }), file);
    expect(await screen.findByText(/cabane\.png/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Écrire un message'), 'La photo de la cabane');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));

    // Vu par Noé, le direct à deux autres s'intitule « Camille, Lina ».
    const log = await screen.findByRole('log', { name: 'Messages de Camille, Lina' });
    await waitFor(() => expect(within(log).getByText('La photo de la cabane')).toBeInTheDocument(), { timeout: 5000 });
    expect(within(log).getByText('Noé Martin :')).toBeInTheDocument();
    expect(within(log).getByRole('link', { name: /Ouvrir l’image/ })).toBeInTheDocument();
  });

  it('modifie son propre message et l’enregistre', async () => {
    // D-02 : l'expéditrice seule voit « Modifier » ; l'enregistrement est
    // optimiste (rollback serveur en cas de refus, prouvé par la RLS 0038).
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    await user.click(await screen.findByRole('button', { name: /^Lina/ }));
    const log = await screen.findByRole('log', { name: /Messages de Lina/ });
    const bubble = within(log).getByText('Pas encore, tu me donneras l’adresse ?').closest('div');
    expect(bubble).not.toBeNull();
    await user.click(within(bubble as HTMLElement).getByRole('button', { name: 'Modifier ce message' }));

    const editor = within(bubble as HTMLElement).getByLabelText('Modifier votre message');
    expect(editor).toHaveValue('Pas encore, tu me donneras l’adresse ?');
    await user.clear(editor);
    await user.type(editor, 'Adresse reçue, merci !');
    await user.click(within(bubble as HTMLElement).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(within(log).getByText('Adresse reçue, merci !')).toBeInTheDocument());
    expect(within(log).queryByText('Pas encore, tu me donneras l’adresse ?')).not.toBeInTheDocument();
    // Le toast suit la confirmation serveur, après l'optimiste : il s'attend.
    await waitFor(() => expect(screen.getByText('Message modifié.')).toBeInTheDocument());
  });

  it('annule l’édition sans toucher au message', async () => {
    // Chaque test repart d'une base regarnie (setup afterEach) : `message-2`
    // est la bulle de Camille, intacte ici.
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    await user.click(await screen.findByRole('button', { name: /^Lina/ }));
    const log = await screen.findByRole('log', { name: /Messages de Lina/ });
    const bubble = within(log).getByText('Pas encore, tu me donneras l’adresse ?').closest('div');
    expect(bubble).not.toBeNull();
    await user.click(within(bubble as HTMLElement).getByRole('button', { name: 'Modifier ce message' }));

    const editor = within(bubble as HTMLElement).getByLabelText('Modifier votre message');
    await user.clear(editor);
    await user.type(editor, 'Brouillon abandonné');
    await user.click(within(bubble as HTMLElement).getByRole('button', { name: 'Annuler' }));

    expect(within(log).getByText('Pas encore, tu me donneras l’adresse ?')).toBeInTheDocument();
    expect(within(log).queryByLabelText('Modifier votre message')).not.toBeInTheDocument();
  });

  it('supprime son propre message après confirmation, le reste du fil demeure', async () => {
    // D-03 : suppression d'un seul message (`message-2`, Camille),
    // historique conservé autour.
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    await user.click(await screen.findByRole('button', { name: /^Lina/ }));
    const log = await screen.findByRole('log', { name: /Messages de Lina/ });
    const bubble = within(log).getByText('Pas encore, tu me donneras l’adresse ?').closest('div');
    expect(bubble).not.toBeNull();
    await user.click(within(bubble as HTMLElement).getByRole('button', { name: 'Supprimer ce message' }));

    const alert = await screen.findByRole('alertdialog');
    expect(alert).toHaveTextContent('disparaîtra pour tous les membres');
    await user.click(within(alert).getByRole('button', { name: 'Supprimer le message' }));

    await waitFor(() => expect(within(log).queryByText('Pas encore, tu me donneras l’adresse ?')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Message supprimé.')).toBeInTheDocument());
    // Les bulles voisines survivent à la suppression ciblée.
    expect(within(log).getByText('Tu as vu le nouveau parc ?')).toBeInTheDocument();
    expect(within(log).getByText(/je te l’envoie/)).toBeInTheDocument();
  });

  it('ne propose plus à l’admin de supprimer le message d’autrui, sans l’éditer', async () => {
    // D-07, miroir RLS (0039) : Camille administre mais ne voit « Supprimer »
    // que sur ses propres bulles — jamais sur celles d'autrui, jamais
    // « Modifier » hors de ses messages. La modération passe par le fil.
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    await user.click(await screen.findByRole('button', { name: /^Lina/ }));
    const log = await screen.findByRole('log', { name: /Messages de Lina/ });
    const bubble = within(log).getByText('Tu as vu le nouveau parc ?').closest('div');
    expect(bubble).not.toBeNull();
    expect(within(bubble as HTMLElement).queryByRole('button', { name: 'Modifier ce message' })).not.toBeInTheDocument();
    expect(within(bubble as HTMLElement).queryByRole('button', { name: 'Supprimer ce message' })).not.toBeInTheDocument();

    // Sa propre bulle garde la suppression confirmée.
    const mine = within(log).getByText('Pas encore, tu me donneras l’adresse ?').closest('div');
    expect(mine).not.toBeNull();
    expect(within(mine as HTMLElement).getByRole('button', { name: 'Supprimer ce message' })).toBeInTheDocument();

    // Le levier de modération demeure : la suppression du fil entier.
    expect(screen.getByRole('button', { name: 'Supprimer la conversation Lina' })).toBeInTheDocument();
  });

  it('page le fil par conversation avec un « Charger plus » explicite', async () => {
    // D-05 : ~35 messages ajoutés au fil de Lina ; la première fenêtre (30)
    // cache les plus anciens, « Charger plus » les annexe. Les effectifs
    // sont lus en base (le début de suite y écrit déjà) plutôt que codés en
    // dur. `conversation-1` est l'identifiant graine du direct avec Lina.
    const seedCount = (await data.list<MessageRow>('messages', { conversation_id: 'conversation-1' })).length;
    // Ancrage déterministe : les paginés naissent après la graine la plus
    // récente, à une seconde d'intervalle. Sans lui, `created_at` vaudrait
    // l'heure d'exécution et le fenêtrage dépendrait de l'heure du lancement
    // (avant 10 h 45, les graines fixes trient après les paginés).
    const seedNewest = (await data.list<MessageRow>('messages', { conversation_id: 'conversation-1' })).reduce(
      (latest, row) => (row.created_at > latest ? row.created_at : latest),
      '',
    );
    // Même format que les graines (`AAAA-MM-JJTHH:mm:ss` local, sans fuseau) :
    // le tri du fil compare les chaînes, et un ISO `Z` trierait avant elles
    // quel que soit l'instant réel.
    const pad = (value: number) => String(value).padStart(2, '0');
    const stampAfterSeed = (seconds: number) => {
      const date = new Date(new Date(seedNewest).getTime() + seconds * 1000);
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };
    const seedBase = new Date(seedNewest).getTime();
    expect(Number.isNaN(seedBase)).toBe(false);
    for (let index = 0; index < 35; index += 1) {
      await data.create<MessageRow>('messages', {
        conversation_id: 'conversation-1',
        household_id: DEMO_HOUSEHOLD_ID,
        sender_id: index % 2 === 0 ? DEMO_MEMBERS.camille : DEMO_MEMBERS.lina,
        content: `Message paginé ${index}`,
        media_url: null,
        created_at: stampAfterSeed(index + 1),
      });
    }
    const total = (await data.list<MessageRow>('messages', { conversation_id: 'conversation-1' })).length;
    expect(total).toBeGreaterThan(30);
    expect(total).toBe(seedCount + 35);
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    await user.click(await screen.findByRole('button', { name: /^Lina/ }));
    const log = await screen.findByRole('log', { name: /Messages de Lina/ });

    expect(await within(log).findByText('Message paginé 34')).toBeInTheDocument();
    // `message-3` (10 h 45, jamais touché par les tests) est le plus ancien
    // survivant : il reste déchargé tant que la fenêtre ne s'élargit pas.
    expect(within(log).queryByText(/je te l’envoie/)).not.toBeInTheDocument();
    expect(within(log).getByText(`30 sur ${total} messages chargés`)).toBeInTheDocument();

    await user.click(within(log).getByRole('button', { name: 'Charger les messages précédents' }));
    await waitFor(() => expect(within(log).getByText(/je te l’envoie/)).toBeInTheDocument());
    expect(within(log).getByText(`${total} sur ${total} messages chargés`)).toBeInTheDocument();
    expect(within(log).queryByRole('button', { name: 'Charger les messages précédents' })).not.toBeInTheDocument();
  });

  it('fusionne l’insert temps réel sans dupliquer la bulle', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    await user.click(await screen.findByRole('button', { name: /^Lina/ }));
    const log = await screen.findByRole('log', { name: /Messages de Lina/ });

    await data.create<MessageRow>('messages', {
      conversation_id: 'conversation-1',
      household_id: DEMO_HOUSEHOLD_ID,
      sender_id: DEMO_MEMBERS.lina,
      content: 'Temps réel sans doublon',
      media_url: null,
    });

    await waitFor(() => expect(within(log).getByText('Temps réel sans doublon')).toBeInTheDocument());
    await waitFor(() => {
      expect(within(log).getAllByText('Temps réel sans doublon')).toHaveLength(1);
    });
  });

  it('quitte une conversation : archives en lecture seule, historique conservé', async () => {
    // D-08 : le départ tombe la ligne (`left_at`, vérifié au registre), le
    // fil bascule dans « Anciennes conversations », lecture seule, historique
    // conservé — la sélection reste sur place au lieu de disparaître.
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    await user.click(await screen.findByRole('button', { name: /^Lina/ }));
    expect(await screen.findByRole('log', { name: /Messages de Lina/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Quitter la conversation Lina' }));
    const alert = await screen.findByRole('alertdialog');
    expect(alert).toHaveTextContent('anciennes conversations');
    await user.click(within(alert).getByRole('button', { name: 'Quitter la conversation' }));

    await waitFor(() =>
      expect(screen.getByText('Conversation quittée : elle reste dans vos anciennes conversations.')).toBeInTheDocument(),
    );

    // La tombe est écrite, la ligne n'est pas retirée.
    const rows = await data.list<ConversationMemberRow>('conversation_members');
    const tomb = rows.find((row) => row.member_id === DEMO_MEMBERS.camille && row.left_at);
    expect(tomb).toBeDefined();

    // Section archives + panneau lecture seule, historique conservé.
    expect(screen.getByText('Anciennes conversations')).toBeInTheDocument();
    const log = screen.getByRole('log', { name: /Messages de Lina/ });
    expect(within(log).getByText('Tu as vu le nouveau parc ?')).toBeInTheDocument();
    expect(screen.getByText(/lecture seule/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Écrire un message')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retirer .* de mes archives/ })).toBeInTheDocument();
  });

  it('retire un fil quitté de ses archives, il disparaît sans toucher aux autres', async () => {
    // D-08 : le retrait des archives supprime sa propre pierre (modale de
    // confirmation, nettoyage personnel) ; le fil disparaît, les autres fils
    // et l'historique des restants demeurent.
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    await user.click(await screen.findByRole('button', { name: /^Lina/ }));
    await user.click(screen.getByRole('button', { name: 'Quitter la conversation Lina' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Quitter la conversation' }),
    );
    await waitFor(() =>
      expect(screen.getByText('Conversation quittée : elle reste dans vos anciennes conversations.')).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: /Retirer .* de mes archives/ }));
    const alert = await screen.findByRole('alertdialog');
    expect(alert).toHaveTextContent('ne supprime la conversation pour personne d’autre');
    await user.click(within(alert).getByRole('button', { name: 'Retirer de mes archives' }));

    await waitFor(() => expect(screen.getByText('Fil retiré de vos archives.')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Lina/ })).not.toBeInTheDocument());
    expect(screen.queryByText('Anciennes conversations')).not.toBeInTheDocument();

    // La pierre est partie, sans emporter le reste du registre.
    const rows = await data.list<ConversationMemberRow>('conversation_members');
    expect(rows.some((row) => row.member_id === DEMO_MEMBERS.camille && row.conversation_id === 'conversation-1')).toBe(false);
    expect(rows.filter((row) => row.conversation_id === 'conversation-1').map((row) => row.member_id)).toEqual([
      DEMO_MEMBERS.lina,
    ]);

    // Les autres fils restent ouverts et sélectionnables.
    expect(screen.getByRole('button', { name: /^Thomas/ })).toBeInTheDocument();
  });

  it('exclut le partant du registre actif, sans toucher aux archives des autres', async () => {
    // D-08, miroir registre : après le départ de Camille, le registre actif
    // du fil ne la compte plus (Lina reste) tandis que la tombe demeure
    // lisible ; la liste active ne montre plus Lina, les archives si.
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    await user.click(await screen.findByRole('button', { name: /^Lina/ }));
    await user.click(screen.getByRole('button', { name: 'Quitter la conversation Lina' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Quitter la conversation' }),
    );
    await waitFor(() =>
      expect(screen.getByText('Conversation quittée : elle reste dans vos anciennes conversations.')).toBeInTheDocument(),
    );

    const rows = await data.list<ConversationMemberRow>('conversation_members', { conversation_id: 'conversation-1' });
    expect(rows.filter((row) => !row.left_at).map((row) => row.member_id)).toEqual([DEMO_MEMBERS.lina]);
    expect(rows.some((row) => row.member_id === DEMO_MEMBERS.camille && row.left_at)).toBe(true);

    // Une seule « Lina » à l'écran : celle des archives.
    expect(screen.getAllByRole('button', { name: /^Lina/ })).toHaveLength(1);
    const archived = screen.getByRole('list', { name: 'Anciennes conversations' });
    expect(within(archived).getByRole('button', { name: /^Lina/ })).toBeInTheDocument();
  });

  it('désactive le départ pour le dernier membre restant', async () => {
    // `conversation-3` ne déclare que Camille : quitter est désactivé avec
    // copie explicative plutôt qu'un refus serveur.
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    await user.click(await screen.findByRole('button', { name: /^Maya/ }));
    expect(await screen.findByRole('log', { name: 'Messages de Maya' })).toBeInTheDocument();

    const quit = screen.getByRole('button', { name: 'Quitter la conversation Maya' });
    expect(quit).toBeDisabled();
    expect(quit).toHaveAttribute('title', expect.stringContaining('dernier membre'));
    await user.click(quit);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('supprime une conversation et son fil après confirmation', async () => {
    // Dernier : la cascade retire le fil de Lina, déjà quitté plus haut —
    // l'opération admin ne dépend d'aucune appartenance.
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    await user.click(await screen.findByRole('button', { name: /^Lina/ }));
    expect(await screen.findByRole('log', { name: /Messages de Lina/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Supprimer la conversation Lina' }));
    const alert = await screen.findByRole('alertdialog');
    await user.click(within(alert).getByRole('button', { name: 'Supprimer la conversation' }));

    await waitFor(() => expect(screen.queryByRole('log', { name: /Messages de Lina/ })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Lina/ })).not.toBeInTheDocument());
    expect(screen.getByText('Conversation supprimée.')).toBeInTheDocument();
  });
});
