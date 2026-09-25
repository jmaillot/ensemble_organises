import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { redeemInviteToken } from '@/lib/invites';
import { joinHouseholdLocal, loadHousehold } from '@/stores/session-store';
import { useToast } from '@/components/ui/toast';

const schema = z.object({
  token: z
    .string()
    .trim()
    .min(22, 'Un token fait au moins 22 caractères.'),
});

type FormValues = z.infer<typeof schema>;

export default function JoinHouseholdPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { token: '' } });

  const onSubmit = async (values: FormValues) => {
    setPending(true);
    setError(null);
    try {
      await redeemInviteToken(values.token);
      if (!import.meta.env.VITE_SUPABASE_URL) {
        await joinHouseholdLocal();
      }
      await loadHousehold();
      toast('Vous avez rejoint le foyer.');
      navigate('/accueil');
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'Impossible de rejoindre ce foyer.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto grid min-h-screen max-w-[620px] place-items-center px-5 py-12 max-[650px]:px-[15px]">
      <div className="w-full">
        <Link to="/connexion" className="mb-6 inline-flex items-center gap-2 text-xs text-muted hover:text-fg">
          <Icon name="arrowLeft" size="sm" />
          Retour à la connexion
        </Link>
        <p className="eyebrow mb-2">Rejoindre</p>
        <h1 className="mb-2.5 text-[clamp(26px,3.2vw,40px)] leading-[1.05]">Rejoindre un foyer</h1>
        <p className="lede mb-6 text-[15px]">
          Collez le token reçu d’un administrateur. Il est vérifié côté serveur, avec expiration, limite
          d’utilisations et contrôle de l’état actif.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          <Field
            label="Token d’invitation"
            error={errors.token?.message}
            hint="Encodage base64url court, 22 caractères ou plus."
          >
            {(props) => (
              <Input
                placeholder="ex. 7Yk3mQpLz1aBcDeFgHiJkL"
                autoComplete="off"
                spellCheck={false}
                className="font-mono tracking-[0.08em]"
                {...props}
                {...register('token')}
              />
            )}
          </Field>
          {error ? (
            <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" fullWidth disabled={pending} icon="arrow">
            {pending ? 'Vérification…' : 'Rejoindre le foyer'}
          </Button>
        </form>
        <div className="mt-6 rounded-[16px] border border-dashed border-accent/40 bg-accent-faint p-4">
          <h2 className="mb-1.5 font-display text-[15px] tracking-[-0.03em]">Pas de token sous la main ?</h2>
          <p className="mb-0 text-xs text-muted">
            Demandez-le directement à un administrateur du foyer : il peut le régénérer à tout moment depuis les
            préférences, ce qui invalide immédiatement le précédent.
          </p>
        </div>
        <p className="mt-4 mb-0 text-xs text-muted">
          Vous n’avez pas encore de foyer ?{' '}
          <Link to="/foyer/nouveau" className="font-bold text-accent-strong">
            Créer le vôtre
          </Link>
        </p>
      </div>
    </div>
  );
}
