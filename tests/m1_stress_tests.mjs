// tests/m1_stress_tests.ts
import React2 from "react";
import { renderToStaticMarkup } from "react-dom/server";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

// src/lib/chordDb.ts
var INSTRUMENT_DATA = {
  guitar: {
    strings: 6,
    fretsOnChord: 4,
    name: "Gitara",
    tunings: {
      standard: ["E", "A", "D", "G", "B", "E"]
    }
  },
  ukulele: {
    strings: 4,
    fretsOnChord: 4,
    name: "Ukulele",
    tunings: {
      standard: ["G", "C", "E", "A"]
    }
  }
};
var guitarDbCache = null;
var ukuleleDbCache = null;
async function getInstrumentDb(instrument) {
  if (instrument === "guitar") {
    if (!guitarDbCache) {
      const module = await import("@tombatossals/chords-db/lib/guitar.json", { with: { type: "json" } });
      guitarDbCache = module.default || module;
    }
    return guitarDbCache;
  } else {
    if (!ukuleleDbCache) {
      const module = await import("@tombatossals/chords-db/lib/ukulele.json", { with: { type: "json" } });
      ukuleleDbCache = module.default || module;
    }
    return ukuleleDbCache;
  }
}
var GUITAR_KEY_MAP = {
  C: "C",
  "C#": "Csharp",
  Db: "Csharp",
  D: "D",
  "D#": "Eb",
  Eb: "Eb",
  E: "E",
  F: "F",
  "F#": "Fsharp",
  Gb: "Fsharp",
  G: "G",
  "G#": "Ab",
  Ab: "Ab",
  A: "A",
  "A#": "Bb",
  Bb: "Bb",
  B: "B",
  H: "B"
  // Polish H = B natural
};
var UKULELE_KEY_MAP = {
  C: "C",
  "C#": "Db",
  Db: "Db",
  D: "D",
  "D#": "Eb",
  Eb: "Eb",
  E: "E",
  F: "F",
  "F#": "Gb",
  Gb: "Gb",
  G: "G",
  "G#": "Ab",
  Ab: "Ab",
  A: "A",
  "A#": "Bb",
  Bb: "Bb",
  B: "B",
  H: "B"
};
var SUFFIX_MAP = {
  "": "major",
  maj: "major",
  M: "major",
  m: "minor",
  min: "minor",
  "-": "minor",
  "7": "7",
  m7: "m7",
  min7: "m7",
  maj7: "maj7",
  M7: "maj7",
  sus2: "sus2",
  sus4: "sus4",
  dim: "dim",
  dim7: "dim7",
  aug: "aug",
  "6": "6",
  m6: "m6",
  "9": "9",
  m9: "m9",
  maj9: "maj9"
};
function normalizeBassNote(bass, polishNotation) {
  let note = bass.trim();
  if (polishNotation) {
    if (note === "B") note = "Bb";
    else if (note === "H") note = "B";
  } else {
    if (note === "H") note = "B";
  }
  const ENHARMONIC_BASS = {
    Db: "C#",
    "D#": "Eb",
    Gb: "F#",
    Ab: "G#",
    "A#": "Bb"
  };
  return ENHARMONIC_BASS[note] || note;
}
function parseChordParts(chordName, instrument, polishNotation = true) {
  if (!chordName || typeof chordName !== "string") return null;
  const match = chordName.trim().match(/^([A-G|H][#b]?)([^/]*)(?:\/([A-G|H][#b]?)(.*))?$/);
  if (!match) return null;
  let rawRoot = match[1];
  const rawQuality = match[2]?.trim() || "";
  const rawBass = match[3];
  if (polishNotation) {
    if (rawRoot === "B") rawRoot = "Bb";
    else if (rawRoot === "H") rawRoot = "B";
  } else {
    if (rawRoot === "H") rawRoot = "B";
  }
  const keyMap = instrument === "guitar" ? GUITAR_KEY_MAP : UKULELE_KEY_MAP;
  const dbKey = keyMap[rawRoot];
  if (!dbKey) return null;
  let dbSuffix;
  if (rawBass) {
    const bass = normalizeBassNote(rawBass, polishNotation);
    if (rawQuality === "m" || rawQuality === "min" || rawQuality === "-") {
      dbSuffix = `m/${bass}`;
    } else if (!rawQuality || rawQuality === "maj" || rawQuality === "M") {
      dbSuffix = `/${bass}`;
    } else {
      dbSuffix = `${rawQuality}/${bass}`;
    }
  } else {
    dbSuffix = SUFFIX_MAP[rawQuality] || rawQuality || "major";
  }
  return { key: dbKey, suffix: dbSuffix };
}
async function lookupChordPositions(chordName, instrument, polishNotation = true) {
  const parsed = parseChordParts(chordName, instrument, polishNotation);
  if (!parsed) return null;
  const db = await getInstrumentDb(instrument);
  const keyChords = db.chords?.[parsed.key];
  if (!Array.isArray(keyChords)) return null;
  const chordEntry = keyChords.find(
    (c) => c.suffix.toLowerCase() === parsed.suffix.toLowerCase()
  );
  if (!chordEntry || !Array.isArray(chordEntry.positions) || chordEntry.positions.length === 0) {
    return null;
  }
  return chordEntry.positions;
}

// src/lib/chordNotation.ts
var CHROMATIC_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
var NOTE_TO_INDEX = {
  C: 0,
  "B#": 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  "E#": 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  H: 11
  // Polish notation: H = B natural
};
function formatNote(note, polishNotation = true) {
  if (polishNotation) {
    if (note === "B") return "H";
    if (note === "A#" || note === "Bb") return "B";
    return note;
  }
  if (note === "H") return "B";
  return note;
}
function transposeNote(note, semitones, polishNotation = true) {
  const index = NOTE_TO_INDEX[note];
  if (index === void 0) return note;
  const transposedIndex = ((index + semitones) % 12 + 12) % 12;
  const standardNote = CHROMATIC_SCALE[transposedIndex];
  return formatNote(standardNote, polishNotation);
}
var CHORD_REGEX = /^([A-G|H][#b]?)([^/]*)(?:\/([A-G|H][#b]?)(.*))?$/;
function transposeChord(chord, semitones, polishNotation = true) {
  if (!chord || chord.trim() === "") return chord;
  const trimmed = chord.trim();
  const match = trimmed.match(CHORD_REGEX);
  if (!match) {
    return trimmed;
  }
  const [, root, suffix = "", bassRoot, bassSuffix = ""] = match;
  const newRoot = transposeNote(root, semitones, polishNotation);
  if (bassRoot) {
    const newBass = transposeNote(bassRoot, semitones, polishNotation);
    return `${newRoot}${suffix}/${newBass}${bassSuffix}`;
  }
  return `${newRoot}${suffix}`;
}
function isChordToken(token) {
  if (!token || token.length > 10) return false;
  return /^[A-G|H][#b]?(?:maj|min|m|M|sus|dim|aug|add)?[0-9]?(?:\/[A-G|H][#b]?)?$/.test(token.trim());
}
function isChordLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return false;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const chordCount = tokens.filter((t) => isChordToken(t)).length;
  return chordCount / tokens.length >= 0.75;
}

// src/lib/songParser.ts
function parseFrontmatter(rawContent) {
  const trimmed = rawContent.trimStart();
  const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { metadata: {}, body: rawContent.trim() };
  }
  const rawYaml = match[1];
  const body = match[2].trim();
  const metadata = {};
  for (const line of rawYaml.split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      metadata[key] = val.slice(1, -1).split(",").map((item) => item.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
    } else {
      metadata[key] = val.replace(/^['"]|['"]$/g, "");
    }
  }
  return { metadata, body };
}
function extractChordPositions(chordLine) {
  const positions2 = [];
  const regex = /\S+/g;
  let match;
  while ((match = regex.exec(chordLine)) !== null) {
    positions2.push({
      chord: match[0],
      startIndex: match.index,
      endIndex: regex.lastIndex
    });
  }
  return positions2;
}
function bindChordsAndLyrics(chordLine, lyricLine) {
  const chords = extractChordPositions(chordLine);
  if (chords.length === 0) {
    return [{ chord: "", lyrics: lyricLine }];
  }
  const segments = [];
  if (chords[0].startIndex > 0) {
    const leadingLyrics = lyricLine.slice(0, chords[0].startIndex);
    if (leadingLyrics.length > 0) {
      segments.push({ chord: "", lyrics: leadingLyrics });
    }
  }
  for (let i = 0; i < chords.length; i++) {
    const currentChord = chords[i];
    const nextChord = chords[i + 1];
    const sliceStart = currentChord.startIndex;
    const sliceEnd = nextChord ? nextChord.startIndex : lyricLine.length;
    const lyricsChunk = sliceStart < lyricLine.length ? lyricLine.slice(sliceStart, sliceEnd) : "";
    segments.push({
      chord: currentChord.chord,
      lyrics: lyricsChunk
    });
  }
  return segments;
}
function parseSong(rawText, slug, filePath = "") {
  const { metadata, body } = parseFrontmatter(rawText);
  const title = metadata.title || slug;
  const artist = metadata.artist || "Nieznany wykonawca";
  const key = metadata.key || "C";
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  const rawLines = body.split(/\r?\n/);
  const songLines = [];
  const uniqueChordsSet = /* @__PURE__ */ new Set();
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      songLines.push({ type: "empty" });
      i++;
      continue;
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      songLines.push({
        type: "section-header",
        header: trimmed.slice(1, -1)
      });
      i++;
      continue;
    }
    if (isChordLine(line)) {
      const nextLine = i + 1 < rawLines.length ? rawLines[i + 1] : "";
      const nextLineTrimmed = nextLine.trim();
      const chordTokens = extractChordPositions(line);
      for (const item of chordTokens) {
        if (isChordToken(item.chord)) {
          uniqueChordsSet.add(item.chord);
        }
      }
      if (nextLineTrimmed && !nextLineTrimmed.startsWith("[") && !isChordLine(nextLine)) {
        const segments2 = bindChordsAndLyrics(line, nextLine);
        songLines.push({
          type: "chords-and-lyrics",
          segments: segments2
        });
        i += 2;
        continue;
      }
      const segments = chordTokens.map((ct) => ({
        chord: ct.chord,
        lyrics: ""
      }));
      songLines.push({
        type: "chords-and-lyrics",
        segments
      });
      i++;
      continue;
    }
    songLines.push({
      type: "chords-and-lyrics",
      segments: [{ chord: "", lyrics: line }]
    });
    i++;
  }
  return {
    slug,
    title,
    artist,
    key,
    tags,
    rawLyrics: body,
    filePath,
    lines: songLines,
    uniqueChords: Array.from(uniqueChordsSet)
  };
}

// src/components/ChordSvg.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var offsets = {
  4: { x: 10, y: 10, length: 40 },
  6: { x: 0, y: 0, length: 50 }
};
var positions = {
  string: [50, 40, 30, 20, 10, 0],
  fret: [-4, 6.5, 18, 30, 42, 54],
  finger: [-3, 8, 19.5, 31.5, 43.5]
};
var offsetMap = {
  4: 0,
  6: -1
};
var fretXPosition = {
  4: [10, 20, 30, 40, 50],
  6: [0, 10, 20, 30, 40, 50]
};
var fretYPosition = [2.35, 13.9, 26, 38];
var getStringPosition = (string, strings) => positions.string[string + (offsetMap[strings] ?? 0)];
var getBarreOffset = (strings, frets, baseFret, capo) => {
  if (strings === 6) {
    return frets[0] === 1 || capo ? baseFret > 9 ? -12 : -11 : baseFret > 9 ? -10 : -7;
  }
  return frets[0] === 1 || capo ? baseFret > 9 ? -1 : 0 : baseFret > 9 ? 3 : 4;
};
var ChordSvg = ({
  chord,
  instrument,
  lite = false,
  className = "w-48 h-auto mx-auto"
}) => {
  if (!chord || !chord.frets) return null;
  const strings = instrument.strings;
  const fretsOnChord = instrument.fretsOnChord || 4;
  const baseFret = chord.baseFret || 1;
  const barres = Array.isArray(chord.barres) ? chord.barres : [];
  const getNeckHorizontalLine = (pos) => `M ${offsets[strings]?.x || 0} ${12 * pos} H ${offsets[strings]?.length || 50}`;
  const getNeckVerticalLine = (pos) => `M ${(offsets[strings]?.y || 0) + pos * 10} 0 V 48`;
  const neckPath = [
    ...Array.from({ length: fretsOnChord + 1 }, (_, pos) => getNeckHorizontalLine(pos)),
    ...Array.from({ length: strings }, (_, pos) => getNeckVerticalLine(pos))
  ].join(" ");
  const onlyDots = chord.frets.map((f, index) => ({ position: index, value: f })).filter((f) => !barres.includes(f.value));
  return /* @__PURE__ */ jsx("div", { className, children: /* @__PURE__ */ jsx(
    "svg",
    {
      width: "100%",
      height: "100%",
      xmlns: "http://www.w3.org/2000/svg",
      preserveAspectRatio: "xMinYMin meet",
      viewBox: "0 0 80 70",
      className: "text-neutral-300",
      children: /* @__PURE__ */ jsxs("g", { transform: "translate(13, 13)", children: [
        /* @__PURE__ */ jsx(
          "path",
          {
            stroke: "currentColor",
            strokeWidth: "0.35",
            strokeLinecap: "square",
            strokeLinejoin: "miter",
            d: neckPath,
            opacity: "0.6"
          }
        ),
        baseFret === 1 ? /* @__PURE__ */ jsx(
          "path",
          {
            stroke: "currentColor",
            strokeWidth: "2.5",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            d: `M ${offsets[strings]?.x || 0} 0 H ${offsets[strings]?.length || 50}`
          }
        ) : /* @__PURE__ */ jsxs(
          "text",
          {
            fontSize: "0.28rem",
            fill: "currentColor",
            fontFamily: "sans-serif",
            fontWeight: "bold",
            x: getBarreOffset(strings, chord.frets, baseFret, chord.capo),
            y: "8",
            children: [
              baseFret,
              "fr"
            ]
          }
        ),
        !lite && instrument.tunings?.standard && /* @__PURE__ */ jsx("g", { children: instrument.tunings.standard.map((note, index) => /* @__PURE__ */ jsx(
          "text",
          {
            fontSize: "0.28rem",
            fill: "currentColor",
            opacity: "0.75",
            fontFamily: "sans-serif",
            textAnchor: "middle",
            x: (offsets[strings]?.x || 0) + index * 10,
            y: "54",
            children: note
          },
          index
        )) }),
        barres.map((barre, bIndex) => {
          const barreFrets = chord.frets.map((f, idx) => ({ position: idx, value: f })).filter((f) => f.value === barre);
          if (barreFrets.length === 0) return null;
          const string1 = barreFrets[0].position;
          const string2 = barreFrets[barreFrets.length - 1].position;
          const width = (string2 - string1) * 10;
          const y = fretYPosition[barre - 1] ?? 0;
          const finger = chord.fingers ? chord.fingers[chord.frets.indexOf(barre)] : void 0;
          return /* @__PURE__ */ jsxs("g", { children: [
            barreFrets.map((fret) => /* @__PURE__ */ jsx(
              "circle",
              {
                strokeWidth: "0.25",
                stroke: "currentColor",
                fill: "#f59e0b",
                cx: getStringPosition(strings - fret.position, strings),
                cy: positions.fret[fret.value],
                r: 4
              },
              fret.position
            )),
            /* @__PURE__ */ jsx(
              "rect",
              {
                fill: "#f59e0b",
                x: fretXPosition[strings]?.[string1] ?? 0,
                y,
                width,
                height: 8.25,
                rx: 4
              }
            ),
            !lite && finger && finger > 0 && /* @__PURE__ */ jsx(
              "text",
              {
                fontSize: "3pt",
                fontFamily: "sans-serif",
                fontWeight: "bold",
                textAnchor: "middle",
                fill: "#000000",
                x: getStringPosition(strings - string1, strings),
                y: positions.finger[barre],
                children: finger
              }
            )
          ] }, bIndex);
        }),
        onlyDots.map((fret) => {
          const isMuted = fret.value === -1;
          const isOpen = fret.value === 0;
          const finger = chord.fingers ? chord.fingers[fret.position] : void 0;
          if (isMuted) {
            return /* @__PURE__ */ jsx(
              "text",
              {
                fontSize: "0.65rem",
                fill: "#ef4444",
                fontFamily: "sans-serif",
                fontWeight: "bold",
                textAnchor: "middle",
                x: getStringPosition(strings - fret.position, strings),
                y: "-2",
                children: "\xD7"
              },
              fret.position
            );
          }
          return /* @__PURE__ */ jsxs("g", { children: [
            /* @__PURE__ */ jsx(
              "circle",
              {
                strokeWidth: "0.5",
                stroke: "currentColor",
                fill: isOpen ? "transparent" : "#f59e0b",
                cx: getStringPosition(strings - fret.position, strings),
                cy: positions.fret[fret.value],
                r: isOpen ? 2.5 : 4
              }
            ),
            !lite && !isOpen && finger && finger > 0 && /* @__PURE__ */ jsx(
              "text",
              {
                fontSize: "3pt",
                fontFamily: "sans-serif",
                fontWeight: "bold",
                textAnchor: "middle",
                fill: "#000000",
                x: getStringPosition(strings - fret.position, strings),
                y: positions.finger[fret.value],
                children: finger
              }
            )
          ] }, fret.position);
        })
      ] })
    }
  ) });
};

// src/components/ChordModal.tsx
import { useEffect, useRef, useState } from "react";

// src/components/Icons.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var ChevronLeftIcon = ({ className = "w-5 h-5", size, ...props }) => /* @__PURE__ */ jsx2(
  "svg",
  {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
    width: size,
    height: size,
    ...props,
    children: /* @__PURE__ */ jsx2("polyline", { points: "15 18 9 12 15 6" })
  }
);
var ChevronRightIcon = ({ className = "w-5 h-5", size, ...props }) => /* @__PURE__ */ jsx2(
  "svg",
  {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
    width: size,
    height: size,
    ...props,
    children: /* @__PURE__ */ jsx2("polyline", { points: "9 18 15 12 9 6" })
  }
);
var XIcon = ({ className = "w-5 h-5", size, ...props }) => /* @__PURE__ */ jsxs2(
  "svg",
  {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
    width: size,
    height: size,
    ...props,
    children: [
      /* @__PURE__ */ jsx2("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
      /* @__PURE__ */ jsx2("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
    ]
  }
);

// src/components/ChordModal.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var ChordModal = ({
  isOpen,
  chord,
  instrument,
  onInstrumentChange,
  onClose,
  polishNotation = true
}) => {
  const dialogRef = useRef(null);
  const [positions2, setPositions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [variationIndex, setVariationIndex] = useState(0);
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
  useEffect(() => {
    let isCancelled = false;
    setVariationIndex(0);
    if (!chord) {
      setPositions(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    lookupChordPositions(chord, instrument, polishNotation).then((result) => {
      if (!isCancelled) {
        setPositions(result);
        setLoading(false);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [chord, instrument, polishNotation]);
  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };
  const handleDialogClose = () => {
    if (isOpen) {
      onClose();
    }
  };
  const hasPositions = positions2 !== null && positions2.length > 0;
  const currentPosition = hasPositions ? positions2[variationIndex] || positions2[0] : null;
  return /* @__PURE__ */ jsx3(
    "dialog",
    {
      ref: dialogRef,
      onClick: handleBackdropClick,
      onClose: handleDialogClose,
      className: "m-auto p-0 bg-transparent text-neutral-100 rounded-2xl max-w-sm w-[calc(100%-2rem)] border-0 shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-xs outline-none",
      children: /* @__PURE__ */ jsxs3("div", { className: "bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4", children: [
        /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between border-b border-neutral-800 pb-3", children: [
          /* @__PURE__ */ jsxs3("div", { className: "flex items-baseline gap-2", children: [
            /* @__PURE__ */ jsx3("span", { className: "text-2xl font-bold font-mono text-amber-400", children: chord || "" }),
            /* @__PURE__ */ jsx3("span", { className: "text-xs text-neutral-400 font-sans", children: instrument === "guitar" ? "Gitara" : "Ukulele" })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxs3("div", { className: "flex items-center rounded-lg bg-neutral-800 p-0.5 text-xs font-medium border border-neutral-700/60", children: [
              /* @__PURE__ */ jsx3(
                "button",
                {
                  type: "button",
                  onClick: () => onInstrumentChange("guitar"),
                  className: `px-2.5 py-1 rounded transition cursor-pointer ${instrument === "guitar" ? "bg-amber-500 text-neutral-950 font-semibold shadow-sm" : "text-neutral-400 hover:text-neutral-200"}`,
                  children: "Gitara"
                }
              ),
              /* @__PURE__ */ jsx3(
                "button",
                {
                  type: "button",
                  onClick: () => onInstrumentChange("ukulele"),
                  className: `px-2.5 py-1 rounded transition cursor-pointer ${instrument === "ukulele" ? "bg-amber-500 text-neutral-950 font-semibold shadow-sm" : "text-neutral-400 hover:text-neutral-200"}`,
                  children: "Ukulele"
                }
              )
            ] }),
            /* @__PURE__ */ jsx3(
              "button",
              {
                type: "button",
                onClick: onClose,
                className: "p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition cursor-pointer",
                "aria-label": "Zamknij",
                children: /* @__PURE__ */ jsx3(XIcon, { className: "w-5 h-5" })
              }
            )
          ] })
        ] }),
        loading ? /* @__PURE__ */ jsxs3("div", { className: "py-12 flex flex-col items-center justify-center text-neutral-400", children: [
          /* @__PURE__ */ jsx3("div", { className: "w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-2" }),
          /* @__PURE__ */ jsx3("span", { className: "text-xs", children: "\u0141adowanie diagramu..." })
        ] }) : hasPositions && currentPosition ? /* @__PURE__ */ jsxs3("div", { className: "flex flex-col items-center", children: [
          /* @__PURE__ */ jsx3(
            ChordSvg,
            {
              chord: currentPosition,
              instrument: INSTRUMENT_DATA[instrument],
              className: "w-48 h-auto mx-auto"
            }
          ),
          /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between pt-3 mt-2 border-t border-neutral-800/80 w-full", children: [
            /* @__PURE__ */ jsx3(
              "button",
              {
                type: "button",
                onClick: () => setVariationIndex((prev) => (prev - 1 + positions2.length) % positions2.length),
                disabled: positions2.length <= 1,
                className: "p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-200 transition cursor-pointer",
                "aria-label": "Poprzednia pozycja",
                children: /* @__PURE__ */ jsx3(ChevronLeftIcon, { className: "w-5 h-5" })
              }
            ),
            /* @__PURE__ */ jsxs3("span", { className: "text-sm font-mono font-medium text-neutral-300 select-none", children: [
              variationIndex + 1,
              " z ",
              positions2.length
            ] }),
            /* @__PURE__ */ jsx3(
              "button",
              {
                type: "button",
                onClick: () => setVariationIndex((prev) => (prev + 1) % positions2.length),
                disabled: positions2.length <= 1,
                className: "p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-200 transition cursor-pointer",
                "aria-label": "Nast\u0119pna pozycja",
                children: /* @__PURE__ */ jsx3(ChevronRightIcon, { className: "w-5 h-5" })
              }
            )
          ] })
        ] }) : (
          /* Fallback notice for uncataloged or invalid chords */
          /* @__PURE__ */ jsx3("div", { className: "py-10 text-center", children: /* @__PURE__ */ jsx3("p", { className: "text-neutral-400 font-medium text-sm", children: "Diagram niedost\u0119pny dla tego chwytu" }) })
        )
      ] })
    }
  );
};

// tests/m1_stress_tests.ts
import guitarDb from "@tombatossals/chords-db/lib/guitar.json" with { type: "json" };
import ukuleleDb from "@tombatossals/chords-db/lib/ukulele.json" with { type: "json" };
var results = [];
async function runTest(suite, name, fn) {
  try {
    await fn();
    results.push({ suite, name, passed: true });
    console.log(`  \u2713 [${suite}] ${name}`);
  } catch (err) {
    results.push({ suite, name, passed: false, error: err?.message || String(err), details: err });
    console.error(`  \u2717 [${suite}] ${name}: ${err?.message || err}`);
  }
}
async function main() {
  console.log("================================================================");
  console.log("STARTING EMPIRICAL CHALLENGER STRESS TESTS \u2014 MILESTONE M1");
  console.log("================================================================\n");
  console.log("--- SUITE 1: Polish Notation Chromatic Roots ---");
  const chromaticRoots = ["H", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A"];
  for (const inst of ["guitar", "ukulele"]) {
    const expectedStrings = inst === "guitar" ? 6 : 4;
    for (const root of chromaticRoots) {
      await runTest("Suite 1: Roots", `${inst.toUpperCase()} major: ${root}`, async () => {
        const positions2 = await lookupChordPositions(root, inst, true);
        assert(positions2 !== null, `Chord ${root} returned null on ${inst}`);
        assert(positions2.length > 0, `Chord ${root} has 0 positions on ${inst}`);
        for (const pos of positions2) {
          assert.strictEqual(pos.frets.length, expectedStrings, `Frets length mismatch for ${root} on ${inst}`);
          for (const f of pos.frets) {
            assert(typeof f === "number" && f >= -1 && f <= 5, `Invalid fret value ${f} in ${root}`);
          }
        }
      });
      await runTest("Suite 1: Roots", `${inst.toUpperCase()} minor: ${root}m`, async () => {
        const positions2 = await lookupChordPositions(`${root}m`, inst, true);
        assert(positions2 !== null, `Chord ${root}m returned null on ${inst}`);
        assert(positions2.length > 0, `Chord ${root}m has 0 positions on ${inst}`);
        for (const pos of positions2) {
          assert.strictEqual(pos.frets.length, expectedStrings, `Frets length mismatch for ${root}m on ${inst}`);
        }
      });
    }
  }
  console.log("\n--- SUITE 2: Polish vs International B/H Equivalence ---");
  for (const inst of ["guitar", "ukulele"]) {
    await runTest("Suite 2: B/H Mapping", `${inst} Polish H == International B`, async () => {
      const plH = await lookupChordPositions("H", inst, true);
      const intB = await lookupChordPositions("B", inst, false);
      assert.deepStrictEqual(plH, intB, `PL H must strictly equal INT B on ${inst}`);
    });
    await runTest("Suite 2: B/H Mapping", `${inst} Polish B == International Bb`, async () => {
      const plB = await lookupChordPositions("B", inst, true);
      const intBb = await lookupChordPositions("Bb", inst, false);
      assert.deepStrictEqual(plB, intBb, `PL B must strictly equal INT Bb on ${inst}`);
    });
    await runTest("Suite 2: B/H Mapping", `${inst} Polish H != Polish B`, async () => {
      const plH = await lookupChordPositions("H", inst, true);
      const plB = await lookupChordPositions("B", inst, true);
      assert.notDeepStrictEqual(plH, plB, `PL H must not equal PL B on ${inst}`);
    });
    await runTest("Suite 2: B/H Mapping", `${inst} Polish Hm == International Bm`, async () => {
      const plHm = await lookupChordPositions("Hm", inst, true);
      const intBm = await lookupChordPositions("Bm", inst, false);
      assert.deepStrictEqual(plHm, intBm, `PL Hm must strictly equal INT Bm on ${inst}`);
    });
    await runTest("Suite 2: B/H Mapping", `${inst} Polish Bm == International Bbm`, async () => {
      const plBm = await lookupChordPositions("Bm", inst, true);
      const intBbm = await lookupChordPositions("Bbm", inst, false);
      assert.deepStrictEqual(plBm, intBbm, `PL Bm must strictly equal INT Bbm on ${inst}`);
    });
  }
  console.log("\n--- SUITE 3: Multi-Voicing Voicings (N=1..5) ---");
  await runTest("Suite 3: Voicings", "N=1: Ukulele C11", async () => {
    const pos = await lookupChordPositions("C11", "ukulele", true);
    assert(pos !== null, "C11 on ukulele should resolve");
    assert.strictEqual(pos.length, 1, `Expected 1 position, got ${pos.length}`);
  });
  await runTest("Suite 3: Voicings", "N=2: Ukulele Amaj11", async () => {
    const pos = await lookupChordPositions("Amaj11", "ukulele", true);
    assert(pos !== null, "Amaj11 on ukulele should resolve");
    assert.strictEqual(pos.length, 2, `Expected 2 positions, got ${pos.length}`);
  });
  await runTest("Suite 3: Voicings", "N=3: Guitar D/F# and C/G", async () => {
    const dSlash = await lookupChordPositions("D/F#", "guitar", true);
    const cSlash = await lookupChordPositions("C/G", "guitar", true);
    assert(dSlash !== null && dSlash.length === 3, "D/F# must have 3 positions");
    assert(cSlash !== null && cSlash.length === 3, "C/G must have 3 positions");
  });
  await runTest("Suite 3: Voicings", "N=4: Guitar C and Ukulele C", async () => {
    const gC = await lookupChordPositions("C", "guitar", true);
    const uC = await lookupChordPositions("C", "ukulele", true);
    assert(gC !== null && gC.length === 4, "C on guitar must have 4 positions");
    assert(uC !== null && uC.length === 4, "C on ukulele must have 4 positions");
  });
  await runTest("Suite 3: Voicings", "N=5: Guitar C9 and Em7", async () => {
    const c9 = await lookupChordPositions("C9", "guitar", true);
    const em7 = await lookupChordPositions("Em7", "guitar", true);
    assert(c9 !== null && c9.length === 5, "C9 on guitar must have 5 positions");
    assert(em7 !== null && em7.length === 5, "Em7 on guitar must have 5 positions");
  });
  await runTest("Suite 3: Carousel Math", "Modulo wrap-around invariant for all N in [1..5]", () => {
    for (const N of [1, 2, 3, 4, 5]) {
      const prevFromZero = (0 - 1 + N) % N;
      assert.strictEqual(prevFromZero, N - 1, `Wrapping left from 0 failed for N=${N}`);
      const nextFromEnd = (N - 1 + 1) % N;
      assert.strictEqual(nextFromEnd, 0, `Wrapping right from N-1 failed for N=${N}`);
      const isDisabled = N <= 1;
      assert.strictEqual(isDisabled, N === 1, `Disabled state mismatch for N=${N}`);
    }
  });
  console.log("\n--- SUITE 4: Slash Chords Resolution vs Fallback ---");
  const validGuitarSlashChords = ["D/F#", "C/G", "Em/G", "C/E", "D/A", "F/E"];
  for (const sc of validGuitarSlashChords) {
    await runTest("Suite 4: Slash Chords", `Valid Guitar slash chord: ${sc}`, async () => {
      const pos = await lookupChordPositions(sc, "guitar", true);
      assert(pos !== null, `Slash chord ${sc} should have resolved on guitar`);
      assert.strictEqual(pos.length, 3, `Slash chord ${sc} should have 3 positions`);
    });
  }
  await runTest("Suite 4: Slash Chords", "Guitar slash G/H (Polish) == G/B (International)", async () => {
    const plGH = await lookupChordPositions("G/H", "guitar", true);
    const intGB = await lookupChordPositions("G/B", "guitar", false);
    assert(plGH !== null, "G/H in Polish should resolve");
    assert.deepStrictEqual(plGH, intGB, "G/H in PL should match G/B in INT");
  });
  await runTest("Suite 4: Slash Chords", "Guitar Polish slash: E/H resolves to E/B (3 positions)", async () => {
    const plEH = await lookupChordPositions("E/H", "guitar", true);
    const intEB = await lookupChordPositions("E/B", "guitar", false);
    assert(plEH !== null, "E/H in Polish should resolve");
    assert.deepStrictEqual(plEH, intEB, "E/H in PL should match E/B in INT");
  });
  await runTest("Suite 4: Slash Chords", "Guitar Polish slash: E/B maps to uncataloged E/Bb (null)", async () => {
    const plEB = await lookupChordPositions("E/B", "guitar", true);
    assert.strictEqual(plEB, null, "E/B in Polish mode is E over Bb, which is not cataloged in chords-db");
  });
  await runTest("Suite 4: Slash Chords", "Guitar Polish slash: D/B resolves to D/Bb (3 positions)", async () => {
    const plDB = await lookupChordPositions("D/B", "guitar", true);
    const intDBb = await lookupChordPositions("D/Bb", "guitar", false);
    assert(plDB !== null, "D/B in Polish should resolve to D/Bb");
    assert.deepStrictEqual(plDB, intDBb, "D/B in PL should match D/Bb in INT");
  });
  await runTest("Suite 4: Slash Chords", "Guitar Enharmonic bass: E/Db resolves to E/C# (3 positions)", async () => {
    const enharmonic = await lookupChordPositions("E/Db", "guitar", true);
    const standard = await lookupChordPositions("E/C#", "guitar", true);
    assert(enharmonic !== null, "E/Db should resolve via enharmonic normalization");
    assert.deepStrictEqual(enharmonic, standard);
  });
  const uncatalogedGuitarSlash = ["C/D", "G/A", "A/B", "Am/D", "E/A"];
  for (const sc of uncatalogedGuitarSlash) {
    await runTest("Suite 4: Slash Chords", `Uncataloged Guitar slash: ${sc} -> null`, async () => {
      const pos = await lookupChordPositions(sc, "guitar", true);
      assert.strictEqual(pos, null, `Uncataloged slash chord ${sc} must return null`);
    });
  }
  const ukuleleSlashChords = ["C/G", "Am/G", "D/F#", "F/A", "G/B", "Em/B"];
  for (const sc of ukuleleSlashChords) {
    await runTest("Suite 4: Slash Chords", `Ukulele slash: ${sc} -> null`, async () => {
      const pos = await lookupChordPositions(sc, "ukulele", true);
      assert.strictEqual(pos, null, `Ukulele slash chord ${sc} must return null`);
    });
  }
  console.log("\n--- SUITE 5: Extreme Inputs and Boundary Fuzzing ---");
  const invalidInputs = [
    "",
    "   ",
    "N.C.",
    "intro",
    "??",
    "solo",
    "chorus",
    "bridge",
    "verse",
    "Cadd11",
    "Hdim77",
    "123",
    "C//G",
    "///",
    "C\\G",
    "<script>alert(1)</script>",
    "--DROP TABLE chords;",
    "\u{1F3B8}",
    "D/invalid",
    null,
    void 0,
    42,
    {},
    []
  ];
  for (const input of invalidInputs) {
    const label = typeof input === "string" ? `"${input}"` : String(input);
    await runTest("Suite 5: Extreme Inputs", `Input: ${label} -> null (no throw)`, async () => {
      for (const inst of ["guitar", "ukulele"]) {
        const res = await lookupChordPositions(input, inst, true);
        assert.strictEqual(res, null, `Expected null for ${label} on ${inst}`);
      }
    });
  }
  await runTest("Suite 5: Extreme Inputs", "Empirical Defect Audit: Trailing garbage after slash bass note", async () => {
    const res1 = await lookupChordPositions("D/F#garbage", "guitar", true);
    const res2 = await lookupChordPositions("D/F#/G", "guitar", true);
    const res3 = await lookupChordPositions("E/C##", "guitar", true);
    console.log(`     [DEFECT AUDIT] D/F#garbage resolved to: ${res1 ? res1.length + " positions (UNEXPECTED RESOLUTION)" : "null"}`);
    console.log(`     [DEFECT AUDIT] D/F#/G resolved to: ${res2 ? res2.length + " positions (UNEXPECTED RESOLUTION)" : "null"}`);
    console.log(`     [DEFECT AUDIT] E/C## resolved to: ${res3 ? res3.length + " positions (UNEXPECTED RESOLUTION)" : "null"}`);
    assert(res1 !== null && res2 !== null, "Empirically confirms that trailing garbage is accepted by chordDb");
  });
  console.log("\n--- SUITE 6: ChordSvg Rendering Invariants ---");
  await runTest("Suite 6: ChordSvg", "Guitar diagram includes 6 strings and EADGBE tuning notes", () => {
    const svg = renderToStaticMarkup(
      React2.createElement(ChordSvg, {
        chord: { frets: [-1, 3, 2, 0, 1, 0], baseFret: 1 },
        instrument: INSTRUMENT_DATA.guitar
      })
    );
    assert(svg.includes("<svg"), "Output must be SVG");
    assert(svg.includes("E") && svg.includes("A") && svg.includes("D") && svg.includes("G") && svg.includes("B"), "Must include EADGBE notes");
  });
  await runTest("Suite 6: ChordSvg", "Ukulele diagram includes 4 strings and GCEA tuning notes", () => {
    const svg = renderToStaticMarkup(
      React2.createElement(ChordSvg, {
        chord: { frets: [0, 0, 0, 3], baseFret: 1 },
        instrument: INSTRUMENT_DATA.ukulele
      })
    );
    assert(svg.includes("<svg"), "Output must be SVG");
    assert(svg.includes("G") && svg.includes("C") && svg.includes("E") && svg.includes("A"), "Must include GCEA notes");
    assert(!svg.includes(">D<") && !svg.includes(">B<"), "Ukulele must not include D or B tunings");
  });
  await runTest("Suite 6: ChordSvg", "Barre chord renders amber rect and barre dots", () => {
    const svg = renderToStaticMarkup(
      React2.createElement(ChordSvg, {
        chord: { frets: [1, 3, 3, 2, 1, 1], barres: [1], baseFret: 1 },
        instrument: INSTRUMENT_DATA.guitar
      })
    );
    assert(svg.includes("<rect"), "Must render rect for barre");
    assert(svg.includes("#f59e0b"), "Must render amber color");
  });
  await runTest("Suite 6: ChordSvg", "Muted string renders red \xD7 mark", () => {
    const svg = renderToStaticMarkup(
      React2.createElement(ChordSvg, {
        chord: { frets: [-1, 3, 2, 0, 1, 0], baseFret: 1 },
        instrument: INSTRUMENT_DATA.guitar
      })
    );
    assert(svg.includes("\xD7"), "Must render \xD7 for muted string");
    assert(svg.includes("#ef4444"), "Must render red color for muted string");
  });
  await runTest("Suite 6: ChordSvg", 'Base fret offset displays "3fr" when baseFret > 1', () => {
    const svg = renderToStaticMarkup(
      React2.createElement(ChordSvg, {
        chord: { frets: [1, 3, 3, 2, 1, 1], baseFret: 3 },
        instrument: INSTRUMENT_DATA.guitar
      })
    );
    assert(svg.includes("3fr"), "Must render 3fr text");
  });
  await runTest("Suite 6: ChordSvg", "Base fret === 1 renders thick nut stroke", () => {
    const svg = renderToStaticMarkup(
      React2.createElement(ChordSvg, {
        chord: { frets: [0, 1, 0, 2, 3, -1], baseFret: 1 },
        instrument: INSTRUMENT_DATA.guitar
      })
    );
    assert(!svg.includes("1fr"), "Nut must not display 1fr");
    assert(svg.includes('stroke-width="2.5"'), "Nut must have thick 2.5 stroke");
  });
  await runTest("Suite 6: ChordSvg", "Fuzz test every chord position across entire database (4,183 chords)", () => {
    let count = 0;
    for (const k in guitarDb.chords) {
      for (const chord of guitarDb.chords[k]) {
        for (const pos of chord.positions) {
          count++;
          const svg = renderToStaticMarkup(
            React2.createElement(ChordSvg, { chord: pos, instrument: INSTRUMENT_DATA.guitar })
          );
          assert(svg.includes("<svg"), `Invalid SVG output for Guitar ${k} ${chord.suffix}`);
        }
      }
    }
    for (const k in ukuleleDb.chords) {
      for (const chord of ukuleleDb.chords[k]) {
        for (const pos of chord.positions) {
          count++;
          const svg = renderToStaticMarkup(
            React2.createElement(ChordSvg, { chord: pos, instrument: INSTRUMENT_DATA.ukulele })
          );
          assert(svg.includes("<svg"), `Invalid SVG output for Ukulele ${k} ${chord.suffix}`);
        }
      }
    }
    console.log(`     [FUZZ] Successfully rendered ${count} unique chord positions with 0 errors.`);
  });
  console.log("\n--- SUITE 7: ChordModal Static Structure & Fallback Invariants ---");
  await runTest("Suite 7: ChordModal", "Fallback notice renders in Polish when chord is uncataloged / null", () => {
    const html = renderToStaticMarkup(
      React2.createElement(ChordModal, {
        isOpen: true,
        chord: "Cadd11",
        instrument: "guitar",
        onInstrumentChange: () => {
        },
        onClose: () => {
        }
      })
    );
    assert(html.includes("Diagram niedost\u0119pny dla tego chwytu"), "Must display Polish fallback");
    assert(html.includes("<dialog"), "Must use native HTML5 dialog element");
    assert(html.includes("Gitara") && html.includes("Ukulele"), "Must render instrument switcher");
    assert(html.includes('aria-label="Zamknij"'), "Must render close button");
  });
  await runTest("Suite 7: ChordModal", "Instrument switch buttons reflect active instrument state", () => {
    const guitarHtml = renderToStaticMarkup(
      React2.createElement(ChordModal, {
        isOpen: true,
        chord: "C",
        instrument: "guitar",
        onInstrumentChange: () => {
        },
        onClose: () => {
        }
      })
    );
    assert(guitarHtml.includes('bg-amber-500 text-neutral-950 font-semibold shadow-sm">Gitara</button>'));
    const ukeHtml = renderToStaticMarkup(
      React2.createElement(ChordModal, {
        isOpen: true,
        chord: "C",
        instrument: "ukulele",
        onInstrumentChange: () => {
        },
        onClose: () => {
        }
      })
    );
    assert(ukeHtml.includes('bg-amber-500 text-neutral-950 font-semibold shadow-sm">Ukulele</button>'));
  });
  console.log("\n--- SUITE 8: Concurrency & Rapid Switching ---");
  await runTest("Suite 8: Concurrency", "Rapid concurrent queries (100 parallel requests) complete deterministically", async () => {
    const chords = ["C", "Am", "D/F#", "H", "B", "N.C.", "C9", "C11", "Em/G", "invalid"];
    const instruments = ["guitar", "ukulele"];
    const promises = [];
    for (let i = 0; i < 100; i++) {
      const c = chords[i % chords.length];
      const inst = instruments[i % 2];
      const pl = i % 3 !== 0;
      promises.push(lookupChordPositions(c, inst, pl));
    }
    const allResults = await Promise.all(promises);
    assert.strictEqual(allResults.length, 100);
    assert(allResults[0] !== null && allResults[0].length === 4);
    assert.strictEqual(allResults[5], null);
  });
  console.log("\n--- SUITE 9: Repository Songs Verification (-6..+6 Transpositions) ---");
  const songDir = "./songs";
  if (fs.existsSync(songDir)) {
    const songFiles = fs.readdirSync(songDir).filter((f) => f.endsWith(".txt"));
    for (const file of songFiles) {
      await runTest("Suite 9: Song Files", `All chords in "${file}" resolve across transpositions (-6..+6)`, async () => {
        const content = fs.readFileSync(path.join(songDir, file), "utf-8");
        const song = parseSong(content, file, path.join(songDir, file));
        assert(song.uniqueChords.length > 0, `No unique chords found in ${file}`);
        for (const chord of song.uniqueChords) {
          for (let semitones = -6; semitones <= 6; semitones++) {
            for (const pl of [true, false]) {
              const transposed = transposeChord(chord, semitones, pl);
              for (const inst of ["guitar", "ukulele"]) {
                const pos = await lookupChordPositions(transposed, inst, pl);
                assert(
                  pos !== null && pos.length > 0,
                  `Failed to resolve song chord ${transposed} (from ${chord} @ ${semitones > 0 ? "+" + semitones : semitones}, pl=${pl}) on ${inst}`
                );
              }
            }
          }
        }
      });
    }
  }
  console.log("\n================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`TEST RESULTS SUMMARY: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log("================================================================\n");
  if (failed > 0) {
    process.exit(1);
  }
}
main().catch((err) => {
  console.error("FATAL TEST ERROR:", err);
  process.exit(1);
});
