// src/lib/chordNotation.ts
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
  const positions = [];
  const regex = /\S+/g;
  let match;
  while ((match = regex.exec(chordLine)) !== null) {
    positions.push({
      chord: match[0],
      startIndex: match.index,
      endIndex: regex.lastIndex
    });
  }
  return positions;
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
function loadAllSongs() {
  const songFiles = import.meta.glob("/songs/**/*.txt", {
    eager: true,
    query: "?raw",
    import: "default"
  });
  const parsedSongs = [];
  for (const [path, rawContent] of Object.entries(songFiles)) {
    const filename = path.split("/").pop()?.replace(/\.txt$/, "") || "song";
    parsedSongs.push(parseSong(String(rawContent), filename, path));
  }
  return parsedSongs.sort((a, b) => a.title.localeCompare(b.title, "pl"));
}

// <stdin>
console.log("Songs:", loadAllSongs().length);
