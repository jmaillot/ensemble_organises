import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { useToast } from '@/components/ui/toast';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { signInWithEmail, signInWithProvider, signUpWithEmail } from '@/hooks/use-auth';
import { signInDemo } from '@/stores/session-store';
import { isSupabaseConfigured } from '@/lib/supabase/client';

const schema = z.object({
  email: z.email('Adresse e-mail invalide.'),
  password: z.string().min(8, 'Au moins 8 caractères.'),
});

type FormValues = z.infer<typeof schema>;

/** Glyphe « G » officiel de Google (quatre couleurs), vectoriel — la lettre
    seule dans une pastille lisait « G » comme l'initiale du foyer, pas comme
    le fournisseur (critique UI 2026-10-24). */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="size-[18px] shrink-0" role="presentation">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91a8.78 8.78 0 0 0 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.16.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * Chemin INTERNE visé après connexion, ou `null`. `RequireAuth` écrit
 * `state.from` ; ce module est son seul lecteur.
 *
 * `state.from` est une donnée du navigateur : l'honorer sans contrôle ferait
 * de la connexion une redirection ouverte (T-19-43). On la résout donc contre
 * l'origine courante et on refuse tout ce qui change d'origine — une URL
 * absolue (`https://…`), une forme protocole-relative (`//evil.example`) et la
 * variante à barre oblique inversée (`/\evil.example`, que l'analyseur d'URL
 * normalise en `//evil.example`). Seul un chemin de l'application passe.
 *
 * Exportée pour être vérifiable directement : un test d'intégration de
 * navigation ne peut pas distinguer cette garde de la même-origine imposée par
 * `history.pushState` (jsdom refuse déjà la poussée hors origine). La preuve
 * doit porter sur la garde elle-même, pas sur le filet du navigateur.
 */
export function internalPathOf(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    const resolved = new URL(value, window.location.origin);
    if (resolved.origin !== window.location.origin) return null;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}

/**
 * Écran « connexion requise pour cette vue » (D-07, plan 35-03) : un raccourci
 * hors-ligne vers une vue du foyer sans session active arrive sur /connexion
 * avec `state.from` — on remplace le formulaire nu par un écran explicite qui
 * nomme la vue visée, patron sobre de `forbidden.tsx`. Le chemin affiché est
 * déjà filtré par `internalPathOf` (garde T-19-43 réutilisée telle quelle) ;
 * aucune donnée utilisateur, aucun stockage — `navigator.onLine` est une
 * lecture d'état (D-08). Le bouton révèle le formulaire : la connexion reste
 * le seul chemin vers la vue, jamais une redirection silencieuse.
 */
export function ConnexionRequise({ vue, onReconnect }: { vue: string; onReconnect: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-5 text-center">
      <div className="max-w-[440px]">
        <span className="mx-auto mb-5 grid size-14 place-items-center rounded-[18px] bg-accent-soft text-accent-strong">
          <Icon name="info" size="lg" />
        </span>
        <h1 className="mb-2 text-[clamp(24px,3vw,36px)] leading-[1.05]">Connexion requise pour cette vue</h1>
        <p className="lede mx-auto mb-6 text-[14px]">
          Vous êtes hors ligne et cette vue n’est pas encore dans vos mains : reconnectez-vous pour ouvrir{' '}
          <span className="font-bold text-fg">{vue}</span>.
        </p>
        <Button onClick={onReconnect}>
          <Icon name="arrow" size="sm" />
          Se reconnecter
        </Button>
      </div>
    </div>
  );
}

