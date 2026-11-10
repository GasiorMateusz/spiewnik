import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { TestRunner, assert } from './helpers/test_framework';
import { validateCustomSongs, type CustomSongRecord } from '../src/hooks/useLocalStorage';
import { parseSong } from '../src/lib/songParser';
import { UploadModal } from '../src/components/UploadModal';
import { TrashIcon } from '../src/components/Icons';

export async function runStage7Tests(runner: TestRunner) {
  runner.setTier('Stage 7 — Upload, Performance & Maintenance');

  // =========================================================================
  // Test 1: validateCustomSongs
  // =========================================================================
  await runner.test('U01: validateCustomSongs validates structure and drops corrupted records', () => {
    const validRecord: CustomSongRecord = {
      slug: 'ognisko-w-gorach',
      title: 'Ognisko w górach',
      artist: 'Włóczęga',
      key: 'G',
      tags: ['folk', 'ognisko'],
      rawLyrics: 'C G\nPłonie ognisko i szumią knieje',
      createdAt: 1700000000000,
    };

    const input = [
      validRecord,
      { slug: 'missing-title', artist: 'Art' }, // missing title, rawLyrics
      null,
      'not an object',
      { slug: 'no-lyrics', title: 'T', artist: 'A' },
      { slug: 'valid-minimal', title: 'Min', artist: 'Art', rawLyrics: 'Lyrics', createdAt: 123 },
    ];

    const result = validateCustomSongs(input);
    assert.strictEqual(result.length, 2, 'Only the 2 valid records must pass validation');
    assert.strictEqual(result[0].slug, 'ognisko-w-gorach');
    assert.strictEqual(result[1].slug, 'valid-minimal');

    // Non-array input defaults to empty array
    assert.deepStrictEqual(validateCustomSongs(null), []);
    assert.deepStrictEqual(validateCustomSongs('invalid'), []);
    assert.deepStrictEqual(validateCustomSongs(12345), []);
  });

  // =========================================================================
  // Test 2: UploadModal component structure
  // =========================================================================
  await runner.test('U02: UploadModal renders native <dialog>, file input, and form fields', () => {
    const html = renderToStaticMarkup(
      React.createElement(UploadModal, {
        isOpen: true,
        onClose: () => {},
        onSave: () => {},
        theme: 'dark',
      })
    );

    assert(html.includes('<dialog'), 'UploadModal must render native <dialog> tag');
    assert(html.includes('Dodaj własny utwór'), 'UploadModal must have Polish title');
    assert(html.includes('Wgraj plik tekstowy (.txt)'), 'UploadModal must have file upload button');
    assert(html.includes('Tytuł utworu'), 'UploadModal must contain Title label');
    assert(html.includes('Wykonawca'), 'UploadModal must contain Artist label');
    assert(html.includes('Tekst i chwyty'), 'UploadModal must contain Lyrics/Chords label');
    assert(html.includes('Zapisz utwór'), 'UploadModal must contain submit button');
    assert(html.includes('Anuluj'), 'UploadModal must contain cancel button');
  });

  // =========================================================================
  // Test 3: UploadModal light theme contrast
  // =========================================================================
  await runner.test('U03: UploadModal adapts to light theme with high contrast classes', () => {
    const html = renderToStaticMarkup(
      React.createElement(UploadModal, {
        isOpen: true,
        onClose: () => {},
        onSave: () => {},
        theme: 'light',
      })
    );

    assert(html.includes('bg-white'), 'Light UploadModal must render bg-white');
    assert(html.includes('text-neutral-900'), 'Light UploadModal must render text-neutral-900');
  });

  // =========================================================================
  // Test 4: Custom song parsing via parseSong
  // =========================================================================
  await runner.test('U04: Custom uploaded song parses atomic chord-lyric segments and detects unique chords', () => {
    const rawSong = `---
title: Bieszczadzki Trakt
artist: Wolna Grupa Bukowina
key: D
tags: [turystyczna, bieszczady]
---
[Zwrotka 1]
D              A
Kiedy w piątek słońce lśni
G              D
Na bieszczadzki ruszam trakt`;

    const parsed = parseSong(rawSong, 'bieszczadzki-trakt');
    assert.strictEqual(parsed.title, 'Bieszczadzki Trakt');
    assert.strictEqual(parsed.artist, 'Wolna Grupa Bukowina');
    assert.strictEqual(parsed.key, 'D');
    assert.deepStrictEqual(parsed.tags, ['turystyczna', 'bieszczady']);
    assert(parsed.uniqueChords.includes('D'), 'Must detect chord D');
    assert(parsed.uniqueChords.includes('A'), 'Must detect chord A');
    assert(parsed.uniqueChords.includes('G'), 'Must detect chord G');
    assert.strictEqual(parsed.lines.length >= 2, true, 'Must parse sections and lines');
  });

  // =========================================================================
  // Test 5: TrashIcon vector presence
  // =========================================================================
  await runner.test('U05: TrashIcon renders SVG trash can element for song deletion', () => {
    const html = renderToStaticMarkup(React.createElement(TrashIcon, { className: 'w-5 h-5 text-red-500' }));
    assert(html.includes('<svg'), 'TrashIcon must render SVG');
    assert(html.includes('text-red-500'), 'TrashIcon must apply classes');
    assert(html.includes('polyline points="3 6 5 6 21 6"'), 'TrashIcon must have trash can polyline');
  });

  // =========================================================================
  // Test 6: Dependabot configuration file
  // =========================================================================
  await runner.test('M01: .github/dependabot.yml exists and configures npm & github-actions', () => {
    const dependabotPath = path.join(process.cwd(), '.github', 'dependabot.yml');
    assert(fs.existsSync(dependabotPath), '.github/dependabot.yml must exist');
    const content = fs.readFileSync(dependabotPath, 'utf8');
    assert(content.includes('package-ecosystem: "npm"'), 'Must configure npm ecosystem');
    assert(content.includes('package-ecosystem: "github-actions"'), 'Must configure github-actions ecosystem');
    assert(content.includes('interval: "weekly"'), 'Must specify weekly schedule');
  });

  // =========================================================================
  // Test 7: package.json lint script
  // =========================================================================
  await runner.test('M02: package.json includes npm run lint script', () => {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert(pkg.scripts?.lint, 'package.json must declare lint script');
    assert(pkg.scripts.lint.includes('tsc'), 'lint script must invoke TypeScript compiler check');
  });

  // =========================================================================
  // Test 8: App.tsx upload and custom song integration
  // =========================================================================
  await runner.test('U06: App.tsx integrates UploadModal, custom song storage, and delete handling', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes('STORAGE_KEYS.CUSTOM_SONGS'), 'App.tsx must use STORAGE_KEYS.CUSTOM_SONGS');
    assert(appSrc.includes('handleSaveCustomSong'), 'App.tsx must define handleSaveCustomSong');
    assert(appSrc.includes('handleDeleteCustomSong'), 'App.tsx must define handleDeleteCustomSong');
    assert(appSrc.includes('<UploadModal'), 'App.tsx must mount UploadModal component');
    assert(appSrc.includes('Dodaj własny utwór'), 'App.tsx must include header button for custom song upload');
  });
}
