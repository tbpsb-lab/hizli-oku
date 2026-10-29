'use client'

import { Minus, Plus, Type } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export type FontFace = 'theme' | 'sans' | 'serif' | 'mono'

export const FONT_FACES: { id: FontFace; label: string; sample: string; family?: string }[] = [
  { id: 'theme', label: 'Tema', sample: 'Aa' },
  {
    id: 'sans',
    label: 'Sans',
    sample: 'Aa',
    family: 'var(--font-inter), ui-sans-serif, system-ui, sans-serif',
  },
  {
    id: 'serif',
    label: 'Serif',
    sample: 'Aa',
    family: 'var(--font-literata), ui-serif, Georgia, serif',
  },
  {
    id: 'mono',
    label: 'Mono',
    sample: 'Aa',
    family: 'var(--font-geist-mono), ui-monospace, monospace',
  },
]

export const FONT_SCALE_MIN = 0.6
export const FONT_SCALE_MAX = 1.4
export const FONT_SCALE_STEP = 0.1

type FontSettingsProps = {
  face: FontFace
  scale: number
  onFaceChange: (face: FontFace) => void
  onScaleChange: (scale: number) => void
}

export function FontSettings({ face, scale, onFaceChange, onScaleChange }: FontSettingsProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const step = (delta: number) =>
    onScaleChange(
      Math.round(Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, scale + delta)) * 10) / 10,
    )

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Yazı tipi ayarları"
        className={cn('ctl panel size-10 landscape-short:size-9', open && 'ctl-primary')}
      >
        <Type className="size-4" />
      </button>

      <div
        id={panelId}
        role="dialog"
        aria-label="Yazı tipi ayarları"
        inert={!open}
        className={cn(
          'panel panel-solid absolute -right-12 top-full z-50 mt-2 w-[min(16rem,calc(100vw-1.5rem))] origin-top-right p-3 sm:right-0 transition-all duration-200 ease-out',
          open ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0',
        )}
      >
        <p className="mb-2 px-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Yazı tipi
        </p>
        <div role="radiogroup" aria-label="Yazı ailesi" className="grid grid-cols-4 gap-1">
          {FONT_FACES.map((f) => {
            const active = f.id === face
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onFaceChange(f.id)}
                className={cn(
                  'ctl flex-col gap-0.5 rounded-xl py-2',
                  active ? 'ctl-primary' : 'bg-transparent text-muted-foreground',
                )}
              >
                <span
                  className="text-lg leading-none"
                  style={{ fontFamily: f.family ?? 'var(--reader-font)' }}
                >
                  {f.sample}
                </span>
                <span className="text-[10px] font-medium">{f.label}</span>
              </button>
            )
          })}
        </div>

        <p className="mb-2 mt-4 px-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Boyut
        </p>
        <div className="flex items-center gap-2" role="group" aria-label="Yazı boyutu">
          <button
            type="button"
            onClick={() => step(-FONT_SCALE_STEP)}
            disabled={scale <= FONT_SCALE_MIN}
            className="ctl size-9 shrink-0 disabled:opacity-40"
            aria-label="Yazıyı küçült"
          >
            <Minus className="size-4" />
          </button>
          <label htmlFor={`${panelId}-scale`} className="sr-only">
            Yazı boyutu
          </label>
          <input
            id={`${panelId}-scale`}
            type="range"
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={FONT_SCALE_STEP}
            value={scale}
            onChange={(e) => onScaleChange(Number(e.target.value))}
            className="scrubber min-w-0 flex-1"
            style={
              {
                '--progress': `${((scale - FONT_SCALE_MIN) / (FONT_SCALE_MAX - FONT_SCALE_MIN)) * 100}%`,
              } as React.CSSProperties
            }
          />
          <button
            type="button"
            onClick={() => step(FONT_SCALE_STEP)}
            disabled={scale >= FONT_SCALE_MAX}
            className="ctl size-9 shrink-0 disabled:opacity-40"
            aria-label="Yazıyı büyüt"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-center font-mono text-[11px] tabular-nums text-muted-foreground">
          %{Math.round(scale * 100)}
        </p>
      </div>
    </div>
  )
}
