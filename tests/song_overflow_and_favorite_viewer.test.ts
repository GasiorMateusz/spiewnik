import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { TestRunner, assert } from './helpers/test_framework';
import { HookHarness } from './helpers/hook_harness';
import { SongList } from '../src/components/SongList';
import { SongViewer } from '../src/components/SongViewer';
import type { ParsedSong } from '../src/types';

const MOCK_LONG_TITLE_SONG: ParsedSong = {
  slug: 'bardzo-dluga-piosenka-turystyczna',
  title: 'Bardzo długa piosenka turystyczna o wędrowaniu przez bieszczadzkie połoniny i paleniu ogniska pod rozgwieżdżonym niebem nad Wetliną',
  artist: 'Wędrowny Bard',
  key: 'Am',
  tags: ['turystyczne', 'ognisko'],
  rawLyrics: 'Am F C G\nIdziemy przez połoniny, wiatr we włosach gra',
  lines: [
    {
      type: 'chords-and-lyrics',
      segments: [
        { chord: 'Am', lyrics: 'Idziemy przez połoniny, ' },
        { chord: 'F', lyrics: 'wiatr we ' },
        { chord: 'C', lyrics: 'włosach ' },
        { chord: 'G', lyrics: 'gra' },
      ],
    },
  ],
  uniqueChords: ['Am', 'F', 'C', 'G'],
};

const MOCK_CUSTOM_SONG: ParsedSong = {
  ...MOCK_LONG_TITLE_SONG,
  slug: 'wlasna-dluga-piosenka',
  title: 'Własna kompozycja napisana przy nocnym ognisku w dolinie Sanu',
  isCustom: true,
};

