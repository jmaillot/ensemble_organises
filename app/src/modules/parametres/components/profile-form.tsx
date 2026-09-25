import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Panel } from '@/components/shared/module-shell';
import { LoadingRows } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { signOut, useSessionUser } from '@/hooks/use-auth';
import { DEMO_USER_ID } from '@/lib/data/seed';
import { useHouseholdStore, useMemberRole } from '@/stores/household-store';
import { fetchProfile, saveProfile, type ProfileSettings } from '../api';
import { providerLabels, roleLabels } from '../types';

const schema = z.object({
  displayName: z.string().trim().min(2, 'Indiquez votre prénom et votre nom.').max(60, '60 caractères maximum.'),
  city: z.string().trim().min(2, 'Indiquez une ville pour la météo.').max(60, '60 caractères maximum.'),
});

type FormValues = z.infer<typeof schema>;

const profileKeys = {
  all: ['parametres', 'profil'] as const,
};

export function ProfileForm() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const user = useSessionUser();
  const role = useMemberRole();
  const householdId = useHouseholdStore((state) => state.householdId);
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);
  const setMembers = useHouseholdStore((state) => state.setMembers);
  const members = useHouseholdStore((state) => state.members);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const target = useMemo(
    () => ({ userId: user?.id ?? DEMO_USER_ID, memberId: currentMemberId, householdId: householdId ?? '' }),
    [currentMemberId, householdId, user?.id],
  );

  const profileQuery = useQuery({
    queryKey: [...profileKeys.all, target.userId, target.memberId],
    enabled: Boolean(target.householdId),
    queryFn: () => fetchProfile(target),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', city: '' },
  });

  useEffect(() => {
    const profile: ProfileSettings | undefined = profileQuery.data;
    if (!profile) return;
    reset({ displayName: profile.displayName, city: profile.city });
  }, [profileQuery.data, reset]);

  const onSubmit = async (values: FormValues) => {
    setPending(true);
    setError(null);
    try {
      await saveProfile(target, values);
      // Le nom affiché dans la barre supérieure et les avatars suit le foyer.
      setMembers(members.map((member) => (member.id === target.memberId ? { ...member, display_name: values.displayName } : member)));
      await queryClient.invalidateQueries({ queryKey: profileKeys.all });
      toast('Profil enregistré. La météo de l’accueil suit votre ville.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Enregistrement impossible.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-[18px] max-[920px]:grid-cols-1 md:grid-cols-[minmax(0,1.3fr)_minmax(280px,.7fr)]">
      <Panel title="Mon profil" description="Ces informations vous identifient dans le foyer.">
        {profileQuery.isLoading ? (
          <LoadingRows rows={3} />
        ) : (
          <form className="grid gap-3.5" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Field label="Prénom et nom" error={errors.displayName?.message}>
              {(props) => <Input placeholder="Camille Martin" autoComplete="name" {...props} {...register('displayName')} />}
            </Field>
            <Field label="Ville" error={errors.city?.message} hint="Elle pilote le widget météo de votre accueil.">
              {(props) => <Input placeholder="Lyon" autoComplete="address-level2" {...props} {...register('city')} />}
            </Field>
            <Field label="Adresse e-mail" hint="L’adresse de connexion ne peut pas être modifiée ici." optional>
              {(props) => <Input type="email" readOnly value={profileQuery.data?.email ?? ''} {...props} />}
            </Field>
            {error ? (
              <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
                {error}
              </p>
            ) : null}
            <div className="mt-1 flex flex-wrap justify-end gap-2">
              <Button type="submit" disabled={pending} icon="check">
                {pending ? 'Enregistrement…' : 'Enregistrer le profil'}
              </Button>
            </div>
          </form>
        )}
      </Panel>

      <Panel title="Compte" description="Session en cours et rôle dans le foyer.">
        <div className="grid gap-0">
          <div className="flex items-center justify-between gap-2.5 border-t-0 py-[13px] text-xs">
            <span className="text-muted">Rôle</span>
            <strong>{roleLabels[role]}</strong>
          </div>
          <div className="flex items-center justify-between gap-2.5 border-t border-border py-[13px] text-xs">
            <span className="text-muted">Connexion via</span>
            <strong>{profileQuery.data ? providerLabels[profileQuery.data.provider] : '—'}</strong>
          </div>
          <div className="flex items-center justify-between gap-2.5 border-t border-border py-[13px] text-xs">
            <span className="text-muted">E-mail</span>
            <strong className="truncate">{profileQuery.data?.email || '—'}</strong>
          </div>
        </div>
        <Button
          variant="secondary"
          icon="logout"
          className="mt-4"
          fullWidth
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            try {
              await signOut();
              navigate('/connexion', { replace: true });
            } catch (signOutError) {
              toast(signOutError instanceof Error ? signOutError.message : 'Déconnexion impossible.', 'error');
              setSigningOut(false);
            }
          }}
        >
          {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
        </Button>
      </Panel>
    </div>
  );
}
