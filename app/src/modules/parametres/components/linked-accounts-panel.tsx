import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/shared/module-shell';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import {
  getLinkedIdentities,
  linkOAuthProvider,
  unlinkOAuthProvider,
  type OAuthProvider,
} from '@/hooks/use-auth';

const providers: { value: OAuthProvider; label: string }[] = [
  { value: 'google', label: 'Google' },
  { value: 'facebook', label: 'Facebook' },
];

/**
 * Liaison des comptes (fusion email + OAuth).
 *
 * Sans liaison, une connexion Google sur une adresse déjà inscrite par email
 * crée un second utilisateur Auth : profils et foyers séparés. Lier depuis une
 * session existante ajoute une seconde identité au même utilisateur, et les
 * deux modes mènent ensuite au même foyer.
 */
export function LinkedAccountsPanel() {
  const [linked, setLinked] = useState<string[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    getLinkedIdentities()
      .then((identities) => {
        if (active) setLinked(identities.map((identity) => identity.provider));
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Lecture impossible.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <Panel title="Comptes liés" description="Fusion de la connexion e-mail avec Google ou Facebook.">
        <p className="m-0 text-xs text-muted">
          Disponible une fois connecté à Supabase. En démonstration locale, il n’y a qu’un seul compte.
        </p>
      </Panel>
    );
  }

  const run = async (key: string, action: () => Promise<unknown>) => {
    setPending(key);
    setError(null);
    try {
      await action();
      setLinked(await getLinkedIdentities().then((identities) => identities.map((identity) => identity.provider)));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Opération impossible.');
    } finally {
      setPending(null);
    }
  };

  return (
    <Panel
      title="Comptes liés"
      description="Liez Google ou Facebook à ce compte : les deux connexions mèneront ensuite au même foyer."
    >
      {loading ? (
        <p className="m-0 text-xs text-muted">Lecture des comptes liés…</p>
      ) : (
        <div className="grid gap-2.5">
          {providers.map((entry) => {
            const isLinked = linked.includes(entry.value);
            const canUnlink = isLinked && linked.length > 1;
            return (
              <div key={entry.value} className="flex items-center justify-between gap-2.5 text-xs">
                <span>
                  <strong>{entry.label}</strong>{' '}
                  <span className="text-muted">{isLinked ? '· lié' : '· non lié'}</span>
                </span>
                {isLinked ? (
                  <Button
                    variant="secondary"
                    disabled={pending !== null || !canUnlink}
                    title={canUnlink ? undefined : 'Dernier mode de connexion : retrait impossible'}
                    onClick={() => run(`unlink-${entry.value}`, () => unlinkOAuthProvider(entry.value))}
                  >
                    {pending === `unlink-${entry.value}` ? 'Retrait…' : 'Délier'}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={pending !== null}
                    onClick={() => run(`link-${entry.value}`, () => linkOAuthProvider(entry.value))}
                  >
                    {pending === `link-${entry.value}` ? 'Redirection…' : 'Lier'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mb-0 text-[11px] text-muted">
        Déjà deux comptes séparés (e-mail puis Google) ? Connectez-vous avec l’e-mail, liez Google ici, puis
        abandonnez le doublon : Supabase ne fusionne jamais deux utilisateurs tout seul.
      </p>
      {error ? (
        <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
