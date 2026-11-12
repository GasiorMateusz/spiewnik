import React, { useEffect, useRef, useState } from 'react';
import type { Instrument } from '../types';
import type { ChordNotation } from '../lib/chordNotation';
import type { ChordPosition } from './ChordSvg';
import { ChordSvg } from './ChordSvg';
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from './Icons';
import { INSTRUMENT_DATA, lookupChordPositions } from '../lib/chordDb';

export interface ChordModalProps {
  isOpen: boolean;
  chord: string | null;
  instrument: Instrument;
  onInstrumentChange: (instrument: Instrument) => void;
  onClose: () => void;
  polishNotation?: boolean;
  chordNotation?: ChordNotation;
}

export const ChordModal: React.FC<ChordModalProps> = ({
  isOpen,
  chord,
  instrument,
  onInstrumentChange,
  onClose,
  polishNotation = true,
  chordNotation,
}) => {
  // Derive the effective polish-notation flag for chord DB lookup.
  // European mode uses International roots (B not H), so treat it as !polish.
  const effectivePolish = chordNotation != null
    ? chordNotation === 'polish'
    : polishNotation;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [positions, setPositions] = useState<ChordPosition[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [variationIndex, setVariationIndex] = useState(0);

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

  // Asynchronous chord lookup on chord or instrument change
  useEffect(() => {
    let isCancelled = false;
    setVariationIndex(0);

    if (!chord) {
      setPositions(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    lookupChordPositions(chord, instrument, effectivePolish).then((result) => {
      if (!isCancelled) {
        setPositions(result);
        setLoading(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [chord, instrument, effectivePolish]);

  // Backdrop click handler: clicking native dialog outside card closes modal
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  const handleDialogClose = () => {
    if (isOpen) {
      onClose();
    }
  };

  const hasPositions = positions !== null && positions.length > 0;
  const currentPosition = hasPositions ? positions[variationIndex] || positions[0] : null;

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onClose={handleDialogClose}
      className="m-auto p-0 bg-transparent text-neutral-100 rounded-2xl max-w-sm w-[calc(100%-2rem)] border-0 shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-xs outline-none"
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-amber-400">
              {chord || ''}
            </span>
            <span className="text-xs text-neutral-400 font-sans">
              {instrument === 'guitar' ? 'Gitara' : 'Ukulele'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Instrument toggle segmented pill buttons */}
            <div className="flex items-center rounded-lg bg-neutral-800 p-0.5 text-xs font-medium border border-neutral-700/60">
              <button
                type="button"
                onClick={() => onInstrumentChange('guitar')}
                className={`px-2.5 py-1 rounded transition cursor-pointer ${
                  instrument === 'guitar'
                    ? 'bg-amber-500 text-neutral-950 font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Gitara
              </button>
              <button
                type="button"
                onClick={() => onInstrumentChange('ukulele')}
                className={`px-2.5 py-1 rounded transition cursor-pointer ${
                  instrument === 'ukulele'
                    ? 'bg-amber-500 text-neutral-950 font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Ukulele
              </button>
            </div>

            {/* Close button with XIcon */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition cursor-pointer"
              aria-label="Zamknij"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-neutral-400">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-2" />
            <span className="text-xs">Ładowanie diagramu...</span>
          </div>
        ) : hasPositions && currentPosition ? (
          <div className="flex flex-col items-center">
            {/* Chord Fretboard Diagram */}
            <ChordSvg
              chord={currentPosition}
              instrument={INSTRUMENT_DATA[instrument]}
              className="w-48 h-auto mx-auto"
            />

            {/* Variation Carousel Bar */}
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-neutral-800/80 w-full">
              <button
                type="button"
                onClick={() =>
                  setVariationIndex((prev) => (prev - 1 + positions.length) % positions.length)
                }
                disabled={positions.length <= 1}
                className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-200 transition cursor-pointer"
                aria-label="Poprzednia pozycja"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>

              <span className="text-sm font-mono font-medium text-neutral-300 select-none">
                {variationIndex + 1} z {positions.length}
              </span>

              <button
                type="button"
                onClick={() =>
                  setVariationIndex((prev) => (prev + 1) % positions.length)
                }
                disabled={positions.length <= 1}
                className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-200 transition cursor-pointer"
                aria-label="Następna pozycja"
              >
                <ChevronRightIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          /* Fallback notice for uncataloged or invalid chords */
          <div className="py-10 text-center">
            <p className="text-neutral-400 font-medium text-sm">
              Diagram niedostępny dla tego chwytu
            </p>
          </div>
        )}
      </div>
    </dialog>
  );
};
