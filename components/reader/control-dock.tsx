'use client'

import { ChevronLeft, ChevronRight, Minus, Pause, Play, Plus } from 'lucide-react'
import type { CSSProperties, Ref } from 'react'
import { cn } from '@/lib/utils'
import { MAX_WPM, MIN_WPM, WPM_STEP, formatRemaining } from '@/lib/rsvp'

type ControlDockProps = {
  ref?: Ref<HTMLElement>
  hidden: boolean
  index: number
  total: number
  wpm: number
  playing: boolean
  onToggle: () => void
  onSeek: (index: number) => void
  onWpmChange: (delta: number) => void
}

export function ControlDock({
  ref,
  hidden,
  index,
  total,
  wpm,
  playing,
  onToggle,
  onSeek,
  onWpmChange,
}: ControlDockProps) {
  const last = Math.max(0, total - 1)
  const progress = last > 0 ? (index / last) * 100 : 0

  return (
    <footer
      ref={ref}
      aria-hidden={hidden}
      inert={hidden}
      className={cn(
        'absolute inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] sm:px-6 sm:pb-6 landscape-short:pb-2',
        hidden && 'pointer-events-none translate-y-8 opacity-0',
      )}
    >
      <div className="panel mx-auto flex max-w-xl flex-col gap-2 p-3 sm:p-4 landscape-short:max-w-3xl landscape-short:flex-row landscape-short:items-center landscape-short:gap-4 landscape-short:px-4 landscape-short:py-2">
        <div className="flex flex-col gap-0.5 landscape-short:min-w-0 landscape-short:flex-1">
          <label htmlFor="scrubber" className="sr-only">
            Metin içinde konum
          </label>
          <input
            id="scrubber"
            type="range"
            min={0}
            max={last}
            step={1}
            value={index}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="scrubber"
            style={{ '--progress': `${progress}%` } as CSSProperties}
          />
          <div className="flex items-center justify-between px-0.5 font-mono text-[11px] tabular-nums text-muted-foreground landscape-short:hidden">
            <span>
              {total === 0 ? 0 : index + 1} / {total}
            </span>
            <span>{formatRemaining(total - index - 1, wpm)} kaldı</span>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 sm:gap-2 landscape-short:flex landscape-short:shrink-0">
          <div
            className="flex items-center gap-1 justify-self-start"
            role="group"
            aria-label="Okuma hızı"
          >
            <button
              type="button"
              onClick={() => onWpmChange(-WPM_STEP)}
              disabled={wpm <= MIN_WPM}
              className="ctl size-9 disabled:opacity-40 sm:size-10 landscape-short:size-9"
              aria-label="Hızı azalt"
            >
              <Minus className="size-4" />
            </button>
            <output
              aria-live="polite"
              className="flex w-11 flex-col items-center leading-none"
            >
              <span className="font-mono text-sm font-semibold tabular-nums">{wpm}</span>
              <span className="mt-1 text-[10px] text-muted-foreground">k/dk</span>
            </output>
            <button
              type="button"
              onClick={() => onWpmChange(WPM_STEP)}
              disabled={wpm >= MAX_WPM}
              className="ctl size-9 disabled:opacity-40 sm:size-10 landscape-short:size-9"
              aria-label="Hızı artır"
            >
              <Plus className="size-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onToggle}
            disabled={total === 0}
            className="ctl ctl-primary h-14 gap-2 px-5 text-base font-semibold tracking-wide disabled:opacity-40 max-[359px]:size-13 max-[359px]:px-0 sm:px-7 landscape-short:h-10 landscape-short:px-5 landscape-short:text-sm"
            aria-keyshortcuts="Space"
          >
            {playing ? (
              <Pause className="size-5 fill-current" />
            ) : (
              <Play className="size-5 fill-current" />
            )}
            <span className="max-[359px]:sr-only">{playing ? 'DUR' : 'OKU'}</span>
          </button>

          <div className="flex items-center gap-1 justify-self-end" role="group" aria-label="Kelime atla">
            <button
              type="button"
              onClick={() => onSeek(index - 10)}
              disabled={index === 0}
              className="ctl size-9 disabled:opacity-40 sm:size-10 landscape-short:size-9"
              aria-label="10 kelime geri"
              aria-keyshortcuts="Shift+ArrowLeft"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => onSeek(index + 10)}
              disabled={index >= last}
              className="ctl size-9 disabled:opacity-40 sm:size-10 landscape-short:size-9"
              aria-label="10 kelime ileri"
              aria-keyshortcuts="Shift+ArrowRight"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>
      </div>

      <p className="mx-auto mt-3 hidden max-w-xl text-center text-xs text-muted-foreground lg:block landscape-short:hidden">
        <kbd className="font-mono">Space</kbd> oku/dur · <kbd className="font-mono">← →</kbd> kelime ·{' '}
        <kbd className="font-mono">↑ ↓</kbd> hız · <kbd className="font-mono">1 2 3</kbd> tema
      </p>
    </footer>
  )
}
