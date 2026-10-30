import type { CSSProperties } from 'react'

interface WordRevealProps {
  text: string
}

export default function WordReveal({ text }: WordRevealProps) {
  return (
    <>
      <span className="sr-only">{text}</span>
      <span className="motion-words" aria-hidden="true">
        {text.split(/(\s+)/).map((part, index) =>
          /^\s+$/.test(part) ? (
            part
          ) : (
            <span className="motion-word-mask" key={`${index}-${part}`}>
              <span className="motion-word" style={{ '--word-delay': `${Math.min(index * 28, 196)}ms` } as CSSProperties}>
                {part}
              </span>
            </span>
          ),
        )}
      </span>
    </>
  )
}
