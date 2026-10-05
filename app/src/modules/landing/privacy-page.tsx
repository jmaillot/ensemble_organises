import { Link } from 'react-router';

const EFFECTIVE_DATE = '5 octobre 2026';
const CONTACT_EMAIL = 'jeremymaillot@gmail.com';

/**
 * Politique de confidentialité (RGPD), page publique.
 * Source du texte : version « Dernière mise à jour : 5 octobre 2026 ».
 * Le même texte est servi sans JavaScript par
 * `app/public/confidentialite/index.html` (vérification OAuth Google) :
 * toute modification ici DOIT être répercutée là-bas, et inversement.
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
      <p className="mt-0 mb-8 text-[13px] text-muted">Dernière mise à jour : {EFFECTIVE_DATE}.</p>

      <div className="grid gap-7 text-[14px] leading-relaxed">
        <section aria-labelledby="prive-qui">
          <h2 id="prive-qui" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            1. Qui sommes-nous ?
          </h2>
          <p className="m-0">
            <strong>Ensemble &amp; Organisés</strong> (« l’application ») est un espace familial permettant de gérer
            ensemble tâches, courses, calendrier, budget partagé et souvenirs. Elle est éditée par{' '}
            <strong>Jérémy Maillot</strong>, à titre personnel, qui est le responsable du traitement de
            vos données. Contact :{' '}
            <a className="font-bold text-accent-strong" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section aria-labelledby="prive-donnees">
          <h2 id="prive-donnees" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            2. Données collectées
          </h2>
          <p className="mt-0 mb-2">
            <strong>Données de compte (connexion Google).</strong> Lorsque vous vous connectez avec Google, nous
            recevons uniquement votre adresse e-mail, votre nom et votre photo de profil. Nous n’accédons à aucune
            autre donnée de votre compte Google (contacts, agenda, Drive, Gmail, etc.).
          </p>
          <p className="mt-0 mb-2">
            <strong>Contenus que vous ajoutez.</strong> Tâches, listes de courses, événements de calendrier, dépenses
            et budget partagé, textes, photos et fichiers que vous choisissez d’importer, ainsi que les informations
            relatives aux membres de votre foyer.
          </p>
          <p className="mt-0 mb-2">
            <strong>Données techniques.</strong> Informations strictement nécessaires au fonctionnement et à la
            sécurité du service : jeton de session, journaux serveur (adresse IP, date et heure des requêtes).
          </p>
          <p className="mt-0 mb-2">
            Nous n’utilisons aucun outil d’analyse d’audience, aucune publicité et aucun traceur de suivi.
          </p>
          <p className="m-0">
            Nous vous invitons à ne pas importer de contenus sensibles dont vous n’avez pas besoin, et à vous assurer
            d’avoir l’accord des personnes figurant sur les photos que vous partagez avec votre foyer.
          </p>
        </section>

        <section aria-labelledby="prive-finalites">
          <h2 id="prive-finalites" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            3. Finalités et bases légales
          </h2>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                <th scope="col" className="border border-border p-2 align-top">
                  Finalité
                </th>
                <th scope="col" className="border border-border p-2 align-top">
                  Base légale
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-border p-2 align-top">Créer votre compte et vous authentifier</td>
                <td className="border border-border p-2 align-top">
                  Exécution du contrat (conditions d’utilisation)
                </td>
              </tr>
              <tr>
                <td className="border border-border p-2 align-top">
                  Fournir les fonctionnalités de l’application et le partage au sein de votre foyer
                </td>
                <td className="border border-border p-2 align-top">Exécution du contrat</td>
              </tr>
              <tr>
                <td className="border border-border p-2 align-top">
                  Assurer la sécurité du service et prévenir les abus
                </td>
                <td className="border border-border p-2 align-top">Intérêt légitime</td>
              </tr>
              <tr>
                <td className="border border-border p-2 align-top">Répondre à vos demandes</td>
                <td className="border border-border p-2 align-top">Intérêt légitime / exécution du contrat</td>
              </tr>
            </tbody>
          </table>
          <p className="mb-0">
            Vos données ne sont ni vendues, ni louées, ni utilisées à des fins publicitaires ou de profilage.
          </p>
        </section>

        <section aria-labelledby="prive-google">
          <h2 id="prive-google" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            4. Utilisation des données Google
          </h2>
          <p className="m-0">
            L’utilisation des informations reçues des API Google respecte la Politique relative aux données
            utilisateur des services d’API Google, y compris les exigences d’utilisation limitée (Limited Use). Les
            données issues de votre connexion Google (adresse e-mail, nom, photo) servent uniquement à vous identifier
            et à faire fonctionner l’application. Elles ne sont ni transférées à des tiers, ni utilisées à des fins
            publicitaires.
          </p>
        </section>

        <section aria-labelledby="prive-hebergement">
          <h2 id="prive-hebergement" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            5. Hébergement et destinataires
          </h2>
          <p className="m-0">
            Les données sont hébergées par nos soins sur une instance Supabase auto-hébergée, exécutée sur
            l’infrastructure d’Oracle Cloud Infrastructure (OCI), dans une région située en France. Oracle intervient
            uniquement comme hébergeur d’infrastructure. Vos données sont stockées dans l’Union européenne et ne font
            l’objet d’aucun transfert hors de l’Union européenne.
          </p>
          <p className="mb-0">
            Les contenus d’un foyer sont accessibles aux membres que vous y avez invités. Google intervient uniquement
            pour l’authentification. Il n’y a pas d’autre destinataire.
          </p>
        </section>

        <section aria-labelledby="prive-duree">
          <h2 id="prive-duree" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            6. Durée de conservation et suppression
          </h2>
          <p className="mt-0 mb-2">
            Les données de votre compte et de votre foyer sont conservées tant que votre compte est actif.
          </p>
          <p className="mt-0 mb-2">
            Vous pouvez supprimer votre foyer depuis l’application : l’ensemble de son contenu (tâches, courses,
            calendrier, budget, souvenirs, photos et fichiers) est alors effacé définitivement. Cette action est
            irréversible.
          </p>
          <p className="mt-0 mb-2">
            Les copies présentes dans nos sauvegardes sont supprimées au plus tard sous 30 jours.
          </p>
          <p className="mt-0 mb-2">
            Vous pouvez aussi demander la suppression de votre compte par e-mail à{' '}
            <a className="font-bold text-accent-strong" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
          <p className="m-0">Les journaux techniques sont conservés 1 mois au maximum.</p>
        </section>

        <section aria-labelledby="prive-securite">
          <h2 id="prive-securite" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            7. Sécurité
          </h2>
          <p className="m-0">
            Les échanges sont chiffrés (HTTPS). L’accès aux données est protégé par authentification et par des règles
            d’accès qui limitent chaque utilisateur aux données de son foyer. Les sauvegardes sont chiffrées, accès
            restreint au serveur.
          </p>
        </section>

        <section aria-labelledby="prive-cookies">
          <h2 id="prive-cookies" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            8. Cookies et stockage local
          </h2>
          <p className="m-0">
            L’application utilise uniquement des mécanismes strictement nécessaires : session de connexion et stockage
            local du navigateur pour le fonctionnement hors ligne (cache, données synchronisées). Ils ne nécessitent
            pas votre consentement et ne servent à aucun suivi.
          </p>
        </section>

        <section aria-labelledby="prive-droits">
          <h2 id="prive-droits" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            9. Vos droits
          </h2>
          <p className="m-0">
            Conformément au RGPD, vous disposez des droits d’accès, de rectification, d’effacement, de limitation,
            d’opposition et de portabilité de vos données. Pour les exercer, écrivez à{' '}
            <a className="font-bold text-accent-strong" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>{' '}
            ; nous vous répondrons dans un délai d’un mois. Vous pouvez également introduire une réclamation auprès de
            la CNIL (
            <a className="font-bold text-accent-strong" href="https://www.cnil.fr" target="_blank" rel="noreferrer">
              www.cnil.fr
            </a>
            ).
          </p>
        </section>

        <section aria-labelledby="prive-enfants">
          <h2 id="prive-enfants" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            10. Enfants
          </h2>
          <p className="m-0">
            L’application est destinée à un usage familial. Elle n’est pas destinée aux enfants de moins de 15 ans
            sans l’accord d’un parent ou tuteur légal, qui reste responsable des informations ajoutées au foyer. Nous
            ne collectons pas sciemment de données auprès d’enfants de manière autonome.
          </p>
        </section>

        <section aria-labelledby="prive-evolutions">
          <h2 id="prive-evolutions" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            11. Modifications
          </h2>
          <p className="m-0">
            Cette politique peut évoluer. La date de dernière mise à jour figure en haut de cette page ; en cas de
            changement important, nous vous en informerons dans l’application.
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
