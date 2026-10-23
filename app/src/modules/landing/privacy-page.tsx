import { Link } from 'react-router';
import { SectionHeading } from '@/components/ui/section-heading';

const EFFECTIVE_DATE = '13 octobre 2026';
const CONTACT_EMAIL = 'jeremymaillot@gmail.com';

/**
 * Politique de confidentialité (RGPD), page publique.
 * Source du texte : version « Dernière mise à jour : 13 octobre 2026 ».
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
          <SectionHeading id="prive-qui" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            1. Qui sommes-nous ?
          </SectionHeading>
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
          <SectionHeading id="prive-donnees" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            2. Données collectées
          </SectionHeading>
          <p className="mt-0 mb-2">
            <strong>Données de compte.</strong> Lorsque vous choisissez « Continuer avec Google », l’application
            demande uniquement les trois autorisations d’identification suivantes, et aucune autre :
          </p>
          <ul className="mt-0 mb-2 pl-5">
            <li>
              <strong>openid</strong> : prouver que la connexion a réussi, sans donnée personnelle ;
            </li>
            <li>
              <strong>email</strong> : recevoir votre adresse e-mail, qui sert d’identifiant unique de votre
              compte et de moyen de contact (confirmations, réinitialisation du mot de passe) ;
            </li>
            <li>
              <strong>profile</strong> : recevoir votre nom et votre photo de profil, affichés comme avatar
              dans votre foyer.
            </li>
          </ul>
          <p className="mt-0 mb-2">
            Nous ne demandons ni n’utilisons aucun autre accès Google : ni Gmail, ni Drive, ni Agenda, ni
            Contacts, ni YouTube. Nous ne lisons jamais le contenu de vos e-mails, fichiers ou calendriers, et
            nous n’y accédons tout simplement pas. Si vous créez un compte avec votre adresse e-mail, nous
            recevons uniquement cette adresse.
          </p>
          <p className="mt-0 mb-2">
            <strong>Contenus que vous ajoutez.</strong> Tâches, listes de courses, événements de calendrier, dépenses
            et budget partagé, carnet de santé de vos animaux, textes, photos et fichiers que vous choisissez
            d’importer, ainsi que les informations relatives aux membres de votre foyer.
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
          <SectionHeading id="prive-finalites" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            3. Finalités et bases légales
          </SectionHeading>
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
          <SectionHeading id="prive-google" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            4. Utilisation des données Google
          </SectionHeading>
          <p className="mt-0 mb-2">
            L’utilisation des informations reçues des API Google respecte la Politique relative aux données
            utilisateur des services d’API Google, y compris les exigences d’utilisation limitée (Limited Use).
            Concrètement, pour les données issues de votre connexion Google (adresse e-mail, nom, photo) :
          </p>
          <ul className="mt-0 mb-2 pl-5">
            <li>elles servent uniquement à vous identifier et à faire fonctionner l’application ;</li>
            <li>elles ne sont ni vendues, ni louées, ni transférées à des tiers ;</li>
            <li>elles ne servent ni à la publicité, ni au profilage, ni à l’entraînement de modèles ;</li>
            <li>aucune personne ne lit ces données, sauf à votre demande expresse (assistance) ou pour la
              sécurité du service et le respect de la loi.</li>
          </ul>
          <p className="m-0">
            Lorsque vous supprimez votre compte, ces données sont effacées avec le reste de vos données
            (voir section 6).
          </p>
        </section>

        <section aria-labelledby="prive-hebergement">
          <SectionHeading id="prive-hebergement" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            5. Hébergement et destinataires
          </SectionHeading>
          <p className="m-0">
            Les données sont hébergées par nos soins sur une instance Supabase auto-hébergée, exécutée sur
            l’infrastructure d’Oracle Cloud Infrastructure (OCI), dans une région située en France. Oracle intervient
            uniquement comme hébergeur d’infrastructure. Vos données sont stockées dans l’Union européenne. Seul
            l’acheminement technique des notifications peut transiter par l’infrastructure de votre éditeur de
            navigateur.
          </p>
          <p className="mb-0">
            Les contenus d’un foyer sont accessibles aux membres que vous y avez invités. Google
            intervient uniquement pour l’authentification. Si vous activez les rappels, les notifications
            transitent par le service de notifications de votre navigateur (par exemple Google pour Chrome, Mozilla
            pour Firefox) : leur contenu est chiffré et illisible pour ces intermédiaires techniques, qui ne voient
            que les informations nécessaires à l’acheminement. Il n’y a pas d’autre destinataire de vos contenus.
          </p>
        </section>

        <section aria-labelledby="prive-duree">
          <SectionHeading id="prive-duree" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            6. Durée de conservation et suppression
          </SectionHeading>
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
          <SectionHeading id="prive-securite" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            7. Sécurité
          </SectionHeading>
          <p className="m-0">
            Les échanges sont chiffrés (HTTPS). L’accès aux données est protégé par authentification et par des règles
            d’accès qui limitent chaque utilisateur aux données de son foyer. Les sauvegardes sont chiffrées, accès
            restreint au serveur.
          </p>
        </section>

        <section aria-labelledby="prive-cookies">
          <SectionHeading id="prive-cookies" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            8. Cookies et stockage local
          </SectionHeading>
          <p className="m-0">
            L’application utilise uniquement des mécanismes strictement nécessaires : session de connexion et stockage
            local du navigateur (cache de l’application installable, jeu de démonstration local). Ils ne nécessitent
            pas votre consentement et ne servent à aucun suivi.
          </p>
        </section>

        <section aria-labelledby="prive-droits">
          <SectionHeading id="prive-droits" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            9. Vos droits
          </SectionHeading>
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
          <SectionHeading id="prive-enfants" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            10. Enfants
          </SectionHeading>
          <p className="m-0">
            L’application est destinée à un usage familial. Elle n’est pas destinée aux enfants de moins de 15 ans
            sans l’accord d’un parent ou tuteur légal, qui reste responsable des informations ajoutées au foyer. Nous
            ne collectons pas sciemment de données auprès d’enfants de manière autonome.
          </p>
        </section>

        <section aria-labelledby="prive-evolutions">
          <SectionHeading id="prive-evolutions" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            11. Modifications
          </SectionHeading>
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
