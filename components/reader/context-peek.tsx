'use client'

import { cn } from '@/lib/utils'

type ContextPeekProps = {
  words: string[]
  index: number
  visible: boolean
  onJump: (index: number) => void
}

const RADIUS = 14

export function ContextPeek({ words, index, visible, onJump }: ContextPeekProps) {
  const start = Math.max(0, index - RADIUS)
  const end = Math.min(words.length, index + RADIUS + 1)
  const slice = words.slice(start, end)

  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={cn(
        'grid transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
        visible
          ? 'grid-rows-[1fr] opacity-100'
          : 'pointer-events-none grid-rows-[0fr] opacity-0',
      )}
    >
      <div className="min-h-0 overflow-hidden">
      <p className="mb-1.5 mt-4 px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground [@media(max-height:640px)]:mt-3 [@media(max-height:640px)]:hidden landscape-short:hidden">
        Bağlam
      </p>
      <p className="line-clamp-3 px-1 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-[15px] [@media(max-height:640px)]:mt-3 [@media(max-height:640px)]:line-clamp-2 landscape-short:mt-2 landscape-short:line-clamp-1">
        {start > 0 && <span aria-hidden="true">… </span>}
        {slice.map((w, i) => {
          const absolute = start + i
          const current = absolute === index
          return (
            <span key={absolute}>
              <button
                type="button"
                onClick={() => onJump(absolute)}
                aria-current={current ? 'true' : undefined}
                className={cn(
                  'rounded-[4px] px-0.5 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
                  current && 'bg-pivot/15 font-medium text-foreground',
                )}
              >
                {w}
              </button>{' '}
            </span>
          )
        })}
        {end < words.length && <span aria-hidden="true">…</span>}
      </p>
      </div>
    </div>
  )
}
