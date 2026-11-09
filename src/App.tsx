import { useState } from 'react';
import type { Instrument } from './types';
import { loadAllSongs } from './lib/songParser';
import { SongViewer } from './components/SongViewer';
import { MusicIcon, SunIcon, MoonIcon } from './components/Icons';

export default function App() {
  const songs = loadAllSongs();
  const [selectedSongIndex] = useState(0);
  const [instrument, setInstrument] = useState<Instrument>('guitar');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const song = songs[selectedSongIndex];
  const isDark = theme === 'dark';

  return (
    <main className={`min-h-screen ${isDark ? 'bg-neutral-950 text-neutral-100' : 'bg-neutral-50 text-neutral-900'} p-4 sm:p-6 flex flex-col items-center transition-colors`}>
      <div className="w-full max-w-xl">
        <header className={`flex items-center justify-between border-b ${isDark ? 'border-neutral-800' : 'border-neutral-200'} pb-4 mb-4`}>
          <div className="flex items-center gap-2">
            <MusicIcon className="w-7 h-7 text-amber-500" />
            <h1 className="text-2xl font-bold tracking-tight text-amber-500">Śpiewnik</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center rounded-lg ${isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-200 border-neutral-300'} border p-0.5 text-xs font-medium`}>
              <button
                type="button"
                onClick={() => setInstrument('guitar')}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  instrument === 'guitar'
                    ? 'bg-amber-500 text-neutral-950 font-semibold shadow-sm'
                    : isDark ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Gitara
              </button>
              <button
                type="button"
                onClick={() => setInstrument('ukulele')}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  instrument === 'ukulele'
                    ? 'bg-amber-500 text-neutral-950 font-semibold shadow-sm'
                    : isDark ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Ukulele
              </button>
            </div>
            <button
              type="button"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`p-2 rounded ${isDark ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300' : 'bg-neutral-200 hover:bg-neutral-300 text-neutral-700'} transition cursor-pointer`}
              title={isDark ? 'Przełącz na jasny motyw' : 'Przełącz na ciemny motyw'}
            >
              {isDark ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {song && (
          <SongViewer
            song={song}
            instrument={instrument}
            onInstrumentChange={setInstrument}
            theme={theme}
            onBack={() => {
              if (typeof window !== 'undefined') {
                window.location.hash = '#/';
              }
            }}
          />
        )}
      </div>
    </main>
  );
}
