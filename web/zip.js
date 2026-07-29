// Minimal zero-dependency ZIP writer (store/no-compression method only).
// Enough to bundle a handful of PNGs into a single downloadable .zip.

function crc32(bytes) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0xf) << 5) |
    (date.getDate() & 0x1f);
  return { time, dosDate };
}

function writeUint16(arr, offset, val) {
  arr[offset] = val & 0xff;
  arr[offset + 1] = (val >>> 8) & 0xff;
}
function writeUint32(arr, offset, val) {
  arr[offset] = val & 0xff;
  arr[offset + 1] = (val >>> 8) & 0xff;
  arr[offset + 2] = (val >>> 16) & 0xff;
  arr[offset + 3] = (val >>> 24) & 0xff;
}

// files: [{ name: string, data: Uint8Array }]
async function createZip(files) {
  const encoder = new TextEncoder();
  const now = new Date();
  const { time, dosDate } = dosDateTime(now);

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = file.data;
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 6, 0);
    writeUint16(localHeader, 8, 0); // store, no compression
    writeUint16(localHeader, 10, time);
    writeUint16(localHeader, 12, dosDate);
    writeUint32(localHeader, 14, crc);
    writeUint32(localHeader, 18, data.length);
    writeUint32(localHeader, 22, data.length);
    writeUint16(localHeader, 26, nameBytes.length);
    writeUint16(localHeader, 28, 0);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 4, 20);
    writeUint16(centralHeader, 6, 20);
    writeUint16(centralHeader, 8, 0);
    writeUint16(centralHeader, 10, 0);
    writeUint16(centralHeader, 12, time);
    writeUint16(centralHeader, 14, dosDate);
    writeUint32(centralHeader, 16, crc);
    writeUint32(centralHeader, 20, data.length);
    writeUint32(centralHeader, 24, data.length);
    writeUint16(centralHeader, 28, nameBytes.length);
    writeUint16(centralHeader, 30, 0);
    writeUint16(centralHeader, 32, 0);
    writeUint16(centralHeader, 34, 0);
    writeUint16(centralHeader, 36, 0);
    writeUint32(centralHeader, 38, 0);
    writeUint32(centralHeader, 42, offset);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const centralOffset = offset;

  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 4, 0);
  writeUint16(end, 6, 0);
  writeUint16(end, 8, files.length);
  writeUint16(end, 10, files.length);
  writeUint32(end, 12, centralSize);
  writeUint32(end, 16, centralOffset);
  writeUint16(end, 20, 0);

  const allParts = [...localParts, ...centralParts, end];
  const totalSize = allParts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(totalSize);
  let pos = 0;
  for (const part of allParts) {
    out.set(part, pos);
    pos += part.length;
  }
  return new Blob([out], { type: "application/zip" });
}
