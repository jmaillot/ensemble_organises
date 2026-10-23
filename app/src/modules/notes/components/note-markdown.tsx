import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/**
 * Aperçu Markdown d'une note.
 *
 * Deux propriétés portent la sûreté de ce rendu, et tiennent au fait de ne rien
 * ajouter à la bibliothèque :
 *
 * - **aucun `rehype-raw`** : react-markdown ne construit que des éléments React
 *   à partir de l'arbre Markdown. Un `<script>` ou un `<img onerror=…>` écrit
 *   dans une note reste donc du *texte* affiché tel quel, jamais un nœud du
 *   document. C'est ce qui dispense d'un assainisseur ;
 * - **`urlTransform` par défaut** : les protocoles `javascript:` et `data:`
 *   sortent vidés d'un lien, donc un `[clic](javascript:…)` ne produit pas de
 *   cible exécutable.
 *
 * Le style passe par le conteneur et ses sélecteurs d'enfants plutôt que par un
 * mapping de balises : les notes affichées sont du texte courant, et la mise en
 * forme doit rester la même partout où l'aperçu apparaît.
 */
export function NoteMarkdown({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        'text-[13.5px] leading-[1.65] text-ink-soft',
        // Les marges verticales viennent des enfants ; sans ceci, un aperçu qui
        // commence par un titre ou finit par une liste déborde de son cadre.
        '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        '[&_p]:my-2 [&_p]:text-[13.5px]',
        '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:font-display [&_h1]:text-[19px] [&_h1]:tracking-[-0.03em] [&_h1]:text-fg',
        '[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-[17px] [&_h2]:tracking-[-0.03em] [&_h2]:text-fg',
        '[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:font-display [&_h3]:text-[15px] [&_h3]:text-fg',
        '[&_h4]:mt-3 [&_h4]:mb-1.5 [&_h4]:font-semibold [&_h4]:text-fg',
        '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-1 [&_li]:pl-0.5 [&_li>p]:my-0',
        '[&_ul_ul]:my-1 [&_ul_ul]:list-[circle]',
        '[&_a]:font-semibold [&_a]:text-accent-strong [&_a]:underline [&_a]:decoration-accent/40 [&_a]:underline-offset-2',
        '[&_strong]:font-[700] [&_strong]:text-fg [&_em]:italic',
        '[&_del]:text-muted [&_del]:line-through',
        '[&_code]:rounded-[6px] [&_code]:bg-accent-faint [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px]',
        '[&_pre]:my-2.5 [&_pre]:overflow-x-auto [&_pre]:rounded-[14px] [&_pre]:bg-accent-deep [&_pre]:p-3.5',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[12.5px] [&_pre_code]:text-on-dark',
        '[&_blockquote]:my-2.5 [&_blockquote]:border-l-[3px] [&_blockquote]:border-accent-soft [&_blockquote]:pl-3 [&_blockquote]:text-muted',
        '[&_hr]:my-4 [&_hr]:border-border',
        '[&_img]:my-2 [&_img]:rounded-[12px]',
        // Un tableau large ne doit pas élargir la carte qui le contient : la
        // même contrainte que les vues, où rien ne défile horizontalement.
        '[&_table]:my-2.5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[12.5px]',
        '[&_th]:border [&_th]:border-border [&_th]:bg-bg [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-bold',
        '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5',
        // Cases de liste de tâches GFM : le rendu pose des `<input disabled>`,
        // désactivés par la bibliothèque. Elles se lisent, elles ne se cliquent
        // pas — la note n'est pas une application de tâches.
        '[&_input[type=checkbox]]:mr-1.5 [&_input[type=checkbox]]:size-[13px] [&_input[type=checkbox]]:align-[-1px] [&_input[type=checkbox]]:accent-[var(--color-accent)]',
        '[&_input[type=checkbox]]:disabled:opacity-100',
        className,
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => {
            // Un lien absolu quitte l'application : il s'ouvre dans un onglet
            // et ne transmet pas la page d'origine. Un lien interne (route de
            // l'application) garde la navigation normale, sans nouvel onglet.
            const external = typeof props.href === 'string' && /^https?:\/\//i.test(props.href);
            return (
              <a
                {...props}
                {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
              />
            );
          },
          table: ({ node, ...props }) => (
            <div className="my-2.5 overflow-x-auto">
              <table {...props} className="my-0" />
            </div>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
