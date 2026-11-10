import { useState, useEffect } from 'react';
import type { SongViewerProps } from '../types';
import { transposeChord } from '../lib/chordNotation';
import { ArrowLeftIcon } from './Icons';
import { ChordModal } from './ChordModal';
import { useWakeLock } from '../hooks/useWakeLock';
import { AutoScroll } from './AutoScroll';

/**
 * Dedicated Song Viewer component (REQ-VIEW-1, REQ-VIEW-2, REQ-VIEW-3, REQ-NOT-1..4, REQ-SCR-3).
 * Renders song lyrics and chords with atomic flex column alignment, responsive font scaling,
 * semitone transposition controls, Polish notation toggle, quick chord chips, and screen wake lock.
 */
export function SongViewer({
  song,
  instrument = 'guitar',
  onInstrumentChange,
  onBack,
  theme = 'dark',
  initialTranspose = 0,
  initialPolishNotation = true,
  initialFontSizeOffset = 0,
  initialScrollSpeed,
  onScrollSpeedChange,
  onTransposeChange,
  onPolishNotationChange,
  onFontSizeOffsetChange,
}: SongViewerProps) {
  const [transpose, setTranspose] = useState<number>(initialTranspose);
  const [polishNotation, setPolishNotation] = useState<boolean>(initialPolishNotation);
  const [fontSizeOffset, setFontSizeOffset] = useState<number>(initialFontSizeOffset);
  const [selectedChord, setSelectedChord] = useState<string | null>(null);

  // Sync internal state when props update externally (e.g. storage sync or song navigation)
  useEffect(() => {
    setTranspose(initialTranspose);
  }, [initialTranspose]);

  useEffect(() => {
    setPolishNotation(initialPolishNotation);
  }, [initialPolishNotation]);

  useEffect(() => {
    setFontSizeOffset(initialFontSizeOffset);
  }, [initialFontSizeOffset]);

  // Screen Wake Lock automatically acquired in viewer (REQ-SCR-3)
  useWakeLock(true);

  const isDark = theme === 'dark';

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      window.location.hash = '#/';
    }
  };

  const handleTransposeDelta = (delta: number) => {
    const next = transpose + delta;
    setTranspose(next);
    onTransposeChange?.(next);
  };

  const handleTransposeReset = () => {
    setTranspose(0);
    onTransposeChange?.(0);
  };

  const handleTogglePolishNotation = () => {
    const next = !polishNotation;
    setPolishNotation(next);
    onPolishNotationChange?.(next);
  };

  const handleFontSizeChange = (delta: number) => {
    const next = Math.max(-4, Math.min(12, fontSizeOffset + delta));
    setFontSizeOffset(next);
    onFontSizeOffsetChange?.(next);
  };

  // Dynamic proportional typography sizing (REQ-VIEW-2)
  const lyricFontSize = 16 + fontSizeOffset;
  const chordFontSize = Math.max(10, 12 + Math.round(fontSizeOffset * 0.65));
  const chordRowHeight = Math.max(16, 16 + Math.round(fontSizeOffset * 0.75));

  return (
    <div className="w-full max-w-xl space-y-4">
      {/* Top Distraction-Free Header (REQ-VIEW-3) */}
      <div className={`flex items-center justify-between border-b ${isDark ? 'border-neutral-800' : 'border-neutral-200'} pb-3`}>
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={handleBack}
            className={`p-2 -ml-2 rounded-lg ${
              isDark
                ? 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'
            } transition cursor-pointer`}
            aria-label="Wróć do katalogu"
            title="Wróć do katalogu"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className={`text-xl font-bold truncate ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>
              {song.title}
            </h2>
            <p className={`text-sm truncate ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
              {song.artist}
            </p>
          </div>
        </div>
      </div>

      {/* Performer Controls Toolbar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2.5 ${
          isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'
        } border rounded-lg p-3`}
      >
        {/* Semitone Transposition & Reset (REQ-NOT-1, REQ-NOT-2) */}
        <div className="flex items-center gap-2">
          <span className={`text-xs ${isDark ? 'text-neutral-400' : 'text-neutral-500'} font-semibold uppercase tracking-wider`}>
            Tonacja:
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleTransposeDelta(-1)}
              className={`w-8 h-8 rounded ${
                isDark ? 'bg-neutral-800 hover:bg-neutral-700' : 'bg-neutral-100 hover:bg-neutral-200'
              } flex items-center justify-center font-bold text-amber-500 cursor-pointer`}
              title="Obniż o półton"
            >
              -1
            </button>
            <span className="text-sm font-mono font-bold w-12 text-center text-amber-500">
              {transpose > 0 ? `+${transpose}` : transpose}
            </span>
            <button
              type="button"
              onClick={() => handleTransposeDelta(1)}
              className={`w-8 h-8 rounded ${
                isDark ? 'bg-neutral-800 hover:bg-neutral-700' : 'bg-neutral-100 hover:bg-neutral-200'
              } flex items-center justify-center font-bold text-amber-500 cursor-pointer`}
              title="Podwyższ o półton"
            >
              +1
            </button>
            {transpose !== 0 && (
              <button
                type="button"
                onClick={handleTransposeReset}
                className={`text-xs ${
                  isDark ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-500 hover:text-neutral-800'
                } underline ml-2 cursor-pointer transition`}
                title="Przywróć oryginalną tonację"
                aria-label="Przywróć oryginalną tonację"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Notation Mode & Font Scaling (REQ-NOT-4, REQ-VIEW-2) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTogglePolishNotation}
            className={`px-2.5 py-1 text-xs rounded border transition cursor-pointer font-medium ${
              isDark
                ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border-neutral-700'
                : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border-neutral-300'
            }`}
            title="Przełącz notację polską (H/B) / międzynarodową (B/Bb)"
          >
            Notacja: {polishNotation ? 'PL (H)' : 'INT (B)'}
          </button>

          {/* Font Scaler Pill */}
          <div
            className={`flex items-center rounded border ${
              isDark ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-300 bg-neutral-100'
            } p-0.5 text-xs`}
          >
            <button
              type="button"
              disabled={fontSizeOffset <= -4}
              onClick={() => handleFontSizeChange(-2)}
              className="px-2 py-0.5 rounded text-neutral-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              title="Zmniejsz czcionkę"
              aria-label="Zmniejsz czcionkę"
            >
              A-
            </button>
            <span className="px-1 text-[10px] text-neutral-400 font-mono select-none">
              {fontSizeOffset > 0 ? `+${fontSizeOffset}` : fontSizeOffset}
            </span>
            <button
              type="button"
              disabled={fontSizeOffset >= 12}
              onClick={() => handleFontSizeChange(2)}
              className="px-2 py-0.5 rounded text-neutral-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              title="Zwiększ czcionkę"
              aria-label="Zwiększ czcionkę"
            >
              A+
            </button>
          </div>
        </div>
      </div>

      {/* Quick Chord Chips (REQ-CHD-3) */}
      <div className="flex flex-wrap gap-2 pt-2">
        <span className={`text-xs ${isDark ? 'text-neutral-500' : 'text-neutral-400'} py-1 font-medium`}>Akordy:</span>
        {song.uniqueChords.map((chord) => {
          const displayChord = transposeChord(chord, transpose, polishNotation);
          return (
            <button
              key={chord}
              type="button"
              onClick={() => setSelectedChord(displayChord)}
              className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/30 text-amber-400 border border-amber-500/20 hover:border-amber-500/40 cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              {displayChord}
            </button>
          );
        })}
      </div>

      {/* Song Lines (Atomic chord-syllable flex wrapping - REQ-VIEW-1) */}
      <div
        className={`${
          isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'
        } border rounded-lg p-3 sm:p-4 font-mono leading-relaxed space-y-2 overflow-x-hidden pb-28 sm:pb-32`}
      >
        {song.lines.map((line, lIdx) => {
          if (line.type === 'empty') {
            return <div key={lIdx} className="h-4" />;
          }
          if (line.type === 'section-header') {
            return (
              <div key={lIdx} className="text-amber-500/80 font-bold font-sans text-xs pt-2">
                [{line.header}]
              </div>
            );
          }
          return (
            <div key={lIdx} className="flex flex-wrap items-end w-full">
              {line.segments?.map((seg, sIdx) => {
                const displayChord = seg.chord
                  ? transposeChord(seg.chord, transpose, polishNotation)
                  : null;
                return (
                  <span key={sIdx} className="inline-flex flex-col align-top mr-1">
                    {displayChord ? (
                      <button
                        type="button"
                        onClick={() => setSelectedChord(displayChord)}
                        style={{ fontSize: `${chordFontSize}px`, height: `${chordRowHeight}px` }}
                        className="text-amber-500 hover:text-amber-400 hover:underline font-bold select-none cursor-pointer text-left focus:outline-none focus:ring-1 focus:ring-amber-500/50 rounded leading-none flex items-center"
                      >
                        {displayChord}
                      </button>
                    ) : (
                      <span
                        style={{ fontSize: `${chordFontSize}px`, height: `${chordRowHeight}px` }}
                        className="text-amber-500 font-bold select-none pointer-events-none leading-none flex items-center"
                      >
                        {'\u00A0'}
                      </span>
                    )}
                    <span
                      style={{ fontSize: `${lyricFontSize}px`, lineHeight: 1.35 }}
                      className={`${isDark ? 'text-neutral-200' : 'text-neutral-800'} whitespace-pre font-sans`}
                    >
                      {seg.lyrics || '\u00A0'}
                    </span>
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Interactive Chord Modal */}
      <ChordModal
        isOpen={selectedChord !== null}
        chord={selectedChord}
        instrument={instrument}
        onInstrumentChange={onInstrumentChange || (() => {})}
        onClose={() => setSelectedChord(null)}
        polishNotation={polishNotation}
      />

      {/* Hands-Free Auto-Scroll Floating Dock (REQ-SCR-1, REQ-SCR-2) */}
      <AutoScroll
        theme={theme}
        initialSpeed={initialScrollSpeed}
        onSpeedChange={onScrollSpeedChange}
      />
    </div>
  );
}
