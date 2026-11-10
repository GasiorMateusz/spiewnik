import fs from 'node:fs';
import zlib from 'node:zlib';

function createPng(width, height) {
  // RGBA pixels
  const rowBytes = width * 4 + 1; // +1 filter byte per row
  const buffer = Buffer.alloc(rowBytes * height, 0);

  // Background color #0f172a (15, 23, 42)
  // Icon color #f59e0b (245, 158, 11)
  const bgR = 15, bgG = 23, bgB = 42;
  const fgR = 245, fgG = 158, fgB = 11;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    buffer[rowOffset] = 0; // Filter type None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      
      // Normalized coordinates [0..1]
      const nx = x / width;
      const ny = y / height;

      // Draw stylized music note:
      // Note 1 head: center (0.28, 0.72), radius 0.12
      // Note 2 head: center (0.72, 0.64), radius 0.12
      // Stem 1: x in [0.36, 0.44], y in [0.22, 0.72]
      // Stem 2: x in [0.80, 0.88], y in [0.14, 0.64]
      // Beam: y in [0.14 + (x - 0.36) * (-0.08 / 0.52) - 0.08, 0.14 + (x - 0.36) * (-0.08 / 0.52)], x in [0.36, 0.88]
      const d1 = Math.hypot(nx - 0.28, ny - 0.72);
      const d2 = Math.hypot(nx - 0.72, ny - 0.64);
      const inHead1 = d1 < 0.13;
      const inHead2 = d2 < 0.13;
      const inStem1 = nx >= 0.37 && nx <= 0.43 && ny >= 0.22 && ny <= 0.72;
      const inStem2 = nx >= 0.81 && nx <= 0.87 && ny >= 0.14 && ny <= 0.64;
      const beamY = 0.22 + (nx - 0.37) * ((0.14 - 0.22) / (0.87 - 0.37));
      const inBeam = nx >= 0.37 && nx <= 0.87 && ny >= beamY - 0.08 && ny <= beamY;

      if (inHead1 || inHead2 || inStem1 || inStem2 || inBeam) {
        buffer[pxOffset] = fgR;
        buffer[pxOffset + 1] = fgG;
        buffer[pxOffset + 2] = fgB;
        buffer[pxOffset + 3] = 255;
      } else {
        buffer[pxOffset] = bgR;
        buffer[pxOffset + 1] = bgG;
        buffer[pxOffset + 2] = bgB;
        buffer[pxOffset + 3] = 255;
      }
    }
  }

  const compressed = zlib.deflateSync(buffer);

  // PNG structure
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    const crcVal = crc32(Buffer.concat([typeBuf, data]));
    crc.writeUInt32BE(crcVal, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  // Precomputed CRC table
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

fs.writeFileSync('public/pwa-192x192.png', createPng(192, 192));
fs.writeFileSync('public/pwa-512x512.png', createPng(512, 512));
fs.writeFileSync('public/apple-touch-icon.png', createPng(180, 180));
console.log('Successfully generated PWA PNG icons!');
