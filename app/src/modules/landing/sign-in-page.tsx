import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { useToast } from '@/components/ui/toast';
import { signInWithEmail, signInWithProvider, signUpWithEmail } from '@/hooks/use-auth';
import { signInDemo } from '@/stores/session-store';
import { isSupabaseConfigured } from '@/lib/supabase/client';

const schema = z.object({
  email: z.email('Adresse e-mail invalide.'),
  password: z.string().min(8, 'Au moins 8 caractères.'),
});

type FormValues = z.infer<typeof schema>;

/** Monogramme de marque : évite les pictogrammes tierces non vectoriels. */
function BrandMark({ initial }: { initial: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-border text-[11px] font-extrabold text-fg"
    >
      {initial}
    </span>
  );
}

export default function SignInPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion');
  const [pending, setPending] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const run = async (label: string, action: () => Promise<unknown>) => {
    setPending(label);
    setFormError(null);
    try {
      await action();
      navigate('/accueil');
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
        <Link to="/" className="flex items-center gap-2.5">
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
            Vos tâches, vos courses, vos anniversaires et votre ardoise restent accessibles hors ligne, et les
            modifications se propagent dès le retour du réseau.
          </p>
        </div>
        <p className="m-0 text-[11px] text-on-dark">Données hébergées sur votre propre instance Supabase.</p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 max-[650px]:px-[15px]">
        <div className="w-full max-w-[420px]">
          <Link to="/" className="mb-6 inline-flex items-center gap-2 text-xs text-muted hover:text-fg lg:hidden">
            <Icon name="arrowLeft" size="sm" />
            Retour à l’accueil
          </Link>
          <p className="eyebrow mb-2">Connexion</p>
          <h2 className="mb-2 text-[clamp(24px,2.6vw,32px)] leading-[1.08]">Ravi de vous revoir</h2>
          <p className="lede mb-6 text-[13px]">Utilisez votre compte Google, Facebook, ou votre adresse e-mail.</p>

          <div className="mb-5 grid gap-2.5">
            <Button variant="secondary" disabled={pending !== null} onClick={() => run('google', () => signInWithProvider('google'))}>
              <BrandMark initial="G" />
              {pending === 'google' ? 'Redirection en cours…' : 'Continuer avec Google'}
            </Button>
            <Button variant="secondary" disabled={pending !== null} onClick={() => run('facebook', () => signInWithProvider('facebook'))}>
              <BrandMark initial="f" />
              {pending === 'facebook' ? 'Redirection en cours…' : 'Continuer avec Facebook'}
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
              <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
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
              className="font-bold text-accent-strong"
              onClick={() => setMode(mode === 'connexion' ? 'inscription' : 'connexion')}
            >
              {mode === 'connexion' ? 'Créer un compte' : 'Se connecter'}
            </button>
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
        </div>
      </section>
    </div>
  );
}
