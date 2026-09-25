import { useState } from 'react';
import { Link } from 'react-router';
import { moduleMap, modules } from '@/lib/modules';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/shared/icon';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { demoMembers } from '@/lib/data/seed';

const highlights: { icon: IconName; title: string; text: string }[] = [
  { icon: 'checkCircle', title: 'Priorités partagées', text: 'Chacun voit ce qui le concerne, avec son code couleur et ses rappels.' },
  { icon: 'wallet', title: 'Ardoise transparente', text: 'Le partage est calculé automatiquement, chacun sait ce qu’il doit à qui.' },
  { icon: 'people', title: 'Un seul fil', text: 'Tâches, courses, anniversaires et souvenirs reunited au même endroit.' },
  { icon: 'wifi', title: 'Utilisable hors ligne', text: 'L’application reste consultable et les saisies repartent à la reconnexion.' },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-bg">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-[10px] focus:bg-fg focus:px-4 focus:py-2 focus:text-surface"
      >
        Aller au contenu
      </a>
      <header className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-5 py-5 max-[650px]:px-[15px]">
        <div className="flex items-center gap-2.5">
          <div className="relative grid size-[38px] place-items-center overflow-hidden rounded-[13px] bg-fg text-surface">
            <Icon name="home" />
            <span aria-hidden="true" className="absolute right-[5px] bottom-[5px] size-[17px] rounded-full border-2 border-accent" />
          </div>
          <div>
            <div className="font-display text-base font-extrabold tracking-[-0.02em]">Ensemble &amp; Organisés</div>
            <div className="text-[11px] text-muted">Votre foyer, en mouvement</div>
          </div>
        </div>
        <Link to="/connexion">
          <Button size="sm">Se connecter</Button>
        </Link>
      </header>

      <main id="contenu" className="mx-auto max-w-[1180px] px-5 max-[650px]:px-[15px]">
        <section className="grid items-center gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
          <div>
            <p className="eyebrow mb-3">L’espace familial</p>
            <h1 className="mb-3.5 text-[clamp(30px,4.4vw,52px)] leading-[1.02]">
              Tout le foyer, <span className="text-accent-strong">au même endroit</span>.
            </h1>
            <p className="lede mb-6 max-w-[520px] text-[15px]">
              Tâches, courses, calendrier, budget partagé et souvenirs : une seule application pour que chacun
              sache ce qu’il a à faire, ce qu’il a promis, et ce qu’il partage.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Link to="/connexion">
                <Button icon="arrow">Commencer avec Google</Button>
              </Link>
              <Link to="/connexion">
                <Button variant="secondary">Continuer avec Facebook</Button>
              </Link>
              <Link to="/connexion" className="w-full max-[650px]:w-auto">
                <Button variant="quiet" className="w-full max-[650px]:w-auto" iconEnd="chevronRight">
                  Continuer avec un email
                </Button>
              </Link>
            </div>
            <div className="mt-7 flex items-center gap-3">
              <span className="flex -space-x-2">
                {demoMembers.slice(0, 4).map((member) => (
                  <MemberAvatar key={member.id} member={member} size="md" className="border-2 border-bg" />
                ))}
              </span>
              <p className="m-0 text-xs text-muted">Pensé pour les foyers de 2 à 6 personnes, avec des rôles Kids.</p>
            </div>
          </div>

          <div className="rounded-[22px] border border-border bg-surface p-5 shadow-[var(--shadow-md)]">
            <div className="rounded-[22px] border border-accent/25 bg-accent-soft p-5">
              <p className="eyebrow mb-1.5">Le point du jour</p>
              <h2 className="mb-1.5 text-xl tracking-[-0.02em]">Deux échéances à garder en tête.</h2>
              <p className="m-0 text-[13px] text-ink-soft">
                Le rendez-vous de 19 h 30 arrive bientôt. Les courses, elles, sont presque prêtes.
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {modules.slice(0, 4).map((entry) => (
                <div key={entry.key} className="rounded-[16px] border border-border bg-surface p-3.5">
                  <span className="mb-2 grid size-9 place-items-center rounded-[12px] bg-accent-soft text-accent-strong">
                    <Icon name={entry.icon} size="sm" />
                  </span>
                  <strong className="block font-display text-[15px] tracking-[-0.03em]">{entry.label}</strong>
                  <span className="text-[11px] text-muted">{entry.detail}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 mb-0 text-[11px] text-muted">
              {moduleMap.taches.label}, {moduleMap.ardoise.label} et {moduleMap.cercle.label} partagent les mêmes membres et
              les mêmes règles d’accès.
            </p>
          </div>
        </section>

        <section aria-labelledby="valeurs" className="py-10">
          <h2 id="valeurs" className="mb-2 text-[clamp(22px,2.4vw,30px)] leading-[1.08]">
            Pensé pour un foyer, pas pour un compte unique
          </h2>
          <p className="lede mb-6 text-[15px]">
            Chaque membre voit ce qui le concerne, les données restent privées au foyer, et les actions sensibles
            passent toujours par le serveur.
          </p>
          <div className="grid gap-3.5 sm:grid-cols-2">
            {highlights.map((item) => (
              <article key={item.title} className="rounded-[16px] border border-border bg-surface p-5">
                <span className="mb-3 grid size-10 place-items-center rounded-[13px] bg-accent-soft text-accent-strong">
                  <Icon name={item.icon} />
                </span>
                <h3 className="mb-1.5 font-display text-lg tracking-[-0.035em]">{item.title}</h3>
                <p className="m-0 text-xs text-muted">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="espaces" className="py-10">
          <h2 id="espaces" className="mb-2 text-[clamp(22px,2.4vw,30px)] leading-[1.08]">
            Seize espaces, une seule cohérence du quotidien
          </h2>
          <p className="lede mb-6 text-[15px]">Chaque module garde sa profondeur, tout en partageant membres, rappels et couleurs.</p>
          <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-3 lg:grid-cols-4">
            {modules.map((entry) => (
              <li key={entry.key}>
                <Link
                  to="/connexion"
                  className="flex min-h-11 items-center gap-2.5 rounded-[12px] border border-border bg-surface px-3.5 py-2.5 text-[13px] font-semibold transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint"
                >
                  <Icon name={entry.icon} size="sm" className="text-accent-strong" />
                  {entry.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="faq" className="py-10">
          <h2 id="faq" className="mb-4 text-[clamp(22px,2.4vw,30px)] leading-[1.08]">
            Questions fréquentes
          </h2>
          <div className="grid gap-2.5">
            {[
              {
                q: 'Comment Invite-t-on un proche ?',
                a: 'Un administrateur génère un token d’invitation depuis les préférences du foyer. Le token brut n’est affiché qu’à sa génération : la base ne conserve que son empreinte HMAC, avec expiration et nombre d’utilisations.',
              },
              {
                q: 'Qui peut voir les données du foyer ?',
                a: 'Uniquement les membres du foyer concerné. Chaque table est protégée par des politiques de sécurité au niveau des lignes, et les opérations sensibles (rôles, rappels, tokens) passent par des fonctions serveur.',
              },
              {
                q: 'Est-ce que ça marche sans réseau ?',
                a: 'Oui. Les données consultées sont mises en cache localement, et les saisies en attente sont rejouées à la reconnexion.',
              },
            ].map((item, index) => {
              const open = openFaq === index;
              return (
                <div key={item.q} className="rounded-[16px] border border-border bg-surface">
                  <h3>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={`faq-${index}`}
                      onClick={() => setOpenFaq(open ? null : index)}
                      className="flex min-h-13 w-full items-center justify-between gap-3 px-4.5 py-3.5 text-left font-display text-[15px] font-bold tracking-[-0.02em]"
                    >
                      {item.q}
                      <Icon name={open ? 'close' : 'plus'} size="sm" className="text-muted" />
                    </button>
                  </h3>
                  {open ? (
                    <p id={`faq-${index}`} className="m-0 border-t border-border px-4.5 py-3.5 text-xs text-muted">
                      {item.a}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-16 rounded-[22px] bg-fg px-6 py-9 text-center text-surface">
          <h2 className="mb-2.5 text-[clamp(22px,2.4vw,30px)] leading-[1.08]">Créez votre foyer en deux minutes</h2>
          <p className="mx-auto mb-6 max-w-[520px] text-[13px] text-on-dark">
            Un nom, une couleur, et votre foyer est prêt. Vous pourrez inviter les autres membres quand vous voulez.
          </p>
          <Link to="/connexion">
            <Button icon="arrow">Commencer</Button>
          </Link>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-5 py-6 text-[11px] text-muted max-[650px]:px-[15px]">
          <span>Ensemble &amp; Organisés — l’espace familial pour tout garder en mouvement.</span>
          <span>Application web installable, utilisable hors ligne.</span>
        </div>
      </footer>
    </div>
  );
}
