import React, { useState, useRef, useEffect } from 'react';
import { XIcon } from './Icons';
import { parseFrontmatter, trimEmptyLines } from '../lib/songParser';

export interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (song: {
    title: string;
    artist: string;
    key?: string;
    tags?: string[];
    rawLyrics: string;
  }) => void;
  theme?: 'dark' | 'light';
}

/**
 * Native <dialog> Modal for uploading / creating custom songs (REQ-UPL).
 * Supports reading .txt files with frontmatter or manual entry with instant preview.
 */
export function UploadModal({
  isOpen,
  onClose,
  onSave,
  theme = 'dark',
}: UploadModalProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [key, setKey] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [rawLyrics, setRawLyrics] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isDark = theme === 'dark';

  // Sync open/close state with native dialog
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleReset = () => {
    setTitle('');
    setArtist('');
    setKey('');
    setTagsInput('');
    setRawLyrics('');
    setError(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      handleClose();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const { metadata, body } = parseFrontmatter(text);

      const parsedTitle =
        metadata.title ||
        file.name.replace(/\.txt$/i, '').replace(/[-_]/g, ' ');
      const parsedArtist = metadata.artist || metadata.author || '';
      const parsedKey = metadata.key || '';
      const parsedTags = Array.isArray(metadata.tags)
        ? metadata.tags.join(', ')
        : metadata.tags || '';

      setTitle(parsedTitle);
      setArtist(parsedArtist || 'Nieznany wykonawca');
      setKey(parsedKey);
      setTagsInput(parsedTags);
      setRawLyrics(trimEmptyLines(body || text));
      setError(null);
    } catch {
      setError('Błąd podczas odczytu pliku. Upewnij się, że to poprawny plik tekstowy.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Podaj tytuł utworu.');
      return;
    }
    if (!rawLyrics.trim()) {
      setError('Wprowadź tekst utworu z chwytami.');
      return;
    }

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    onSave({
      title: title.trim(),
      artist: (artist.trim() || 'Nieznany wykonawca'),
      key: key.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      rawLyrics: trimEmptyLines(rawLyrics.trim()),
    });

    handleClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onClose={handleClose}
      className="m-auto p-0 bg-transparent text-neutral-100 rounded-2xl max-w-lg w-[calc(100%-2rem)] border-0 shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-xs outline-none"
    >
      <div
        className={`${
          isDark
            ? 'bg-neutral-900 border-neutral-800 text-neutral-100'
            : 'bg-white border-neutral-200 text-neutral-900'
        } border rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between border-b ${isDark ? 'border-neutral-800' : 'border-neutral-200'} pb-3`}>
          <div>
            <h2 className={`text-xl font-bold ${isDark ? 'text-amber-500' : 'text-amber-600'}`}>
              Dodaj własny utwór
            </h2>
            <p className={`text-xs ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
              Wgraj plik .txt lub wpisz tekst i chwyty
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Zamknij"
            title="Zamknij"
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              isDark
                ? 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800'
                : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Upload file button shortcut */}
        <div>
          <input
            type="file"
            ref={fileInputRef}
            accept=".txt,text/plain"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`w-full py-2.5 px-4 rounded-xl border border-dashed text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
              isDark
                ? 'border-neutral-700 bg-neutral-800/50 hover:bg-neutral-800 text-neutral-200'
                : 'border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-neutral-700'
            }`}
          >
            <span>📁 Wgraj plik tekstowy (.txt)</span>
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg text-xs bg-red-500/10 border border-red-500/30 text-red-400">
            {error}
          </div>
        )}

        {/* Form fields */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                Tytuł utworu *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="np. Moja Piosenka"
                className={`w-full px-3 py-2 text-sm rounded-lg border outline-none transition ${
                  isDark
                    ? 'bg-neutral-800 border-neutral-700 text-neutral-100 focus:border-amber-500'
                    : 'bg-white border-neutral-300 text-neutral-900 focus:border-amber-500'
                }`}
              />
            </div>

            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                Wykonawca
              </label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="np. Dżem lub autor"
                className={`w-full px-3 py-2 text-sm rounded-lg border outline-none transition ${
                  isDark
                    ? 'bg-neutral-800 border-neutral-700 text-neutral-100 focus:border-amber-500'
                    : 'bg-white border-neutral-300 text-neutral-900 focus:border-amber-500'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                Tonacja (opcjonalnie)
              </label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="np. G, Am, C"
                className={`w-full px-3 py-2 text-sm rounded-lg border outline-none transition ${
                  isDark
                    ? 'bg-neutral-800 border-neutral-700 text-neutral-100 focus:border-amber-500'
                    : 'bg-white border-neutral-300 text-neutral-900 focus:border-amber-500'
                }`}
              />
            </div>

            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                Tagi (po przecinku)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="np. rock, ballada, biesiada"
                className={`w-full px-3 py-2 text-sm rounded-lg border outline-none transition ${
                  isDark
                    ? 'bg-neutral-800 border-neutral-700 text-neutral-100 focus:border-amber-500'
                    : 'bg-white border-neutral-300 text-neutral-900 focus:border-amber-500'
                }`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
              Tekst i chwyty *
            </label>
            <textarea
              required
              rows={8}
              value={rawLyrics}
              onChange={(e) => setRawLyrics(e.target.value)}
              placeholder={`[Zwrotka 1]\nC              G\nKiedy byłem małym chłopcem, hej!\nAm             F\nBrałem gitarę i grałem...`}
              className={`w-full px-3 py-2 text-xs font-mono rounded-lg border outline-none leading-relaxed transition ${
                isDark
                  ? 'bg-neutral-800 border-neutral-700 text-neutral-100 focus:border-amber-500'
                  : 'bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-amber-500'
              }`}
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                isDark
                  ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                  : 'bg-neutral-200 hover:bg-neutral-300 text-neutral-700'
              }`}
            >
              Anuluj
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-neutral-950 transition cursor-pointer shadow-sm"
            >
              Zapisz utwór
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
