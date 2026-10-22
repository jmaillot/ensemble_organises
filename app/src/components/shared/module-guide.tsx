import * as Accordion from '@radix-ui/react-accordion';
import { ModuleShell } from './module-shell';
import { Icon, type IconName } from './icon';
import type { ModuleKey } from '@/lib/modules';

/**
 * Page « mode d'emploi » d'un module.
 *
 * Ce que la référence de design appelle une page « How it works » : deux
 * cartes qui disent ce que le module fait, et les questions que l'on se pose
 * devant. La structure est celle de la référence ; le TEXTE, lui, décrit ce
 * que le code fait — jamais ce qu'un autre produit fait (les fonctions
 * Premium d'ailleurs, le frigo, l'export PDF : ce module ne les a pas, donc
 * il ne les annonce pas).
 *
 * Réutilisable : un module passe ses sections et ses questions, la mise en
 * page est ici. Le contenu d'un module vit dans son propre fichier, pour que
 * la page reste lisible et que le texte soit révisable sans toucher au
 * composant.
 */

export interface GuideFeature {
  /** Pictogramme de la fonction. */
  icon: IconName;
  /** Titre court : « Regroupement par rayon ». */
  title: string;
  /** Explication en une ou deux phrases. */
  text: string;
}

export interface GuideSection {
  icon: IconName;
  /** Titre de la carte : « La liste de courses, partagée par le foyer ». */
  title: string;
  /** Phrase d'ouverture, qui résume l'idée de la carte. */
  intro: string;
  features: GuideFeature[];
}

export interface GuideQuestion {
  question: string;
  answer: string;
}

export interface ModuleGuideProps {
  /** Module dont la page est lue (en-tête, fil d'Ariane). */
  module: ModuleKey;
  title: string;
  description: string;
  sections: GuideSection[];
  questions: GuideQuestion[];
  /** Destination du bouton retour. */
  backTo: string;
  backLabel: string;
}

export function ModuleGuide({
  module,
  title,
  description,
  sections,
  questions,
  backTo,
  backLabel,
}: ModuleGuideProps) {
  return (
    <ModuleShell
      module={module}
      title={title}
      description={description}
      backTo={backTo}
      backLabel={backLabel}
    >
      <div className="grid grid-cols-2 gap-[18px] max-[920px]:grid-cols-1">
        {sections.map((section) => (
          <section key={section.title} className="panel-surface min-w-0 rounded-[24px] p-[22px] max-[650px]:rounded-[20px] max-[650px]:p-[16px]">
            <header className="mb-3 flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-accent-soft text-accent-strong">
                <Icon name={section.icon} />
              </span>
              <h2 className="m-0 font-display text-[20px] leading-tight font-semibold tracking-[-0.02em]">
                {section.title}
              </h2>
            </header>
            <p className="mb-4 text-[13px] leading-relaxed text-muted">{section.intro}</p>
            <ul className="m-0 grid list-none gap-4 p-0">
              {section.features.map((feature) => (
                <li key={feature.title} className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-muted">
                    <Icon name={feature.icon} size="sm" />
                  </span>
                  <div className="min-w-0">
                    <strong className="block text-[13px] leading-snug font-[750]">{feature.title}</strong>
                    <p className="mt-0.5 mb-0 text-[12.5px] leading-relaxed text-muted">{feature.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {questions.length > 0 ? (
        <section className="mt-[18px]" aria-labelledby="guide-questions">
          <h2
            id="guide-questions"
            className="mb-3 font-display text-[length:var(--text-section)] tracking-[-0.035em]"
          >
            Questions fréquentes
          </h2>
          <Accordion.Root
            type="single"
            collapsible
            className="panel-surface overflow-hidden rounded-[24px] px-[22px] max-[650px]:rounded-[20px] max-[650px]:px-[16px]"
          >
            {questions.map((question) => (
              <Accordion.Item key={question.question} value={question.question} className="border-b border-border last:border-b-0">
                <Accordion.Header>
                  <Accordion.Trigger className="group flex w-full items-center justify-between gap-3 py-3.5 text-left text-[13px] font-[700] transition-colors hover:text-accent-strong">
                    {question.question}
                    <Icon name="chevronDown" size="sm" className="shrink-0 text-muted transition-transform duration-[var(--duration-quick)] group-data-[state=open]:rotate-180" />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="overflow-hidden text-[12.5px] leading-relaxed text-muted data-[state=closed]:animate-none">
                  <p className="mt-0 mb-3.5">{question.answer}</p>
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </section>
      ) : null}
    </ModuleShell>
  );
}
