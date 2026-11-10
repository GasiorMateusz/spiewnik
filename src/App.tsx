import { useEffect, useState, useMemo } from 'react';
import type { Instrument, SongPreferences, ParsedSong } from './types';
import { loadAllSongs } from './lib/songParser';
import { SongViewer } from './components/SongViewer';
import { SongList } from './components/SongList';
import { MusicIcon, SunIcon, MoonIcon, ArrowLeftIcon, StarIcon, SearchIcon, XIcon, WifiOffIcon } from './components/Icons';
import { Toast } from './components/Toast';
import { artistToSlug, normalizeSearchText, matchSong, extractCatalogTags } from './lib/search';
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

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [toast, setToast] = useState<{
    message: string;
    actionLabel?: string;
    onAction?: () => void;
    autoCloseMs?: number;
  } | null>(null);

  // Synchronize document dark class, body class, and mobile theme-color
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (isDark) {
        document.documentElement.classList.add('dark');
        document.body.className =
          'bg-neutral-950 text-neutral-100 min-h-screen antialiased selection:bg-amber-500 selection:text-black';
      } else {
        document.documentElement.classList.remove('dark');
        document.body.className =
          'bg-neutral-50 text-neutral-900 min-h-screen antialiased selection:bg-amber-500 selection:text-black';
      }
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', isDark ? '#0a0a0a' : '#fafafa');
      }
    }
  }, [isDark]);

  // Network offline/online listeners and Service Worker update detection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      setToast({
        message: 'Przywrócono połączenie z internetem.',
        autoCloseMs: 3000,
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      setToast({
        message: 'Brak połączenia z siecią. Śpiewnik działa w trybie offline.',
        autoCloseMs: 4000,
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setToast({
                message: 'Dostępna nowa wersja śpiewnika',
                actionLabel: 'Odśwież',
                onAction: () => window.location.reload(),
              });
            }
          });
        });
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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

  // Artist View state: search, tag filtering, and favorites
  const [artistSearchQuery, setArtistSearchQuery] = useState('');
  const [artistSelectedTag, setArtistSelectedTag] = useState<string | null>(null);
  const [artistOnlyFavorites, setArtistOnlyFavorites] = useState(false);

  useEffect(() => {
    setArtistSearchQuery('');
    setArtistSelectedTag(null);
    setArtistOnlyFavorites(false);
  }, [route.type === 'artist' ? route.slug : null]);

  const artistTags = useMemo(
    () => extractCatalogTags(artistSongs),
    [artistSongs]
  );

  const filteredArtistSongs = useMemo(() => {
    let list = artistSongs;

    if (artistOnlyFavorites) {
      list = list.filter((s) => favorites.includes(s.slug));
    }

    if (artistSelectedTag) {
      list = list.filter((s) => s.tags?.includes(artistSelectedTag));
    }

    if (!artistSearchQuery.trim()) {
      return list.map((song) => ({ song, lyricSnippet: null as string | null }));
    }

    const normalizedQuery = normalizeSearchText(artistSearchQuery);
    const results: { song: ParsedSong; lyricSnippet: string | null }[] = [];
    for (const song of list) {
      const match = matchSong(song, normalizedQuery);
      if (match.matches) {
        results.push({ song, lyricSnippet: match.lyricSnippet });
      }
    }
    return results;
  }, [artistSongs, artistOnlyFavorites, artistSelectedTag, artistSearchQuery, favorites]);

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
            {!isOnline && (
              <span
                role="status"
                aria-label="Tryb offline"
                title="Brak połączenia z siecią - działasz w trybie offline"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/30 select-none animate-pulse"
              >
                <WifiOffIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Offline</span>
              </span>
            )}
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

              {/* Artist Search Bar */}
              <div className="relative flex items-center w-full">
                <div className="absolute left-3.5 pointer-events-none text-neutral-400 flex items-center justify-center">
                  <SearchIcon className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={artistSearchQuery}
                  onChange={(e) => setArtistSearchQuery(e.target.value)}
                  placeholder="Szukaj w utworach wykonawcy..."
                  aria-label="Szukaj w utworach wykonawcy"
                  className={`w-full pl-11 pr-11 py-3 text-sm rounded-xl border transition-colors outline-none min-h-[44px] ${
                    isDark
                      ? 'bg-neutral-900 border-neutral-800 text-neutral-100 placeholder-neutral-500 focus:border-amber-500'
                      : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400 focus:border-amber-500 shadow-sm'
                  }`}
                />
                {artistSearchQuery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setArtistSearchQuery('')}
                    aria-label="Wyczyść wyszukiwanie"
                    title="Wyczyść wyszukiwanie"
                    className={`absolute right-1 w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                      isDark
                        ? 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800'
                        : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
                    }`}
                  >
                    <XIcon className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Artist Tag & Favorites Filter Chips */}
              <div
                role="group"
                aria-label="Filtr tagów wykonawcy"
                className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 w-full"
              >
                <button
                  type="button"
                  onClick={() => {
                    setArtistSelectedTag(null);
                    setArtistOnlyFavorites(false);
                  }}
                  aria-pressed={artistSelectedTag === null && !artistOnlyFavorites}
                  className={`min-h-[44px] px-4 py-2 inline-flex items-center justify-center text-xs font-semibold rounded-full shrink-0 transition-colors cursor-pointer ${
                    artistSelectedTag === null && !artistOnlyFavorites
                      ? 'bg-amber-500 text-neutral-950 font-bold shadow-sm'
                      : isDark
                        ? 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-neutral-100'
                        : 'bg-neutral-100 border border-neutral-300 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900'
                  }`}
                >
                  Wszystkie
                </button>

                <button
                  type="button"
                  onClick={() => setArtistOnlyFavorites((prev) => !prev)}
                  aria-pressed={artistOnlyFavorites}
                  className={`min-h-[44px] px-4 py-2 inline-flex items-center justify-center gap-1.5 text-xs font-semibold rounded-full shrink-0 transition-colors cursor-pointer ${
                    artistOnlyFavorites
                      ? 'bg-amber-500 text-neutral-950 font-bold shadow-sm'
                      : isDark
                        ? 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-neutral-100'
                        : 'bg-neutral-100 border border-neutral-300 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900'
                  }`}
                >
                  <StarIcon className="w-3.5 h-3.5" filled={artistOnlyFavorites} />
                  <span>Ulubione</span>
                </button>

                {artistTags.map((tag) => {
                  const isSelected = artistSelectedTag === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setArtistSelectedTag(isSelected ? null : tag)}
                      aria-pressed={isSelected}
                      className={`min-h-[44px] px-4 py-2 inline-flex items-center justify-center text-xs font-semibold rounded-full shrink-0 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500 text-neutral-950 font-bold shadow-sm'
                          : isDark
                            ? 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-neutral-100'
                            : 'bg-neutral-100 border border-neutral-300 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>

              {filteredArtistSongs.length > 0 ? (
                <div className="grid gap-2.5">
                  {filteredArtistSongs.map(({ song: s, lyricSnippet }) => (
                    <a
                      key={s.slug}
                      href={`#/song/${s.slug}`}
                      className={`block p-3.5 rounded-xl border transition cursor-pointer group ${
                        isDark
                          ? 'bg-neutral-900 border-neutral-800 hover:border-amber-500/50 hover:bg-neutral-800/80 text-neutral-100'
                          : 'bg-white border-neutral-200 hover:border-amber-500/50 hover:bg-neutral-50 text-neutral-900 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3
                            className={`font-semibold truncate transition ${
                              isDark ? 'group-hover:text-amber-400' : 'group-hover:text-amber-600'
                            }`}
                          >
                            {s.title}
                          </h3>
                          <p className={`text-xs truncate ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                            {s.artist}
                          </p>
                          {lyricSnippet && (
                            <p
                              className={`text-xs mt-1 italic truncate font-mono ${
                                isDark ? 'text-amber-400/90' : 'text-amber-700'
                              }`}
                            >
                              {lyricSnippet}
                            </p>
                          )}
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
              ) : (
                <div
                  className={`p-8 rounded-xl border text-center space-y-3 ${
                    isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
                  }`}
                >
                  <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <SearchIcon className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className={`text-base font-bold ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>
                      Brak wyników
                    </h3>
                    <p className={`text-sm ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                      Brak piosenek spełniających kryteria wyszukiwania.
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setArtistSearchQuery('');
                        setArtistSelectedTag(null);
                        setArtistOnlyFavorites(false);
                      }}
                      className="inline-flex items-center px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-sm transition cursor-pointer min-h-[44px]"
                    >
                      Wyczyść filtry
                    </button>
                  </div>
                </div>
              )}
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

        {/* 5. Non-intrusive PWA Update & Offline Toast */}
        {toast && (
          <Toast
            message={toast.message}
            actionLabel={toast.actionLabel}
            onAction={toast.onAction}
            onClose={() => setToast(null)}
            autoCloseMs={toast.autoCloseMs}
            theme={theme}
          />
        )}
      </div>
    </main>
  );
}
