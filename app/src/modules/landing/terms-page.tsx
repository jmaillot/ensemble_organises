import { Link } from 'react-router';

const EFFECTIVE_DATE = '3 octobre 2026';
const CONTACT_EMAIL = 'jeremymaillot@gmail.com';

/**
 * Conditions Générales d'Utilisation, page publique.
 * Juridique mais lisible. Mise à jour = nouvelle date d'effet.
 * Relecture par un juriste recommandée avant tout litige (voir article 8).
 */
export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-[780px] px-5 py-10 max-[650px]:px-[15px]">
      <p className="mb-2 text-[11px] font-extrabold tracking-wide text-muted uppercase">
        <Link to="/" className="text-accent-strong">
          Ensemble &amp; Organisés
        </Link>{' '}
        · CGU
      </p>
      <h1 className="mb-2 font-display text-[clamp(26px,3vw,38px)] leading-[1.05] tracking-[-0.03em]">
        Conditions Générales d’Utilisation
      </h1>
      <p className="mt-0 mb-8 text-[13px] text-muted">En vigueur depuis le {EFFECTIVE_DATE}.</p>

      <div className="grid gap-7 text-[14px] leading-relaxed">
        <section aria-labelledby="cgu-objet">
          <h2 id="cgu-objet" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            Article 1 — Objet
          </h2>
          <p className="m-0">
            <strong>Ensemble &amp; Organisés</strong> est une application web progressive (PWA) d’organisation
            familiale, éditée par <strong>Jérémy Maillot</strong>. Elle permet aux membres d’un même foyer de
            centraliser leur quotidien : listes de courses, calendrier partagé, notes, tâches, routines, budget
            partagé (« Ardoise »), listes de cadeaux, anniversaires, fiches animaux, prestataires, cartes de
            fidélité, lieux favoris, fil familial (« Cercle ») et messagerie entre membres. Les présentes
            conditions encadrent l’accès et l’utilisation du service.
          </p>
        </section>

        <section aria-labelledby="cgu-acceptation">
          <h2 id="cgu-acceptation" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            Article 2 — Acceptation
          </h2>
          <p className="m-0">
            L’utilisation du service, y compris l’accès à un contenu partagé en tant qu’invité externe, implique l’
            <strong>acceptation pleine et entière</strong> des présentes CGU ainsi que de la{' '}
            <Link to="/confidentialite" className="font-bold text-accent-strong">
              politique de confidentialité
            </Link>
            . Si vous n’acceptez pas ces documents, n’utilisez pas le service.
          </p>
        </section>

        <section aria-labelledby="cgu-compte">
          <h2 id="cgu-compte" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            Article 3 — Compte, foyer et invitations
          </h2>
          <ul className="m-0 grid gap-1.5 pl-5">
            <li>
              <strong>Âge minimum : 15 ans révolus</strong> pour créer un compte. En dessous de 15 ans, aucune
              inscription directe : un parent (ou représentant légal) crée et gère un profil « enfant » depuis son
              propre compte et en assume la responsabilité.
            </li>
            <li>
              <strong>Connexion :</strong> via Google, Facebook ou e-mail et mot de passe. Vous êtes responsable de
              la confidentialité de vos identifiants.
            </li>
            <li>
              <strong>Foyer :</strong> vous créez un foyer (vous en devenez administrateur) ou rejoignez un foyer
              existant grâce au code d’invitation transmis par son administrateur. L’administrateur gère les
              membres (ajout, retrait) et les codes d’accès ; il lui appartient de ne diffuser ces codes qu’aux
              personnes concernées.
            </li>
          </ul>
        </section>

        <section aria-labelledby="cgu-contenus">
          <h2 id="cgu-contenus" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            Article 4 — Contenus publiés par les utilisateurs
          </h2>
          <ul className="m-0 grid gap-1.5 pl-5">
            <li>
              Vous restez <strong>propriétaire</strong> des contenus que vous publiez (photos, notes, messages,
              publications du Cercle).
            </li>
            <li>
              Vous garantissez disposer de <strong>tous les droits nécessaires</strong> sur ces contenus, notamment
              pour les photos représentant des tiers ou des mineurs du foyer (autorisation des personnes concernées
              ou de leurs représentants légaux).
            </li>
            <li>
              L’éditeur peut <strong>retirer sans délai</strong> tout contenu manifestement illicite porté à sa
              connaissance, et suspendre le compte à l’origine d’abus répétés.
            </li>
          </ul>
        </section>

        <section aria-labelledby="cgu-comportement">
          <h2 id="cgu-comportement" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            Article 5 — Usage autorisé
          </h2>
          <p className="mt-0 mb-2">
            Le Cercle et les Messages sont réservés aux échanges entre membres invités du foyer. Sont interdits :
            contenus illicites, harcèlement, usurpation d’identité, atteinte aux droits des tiers ou à la vie
            privée, et plus généralement tout usage détourné du service.
          </p>
          <p className="m-0">
            Tout usage contraire peut entraîner la suspension ou la suppression du compte, sans préjudice d’éventuelles
            poursuites.
          </p>
        </section>

        <section aria-labelledby="cgu-externes">
          <h2 id="cgu-externes" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            Article 6 — Partage avec des personnes externes
          </h2>
          <p className="m-0">
            Certaines fonctionnalités (listes de cadeaux, lecture d’une ardoise via lien d’invitation) permettent de
            partager du contenu avec des personnes extérieures au foyer. En accédant à ce contenu, ces personnes
            acceptent les présentes CGU et la politique de confidentialité. L’utilisateur qui partage un lien ou un
            code est responsable de sa diffusion : toute personne en possession du lien peut consulter le contenu
            partagé, dans la limite des droits accordés (lecture seule pour les invités d’ardoise).
          </p>
        </section>

        <section aria-labelledby="cgu-dispo">
          <h2 id="cgu-dispo" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            Article 7 — Disponibilité
          </h2>
          <p className="m-0">
            Le service est fourni <strong>« en l’état »</strong>, sans garantie de disponibilité continue
            (maintenance, mises à jour, pannes). L’application fonctionne partiellement hors ligne (PWA), avec
            synchronisation différée au retour de la connexion : des conflits de synchronisation peuvent survenir,
            auquel cas la version la plus récente prévaut.
          </p>
        </section>

        <section aria-labelledby="cgu-responsabilite">
          <h2 id="cgu-responsabilite" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            Article 8 — Responsabilité
          </h2>
          <ul className="m-0 grid gap-1.5 pl-5">
            <li>
              L’éditeur n’est pas responsable des contenus publiés par les utilisateurs ni des litiges entre membres
              d’un foyer.
            </li>
            <li>
              <strong>Module « Ardoise » :</strong> l’outil calcule une <strong>répartition indicative</strong> des
              dépenses à partir des montants saisis. Il ne constitue ni une transaction financière, ni un moyen de
              paiement, ni une garantie de remboursement : les règlements restent des arrangements privés entre
              membres, sous leur seule responsabilité.
            </li>
          </ul>
        </section>

        <section aria-labelledby="cgu-suppression">
          <h2 id="cgu-suppression" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            Article 9 — Suppression du compte et du foyer
          </h2>
          <ul className="m-0 grid gap-1.5 pl-5">
            <li>
              Vous pouvez supprimer votre compte à tout moment (écrivez à{' '}
              <a className="font-bold text-accent-strong" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              ).
            </li>
            <li>
              L’administrateur d’un foyer peut <strong>supprimer le foyer à tout moment</strong> : cette suppression
              est <strong>définitive</strong> et entraîne la perte d’accès de tous les membres aux données du foyer,
              elles-mêmes supprimées comme décrit dans la{' '}
              <Link to="/confidentialite" className="font-bold text-accent-strong">
                politique de confidentialité
              </Link>
              . Chaque membre est invité à exporter au préalable ce qu’il souhaite conserver.
            </li>
          </ul>
        </section>

        <section aria-labelledby="cgu-pi">
          <h2 id="cgu-pi" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            Article 10 — Propriété intellectuelle
          </h2>
          <p className="m-0">
            L’éditeur reste propriétaire de la marque, du design et du code de l’application. Les utilisateurs
            conservent l’intégralité de leurs droits sur les contenus qu’ils publient et concèdent à l’éditeur la
            seule autorisation technique d’hébergement et d’affichage nécessaire au service, limitée aux
            destinataires choisis (foyer, invités).
          </p>
        </section>

        <section aria-labelledby="cgu-modifs">
          <h2 id="cgu-modifs" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            Article 11 — Modification des CGU
          </h2>
          <p className="m-0">
            Les présentes CGU peuvent évoluer. Toute modification substantielle sera notifiée dans l’application
            avant son entrée en vigueur ; la poursuite de l’utilisation du service après cette date vaut
            acceptation. La date d’effet figure en haut de cette page.
          </p>
        </section>

        <section aria-labelledby="cgu-litiges">
          <h2 id="cgu-litiges" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            Article 12 — Droit applicable et litiges
          </h2>
          <p className="m-0">
            Les présentes CGU sont soumises au <strong>droit français</strong>. En cas de différend, une résolution
            amiable sera recherchée en priorité (écrivez à{' '}
            <a className="font-bold text-accent-strong" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            ). À défaut d’accord, les tribunaux français compétents seront saisis. Le service étant fourni
            gratuitement dans un cadre familial, aucun dispositif de médiation de la consommation n’est rattaché à
            ce jour ; cette mention sera actualisée en cas d’offre payante.
          </p>
        </section>

        <section aria-labelledby="cgu-contact">
          <h2 id="cgu-contact" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            Article 13 — Contact
          </h2>
          <p className="m-0">
            Pour toute question relative aux présentes CGU :{' '}
            <a className="font-bold text-accent-strong" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
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