export default function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  // 31-03 (D-19) : le pré-écran d'invitation pose `state.mode` quand il
  // envoie un étranger vers l'inscription — l'écran s'ouvre directement au
  // bon mode au lieu de lui faire retrouver le lien « Créer un compte ».
  const [mode, setMode] = useState<'connexion' | 'inscription'>(() =>
    (location.state as { mode?: unknown } | null)?.mode === 'inscription' ? 'inscription' : 'connexion',
  );
  const [pending, setPending] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  /**
   * Route visée avant la connexion, si `RequireAuth` en a laissé une. Le
   * routage d'amorçage reste MAÎTRE : on ne fait que rendre à l'utilisateur la
   * route qu'il visait, et les gardes en aval gouvernent la suite — un
   * utilisateur sans foyer arrivé sur `/accueil` (ou `/foyer`) repart vers le
   * choix « créer / rejoindre » (`RequireHousehold` / `RequireNoHousehold`),
   * exactement comme avant. C'est pourquoi honorer `from` ne déplace pas
   * l'invariant d'amorçage : ce sont les gardes, pas cette page, qui décident.
   */
  const requestedPath = internalPathOf((location.state as { from?: unknown } | null)?.from);

  // D-07 : l'écran « connexion requise » ne s'applique qu'au deep link visé
  // (vue demandée présente) ET hors ligne — en ligne, le formulaire standard
  // reste inchangé. `useState` réserve la révocation par le bouton
  // « Se reconnecter » : révéler le formulaire est un état de session de la
  // page, jamais persisté (D-08).
  const [formRevealed, setFormRevealed] = useState(false);
  // MED-1 (35-REVIEW) : l'état réseau est RÉACTIF (`useOnlineStatus`, source
  // `onlineManager` — la même que le bootstrap), pas `navigator.onLine` lu une
  // fois au rendu : si le réseau revient pendant que l'écran D-07 est affiché,
  // il doit refléter le retour en ligne, pas rester figé hors ligne.
  const online = useOnlineStatus();
  const offlineWithoutSession = requestedPath !== null && !online && !formRevealed;

  const run = async (label: string, action: () => Promise<unknown>) => {
    setPending(label);
    setFormError(null);
    try {
      await action();
      navigate(requestedPath ?? '/accueil');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Connexion impossible pour le moment.');
    } finally {
      setPending(null);
    }
  };

  const onSubmit = (values: FormValues) =>
    run('email', () => (mode === 'connexion' ? signInWithEmail(values.email, values.password) : signUpWithEmail(values.email, values.password)));

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="flex flex-col justify-between bg-fg px-6 py-8 text-surface max-[1024px]:hidden">
        <Link to="/" className="flex min-h-11 items-center gap-2.5">
          <div className="relative grid size-[38px] place-items-center overflow-hidden rounded-[13px] bg-surface text-fg">
            <Icon name="home" />
            <span aria-hidden="true" className="absolute right-[5px] bottom-[5px] size-[17px] rounded-full border-2 border-accent" />
          </div>
          <span className="font-display text-base font-extrabold tracking-[-0.02em]">Ensemble &amp; Organisés</span>
        </Link>
        <div>
          <h1 className="mb-3 text-[clamp(26px,3vw,40px)] leading-[1.05] text-surface">
            Reprenez le fil de votre foyer, où que vous soyez.
          </h1>
          <p className="m-0 max-w-[420px] text-[13px] text-on-dark">
            Vos tâches, vos courses, vos anniversaires et votre ardoise vivent sur le serveur de votre foyer :
            connectez-vous en ligne pour les retrouver, où que vous soyez.
          </p>
        </div>
        <p className="m-0 text-xs text-on-dark">Données hébergées sur votre propre instance Supabase.</p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 max-[650px]:px-[15px]">
        <div className="w-full max-w-[420px]">
          {offlineWithoutSession ? (
            <ConnexionRequise vue={requestedPath} onReconnect={() => setFormRevealed(true)} />
          ) : (
            <>
            <Link to="/" className="mb-6 inline-flex min-h-11 items-center gap-2 px-1 text-xs text-muted hover:text-fg lg:hidden">
              <Icon name="arrowLeft" size="sm" />
              Retour à l’accueil
            </Link>
            <p className="eyebrow mb-2">Connexion</p>
            <h2 className="mb-2 text-[clamp(24px,2.6vw,32px)] leading-[1.08]">Ravi de vous revoir</h2>
            <p className="lede mb-6 text-[13px]">Utilisez votre compte Google ou votre adresse e-mail.</p>
            <p className="mb-5 text-xs text-muted">
              Déjà un compte e-mail ? Connectez-vous avec, puis liez Google depuis Paramètres → Profil :
              les deux connexions mèneront au même foyer.
            </p>

            <div className="mb-5 grid gap-2.5">
              <Button variant="secondary" disabled={pending !== null} onClick={() => run('google', () => signInWithProvider('google'))}>
                <GoogleMark />
                {pending === 'google' ? 'Redirection en cours…' : 'Continuer avec Google'}
              </Button>
            </div>

            <div className="mb-5 flex items-center gap-3 text-[11px] text-muted">
              <span className="h-px flex-1 bg-border" />
              ou avec un email
              <span className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3.5" noValidate>
              <Field label="Adresse e-mail" error={errors.email?.message}>
                {(props) => <Input type="email" autoComplete="email" placeholder="vous@exemple.fr" {...props} {...register('email')} />}
              </Field>
              <Field label="Mot de passe" error={errors.password?.message}>
                {(props) => <Input type="password" autoComplete="current-password" placeholder="8 caractères minimum" {...props} {...register('password')} />}
              </Field>
              {formError ? (
                <p role="alert" className="m-0 text-[11px] font-semibold text-coral-text">
                  {formError}
                </p>
              ) : null}
              <Button type="submit" fullWidth disabled={pending !== null} icon="arrow">
                {mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}
              </Button>
            </form>

            <p className="mt-4 mb-0 text-xs text-muted">
              {mode === 'connexion' ? 'Pas encore de compte ?' : 'Vous avez déjà un compte ?'}{' '}
              <button
                type="button"
                className="inline-block -my-3.5 py-3.5 font-bold text-accent-strong"
                onClick={() => setMode(mode === 'connexion' ? 'inscription' : 'connexion')}
              >
                {mode === 'connexion' ? 'Créer un compte' : 'Se connecter'}
              </button>
            </p>
            <p className="mt-3 mb-0 text-[11px] text-muted">
              En continuant, vous acceptez les{' '}
              <Link to="/conditions-utilisation" className="inline-block -mx-2.5 -my-3.75 px-2.5 py-3.75 font-bold text-accent-strong">
                CGU
              </Link>{' '}
              et la{' '}
              <Link to="/confidentialite" className="inline-block -mx-2.5 -my-3.75 px-2.5 py-3.75 font-bold text-accent-strong">
                politique de confidentialité
              </Link>
              .
            </p>

            {!isSupabaseConfigured ? (
              <div className="mt-6 rounded-[16px] border border-dashed border-accent/40 bg-accent-faint p-4">
                <h3 className="mb-1.5 font-display text-[15px] tracking-[-0.03em]">Mode démonstration</h3>
                <p className="mb-3 text-xs text-muted">
                  Aucun backend n’est configuré sur cet environnement. Entrez dans le foyer de démonstration pour
                  parcourir l’ensemble des modules.
                </p>
                <Button
                  icon="arrow"
                  disabled={pending !== null}
                  onClick={async () => {
                    await run('demo', async () => {
                      await signInDemo();
                      toast('Session de démonstration ouverte.');
                    });
                  }}
                >
                  Entrer dans la démonstration
                </Button>
              </div>
            ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
