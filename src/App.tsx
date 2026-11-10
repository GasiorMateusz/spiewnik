import { useEffect } from 'react';
import type { Instrument, SongPreferences } from './types';
import { loadAllSongs } from './lib/songParser';
import { SongViewer } from './components/SongViewer';
import { SongList } from './components/SongList';
import { MusicIcon, SunIcon, MoonIcon, ArrowLeftIcon, StarIcon } from './components/Icons';
import { artistToSlug } from './lib/search';
import { useHashRoute } from './hooks/useHashRoute';
import {
  useLocalStorage,
  STORAGE_KEYS,
  getSongPrefKey,
  validateTheme,
  validateInstrument,
  validatePolishNotation,
  validateFontOffset,
  validateFavorites,
  validateSongPreferences,
} from './hooks/useLocalStorage';

export default function App() {
  const songs = loadAllSongs();
  const route = useHashRoute();

  // Typed global preferences stored in localStorage (REQ-PER-2)
  const [instrument, setInstrument] = useLocalStorage<Instrument>(
    STORAGE_KEYS.INSTRUMENT,
    'guitar',
    validateInstrument
  );
  const [theme, setTheme] = useLocalStorage<'dark' | 'light'>(
    STORAGE_KEYS.THEME,
    'dark',
    validateTheme
  );
  const [polishNotation, setPolishNotation] = useLocalStorage<boolean>(
    STORAGE_KEYS.POLISH_NOTATION,
    true,
    validatePolishNotation
  );
  const [fontSizeOffset, setFontSizeOffset] = useLocalStorage<number>(
    STORAGE_KEYS.FONT_OFFSET,
    0,
    validateFontOffset
  );
  const [favorites, setFavorites] = useLocalStorage<string[]>(
    STORAGE_KEYS.FAVORITES,
    [],
    validateFavorites
  );

  const handleToggleFavorite = (slug: string) => {
    setFavorites((prev = []) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  const isDark = theme === 'dark';

  // Synchronize document dark class for Tailwind styles
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDark]);

  // Locate requested song when on song route
  const song =
    route.type === 'song'
      ? songs.find(
          (s) =>
            s.slug === route.slug ||
            s.title.toLowerCase() === route.slug.toLowerCase()
        ) || null
      : null;

  // Per-song preferences for the currently resolved song (REQ-PER-1)
  const songPrefKey = song ? getSongPrefKey(song.slug) : '';
  const [songPrefs, setSongPrefs] = useLocalStorage<SongPreferences>(
    songPrefKey,
    { transpose: 0, scrollSpeed: 30 },
    validateSongPreferences
  );

  // Filter songs for artist route
  const artistSongs =
    route.type === 'artist'
      ? songs.filter((s) => {
          const normArtist = s.artist.toLowerCase().trim();
          const normSlug = route.slug.toLowerCase().trim();
          return normArtist === normSlug || artistToSlug(s.artist) === normSlug;
        })
      : [];

  return (
    <main
      className={`min-h-screen ${
        isDark ? 'bg-neutral-950 text-neutral-100' : 'bg-neutral-50 text-neutral-900'
      } p-4 sm:p-6 flex flex-col items-center transition-colors`}
    >
      <div className="w-full max-w-xl">
        <header
          className={`flex items-center justify-between border-b ${
            isDark ? 'border-neutral-800' : 'border-neutral-200'
          } pb-4 mb-4`}
        >
          <a
            href="#/"
            className="flex items-center gap-2 hover:opacity-90 transition cursor-pointer"
            title="Wróć do katalogu"
          >
            <MusicIcon className="w-7 h-7 text-amber-500" />
            <h1 className="text-2xl font-bold tracking-tight text-amber-500">Śpiewnik</h1>
          </a>
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center rounded-lg ${
                isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-200 border-neutral-300'
              } border p-0.5 text-xs font-medium`}
            >
              <button
                type="button"
                onClick={() => setInstrument('guitar')}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  instrument === 'guitar'
                    ? 'bg-amber-500 text-neutral-950 font-semibold shadow-sm'
                    : isDark
                      ? 'text-neutral-400 hover:text-neutral-200'
                      : 'text-neutral-600 hover:text-neutral-900'
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
                    : isDark
                      ? 'text-neutral-400 hover:text-neutral-200'
                      : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Ukulele
              </button>
            </div>
            <button
              type="button"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`p-2 rounded ${
                isDark
                  ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                  : 'bg-neutral-200 hover:bg-neutral-300 text-neutral-700'
              } transition cursor-pointer`}
              title={isDark ? 'Przełącz na jasny motyw' : 'Przełącz na ciemny motyw'}
            >
              {isDark ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* 1. Song View: Render SongViewer if song exists, or Polish fallback card if not found */}
        {route.type === 'song' && (
          song ? (
            <SongViewer
              key={song.slug}
              song={song}
              instrument={instrument}
              onInstrumentChange={setInstrument}
              theme={theme}
              initialTranspose={songPrefs.transpose}
              initialPolishNotation={polishNotation}
              initialFontSizeOffset={fontSizeOffset}
              initialScrollSpeed={songPrefs.scrollSpeed}
              onTransposeChange={(transpose) =>
                setSongPrefs((prev) => ({ ...prev, transpose }))
              }
              onScrollSpeedChange={(scrollSpeed) =>
                setSongPrefs((prev) => ({ ...prev, scrollSpeed }))
              }
              onPolishNotationChange={setPolishNotation}
              onFontSizeOffsetChange={setFontSizeOffset}
              onBack={() => {
                if (typeof window !== 'undefined') {
                  window.location.hash = '#/';
                }
              }}
            />
          ) : (
            <div
              className={`p-6 rounded-lg border text-center space-y-4 ${
                isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
              }`}
            >
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                <MusicIcon className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className={`text-xl font-bold ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>
                  Nie znaleziono piosenki
                </h2>
                <p className={`text-sm ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                  Piosenka o identyfikatorze „{route.slug}” nie istnieje w śpiewniku.
                </p>
              </div>
              <div className="pt-2">
                <a
                  href="#/"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-sm transition cursor-pointer"
                >
                  Wróć do katalogu
                </a>
              </div>
            </div>
          )
        )}

        {/* 2. Artist View: Filtered song list or clean fallback notice */}
        {route.type === 'artist' && (
          artistSongs.length > 0 ? (
            <div className="space-y-4">
              <div
                className={`flex items-center justify-between border-b ${
                  isDark ? 'border-neutral-800' : 'border-neutral-200'
                } pb-3`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <a
                    href="#/"
                    className={`p-2 -ml-2 rounded-lg ${
                      isDark
                        ? 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800'
                        : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'
                    } transition cursor-pointer`}
                    aria-label="Wróć do katalogu"
                    title="Wróć do katalogu"
                  >
                    <ArrowLeftIcon className="w-5 h-5" />
                  </a>
                  <div className="min-w-0">
                    <h2 className={`text-xl font-bold truncate ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>
                      {artistSongs[0].artist}
                    </h2>
                    <p className={`text-xs ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                      Wykonawca • {artistSongs.length} {artistSongs.length === 1 ? 'utwór' : 'utwory'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-2.5">
                {artistSongs.map((s) => (
                  <a
                    key={s.slug}
                    href={`#/song/${s.slug}`}
                    className={`block p-3.5 rounded-lg border transition cursor-pointer group ${
                      isDark
                        ? 'bg-neutral-900 border-neutral-800 hover:border-amber-500/50 hover:bg-neutral-800/80 text-neutral-100'
                        : 'bg-white border-neutral-200 hover:border-amber-500/50 hover:bg-neutral-50 text-neutral-900 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3
                          className={`font-semibold truncate transition ${
                            isDark ? 'group-hover:text-amber-400' : 'group-hover:text-amber-600'
                          }`}
                        >
                          {s.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {s.key && (
                          <span
                            className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                              isDark
                                ? 'bg-neutral-800 text-amber-400 border border-neutral-700'
                                : 'bg-neutral-100 text-amber-600 border border-neutral-300'
                            }`}
                          >
                            {s.key}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleToggleFavorite(s.slug);
                          }}
                          aria-label={
                            favorites.includes(s.slug)
                              ? `Usuń ${s.title} z ulubionych`
                              : `Dodaj ${s.title} do ulubionych`
                          }
                          title={favorites.includes(s.slug) ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
                          className={`w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
                            favorites.includes(s.slug)
                              ? 'text-amber-400 hover:text-amber-300'
                              : isDark
                                ? 'text-neutral-500 hover:text-amber-400 hover:bg-neutral-800'
                                : 'text-neutral-400 hover:text-amber-600 hover:bg-neutral-100'
                          }`}
                        >
                          <StarIcon className="w-5 h-5" filled={favorites.includes(s.slug)} />
                        </button>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div
              className={`p-6 rounded-lg border text-center space-y-4 ${
                isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
              }`}
            >
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                <MusicIcon className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className={`text-xl font-bold ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>
                  Nie znaleziono wykonawcy
                </h2>
                <p className={`text-sm ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                  Nie znaleziono piosenek wykonawcy „{route.slug}” w śpiewniku.
                </p>
              </div>
              <div className="pt-2">
                <a
                  href="#/"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-sm transition cursor-pointer"
                >
                  Wróć do katalogu
                </a>
              </div>
            </div>
          )
        )}

        {/* 3. Catalog View: Dual Catalog SongList with tabs, search, tags, favorites */}
        {route.type === 'catalog' && (
          <SongList
            songs={songs}
            theme={theme}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {/* 4. Not-Found / Fallback View */}
        {route.type === 'not-found' && (
          <div
            className={`p-6 rounded-lg border text-center space-y-4 ${
              isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
            }`}
          >
            <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
              <MusicIcon className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className={`text-xl font-bold ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>
                Nie znaleziono strony
              </h2>
              <p className={`text-sm ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                Podana strona „{route.path}” nie istnieje.
              </p>
            </div>
            <div className="pt-2">
              <a
                href="#/"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-sm transition cursor-pointer"
              >
                Wróć do katalogu
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
