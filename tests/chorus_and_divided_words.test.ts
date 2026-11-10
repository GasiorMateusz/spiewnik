import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TestRunner, assert } from './helpers/test_framework';
import { SongViewer } from '../src/components/SongViewer';
import type { ParsedSong } from '../src/types';

export async function runChorusAndDividedWordsTests(runner: TestRunner) {
  runner.setTier('Chorus (Refren) Styling & Divided Words Alignment');

  // =========================================================================
  // Test 1: Chorus section receives distinct background color in dark theme
  // =========================================================================
  await runner.test('CRD-01: Chorus [Refren] renders inside container with distinct background color in dark theme', () => {
    const song: ParsedSong = {
      slug: 'test-chorus-dark',
      title: 'Piosenka z refrenem',
      artist: 'Wykonawca',
      key: 'G',
      tags: [],
      rawLyrics: '',
      lines: [
        { type: 'section-header', header: 'Zwrotka 1' },
        {
          type: 'chords-and-lyrics',
          segments: [{ chord: 'G', lyrics: 'To jest zwrotka' }],
        },
        { type: 'empty' },
        { type: 'section-header', header: 'Refren' },
        {
          type: 'chords-and-lyrics',
          segments: [{ chord: 'C', lyrics: 'To jest refren' }],
        },
      ],
      uniqueChords: ['G', 'C'],
    };

    const htmlDark = renderToStaticMarkup(
      React.createElement(SongViewer, { song, theme: 'dark' })
    );

    // Chorus box must have distinctive background color and accent border
    assert(htmlDark.includes('bg-amber-500/10'), 'Dark chorus must apply distinct amber tinted background');
    assert(htmlDark.includes('border-l-4 border-amber-500'), 'Chorus must apply distinct left accent border');
    assert(htmlDark.includes('[Refren]'), 'Must render Refren header');
    assert(htmlDark.includes('[Zwrotka 1]'), 'Must render Zwrotka 1 header');
  });

  // =========================================================================
  // Test 2: Chorus section receives distinct background color in light theme
  // =========================================================================
  await runner.test('CRD-02: Chorus [Refren] renders inside container with distinct background color in light theme', () => {
    const song: ParsedSong = {
      slug: 'test-chorus-light',
      title: 'Piosenka z refrenem jasna',
      artist: 'Wykonawca',
      key: 'G',
      tags: [],
      rawLyrics: '',
      lines: [
        { type: 'section-header', header: 'Refren' },
        {
          type: 'chords-and-lyrics',
          segments: [{ chord: 'C', lyrics: 'To jest refren' }],
        },
      ],
      uniqueChords: ['C'],
    };

    const htmlLight = renderToStaticMarkup(
      React.createElement(SongViewer, { song, theme: 'light' })
    );

    assert(htmlLight.includes('bg-amber-500/10'), 'Light chorus must apply distinct background color');
    assert(htmlLight.includes('border-l-4 border-amber-500'), 'Light chorus must apply accent border');
  });

  // =========================================================================
  // Test 3: Various chorus header names are recognized (Refren, Chorus, Ref., Refren 2)
  // =========================================================================
  await runner.test('CRD-03: Recognizes Refren, Chorus, Ref., and numbered variations as chorus sections', () => {
    const song: ParsedSong = {
      slug: 'test-chorus-variants',
      title: 'Warianty refrenu',
      artist: 'Wykonawca',
      key: 'C',
      tags: [],
      rawLyrics: '',
      lines: [
        { type: 'section-header', header: 'Chorus 1' },
        { type: 'chords-and-lyrics', segments: [{ chord: 'C', lyrics: 'Part 1' }] },
        { type: 'section-header', header: 'Refren (x2)' },
        { type: 'chords-and-lyrics', segments: [{ chord: 'G', lyrics: 'Part 2' }] },
        { type: 'section-header', header: 'Ref. 3' },
        { type: 'chords-and-lyrics', segments: [{ chord: 'Am', lyrics: 'Part 3' }] },
      ],
      uniqueChords: ['C', 'G', 'Am'],
    };

    const html = renderToStaticMarkup(React.createElement(SongViewer, { song, theme: 'dark' }));
    const chorusBlocks = html.match(/bg-amber-500\/10/g);
    assert(chorusBlocks && chorusBlocks.length >= 3, 'All 3 chorus variants must receive chorus styling');
  });

  // =========================================================================
  // Test 4: Non-chorus sections do not receive chorus card wrapper
  // =========================================================================
  await runner.test('CRD-04: Non-chorus sections (Zwrotka, Intro, Solo, Outro) are not styled as chorus', () => {
    const song: ParsedSong = {
      slug: 'test-non-chorus',
      title: 'Tylko zwrotki',
      artist: 'Wykonawca',
      key: 'D',
      tags: [],
      rawLyrics: '',
      lines: [
        { type: 'section-header', header: 'Intro' },
        { type: 'chords-and-lyrics', segments: [{ chord: 'D', lyrics: 'Riff' }] },
        { type: 'section-header', header: 'Zwrotka 1' },
        { type: 'chords-and-lyrics', segments: [{ chord: 'A', lyrics: 'Wers 1' }] },
        { type: 'section-header', header: 'Solo' },
        { type: 'chords-and-lyrics', segments: [{ chord: 'G', lyrics: 'Gitara' }] },
      ],
      uniqueChords: ['D', 'A', 'G'],
    };

    const html = renderToStaticMarkup(React.createElement(SongViewer, { song, theme: 'dark' }));
    assert(!html.includes('border-l-4 border-amber-500'), 'Non-chorus song must not contain chorus accent border');
  });

  // =========================================================================
  // Test 5: Divided words use mr-0 between parts instead of mr-1
  // =========================================================================
  await runner.test('CRD-05: Divided words across segments use mr-0 to prevent excessive gap inside word', () => {
    const song: ParsedSong = {
      slug: 'test-divided-words',
      title: 'Dzielone słowa',
      artist: 'Wykonawca',
      key: 'C',
      tags: [],
      rawLyrics: '',
      lines: [
        {
          type: 'chords-and-lyrics',
          segments: [
            // "Tak za" + "częła" = "Tak zaczęła" (word divided at 'za')
            { chord: '', lyrics: 'Tak za' },
            { chord: 'C', lyrics: 'częła się wak' },
            // "wak" + "acyjna" = "wakacyjna" (word divided at 'wak')
            { chord: 'Dm', lyrics: 'acyjna' },
          ],
        },
      ],
      uniqueChords: ['C', 'Dm'],
    };

    const html = renderToStaticMarkup(React.createElement(SongViewer, { song }));

    // Segments that divide a word must have mr-0 so no artificial space is inserted
    assert(html.includes('inline-flex flex-col align-top mr-0'), 'Divided word parts must use mr-0');
  });

  // =========================================================================
  // Test 6: Segments ending with space continue to use mr-1
  // =========================================================================
  await runner.test('CRD-06: Segments ending with a space preserve standard mr-1 spacing', () => {
    const song: ParsedSong = {
      slug: 'test-normal-words',
      title: 'Normalne słowa',
      artist: 'Wykonawca',
      key: 'C',
      tags: [],
      rawLyrics: '',
      lines: [
        {
          type: 'chords-and-lyrics',
          segments: [
            { chord: 'C', lyrics: 'To ' },
            { chord: 'G', lyrics: 'jest ' },
            { chord: 'Am', lyrics: 'test' },
          ],
        },
      ],
      uniqueChords: ['C', 'G', 'Am'],
    };

    const html = renderToStaticMarkup(React.createElement(SongViewer, { song }));
    assert(html.includes('inline-flex flex-col align-top mr-1'), 'Normal segments must preserve mr-1');
  });

  // =========================================================================
  // Test 7: Chord overhang when chord is placed on syllable without next chord
  // =========================================================================
  await runner.test('CRD-07: Chord on divided syllable overhangs smoothly when next segment has no chord', () => {
    const song: ParsedSong = {
      slug: 'test-chord-overhang',
      title: 'Overhang akordu',
      artist: 'Wykonawca',
      key: 'C',
      tags: [],
      rawLyrics: '',
      lines: [
        {
          type: 'chords-and-lyrics',
          segments: [
            // "Cmaj7" chord placed over short syllable "za", continuing into "częła"
            { chord: 'Cmaj7', lyrics: 'za' },
            { chord: '', lyrics: 'częła' },
          ],
        },
      ],
      uniqueChords: ['Cmaj7'],
    };

    const html = renderToStaticMarkup(React.createElement(SongViewer, { song }));
    assert(html.includes('overflow:visible') || html.includes('overflow: visible'), 'Chord button must allow overflow for overhang');
    assert(html.includes('width:0px') || html.includes('width: 0px'), 'Chord button must use width 0 to prevent expanding syllable column');
  });

  // =========================================================================
  // Test 8: Hyphenated divided words with spaces are collapsed
  // =========================================================================
  await runner.test('CRD-08: Hyphenated words with extra spacing collapse to clean hyphen', () => {
    const song: ParsedSong = {
      slug: 'test-hyphen-collapse',
      title: 'Łączniki w słowach',
      artist: 'Wykonawca',
      key: 'C',
      tags: [],
      rawLyrics: '',
      lines: [
        {
          type: 'chords-and-lyrics',
          segments: [
            { chord: 'C', lyrics: 'za - ' },
            { chord: 'G', lyrics: 'częła' },
          ],
        },
      ],
      uniqueChords: ['C', 'G'],
    };

    const html = renderToStaticMarkup(React.createElement(SongViewer, { song }));
    assert(html.includes('za-'), 'Spaces around hyphen in divided word must be collapsed to za-');
  });
}
