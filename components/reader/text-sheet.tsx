'use client'

import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { SAMPLE_TEXT, tokenize } from '@/lib/rsvp'

type TextSheetProps = {
  open: boolean
  initialText: string
  onClose: () => void
  onApply: (text: string) => void
}

export function TextSheet({ open, initialText, onClose, onApply }: TextSheetProps) {
  if (!open) return null
  return <TextSheetBody initialText={initialText} onClose={onClose} onApply={onApply} />
}

function TextSheetBody({ initialText, onClose, onApply }: Omit<TextSheetProps, 'open'>) {
  const [draft, setDraft] = useState(initialText)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const count = tokenize(draft).length

  useEffect(() => {
    textareaRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Kapat"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/20 animate-in fade-in duration-300"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="text-sheet-title"
        className="panel relative flex max-h-[85dvh] w-full max-w-2xl flex-col gap-3 rounded-b-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-8 fade-in duration-300 sm:rounded-b-(--panel-radius) sm:p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="text-sheet-title" className="text-base font-semibold tracking-tight">
              Okunacak metin
            </h2>
            <p className="text-xs text-muted-foreground">Bir makale, bölüm ya da not yapıştırın.</p>
          </div>
          <button type="button" onClick={onClose} className="ctl size-9" aria-label="Kapat">
            <X className="size-4" />
          </button>
        </div>

        <label htmlFor="reader-text" className="sr-only">
          Metin
        </label>
        <textarea
          id="reader-text"
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          className="min-h-40 w-full flex-1 resize-none rounded-[calc(var(--panel-radius)*0.6)] border border-border bg-background/60 p-3 font-reader text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Metninizi buraya yapıştırın…"
        />

        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{count} kelime</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDraft(SAMPLE_TEXT)}
              className="ctl h-10 px-3 text-sm"
            >
              Örnek
            </button>
            <button type="button" onClick={() => setDraft('')} className="ctl h-10 px-3 text-sm">
              Temizle
            </button>
            <button
              type="button"
              onClick={() => onApply(draft)}
              disabled={count === 0}
              className="ctl ctl-primary h-10 px-4 text-sm font-semibold disabled:opacity-40"
            >
              Uygula
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
