import { Link } from 'react-router';
import { SectionHeading } from '@/components/ui/section-heading';

const CONTACT_EMAIL = 'contact@jeremymaillot.fr';

/**
 * Mentions légales (D-13), page publique.
 * Éditeur et directeur de publication : Jeremy Maillot, entrepreneur individuel.
 * Hébergement auto-hébergé ; contact dédié contact@jeremymaillot.fr —
 * l'adresse Gmail brute ne figure JAMAIS sur cette page (T-31-13, test).
 *
 * D-13 : brouillon rédigé par l'IA, validé par l'éditeur avant mise en ligne —
 * le code part avec le contenu final rédigé ici ; l'éditeur relit la page rendue
 * au checkpoint de fin de plan (31-05, Task 3) avant le go-live.
 */
export default function LegalPage() {
  return (
    <div className="mx-auto w-full max-w-[780px] px-5 py-10 max-[650px]:px-[15px]">
      <p className="mb-2 text-[11px] font-extrabold tracking-wide text-muted uppercase">
        <Link to="/" className="text-accent-strong">
          Ensemble &amp; Organisés
        </Link>{' '}
        · Informations
      </p>
      <h1 className="mb-8 font-display text-[clamp(26px,3vw,38px)] leading-[1.05] tracking-[-0.03em]">
        Mentions légales
      </h1>

      <div className="grid gap-7 text-[14px] leading-relaxed">
        <section aria-labelledby="legal-editeur">
          <SectionHeading id="legal-editeur" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            Éditeur
          </SectionHeading>
          <p className="m-0">
            <strong>Ensemble &amp; Organisés</strong> est une application web d’organisation familiale, éditée par{' '}
            <strong>Jeremy Maillot, entrepreneur individuel</strong>.
            Contact :{' '}
            <a className="font-bold text-accent-strong" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section aria-labelledby="legal-directeur">
          <SectionHeading id="legal-directeur" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            Directeur de publication
          </SectionHeading>
          <p className="m-0">Jeremy Maillot.</p>
        </section>

        <section aria-labelledby="legal-hebergement">
          <SectionHeading id="legal-hebergement" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            Hébergement
          </SectionHeading>
          <p className="m-0">
            Le service est <strong>hébergé par l’éditeur lui-même sur son propre serveur</strong>. Vos données sont
            stockées dans l’Union européenne, comme décrit dans la{' '}
            <Link to="/confidentialite" className="font-bold text-accent-strong">
              politique de confidentialité
            </Link>
            .
          </p>
        </section>

        <section aria-labelledby="legal-purge">
          <SectionHeading id="legal-purge" className="mb-2 font-display text-[19px] tracking-[-0.02em]">
            Politique de purge et de sauvegarde
          </SectionHeading>
          <p className="mt-0 mb-2">
            Vos données sont supprimées au plus tard <strong>30 jours</strong> après la demande effective de
            suppression. Les <strong>sauvegardes sont chiffrées et tournent chaque nuit</strong> : les copies
            disparaissent avec ce même délai.
          </p>
          <p className="m-0">
            Le détail des durées de conservation figure dans la{' '}
            <Link to="/confidentialite" className="font-bold text-accent-strong">
              politique de confidentialité
            </Link>
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
