import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { cn } from '@/lib/utils';
import { Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { useToast } from '@/components/ui/toast';
import { compressImage, describeFile, type CompressedImage } from '../lib/media';
import type { PublishInput } from '../types';

const schema = z.object({
  text: z.string().trim().max(600, 'Le message est limité à 600 caractères.'),
});

type ComposerValues = z.infer<typeof schema>;

export interface PostComposerProps {
  onPublish: (input: PublishInput) => Promise<boolean>;
  /** Incrémenté par la page pour placer le curseur dans le composeur. */
  focusSignal?: number;
  disabled?: boolean;
}

/** Compositeur du fil : texte, photo compressée localement, publication. */
export function PostComposer({ onPublish, focusSignal = 0, disabled }: PostComposerProps) {
  const toast = useToast();
  const [image, setImage] = useState<CompressedImage | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [pending, setPending] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setFocus,
    control,
    formState: { errors },
  } = useForm<ComposerValues>({ resolver: zodResolver(schema), defaultValues: { text: '' } });
  const text = useWatch({ control, name: 'text' }) ?? '';

  useEffect(() => {
    if (focusSignal > 0) setFocus('text');
  }, [focusSignal, setFocus]);

  const discardImage = () => {
    setImage((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
  };

  const onSelectFile = async (file: File | undefined) => {
    if (!file) return;
    setCompressing(true);
    try {
      const compressed = await compressImage(file);
      setImage((current) => {
        if (current) URL.revokeObjectURL(current.previewUrl);
        return compressed;
      });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Photo illisible.', 'error');
    } finally {
      setCompressing(false);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    const message = values.text.trim();
    if (!message && !image) {
      setError('text', { message: 'Écrivez un mot au foyer ou ajoutez une photo.' });
      return;
    }
    setPending(true);
    const published = await onPublish({ text: message, image });
    setPending(false);
    if (published) {
      reset({ text: '' });
      // L'URL d'aperçu est conservée : en mode démo elle sert de média stocké.
      setImage(null);
    }
  });

  return (
    <Panel title="Partager un moment" description="Une photo, une vidéo ou simplement une pensée." className="mb-3.5">
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field
          label="Votre commentaire"
          error={errors.text?.message}
          hint="Les publications sont visibles par tout le foyer."
        >
          {(props) => (
            <Textarea
              {...props}
              {...register('text')}
              placeholder="Écrire au foyer…"
              disabled={disabled || pending}
            />
          )}
        </Field>

        <div className="flex flex-wrap items-center gap-2.5">
          <label
            className={cn(
              'inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-surface px-[11px] text-[12px] font-[760] text-fg transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint',
              compressing && 'pointer-events-none opacity-55',
            )}
          >
            <Icon name="image" size="sm" />
            {compressing ? 'Compression…' : 'Ajouter une photo'}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={disabled || compressing || pending}
              onChange={(event) => {
                void onSelectFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </label>

          {image ? (
            <>
              <img
                src={image.previewUrl}
                alt="Aperçu de la photo choisie"
                className="size-11 shrink-0 rounded-[11px] border border-border object-cover"
              />
              <span className="text-[11px] text-muted">{describeFile(image.originalName, image.size)}</span>
              <button
                type="button"
                onClick={discardImage}
                className="grid size-8 place-items-center rounded-[9px] text-muted transition-colors duration-[var(--duration-quick)] hover:bg-coral-soft hover:text-coral"
                aria-label="Retirer la photo"
              >
                <Icon name="close" size="sm" />
              </button>
            </>
          ) : null}

          <Button
            type="submit"
            icon="send"
            className="ml-auto"
            disabled={disabled || pending || compressing || (!text.trim() && !image)}
          >
            {pending ? 'Publication…' : 'Publier'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