export async function runSongOverflowAndFavoriteViewerTests(runner: TestRunner) {
  runner.setTier('Song Title Overflow & Song View Favorite Star');

  // =========================================================================
  // Test 1: SongList renders long titles with multiline wrapping (break-words)
  // =========================================================================
  await runner.test('SOF-01: SongList cards apply overflow-hidden, min-w-0, and break-words to prevent screen overflow', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongList, {
        songs: [MOCK_LONG_TITLE_SONG],
        favorites: [],
        onToggleFavorite: () => {},
      })
    );

    assert(html.includes('overflow-hidden'), 'Song card <a> must include overflow-hidden to prevent container blowout');
    assert(html.includes('min-w-0'), 'Song card <a> and inner flex containers must include min-w-0');
    assert(html.includes('break-words'), 'Song title heading must include break-words for multiline wrapping');
    assert(
      html.includes('Bardzo długa piosenka turystyczna o wędrowaniu przez bieszczadzkie połoniny'),
      'Full title text must be rendered in HTML'
    );
  });

  // =========================================================================
  // Test 2: SongList custom song badge renders inline without flex blow-out
  // =========================================================================
  await runner.test('SOF-02: SongList custom song badge renders inline-block after wrapped title', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongList, {
        songs: [MOCK_CUSTOM_SONG],
        favorites: [],
        onToggleFavorite: () => {},
      })
    );

    assert(html.includes('Własny'), 'Custom song badge must be rendered');
    assert(html.includes('inline-block'), 'Custom song badge must be styled as inline-block to flow naturally with wrapped text');
    assert(html.includes('select-none'), 'Custom song badge must have select-none');
  });

  // =========================================================================
  // Test 3: SongList right action container retains shrink-0 and key badge
  // =========================================================================
  await runner.test('SOF-03: Key badge and star button have shrink-0 ensuring they remain visible when title wraps', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongList, {
        songs: [MOCK_LONG_TITLE_SONG],
        favorites: [MOCK_LONG_TITLE_SONG.slug],
        onToggleFavorite: () => {},
      })
    );

    assert(html.includes('shrink-0'), 'Action container must have shrink-0 to prevent being crushed');
    assert(html.includes('>Am</span>'), 'Song key Am badge must be rendered');
    assert(html.includes('min-w-[44px]'), 'Star button must preserve 44px touch target');
  });

  // =========================================================================
  // Test 4: SongViewer header supports multiline title wrapping
  // =========================================================================
  await runner.test('SOF-04: SongViewer header uses break-words for song title and preserves back button', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_LONG_TITLE_SONG,
      })
    );

    assert(html.includes('break-words'), 'SongViewer title heading must include break-words');
    assert(html.includes('aria-label="Wróć do katalogu"'), 'Back button must remain accessible in SongViewer header');
  });

  // =========================================================================
  // Test 5: SongViewer renders un-favorited star button (outline)
  // =========================================================================
  await runner.test('SOF-05: SongViewer renders favorite star button with fill=none when isFavorite is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_LONG_TITLE_SONG,
        isFavorite: false,
        onToggleFavorite: () => {},
      })
    );

    assert(
      html.includes(`aria-label="Dodaj ${MOCK_LONG_TITLE_SONG.title} do ulubionych"`),
      'Must have Polish aria-label for adding to favorites'
    );
    assert(html.includes('title="Dodaj do ulubionych"'), 'Must have Polish title for adding to favorites');
    assert(html.includes('fill="none"'), 'Star icon must have fill="none" when not favorited');
    assert(html.includes('min-w-[44px]'), 'Favorite button in viewer must have min 44px touch target');
  });

  // =========================================================================
  // Test 6: SongViewer renders favorited star button (filled amber)
  // =========================================================================
  await runner.test('SOF-06: SongViewer renders favorite star button with fill=currentColor and amber styling when isFavorite is true', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_LONG_TITLE_SONG,
        isFavorite: true,
        onToggleFavorite: () => {},
      })
    );

    assert(
      html.includes(`aria-label="Usuń ${MOCK_LONG_TITLE_SONG.title} z ulubionych"`),
      'Must have Polish aria-label for removing from favorites'
    );
    assert(html.includes('title="Usuń z ulubionych"'), 'Must have Polish title for removing from favorites');
    assert(html.includes('fill="currentColor"'), 'Star icon must have fill="currentColor" when favorited');
    assert(html.includes('text-amber-400'), 'Favorited button must have text-amber-400 color');
  });

  // =========================================================================
  // Test 7: SongViewer star button triggers onToggleFavorite with song.slug
  // =========================================================================
  await runner.test('SOF-07: SongViewer star button click triggers onToggleFavorite callback with slug', () => {
    let toggledSlug: string | null = null;
    const harness = new HookHarness(
      (p) => SongViewer(p),
      {
        song: MOCK_LONG_TITLE_SONG,
        isFavorite: false,
        onToggleFavorite: (slug: string) => {
          toggledSlug = slug;
        },
      }
    );
    harness.render();

    function findButton(curr: any): any {
      if (!curr) return null;
      if (Array.isArray(curr)) {
        for (const item of curr) {
          const found = findButton(item);
          if (found) return found;
        }
        return null;
      }
      if (curr.props?.title === 'Dodaj do ulubionych') return curr;
      if (curr.props && curr.props.children) {
        return findButton(curr.props.children);
      }
      return null;
    }

    const button = findButton(harness.result);
    assert(button !== null, 'Favorite button must exist in SongViewer element tree');
    assert(typeof button.props?.onClick === 'function', 'Favorite button must have onClick handler');
    button.props.onClick();
    assert(toggledSlug === MOCK_LONG_TITLE_SONG.slug, 'Clicking favorite button must pass song.slug to onToggleFavorite');
  });

  // =========================================================================
  // Test 8: App.tsx integration passes favorite props and handles multiline artist view
  // =========================================================================
  await runner.test('SOF-08: App.tsx connects isFavorite and onToggleFavorite to SongViewer and wraps artist songs', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');

    assert(appSrc.includes('isFavorite={favorites.includes(song.slug)}'), 'App.tsx must pass isFavorite prop to SongViewer');
    assert(appSrc.includes('onToggleFavorite={handleToggleFavorite}'), 'App.tsx must pass onToggleFavorite prop to SongViewer');
    assert(appSrc.includes('overflow-hidden min-w-0'), 'App.tsx artist song list must include overflow-hidden min-w-0');
    assert(appSrc.includes('break-words'), 'App.tsx artist song list must include break-words for multiline titles');
  });

  // =========================================================================
  // Test 9: SongViewer lyrics lines wrap and prevent song content overflow
  // =========================================================================
  await runner.test('SOF-09: SongViewer song lines apply maxWidth 100%, pre-wrap, and break-words to prevent lyrics overflow', () => {
    const longLyricSong: ParsedSong = {
      slug: 'dlugie-teksty-piosenki',
      title: 'Piosenka z długim tekstem',
      artist: 'Artysta',
      key: 'C',
      tags: [],
      rawLyrics: 'C\nTo jest niesamowicie długi wers piosenki który bez zawijania wylewałby się daleko poza ekran telefonu i nikt nie mógłby go przeczytać',
      lines: [
        {
          type: 'chords-and-lyrics',
          segments: [
            {
              chord: 'C',
              lyrics: 'To jest niesamowicie długi wers piosenki który bez zawijania wylewałby się daleko poza ekran telefonu i nikt nie mógłby go przeczytać',
            },
          ],
        },
      ],
      uniqueChords: ['C'],
    };

    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: longLyricSong,
      })
    );

    assert(html.includes('max-width:100%'), 'Segment container must constrain width with max-width: 100%');
    assert(html.includes('white-space:pre-wrap'), 'Lyric span must use white-space: pre-wrap to allow multiline lyrics wrapping');
    assert(html.includes('overflow-wrap:break-word'), 'Lyric span must use overflow-wrap: break-word to prevent long word blowout');
  });
}
