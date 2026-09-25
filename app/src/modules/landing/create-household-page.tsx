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
import { createInviteToken } from '@/lib/invites';
import { createHouseholdLocal } from '@/stores/session-store';
import { loadHousehold } from '@/stores/session-store';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { QrCode } from '@/components/shared/qr-code';

const colors = ['accent', 'coral', 'amber', 'ink'] as const;

const colorClass: Record<(typeof colors)[number], string> = {
  accent: 'bg-accent',
  coral: 'bg-coral',
  amber: 'bg-amber',
  ink: 'bg-fg',
};

const schema = z.object({
  name: z.string().trim().min(2, 'Donnez un nom à votre foyer.').max(60, '60 caractères maximum.'),
  color: z.enum(colors),
});

type FormValues = z.infer<typeof schema>;

export default function CreateHouseholdPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', color: 'accent' } });
  const color = watch('color');

  const onSubmit = async (values: FormValues) => {
    setPending(true);
    setError(null);
    try {
      if (isSupabaseConfigured) {
        // En production : création via Edge Function transactionnelle.
        // Le backend n'étant pas déployé ici, on bascule sur le foyer de démonstration.
        await createHouseholdLocal(values.name, values.color);
      } else {
        await createHouseholdLocal(values.name, values.color);
      }
      await loadHousehold();
      const preview = await createInviteToken({ maxUses: 10 });
      setToken(preview.token);
      toast('Foyer créé. Partagez le token ci-dessous.');
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : 'Création impossible.');
    } finally {
      setPending(false);
    }
  };

  if (token) {
    return (
      <div className="mx-auto grid min-h-screen max-w-[760px] place-items-center px-5 py-12 max-[650px]:px-[15px]">
        <div className="w-full">
          <span className="mb-4 grid size-12 place-items-center rounded-[16px] bg-accent-soft text-accent-strong">
            <Icon name="checkCircle" size="lg" />
          </span>
          <h1 className="mb-2.5 text-[clamp(24px,3vw,36px)] leading-[1.05]">Votre foyer est prêt</h1>
          <p className="lede mb-6 text-[14px]">
            Ce token d’invitation n’est affiché qu’ici. Copiez-le ou scannez-le : la base n’en conserve que
            l’empreinte.
          </p>
          <div className="grid gap-5 rounded-[22px] border border-border bg-surface p-6 sm:grid-cols-[1fr_auto]">
            <div>
              <p className="eyebrow mb-2">Token d’invitation</p>
              <p className="mb-4 font-mono text-lg tracking-[0.12em] break-all">{token}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  icon="copy"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(token);
                    toast('Token copié dans le presse-papiers.');
                  }}
                >
                  Copier
                </Button>
                <Button asChild variant="secondary" icon="share">
                  <a href={`https://wa.me/?text=${encodeURIComponent(`Rejoins mon foyer sur Ensemble & Organisés avec le token ${token}`)}`}>
                    Partager
                  </a>
                </Button>
              </div>
              <p className="mt-4 mb-0 text-[11px] text-muted">
                Maximum 10 utilisations. Vous pourrez régénérer ce token ou en fixer l’expiration dans les préférences
                du foyer.
              </p>
            </div>
            <div className="rounded-[16px] border border-border bg-surface p-3">
              <QrCode value={token} size={168} label="QR code du token d’invitation" />
            </div>
          </div>
          <div className="mt-7 flex flex-wrap gap-2">
            <Button onClick={() => navigate('/accueil')} icon="arrow">
              Aller au tableau de bord
            </Button>
            <Button asChild variant="secondary" icon="settings">
              <Link to="/parametres">Gérer les invitations</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid min-h-screen max-w-[620px] place-items-center px-5 py-12 max-[650px]:px-[15px]">
      <div className="w-full">
        <Link to="/connexion" className="mb-6 inline-flex items-center gap-2 text-xs text-muted hover:text-fg">
          <Icon name="arrowLeft" size="sm" />
          Retour à la connexion
        </Link>
        <p className="eyebrow mb-2">Nouveau foyer</p>
        <h1 className="mb-2.5 text-[clamp(26px,3.2vw,40px)] leading-[1.05]">Créer mon foyer</h1>
        <p className="lede mb-6 text-[15px]">
          Un nom et une couleur suffisent. Vous serez administrateur, et un token d’invitation sera généré pour vos
          proches.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          <Field label="Nom du foyer" error={errors.name?.message}>
            {(props) => <Input placeholder="Foyer Martin" {...props} {...register('name')} />}
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-[11px] font-extrabold text-muted">Couleur du foyer</legend>
            <div className="flex flex-wrap gap-2.5">
              {colors.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={color === value}
                  aria-label={`Choisir la couleur ${value}`}
                  onClick={() => setValue('color', value)}
                  className={`size-11 rounded-[12px] border-2 transition-transform duration-[var(--duration-quick)] hover:-translate-y-px ${
                    color === value ? 'border-fg' : 'border-transparent'
                  } ${colorClass[value]}`}
                />
              ))}
            </div>
          </fieldset>
          {error ? (
            <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" fullWidth disabled={pending} icon="arrow">
            {pending ? 'Création…' : 'Créer mon foyer'}
          </Button>
        </form>
        <p className="mt-4 mb-0 text-xs text-muted">
          Vous avez déjà un foyer ?{' '}
          <Link to="/foyer/rejoindre" className="font-bold text-accent-strong">
            Rejoindre avec un token
          </Link>
        </p>
      </div>
    </div>
  );
}
