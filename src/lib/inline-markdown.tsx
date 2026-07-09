import { Fragment, type ReactNode } from 'react'

// L'IA écrit en principe de la prose simple (le prompt système interdit listes
// à puces et titres), mais laisse parfois passer du markdown inline (**gras**,
// _italique_, `code`) — on le restitue stylé plutôt que de l'afficher brut.
const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g

export function renderInlineMarkdown(text: string): ReactNode {
  return text.split(INLINE_PATTERN).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="px-1 py-0.5 rounded bg-black/10 text-[0.92em]">{part.slice(1, -1)}</code>
    }
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}
