import React from 'react';

export interface ChordPosition {
  frets: number[];
  fingers?: number[];
  barres?: number[];
  baseFret?: number;
  capo?: boolean;
}

export interface InstrumentData {
  strings: number;
  fretsOnChord: number;
  name: string;
  tunings: {
    standard: string[];
  };
}

interface ChordSvgProps {
  chord: ChordPosition;
  instrument: InstrumentData;
  lite?: boolean;
  className?: string;
}

const offsets: Record<number, { x: number; y: number; length: number }> = {
  4: { x: 10, y: 10, length: 40 },
  6: { x: 0, y: 0, length: 50 },
};

const positions = {
  string: [50, 40, 30, 20, 10, 0],
  fret: [-4, 6.5, 18, 30, 42, 54],
  finger: [-3, 8, 19.5, 31.5, 43.5],
};

const offsetMap: Record<number, number> = {
  4: 0,
  6: -1,
};

const fretXPosition: Record<number, number[]> = {
  4: [10, 20, 30, 40, 50],
  6: [0, 10, 20, 30, 40, 50],
};

const fretYPosition = [2.35, 13.9, 26, 38];

const getStringPosition = (string: number, strings: number) =>
  positions.string[string + (offsetMap[strings] ?? 0)];

const getBarreOffset = (strings: number, frets: number[], baseFret: number, capo?: boolean) => {
  if (strings === 6) {
    return frets[0] === 1 || capo ? (baseFret > 9 ? -12 : -11) : baseFret > 9 ? -10 : -7;
  }
  return frets[0] === 1 || capo ? (baseFret > 9 ? -1 : 0) : baseFret > 9 ? 3 : 4;
};

export const ChordSvg: React.FC<ChordSvgProps> = ({
  chord,
  instrument,
  lite = false,
  className = 'w-48 h-auto mx-auto',
}) => {
  if (!chord || !chord.frets) return null;

  const strings = instrument.strings;
  const fretsOnChord = instrument.fretsOnChord || 4;
  const baseFret = chord.baseFret || 1;
  const barres = Array.isArray(chord.barres) ? chord.barres : [];

  const getNeckHorizontalLine = (pos: number) =>
    `M ${offsets[strings]?.x || 0} ${12 * pos} H ${offsets[strings]?.length || 50}`;

  const getNeckVerticalLine = (pos: number) =>
    `M ${(offsets[strings]?.y || 0) + pos * 10} 0 V 48`;

  const neckPath = [
    ...Array.from({ length: fretsOnChord + 1 }, (_, pos) => getNeckHorizontalLine(pos)),
    ...Array.from({ length: strings }, (_, pos) => getNeckVerticalLine(pos)),
  ].join(' ');

  const onlyDots = chord.frets
    .map((f, index) => ({ position: index, value: f }))
    .filter((f) => !barres.includes(f.value));

  return (
    <div className={className}>
      <svg
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMinYMin meet"
        viewBox="0 0 80 70"
        className="text-neutral-300"
      >
        <g transform="translate(13, 13)">
          {/* Fretboard Grid */}
          <path
            stroke="currentColor"
            strokeWidth="0.35"
            strokeLinecap="square"
            strokeLinejoin="miter"
            d={neckPath}
            opacity="0.6"
          />

          {/* Nut / Base Fret */}
          {baseFret === 1 ? (
            <path
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              d={`M ${offsets[strings]?.x || 0} 0 H ${offsets[strings]?.length || 50}`}
            />
          ) : (
            <text
              fontSize="0.28rem"
              fill="currentColor"
              fontFamily="sans-serif"
              fontWeight="bold"
              x={getBarreOffset(strings, chord.frets, baseFret, chord.capo)}
              y="8"
            >
              {baseFret}fr
            </text>
          )}

          {/* Tuning notes at bottom */}
          {!lite && instrument.tunings?.standard && (
            <g>
              {instrument.tunings.standard.map((note, index) => (
                <text
                  key={index}
                  fontSize="0.28rem"
                  fill="currentColor"
                  opacity="0.75"
                  fontFamily="sans-serif"
                  textAnchor="middle"
                  x={(offsets[strings]?.x || 0) + index * 10}
                  y="54"
                >
                  {note}
                </text>
              ))}
            </g>
          )}

          {/* Barres */}
          {barres.map((barre, bIndex) => {
            const barreFrets = chord.frets
              .map((f, idx) => ({ position: idx, value: f }))
              .filter((f) => f.value === barre);

            if (barreFrets.length === 0) return null;

            const string1 = barreFrets[0].position;
            const string2 = barreFrets[barreFrets.length - 1].position;
            const width = (string2 - string1) * 10;
            const y = fretYPosition[barre - 1] ?? 0;
            const finger = chord.fingers ? chord.fingers[chord.frets.indexOf(barre)] : undefined;

            return (
              <g key={bIndex}>
                {barreFrets.map((fret) => (
                  <circle
                    key={fret.position}
                    strokeWidth="0.25"
                    stroke="currentColor"
                    fill="#f59e0b"
                    cx={getStringPosition(strings - fret.position, strings)}
                    cy={positions.fret[fret.value]}
                    r={4}
                  />
                ))}
                <rect
                  fill="#f59e0b"
                  x={fretXPosition[strings]?.[string1] ?? 0}
                  y={y}
                  width={width}
                  height={8.25}
                  rx={4}
                />
                {!lite && finger && finger > 0 && (
                  <text
                    fontSize="3pt"
                    fontFamily="sans-serif"
                    fontWeight="bold"
                    textAnchor="middle"
                    fill="#000000"
                    x={getStringPosition(strings - string1, strings)}
                    y={positions.finger[barre]}
                  >
                    {finger}
                  </text>
                )}
              </g>
            );
          })}

          {/* Individual Dots (Open, Muted, or Fretted) */}
          {onlyDots.map((fret) => {
            const isMuted = fret.value === -1;
            const isOpen = fret.value === 0;
            const finger = chord.fingers ? chord.fingers[fret.position] : undefined;

            if (isMuted) {
              return (
                <text
                  key={fret.position}
                  fontSize="0.65rem"
                  fill="#ef4444"
                  fontFamily="sans-serif"
                  fontWeight="bold"
                  textAnchor="middle"
                  x={getStringPosition(strings - fret.position, strings)}
                  y="-2"
                >
                  ×
                </text>
              );
            }

            return (
              <g key={fret.position}>
                <circle
                  strokeWidth="0.5"
                  stroke="currentColor"
                  fill={isOpen ? 'transparent' : '#f59e0b'}
                  cx={getStringPosition(strings - fret.position, strings)}
                  cy={positions.fret[fret.value]}
                  r={isOpen ? 2.5 : 4}
                />
                {!lite && !isOpen && finger && finger > 0 && (
                  <text
                    fontSize="3pt"
                    fontFamily="sans-serif"
                    fontWeight="bold"
                    textAnchor="middle"
                    fill="#000000"
                    x={getStringPosition(strings - fret.position, strings)}
                    y={positions.finger[fret.value]}
                  >
                    {finger}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
