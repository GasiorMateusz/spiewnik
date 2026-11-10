import React, { useState, useMemo } from 'react';
import type { ParsedSong, SongListProps, SongListTab, ArtistCatalogItem } from '../types';
import {
  normalizeSearchText,
  matchSong,
  extractCatalogTags,
  extractArtistCatalog,
} from '../lib/search';
import { SearchIcon, XIcon, StarIcon, MusicIcon, ChevronRightIcon } from './Icons';

interface FilteredSongItem {
  song: ParsedSong;
  lyricSnippet: string | null;
}

function formatSongCount(count: number): string {
  if (count === 1) return '1 utwór';
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} utwory`;
  }
  return `${count} utworów`;
}

export function SongList({
  songs,
  theme = 'dark',
  favorites,
  onToggleFavorite,
  onSelectSong,
  onSelectArtist,
  className = '',
}: SongListProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<SongListTab>('songs');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const isDark = theme !== 'light';
  const normalizedQuery = useMemo(() => normalizeSearchText(searchQuery), [searchQuery]);
  const catalogTags = useMemo(() => extractCatalogTags(songs), [songs]);
  const allArtists = useMemo(() => extractArtistCatalog(songs), [songs]);
  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);

  const totalFavoritesCount = useMemo(
    () => songs.filter((s) => favoritesSet.has(s.slug)).length,
    [songs, favoritesSet]
  );

  // Pre-filter catalog by selected tag and search query
  const queryAndTagFilteredSongs: FilteredSongItem[] = useMemo(() => {
    let list = songs;
    if (selectedTag) {
      list = list.filter((s) => s.tags?.includes(selectedTag));
    }

    if (!normalizedQuery) {
      return list.map((song) => ({ song, lyricSnippet: null }));
    }

    const results: FilteredSongItem[] = [];
    for (const song of list) {
      const match = matchSong(song, normalizedQuery);
      if (match.matches) {
        results.push({
          song,
          lyricSnippet: match.lyricSnippet,
        });
      }
    }
    return results;
  }, [songs, selectedTag, normalizedQuery]);

  // Tab: Piosenki
  const songsTabItems = queryAndTagFilteredSongs;

  // Tab: Ulubione
  const favoritesTabItems = useMemo(() => {
    return queryAndTagFilteredSongs.filter((item) => favoritesSet.has(item.song.slug));
  }, [queryAndTagFilteredSongs, favoritesSet]);

  // Tab: Wykonawcy
  const artistsTabItems = useMemo(() => {
    if (!normalizedQuery && !selectedTag) {
      return allArtists;
    }
    return extractArtistCatalog(queryAndTagFilteredSongs.map((i) => i.song));
  }, [allArtists, queryAndTagFilteredSongs, normalizedQuery, selectedTag]);

  return (
    <div className={`w-full space-y-4 ${className}`}>
      {/* 1. Tab Bar (REQ-CAT-1) */}
      <div
        role="tablist"
        aria-label="Kategorie katalogu"
        className={`flex items-center border-b ${
          isDark ? 'border-neutral-800' : 'border-neutral-200'
        } mb-4`}
      >
        <button
          type="button"
          role="tab"
          id="tab-songs"
          aria-selected={activeTab === 'songs'}
          aria-controls="panel-songs"
          onClick={() => setActiveTab('songs')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 text-sm font-semibold transition-colors cursor-pointer border-b-2 -mb-px min-h-[44px] ${
            activeTab === 'songs'
              ? 'border-amber-500 text-amber-500 font-bold'
              : isDark
                ? 'border-transparent text-neutral-400 hover:text-neutral-200'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
          }`}
        >
          <span>Piosenki</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-mono font-medium ${
              activeTab === 'songs'
                ? isDark
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-amber-100 text-amber-800'
                : isDark
                  ? 'bg-neutral-800 text-neutral-400'
                  : 'bg-neutral-200 text-neutral-600'
            }`}
          >
            {songs.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-artists"
          aria-selected={activeTab === 'artists'}
          aria-controls="panel-artists"
          onClick={() => setActiveTab('artists')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 text-sm font-semibold transition-colors cursor-pointer border-b-2 -mb-px min-h-[44px] ${
            activeTab === 'artists'
              ? 'border-amber-500 text-amber-500 font-bold'
              : isDark
                ? 'border-transparent text-neutral-400 hover:text-neutral-200'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
          }`}
        >
          <span>Wykonawcy</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-mono font-medium ${
              activeTab === 'artists'
                ? isDark
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-amber-100 text-amber-800'
                : isDark
                  ? 'bg-neutral-800 text-neutral-400'
                  : 'bg-neutral-200 text-neutral-600'
            }`}
          >
            {allArtists.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-favorites"
          aria-selected={activeTab === 'favorites'}
          aria-controls="panel-favorites"
          onClick={() => setActiveTab('favorites')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 text-sm font-semibold transition-colors cursor-pointer border-b-2 -mb-px min-h-[44px] ${
            activeTab === 'favorites'
              ? 'border-amber-500 text-amber-500 font-bold'
              : isDark
                ? 'border-transparent text-neutral-400 hover:text-neutral-200'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
          }`}
        >
          <span>Ulubione</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-mono font-medium ${
              activeTab === 'favorites'
                ? isDark
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-amber-100 text-amber-800'
                : isDark
                  ? 'bg-neutral-800 text-neutral-400'
                  : 'bg-neutral-200 text-neutral-600'
            }`}
          >
            {totalFavoritesCount}
          </span>
        </button>
      </div>

      {/* 2. Instant Search Bar (REQ-CAT-2) */}
      <div className="relative flex items-center w-full">
        <div className="absolute left-3.5 pointer-events-none text-neutral-400 flex items-center justify-center">
          <SearchIcon className="w-5 h-5" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Szukaj piosenki, wykonawcy, tekstu..."
          aria-label="Szukaj piosenki, wykonawcy, tekstu"
          className={`w-full pl-11 pr-11 py-3 text-sm rounded-xl border transition-colors outline-none min-h-[44px] ${
            isDark
              ? 'bg-neutral-900 border-neutral-800 text-neutral-100 placeholder-neutral-500 focus:border-amber-500'
              : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400 focus:border-amber-500 shadow-sm'
          }`}
        />
        {searchQuery.length > 0 && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
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

      {/* 3. Horizontal Tag Filter Chips (REQ-CAT-4) */}
      {catalogTags.length > 0 && (
        <div
          role="group"
          aria-label="Filtr tagów"
          className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 w-full"
        >
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            aria-pressed={selectedTag === null}
            className={`min-h-[44px] px-4 py-2 inline-flex items-center justify-center text-xs font-semibold rounded-full shrink-0 transition-colors cursor-pointer ${
              selectedTag === null
                ? 'bg-amber-500 text-neutral-950 font-bold shadow-sm'
                : isDark
                  ? 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-neutral-100'
                  : 'bg-neutral-100 border border-neutral-300 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900'
            }`}
          >
            Wszystkie
          </button>
          {catalogTags.map((tag) => {
            const isSelected = selectedTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(isSelected ? null : tag)}
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
      )}

      {/* 4. Tab Panels */}
      {/* 4A. Piosenki Panel */}
      {activeTab === 'songs' && (
        <div id="panel-songs" role="tabpanel" aria-labelledby="tab-songs">
          {songsTabItems.length > 0 ? (
            <div className="grid gap-2.5">
              {songsTabItems.map((item) => renderSongCard(item, isDark, favoritesSet, onToggleFavorite, onSelectSong))}
            </div>
          ) : (
            renderEmptyState({
              query: searchQuery,
              tag: selectedTag,
              isDark,
              onClearSearch: () => setSearchQuery(''),
              onClearTag: () => setSelectedTag(null),
            })
          )}
        </div>
      )}

      {/* 4B. Wykonawcy Panel */}
      {activeTab === 'artists' && (
        <div id="panel-artists" role="tabpanel" aria-labelledby="tab-artists">
          {artistsTabItems.length > 0 ? (
            <div className="grid gap-2.5">
              {artistsTabItems.map((artist) => renderArtistCard(artist, isDark, onSelectArtist))}
            </div>
          ) : (
            renderEmptyState({
              query: searchQuery,
              tag: selectedTag,
              isDark,
              onClearSearch: () => setSearchQuery(''),
              onClearTag: () => setSelectedTag(null),
            })
          )}
        </div>
      )}

      {/* 4C. Ulubione Panel */}
      {activeTab === 'favorites' && (
        <div id="panel-favorites" role="tabpanel" aria-labelledby="tab-favorites">
          {totalFavoritesCount === 0 ? (
            /* Pristine favorites empty state */
            <div
              className={`p-8 rounded-xl border text-center space-y-3 ${
                isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
              }`}
            >
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                <StarIcon className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className={`text-base font-bold ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>
                  Brak ulubionych utworów
                </h3>
                <p className={`text-sm max-w-sm mx-auto ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                  Brak ulubionych utworów. Dodaj piosenki do ulubionych, klikając gwiazdkę.
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('songs')}
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-sm transition cursor-pointer min-h-[44px]"
                >
                  Przeglądaj piosenki
                </button>
              </div>
            </div>
          ) : favoritesTabItems.length > 0 ? (
            <div className="grid gap-2.5">
              {favoritesTabItems.map((item) => renderSongCard(item, isDark, favoritesSet, onToggleFavorite, onSelectSong))}
            </div>
          ) : (
            renderEmptyState({
              query: searchQuery,
              tag: selectedTag,
              isDark,
              onClearSearch: () => setSearchQuery(''),
              onClearTag: () => setSelectedTag(null),
              isFavoritesTab: true,
            })
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Renders an individual song card with title, artist, key, lyric snippet, and star toggle.
 */
function renderSongCard(
  item: FilteredSongItem,
  isDark: boolean,
  favoritesSet: Set<string>,
  onToggleFavorite: (slug: string) => void,
  onSelectSong?: (slug: string) => void
) {
  const { song, lyricSnippet } = item;
  const isFav = favoritesSet.has(song.slug);

  return (
    <a
      key={song.slug}
      href={`#/song/${song.slug}`}
      onClick={(e) => {
        if (onSelectSong) {
          e.preventDefault();
          onSelectSong(song.slug);
        }
      }}
      className={`block p-3.5 rounded-xl border transition cursor-pointer group ${
        isDark
          ? 'bg-neutral-900 border-neutral-800 hover:border-amber-500/50 hover:bg-neutral-800/80 text-neutral-100'
          : 'bg-white border-neutral-200 hover:border-amber-500/50 hover:bg-neutral-50 text-neutral-900 shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className={`font-semibold truncate transition flex items-center gap-1.5 ${
              isDark ? 'group-hover:text-amber-400' : 'group-hover:text-amber-600'
            }`}
          >
            <span className="truncate">{song.title}</span>
            {song.isCustom && (
              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/30 shrink-0 select-none">
                Własny
              </span>
            )}
          </h3>
          <p className={`text-xs truncate ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
            {song.artist}
          </p>

          {/* Contextual lyric snippet preview (REQ-CAT-3) */}
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
          {song.key && (
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                isDark
                  ? 'bg-neutral-800 text-amber-400 border border-neutral-700'
                  : 'bg-neutral-100 text-amber-600 border border-neutral-300'
              }`}
            >
              {song.key}
            </span>
          )}

          {/* Star favorites button with click isolation (REQ-CAT-1) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onToggleFavorite(song.slug);
            }}
            aria-label={
              isFav ? `Usuń ${song.title} z ulubionych` : `Dodaj ${song.title} do ulubionych`
            }
            title={isFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
            className={`w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
              isFav
                ? 'text-amber-400 hover:text-amber-300'
                : isDark
                  ? 'text-neutral-500 hover:text-amber-400 hover:bg-neutral-800'
                  : 'text-neutral-400 hover:text-amber-600 hover:bg-neutral-100'
            }`}
          >
            <StarIcon className="w-5 h-5" filled={isFav} />
          </button>
        </div>
      </div>
    </a>
  );
}

/**
 * Renders an artist catalog row with song count badge.
 */
function renderArtistCard(
  artist: ArtistCatalogItem,
  isDark: boolean,
  onSelectArtist?: (artistSlug: string) => void
) {
  return (
    <a
      key={artist.slug}
      href={`#/artist/${artist.slug}`}
      onClick={(e) => {
        if (onSelectArtist) {
          e.preventDefault();
          onSelectArtist(artist.slug);
        }
      }}
      className={`block p-3.5 rounded-xl border transition cursor-pointer group ${
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
            {artist.name}
          </h3>
          <p className={`text-xs ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
            {formatSongCount(artist.songCount)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-mono font-medium ${
              isDark
                ? 'bg-neutral-800 text-amber-400 border border-neutral-700'
                : 'bg-neutral-100 text-amber-600 border border-neutral-300'
            }`}
          >
            {artist.songCount}
          </span>
          <ChevronRightIcon
            className={`w-4 h-4 transition ${
              isDark
                ? 'text-neutral-500 group-hover:text-neutral-300'
                : 'text-neutral-400 group-hover:text-neutral-700'
            }`}
          />
        </div>
      </div>
    </a>
  );
}

interface EmptyStateProps {
  query?: string;
  tag?: string | null;
  isDark: boolean;
  onClearSearch: () => void;
  onClearTag: () => void;
  isFavoritesTab?: boolean;
}

/**
 * Renders contextual search and filter empty states.
 */
function renderEmptyState({
  query,
  tag,
  isDark,
  onClearSearch,
  onClearTag,
  isFavoritesTab,
}: EmptyStateProps) {
  let icon = <MusicIcon className="w-6 h-6" />;
  let title = 'Brak piosenek';
  let desc = 'Katalog jest obecnie pusty.';
  let action: React.ReactNode = null;

  if (query) {
    icon = <SearchIcon className="w-6 h-6" />;
    title = 'Brak wyników';
    desc = `${isFavoritesTab ? 'Brak wyników w ulubionych dla zapytania: ' : 'Brak wyników dla zapytania: '}"${query}"`;
    action = (
      <button
        type="button"
        onClick={onClearSearch}
        className="inline-flex items-center px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-sm transition cursor-pointer min-h-[44px]"
      >
        Wyczyść wyszukiwanie
      </button>
    );
  } else if (tag) {
    title = 'Brak piosenek z tagiem';
    desc = `Brak piosenek z wybranym tagiem: "${tag}"`;
    action = (
      <button
        type="button"
        onClick={onClearTag}
        className="inline-flex items-center px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-sm transition cursor-pointer min-h-[44px]"
      >
        Pokaż wszystkie piosenki
      </button>
    );
  }

  return (
    <div
      className={`p-8 rounded-xl border text-center space-y-3 ${
        isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
      }`}
    >
      <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
        {icon}
      </div>
      <div className="space-y-1">
        <h3 className={`text-base font-bold ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>{title}</h3>
        <p className={`text-sm ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>{desc}</p>
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
