import { useState, useEffect } from 'react';
import type { SongViewerProps } from '../types';
import type { ChordNotation } from '../lib/chordNotation';
import { transposeChord } from '../lib/chordNotation';
import { ArrowLeftIcon, TrashIcon, StarIcon } from './Icons';
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
  initialChordNotation,
  initialFontSizeOffset = 0,
  initialScrollSpeed,
  onScrollSpeedChange,
  onTransposeChange,
  onPolishNotationChange,
  onChordNotationChange,
  onFontSizeOffsetChange,
  onDeleteCustomSong,
  isFavorite = false,
  onToggleFavorite,
}: SongViewerProps) {
  const [transpose, setTranspose] = useState<number>(initialTranspose);

  // Resolve the initial chord notation mode.
  // Priority: initialChordNotation > legacy initialPolishNotation bool > default 'polish'
  const resolveInitialNotation = (): ChordNotation => {
    if (initialChordNotation) return initialChordNotation;
    return initialPolishNotation ? 'polish' : 'international';
  };
  const [chordNotation, setChordNotation] = useState<ChordNotation>(resolveInitialNotation);

  const [fontSizeOffset, setFontSizeOffset] = useState<number>(initialFontSizeOffset);
  const [selectedChord, setSelectedChord] = useState<string | null>(null);

  // Sync internal state when props update externally (e.g. storage sync or song navigation)
  useEffect(() => {
    setTranspose(initialTranspose);
  }, [initialTranspose]);

  useEffect(() => {
    if (initialChordNotation) {
      setChordNotation(initialChordNotation);
    }
  }, [initialChordNotation]);

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

  const handleSetChordNotation = (next: ChordNotation) => {
    setChordNotation(next);
    onChordNotationChange?.(next);
    // Keep legacy polishNotation in sync for backward compatibility
    onPolishNotationChange?.(next === 'polish');
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

  const isChorusHeader = (header?: string): boolean => {
    if (!header) return false;
    return /^(refren|chorus|ref\b|\bref\.)/i.test(header.trim());
  };

  // Group song lines into sections so Chorus (refren) can be styled with distinct background
  const sections: {
    isChorus: boolean;
    lines: { line: (typeof song.lines)[number]; originalIndex: number }[];
    trailingEmptyLines: { line: (typeof song.lines)[number]; originalIndex: number }[];
  }[] = [];

  let currentSec: {
    isChorus: boolean;
    lines: { line: (typeof song.lines)[number]; originalIndex: number }[];
    trailingEmptyLines: { line: (typeof song.lines)[number]; originalIndex: number }[];
  } = { isChorus: false, lines: [], trailingEmptyLines: [] };

  for (let i = 0; i < song.lines.length; i++) {
    const line = song.lines[i];
    if (line.type === 'section-header') {
      if (currentSec.lines.length > 0 || currentSec.trailingEmptyLines.length > 0) {
        sections.push(currentSec);
      }
      currentSec = {
        isChorus: isChorusHeader(line.header),
        lines: [{ line, originalIndex: i }],
        trailingEmptyLines: [],
      };
    } else {
      currentSec.lines.push({ line, originalIndex: i });
    }
  }
  if (currentSec.lines.length > 0 || currentSec.trailingEmptyLines.length > 0) {
    sections.push(currentSec);
  }

  // For chorus sections, separate trailing empty lines so they serve as spacers between sections
  for (const sec of sections) {
    if (sec.isChorus && sec.lines.length > 0) {
      while (sec.lines.length > 0 && sec.lines[sec.lines.length - 1].line.type === 'empty') {
        sec.trailingEmptyLines.unshift(sec.lines.pop()!);
      }
    }
  }

  // Build a map: normalized header → content lines, from every non-ref section definition.
  // Last definition of a given name wins (overwrite on duplicate).
  const sectionDefMap = new Map<
    string,
    { line: (typeof song.lines)[number]; originalIndex: number }[]
  >();
  for (const sec of sections) {
    const headerEntry = sec.lines[0];
    if (headerEntry?.line.type !== 'section-header') continue;
    if (headerEntry.line.isRef) continue;
    const hasContent = sec.lines.some((e) => e.line.type !== 'section-header');
    if (!hasContent) continue;
    sectionDefMap.set(headerEntry.line.header!.toLowerCase(), sec.lines);
  }

  // Resolve references: inject borrowed content lines into [^...] sections.
  for (const sec of sections) {
    const headerEntry = sec.lines[0];
    if (headerEntry?.line.type !== 'section-header') continue;
    if (!headerEntry.line.isRef) continue;

    const key = headerEntry.line.header!.toLowerCase();
    const defLines = sectionDefMap.get(key);
    if (defLines) {
      const borrowedContent = defLines.filter((e) => e.line.type !== 'section-header');
      sec.lines = [headerEntry, ...borrowedContent];
    }
  }

  const renderLine = (line: (typeof song.lines)[number], lIdx: number) => {
    if (line.type === 'empty') {
      return <div key={lIdx} className="h-4" />;
    }
    if (line.type === 'section-header') {
      return (
        <div key={lIdx} className="text-amber-500/80 font-bold font-sans text-xs pt-2 break-words">
          [{line.header}]
        </div>
      );
    }
    return (
      <div key={lIdx} className="flex flex-wrap items-end w-full">
        {line.segments?.map((seg, sIdx) => {
          const displayChord = seg.chord
            ? transposeChord(seg.chord, transpose, chordNotation)
            : null;
          const nextSeg = line.segments && line.segments[sIdx + 1];
          const isDividedWord = Boolean(
            seg.lyrics &&
            nextSeg &&
            nextSeg.lyrics &&
            (
              (!/\s$/.test(seg.lyrics) && !/^\s/.test(nextSeg.lyrics)) ||
              (/\b\s*-\s*$/.test(seg.lyrics) && /^[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(nextSeg.lyrics.trimStart()))
            )
          );

          const canOverhang = isDividedWord && Boolean(displayChord) && !nextSeg?.chord;
          const displayLyrics = (isDividedWord && /\b\s+-\s*$/.test(seg.lyrics))
            ? seg.lyrics.replace(/\s+-\s*$/, '-')
            : seg.lyrics;

          const segmentClass = isDividedWord
            ? 'inline-flex flex-col align-top mr-0'
            : 'inline-flex flex-col align-top mr-1';

          return (
            <span
              key={sIdx}
              className={segmentClass}
              style={{ maxWidth: '100%' }}
            >
              {displayChord ? (
                <button
                  type="button"
                  onClick={() => setSelectedChord(displayChord)}
                  style={{
                    fontSize: `${chordFontSize}px`,
                    height: `${chordRowHeight}px`,
                    ...(canOverhang
                      ? {
                          width: '0px',
                          minWidth: '100%',
                          overflow: 'visible',
                          whiteSpace: 'nowrap',
                        }
                      : {}),
                  }}
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
                style={{
                  fontSize: `${lyricFontSize}px`,
                  lineHeight: 1.35,
                  ...(displayLyrics
                    ? {
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'break-word',
                        wordBreak: 'break-word',
                      }
                    : {}),
                }}
                className={`${isDark ? 'text-neutral-200' : 'text-neutral-800'} whitespace-pre font-sans`}
              >
                {displayLyrics || '\u00A0'}
              </span>
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="w-full max-w-xl space-y-4 min-w-0">
      {/* Top Distraction-Free Header (REQ-VIEW-3) */}
      <div className={`flex items-center justify-between border-b ${isDark ? 'border-neutral-800' : 'border-neutral-200'} pb-3 gap-2`}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={handleBack}
            className={`p-2 -ml-2 rounded-lg shrink-0 ${
              isDark
                ? 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'
            } transition cursor-pointer`}
            aria-label="Wróć do katalogu"
            title="Wróć do katalogu"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className={`text-xl font-bold break-words ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>
              <span>{song.title}</span>
              {song.isCustom && (
                <span className="inline-block ml-2 align-middle text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/30 shrink-0 select-none">
                  Własny
                </span>
              )}
            </h2>
            <p className={`text-sm truncate ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
              {song.artist}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onToggleFavorite && (
            <button
              type="button"
              onClick={() => onToggleFavorite(song.slug)}
              aria-label={
                isFavorite ? `Usuń ${song.title} z ulubionych` : `Dodaj ${song.title} do ulubionych`
              }
              title={isFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
              className={`w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
                isFavorite
                  ? 'text-amber-400 hover:text-amber-300'
                  : isDark
                    ? 'text-neutral-500 hover:text-amber-400 hover:bg-neutral-800'
                    : 'text-neutral-400 hover:text-amber-600 hover:bg-neutral-100'
              }`}
            >
              <StarIcon className="w-5 h-5" filled={isFavorite} />
            </button>
          )}
          {song.isCustom && onDeleteCustomSong && (
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.confirm(`Czy na pewno chcesz usunąć utwór "${song.title}"?`)) {
                  onDeleteCustomSong(song.slug);
                }
              }}
              className={`w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition cursor-pointer shrink-0 ${
                isDark
                  ? 'text-red-400 hover:text-red-300 hover:bg-neutral-800'
                  : 'text-red-500 hover:text-red-700 hover:bg-neutral-100'
              }`}
              aria-label="Usuń piosenkę"
              title="Usuń ten utwór ze śpiewnika"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          )}
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
          {/* Chord Notation Segmented Control */}
          <div
            className={`flex items-center rounded border ${
              isDark ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-300 bg-neutral-100'
            } p-0.5 text-xs`}
            role="group"
            aria-label="Notacja akordów"
          >
            {(
              [
                { value: 'international', label: 'INT' },
                { value: 'polish',        label: 'PL' },
                { value: 'european',      label: 'EUR' },
              ] as { value: ChordNotation; label: string }[]
            ).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => handleSetChordNotation(value)}
                aria-pressed={chordNotation === value}
                title={
                  value === 'international' ? 'Notacja międzynarodowa (Dm, B, Bb)' :
                  value === 'polish'        ? 'Notacja polska (Dm, H, B)' :
                                             'Notacja europejska (d, h, b)'
                }
                className={`px-2 py-0.5 rounded transition cursor-pointer ${
                  chordNotation === value
                    ? 'bg-amber-500 text-neutral-950 font-bold shadow-sm'
                    : isDark
                      ? 'text-neutral-300 hover:text-white'
                      : 'text-neutral-700 hover:text-neutral-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

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
              className={`px-2 py-0.5 rounded ${
                isDark ? 'text-neutral-300 hover:text-white' : 'text-neutral-700 hover:text-neutral-900'
              } disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer`}
              title="Zmniejsz czcionkę"
              aria-label="Zmniejsz czcionkę"
            >
              A-
            </button>
            <span className={`px-1 text-[10px] ${isDark ? 'text-neutral-400' : 'text-neutral-600 font-semibold'} font-mono select-none`}>
              {fontSizeOffset > 0 ? `+${fontSizeOffset}` : fontSizeOffset}
            </span>
            <button
              type="button"
              disabled={fontSizeOffset >= 12}
              onClick={() => handleFontSizeChange(2)}
              className={`px-2 py-0.5 rounded ${
                isDark ? 'text-neutral-300 hover:text-white' : 'text-neutral-700 hover:text-neutral-900'
              } disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer`}
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
          const displayChord = transposeChord(chord, transpose, chordNotation);
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
        } border rounded-lg p-3 sm:p-4 font-mono leading-relaxed space-y-2 overflow-x-hidden min-w-0 pb-28 sm:pb-32`}
      >
        {sections.map((sec, secIdx) => {
          if (sec.isChorus) {
            return (
              <div key={`sec-${secIdx}`} className="space-y-2">
                <div
                  className={`rounded-lg p-3 sm:p-4 my-2 border-l-4 border-amber-500 bg-amber-500/10 ${
                    isDark
                      ? 'border-y border-r border-amber-500/20'
                      : 'border-y border-r border-amber-500/30'
                  } space-y-2`}
                >
                  {sec.lines.map(({ line, originalIndex }) => renderLine(line, originalIndex))}
                </div>
                {sec.trailingEmptyLines.map(({ line, originalIndex }) =>
                  renderLine(line, originalIndex)
                )}
              </div>
            );
          }
          return (
            <div key={`sec-${secIdx}`} className="contents">
              {sec.lines.map(({ line, originalIndex }) => renderLine(line, originalIndex))}
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
        chordNotation={chordNotation}
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
