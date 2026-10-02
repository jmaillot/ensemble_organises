import { Link } from 'react-router';

const EFFECTIVE_DATE = '3 octobre 2026';
const CONTACT_EMAIL = 'jeremymaillot@gmail.com';

/**
 * Politique de confidentialité (RGPD), page publique.
 * Langage simple, sans jargon inutile. Mise à jour = nouvelle date d'effet.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[780px] px-5 py-10 max-[650px]:px-[15px]">
      <p className="mb-2 text-[11px] font-extrabold tracking-wide text-muted uppercase">
        <Link to="/" className="text-accent-strong">
          Ensemble &amp; Organisés
        </Link>{' '}
        · Confidentialité
      </p>
      <h1 className="mb-2 font-display text-[clamp(26px,3vw,38px)] leading-[1.05] tracking-[-0.03em]">
        Politique de confidentialité
      </h1>
      <p className="mt-0 mb-8 text-[13px] text-muted">En vigueur depuis le {EFFECTIVE_DATE}.</p>

      <div className="grid gap-7 text-[14px] leading-relaxed">
        <section aria-labelledby="prive-qui">
          <h2 id="prive-qui" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            1. Qui traite vos données ?
          </h2>
          <p className="m-0">
            L’application <strong>Ensemble &amp; Organisés</strong> est éditée par <strong>Jérémy Maillot</strong>,
            responsable du traitement de vos données personnelles. Pour toute question sur la confidentialité ou pour
            exercer vos droits (voir § 7), écrivez à{' '}
            <a className="font-bold text-accent-strong" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section aria-labelledby="prive-quoi">
          <h2 id="prive-quoi" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            2. Quelles données collectons-nous ?
          </h2>
          <p className="mt-0 mb-2">Uniquement ce qui sert à organiser votre foyer. Rien n’est revendu, rien ne sert à la publicité.</p>
          <ul className="m-0 grid gap-1.5 pl-5">
            <li>
              <strong>Compte :</strong> nom, adresse e-mail (via Google, Facebook ou e-mail et mot de passe) et photo
              de profil si vous en fournissez une.
            </li>
            <li>
              <strong>Foyer :</strong> nom du foyer, membres et leurs rôles (admin, membre, enfant).
            </li>
            <li>
              <strong>Contenu que vous saisissez :</strong> listes de courses, événements du calendrier, notes,
              tâches et échéances, routines et leur historique, dépenses partagées et leur répartition (Ardoise),
              listes de cadeaux (prix, commentaires, liens, photos), anniversaires (noms, dates, photos), fiches
              animaux (nom, race, poids, identification, carnet de santé), prestataires (nom, e-mail, téléphone,
              adresse), cartes de fidélité (codes-barres, QR codes), adresses et lieux (notes, photos, position si
              vous l’enregistrez), publications, photos, vidéos et commentaires du Cercle, messages entre membres.
            </li>
            <li>
              <strong>Données techniques :</strong> adresse IP, type d’appareil et données de navigation nécessaires au
              fonctionnement (service worker et cache hors ligne de l’application).
            </li>
            <li>
              <strong>Notifications :</strong> jeton d’envoi sur votre appareil, uniquement si vous acceptez les
              notifications (rappels de tâches, routines, événements).
            </li>
          </ul>
        </section>

        <section aria-labelledby="prive-pourquoi">
          <h2 id="prive-pourquoi" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            3. Pourquoi, et sur quelle base légale ?
          </h2>
          <ul className="m-0 grid gap-1.5 pl-5">
            <li>
              <strong>Faire fonctionner le service</strong> (organisation familiale, authentification, sécurité du
              compte) : exécution du contrat, c’est-à-dire votre utilisation de l’application.
            </li>
            <li>
              <strong>Envoyer notifications et rappels</strong> : votre consentement, donné en acceptant les
              notifications, retirable à tout moment dans les réglages de votre appareil ou navigateur.
            </li>
            <li>
              <strong>Améliorer le service</strong> (correction des erreurs, fiabilité) : intérêt légitime, sans
              profilage ni publicité.
            </li>
          </ul>
        </section>

        <section aria-labelledby="prive-qui-voit">
          <h2 id="prive-qui-voit" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            4. Qui voit vos données ?
          </h2>
          <ul className="m-0 grid gap-1.5 pl-5">
            <li>
              <strong>Les membres de votre foyer</strong>, selon la nature de chaque donnée (par exemple, une liste
              de cadeaux privée reste masquée à son destinataire).
            </li>
            <li>
              <strong>Nos sous-traitants techniques :</strong> la base de données et l’authentification sont hébergées
              par nos soins (Supabase auto-hébergé, serveurs situés en France / Union européenne, infrastructure
              Oracle). Google et Facebook n’interviennent que pour la connexion (nom, e-mail) : aucune donnée de
              votre foyer ne leur est transmise. Les notifications sont envoyées par notre propre serveur, sans
              prestataire tiers.
            </li>
          </ul>
          <p className="mb-0">Aucune donnée n’est vendue, louée ni partagée à des fins publicitaires.</p>
        </section>

        <section aria-labelledby="prive-duree">
          <h2 id="prive-duree" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            5. Combien de temps sont-elles conservées ?
          </h2>
          <p className="mt-0 mb-2">
            Vos données sont conservées tant que votre compte et votre foyer existent. Lorsque vous supprimez votre
            foyer, <strong>l’ensemble des données associées est supprimé définitivement et sans retour possible</strong>,
            dans toutes les rubriques listées au § 2.
          </p>
          <p className="m-0">
            Les copies de sécurité (sauvegardes techniques) sont purgées <strong>sous 30 jours</strong> après la
            suppression : passé ce délai, il ne reste strictement rien.
          </p>
        </section>

        <section aria-labelledby="prive-droits">
          <h2 id="prive-droits" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            6. Vos droits
          </h2>
          <p className="mt-0 mb-2">
            Vous disposez des droits d’<strong>accès</strong>, de <strong>rectification</strong>, d’
            <strong>effacement</strong>, de <strong>limitation</strong>, de <strong>portabilité</strong> et d’
            <strong>opposition</strong> au traitement de vos données. Pour les exercer, écrivez à{' '}
            <a className="font-bold text-accent-strong" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>{' '}
            en précisant votre demande : nous y répondons sous un mois.
          </p>
          <p className="m-0">
            Si la réponse ne vous satisfait pas, vous pouvez adresser une réclamation à la{' '}
            <strong>CNIL</strong> (Commission nationale de l’informatique et des libertés,{' '}
            <a className="font-bold text-accent-strong" href="https://www.cnil.fr" target="_blank" rel="noreferrer">
              cnil.fr
            </a>
            ).
          </p>
        </section>

        <section aria-labelledby="prive-mineurs">
          <h2 id="prive-mineurs" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            7. Enfants mineurs
          </h2>
          <p className="m-0">
            L’application ne permet pas l’inscription directe d’un mineur. Les profils « enfant » sont{' '}
            <strong>créés et gérés par un parent</strong> (ou représentant légal) depuis son propre compte, qui en
            est responsable : c’est lui qui saisit leurs informations, décide de ce qui est partagé et peut les
            supprimer à tout moment.
          </p>
        </section>

        <section aria-labelledby="prive-cookies">
          <h2 id="prive-cookies" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            8. Cookies et stockage sur votre appareil
          </h2>
          <p className="m-0">
            L’application utilise le stockage local de votre navigateur (localStorage, IndexedDB) uniquement pour
            fonctionner : session, cache hors ligne, brouillons et tickets d’invitation. Aucun traceur publicitaire,
            aucun cookie de mesure d’audience. Supprimer les données du site dans votre navigateur vous déconnecte
            et efface ces copies locales, sans toucher vos données sur le serveur.
          </p>
        </section>

        <section aria-labelledby="prive-securite">
          <h2 id="prive-securite" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            9. Sécurité
          </h2>
          <p className="m-0">
            Connexions chiffrées (HTTPS), mots de passe jamais stockés en clair, accès aux données du foyer filtrés
            par des règles d’autorisation côté serveur, codes d’invitation conservés uniquement sous forme
            d’empreintes invérifiables sans le code d’origine. En cas d’incident affectant vos données, vous seriez
            informé conformément à la réglementation.
          </p>
        </section>

        <section aria-labelledby="prive-evolutions">
          <h2 id="prive-evolutions" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            10. Évolutions de cette politique
          </h2>
          <p className="m-0">
            Cette politique peut évoluer, par exemple lors de l’ajout d’une fonctionnalité. Toute modification
            importante vous sera notifiée dans l’application avant son entrée en vigueur. La date d’effet figure en
            haut de cette page.
          </p>
        </section>
      </div>

      <footer className="mt-10 border-t border-border pt-4 text-[11px] text-muted">
        <Link to="/" className="font-bold text-accent-strong">
          ← Retour à l’accueil
        </Link>
      </footer>
    </div>
  );
}
