import { useEffect, useMemo, useState } from 'react';
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
import { useHouseholdStore, useIsAdmin } from '@/stores/household-store';
import { fetchHousehold, saveHousehold } from '../api';
import { householdColorClass, householdColorLabels, householdColors, type HouseholdColor } from '../types';

const schema = z.object({
  name: z.string().trim().min(2, 'Donnez un nom à votre foyer.').max(60, '60 caractères maximum.'),
  color: z.enum(householdColors),
});

type FormValues = z.infer<typeof schema>;

const householdKeys = {
  all: ['parametres', 'foyer'] as const,
};

export function HouseholdForm() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();
  const householdId = useHouseholdStore((state) => state.householdId);
  const householdName = useHouseholdStore((state) => state.householdName);
  const householdColor = useHouseholdStore((state) => state.householdColor);
  const members = useHouseholdStore((state) => state.members);
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);
  const setHousehold = useHouseholdStore((state) => state.setHousehold);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const householdQuery = useQuery({
    queryKey: [...householdKeys.all, householdId],
    enabled: Boolean(householdId),
    queryFn: () => fetchHousehold(householdId),
  });

  const initialColor = useMemo<HouseholdColor>(
    () => (householdColors as readonly string[]).includes(householdColor) ? (householdColor as HouseholdColor) : 'accent',
    [householdColor],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: householdName, color: initialColor },
  });
  const color = watch('color');

  useEffect(() => {
    const household = householdQuery.data;
    if (!household) return;
    reset({
      name: household.name,
      color: (householdColors as readonly string[]).includes(household.avatar_color)
        ? (household.avatar_color as HouseholdColor)
        : 'accent',
    });
  }, [householdQuery.data, reset]);

  const onSubmit = async (values: FormValues) => {
    if (!householdId) return;
    setPending(true);
    setError(null);
    try {
      const updated = await saveHousehold(householdId, { name: values.name, avatar_color: values.color });
      // La barre latérale et l'accueil lisent le foyer depuis le store.
      setHousehold(updated, members, currentMemberId);
      await queryClient.invalidateQueries({ queryKey: householdKeys.all });
      toast('Foyer mis à jour.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Enregistrement impossible.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Panel
      title="Le foyer"
      description="Le nom et la couleur apparaissent dans la barre latérale et sur l’accueil."
      action={isAdmin ? null : <span className="text-[11px] text-muted">Lecture seule</span>}
    >
      {householdQuery.isLoading ? (
        <LoadingRows rows={2} />
      ) : (
        <form className="grid gap-3.5" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Field
            label="Nom du foyer"
            error={errors.name?.message}
            hint={isAdmin ? undefined : 'Seul un administrateur peut modifier le foyer.'}
          >
            {(props) => <Input placeholder="Foyer Martin" readOnly={!isAdmin} {...props} {...register('name')} />}
          </Field>
          <fieldset disabled={!isAdmin}>
            <legend className="mb-1.5 text-[11px] font-extrabold text-muted">Couleur du foyer</legend>
            <div className="flex flex-wrap gap-2.5">
              {householdColors.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={color === value}
                  aria-label={`Couleur ${householdColorLabels[value]}`}
                  onClick={() => setValue('color', value)}
                  className={`size-11 rounded-[12px] border-2 transition-transform duration-[var(--duration-quick)] hover:-translate-y-px ${
                    color === value ? 'border-fg' : 'border-transparent'
                  } ${householdColorClass[value]}`}
                />
              ))}
            </div>
          </fieldset>
          {error ? (
            <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
              {error}
            </p>
          ) : null}
          {isAdmin ? (
            <div className="mt-1 flex flex-wrap justify-end gap-2">
              <Button type="submit" disabled={pending} icon="check">
                {pending ? 'Enregistrement…' : 'Enregistrer le foyer'}
              </Button>
            </div>
          ) : null}
        </form>
      )}
    </Panel>
  );
}
