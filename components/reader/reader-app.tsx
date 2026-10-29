'use client'

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  MAX_WPM,
  MIN_WPM,
  SAMPLE_TEXT,
  THEMES,
  WPM_STEP,
  type ThemeId,
  tokenize,
  wordDelay,
} from '@/lib/rsvp'
import { TopBar } from './top-bar'
import { RsvpDisplay } from './rsvp-display'
import { ContextPeek } from './context-peek'
import { ControlDock } from './control-dock'
import { TextSheet } from './text-sheet'
import { FONT_FACES, FontSettings, type FontFace } from './font-settings'
import { useElementHeight } from '@/lib/use-element-height'

export function ReaderApp() {
  const [theme, setTheme] = useState<ThemeId>('ios')
  const [fontFace, setFontFace] = useState<FontFace>('theme')
  const [fontScale, setFontScale] = useState(1)
  const [headerRef, headerHeight] = useElementHeight<HTMLElement>()
  const [dockRef, dockHeight] = useElementHeight<HTMLElement>()
  const [text, setText] = useState(SAMPLE_TEXT)
  const [index, setIndex] = useState(0)
  const [wpm, setWpm] = useState(300)
  const [playing, setPlaying] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const words = useMemo(() => tokenize(text), [text])
  const lastIndex = Math.max(0, words.length - 1)
  const zen = playing

  useEffect(() => {
    if (!playing || words.length === 0) return
    const timer = setTimeout(
      () => {
        if (index >= lastIndex) setPlaying(false)
        else setIndex((i) => i + 1)
      },
      wordDelay(words[index] ?? '', wpm),
    )
    return () => clearTimeout(timer)
  }, [playing, index, wpm, words, lastIndex])

  const togglePlay = useCallback(() => {
    if (words.length === 0) return
    setPlaying((p) => {
      if (!p && index >= lastIndex) setIndex(0)
      return !p
    })
  }, [words.length, index, lastIndex])

  const seek = useCallback(
    (next: number) => setIndex(Math.min(lastIndex, Math.max(0, next))),
    [lastIndex],
  )

  const changeWpm = useCallback(
    (delta: number) => setWpm((w) => Math.min(MAX_WPM, Math.max(MIN_WPM, w + delta))),
    [],
  )

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (sheetOpen) return
    const target = e.target as HTMLElement | null
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
      if (!(target instanceof HTMLInputElement && target.type === 'range' && e.code === 'Space'))
        return
    }
    switch (e.code) {
      case 'Space':
        e.preventDefault()
        togglePlay()
        break
      case 'Escape':
        setPlaying(false)
        break
      case 'ArrowLeft':
        e.preventDefault()
        seek(index - (e.shiftKey ? 10 : 1))
        break
      case 'ArrowRight':
        e.preventDefault()
        seek(index + (e.shiftKey ? 10 : 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        changeWpm(WPM_STEP)
        break
      case 'ArrowDown':
        e.preventDefault()
        changeWpm(-WPM_STEP)
        break
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
        setTheme(THEMES[Number(e.key) - 1].id)
        break
    }
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const applyText = (next: string) => {
    setText(next)
    setIndex(0)
    setPlaying(false)
    setSheetOpen(false)
  }

  const progress = words.length > 1 ? index / lastIndex : 0

  return (
    <div
      data-theme={theme}
      className="app-bg relative h-dvh w-full touch-manipulation overflow-hidden font-sans text-foreground transition-colors duration-500 selection:bg-primary/25"
    >
      <TopBar
        ref={headerRef}
        fontControl={
          <FontSettings
            face={fontFace}
            scale={fontScale}
            onFaceChange={setFontFace}
            onScaleChange={setFontScale}
          />
        }
        theme={theme}
        onThemeChange={setTheme}
        onOpenText={() => {
          setPlaying(false)
          setSheetOpen(true)
        }}
        hidden={zen}
      />

      <main
        className="absolute inset-0 flex items-center justify-center overflow-hidden px-4 transition-[padding] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] sm:px-8"
        style={{
          paddingTop: zen ? 0 : headerHeight,
          paddingBottom: zen ? 0 : dockHeight,
        }}
      >
        <div className="relative flex max-h-full w-full max-w-2xl flex-col py-3">
          <RsvpDisplay
            word={words[index] ?? ''}
            playing={playing}
            onToggle={togglePlay}
            wpm={wpm}
            fontScale={fontScale}
            fontFamily={FONT_FACES.find((f) => f.id === fontFace)?.family}
          />
          <ContextPeek
            words={words}
            index={index}
            visible={!zen && words.length > 0}
            onJump={seek}
          />
        </div>
      </main>

      <ControlDock
        ref={dockRef}
        hidden={zen}
        index={index}
        total={words.length}
        wpm={wpm}
        playing={playing}
        onToggle={togglePlay}
        onSeek={seek}
        onWpmChange={changeWpm}
      />

      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none fixed inset-x-0 top-0 z-40 h-0.5 transition-opacity duration-500',
          zen ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div
          className="h-full bg-primary transition-[width] duration-200 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {zen && (
        <button
          type="button"
          onClick={togglePlay}
          className="fixed inset-0 z-20 cursor-default"
          aria-label="Okumayı duraklat"
        />
      )}

      <p
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-6 z-20 text-center font-mono text-xs text-muted-foreground transition-opacity delay-700 duration-700',
          zen ? 'opacity-60' : 'opacity-0 delay-0 duration-200',
        )}
      >
        <span className="hidden md:inline">Duraklatmak için Space</span>
        <span className="md:hidden">Duraklatmak için dokunun</span>
      </p>

      <TextSheet
        open={sheetOpen}
        initialText={text}
        onClose={() => setSheetOpen(false)}
        onApply={applyText}
      />
    </div>
  )
}
