'use client'

import { FileText } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { cn } from '@/lib/utils'
import { THEMES, type ThemeId } from '@/lib/rsvp'

type TopBarProps = {
  ref?: Ref<HTMLElement>
  theme: ThemeId
  onThemeChange: (theme: ThemeId) => void
  onOpenText: () => void
  hidden: boolean
  fontControl: ReactNode
}

export function TopBar({ ref, theme, onThemeChange, onOpenText, hidden, fontControl }: TopBarProps) {
  return (
    <header
      ref={ref}
      aria-hidden={hidden}
      inert={hidden}
      className={cn(
        'absolute inset-x-0 top-0 z-30 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] sm:px-6 sm:pt-5 landscape-short:pt-2',
        hidden && 'pointer-events-none -translate-y-6 opacity-0',
      )}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="panel grid size-9 place-items-center landscape-short:size-8"
          >
            <span className="size-2 rounded-full bg-pivot pivot-glow" />
          </span>
          <div className="leading-tight max-[359px]:sr-only">
            <p className="text-sm font-semibold tracking-tight">Odak</p>
            <p className="hidden text-xs text-muted-foreground sm:block">Hızlı okuma penceresi</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Tasarım teması"
            className="panel flex items-center gap-0.5 p-1"
          >
            {THEMES.map((t) => {
              const active = t.id === theme
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={t.hint}
                  onClick={() => onThemeChange(t.id)}
                  className={cn(
                    'ctl h-8 gap-1.5 px-2.5 text-xs font-medium landscape-short:h-7',
                    active ? 'ctl-primary' : 'bg-transparent text-muted-foreground',
                  )}
                >
                  <span className="font-mono opacity-70">{t.key}</span>
                  <span className="hidden min-[380px]:inline">{t.label}</span>
                </button>
              )
            })}
          </div>

          {fontControl}

          <button
            type="button"
            onClick={onOpenText}
            className="ctl panel size-10 landscape-short:size-9"
            aria-label="Metni düzenle"
          >
            <FileText className="size-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
