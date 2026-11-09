import { useState } from 'react';
import { loadAllSongs } from './lib/songParser';
import { transposeChord } from './lib/chordNotation';
import { StarIcon, SunIcon, MusicIcon } from './components/Icons';

export default function App() {
  const songs = loadAllSongs();
  const [selectedSongIndex] = useState(0);
  const [transpose, setTranspose] = useState(0);
  const [polishNotation, setPolishNotation] = useState(true);

  const song = songs[selectedSongIndex];

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6 flex flex-col items-center">
      <div className="w-full max-w-xl">
        <header className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-6">
          <div className="flex items-center gap-2">
            <MusicIcon className="w-7 h-7 text-amber-500" />
            <h1 className="text-2xl font-bold tracking-tight text-amber-500">Śpiewnik</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPolishNotation(!polishNotation)}
              className="px-2.5 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition"
              title="Przełącz notację polską (H/B) / międzynarodową (B/Bb)"
            >
              Notacja: {polishNotation ? 'PL (H)' : 'INT (B)'}
            </button>
            <button className="p-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300">
              <SunIcon className="w-4 h-4" />
            </button>
          </div>
        </header>

        {song && (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-neutral-100">{song.title}</h2>
                <p className="text-sm text-neutral-400">{song.artist}</p>
                <div className="flex gap-1.5 mt-2">
                  {song.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <button className="p-2 text-neutral-500 hover:text-amber-400 transition">
                <StarIcon className="w-6 h-6" />
              </button>
            </div>

            {/* Transpose controls */}
            <div className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-lg p-3">
              <span className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">Tonacja:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTranspose(transpose - 1)}
                  className="w-8 h-8 rounded bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center font-bold text-amber-400"
                >
                  -1
                </button>
                <span className="text-sm font-mono font-bold w-12 text-center text-amber-500">
                  {transpose > 0 ? `+${transpose}` : transpose}
                </span>
                <button
                  onClick={() => setTranspose(transpose + 1)}
                  className="w-8 h-8 rounded bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center font-bold text-amber-400"
                >
                  +1
                </button>
                {transpose !== 0 && (
                  <button
                    onClick={() => setTranspose(0)}
                    className="text-xs text-neutral-400 hover:text-neutral-200 underline ml-2"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Quick chord chips */}
            <div className="flex flex-wrap gap-2 pt-2">
              <span className="text-xs text-neutral-500 py-1 font-medium">Akordy:</span>
              {song.uniqueChords.map((chord) => (
                <span
                  key={chord}
                  className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20"
                >
                  {transposeChord(chord, transpose, polishNotation)}
                </span>
              ))}
            </div>

            {/* Song lines (Atomic chord-syllable flex wrapping) */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 font-mono text-sm leading-relaxed space-y-2">
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
                  <div key={lIdx} className="flex flex-wrap items-end">
                    {line.segments?.map((seg, sIdx) => (
                      <span key={sIdx} className="inline-flex flex-col align-top mr-1">
                        <span className="text-amber-400 font-bold h-4 text-xs select-none">
                          {seg.chord ? transposeChord(seg.chord, transpose, polishNotation) : '\u00A0'}
                        </span>
                        <span className="text-neutral-200 whitespace-pre font-sans text-base">
                          {seg.lyrics || '\u00A0'}
                        </span>
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
