const UTF8_ENCODER = new TextEncoder();
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let idx = 0; idx < 256; idx += 1) {
    let value = idx;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[idx] = value >>> 0;
  }
  return table;
})();

function sanitizeFilePart(raw, fallback = "lesson") {
  const value = String(raw || "").trim();
  const safe = value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return safe || fallback;
}

function uint16le(value) {
  const buffer = new Uint8Array(2);
  const view = new DataView(buffer.buffer);
  view.setUint16(0, Number(value) >>> 0, true);
  return buffer;
}

function uint32le(value) {
  const buffer = new Uint8Array(4);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, Number(value) >>> 0, true);
  return buffer;
}

function concatUint8Arrays(parts) {
  const safeParts = Array.isArray(parts) ? parts.filter((part) => part instanceof Uint8Array) : [];
  const total = safeParts.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  safeParts.forEach((part) => {
    merged.set(part, offset);
    offset += part.byteLength;
  });
  return merged;
}

function crc32OfBytes(bytes) {
  let crc = 0xFFFFFFFF;
  for (let idx = 0; idx < bytes.length; idx += 1) {
    const code = bytes[idx];
    crc = CRC32_TABLE[(crc ^ code) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date();
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  const month = Math.max(1, Math.min(12, date.getMonth() + 1));
  const day = Math.max(1, Math.min(31, date.getDate()));
  const hour = Math.max(0, Math.min(23, date.getHours()));
  const minute = Math.max(0, Math.min(59, date.getMinutes()));
  const second = Math.max(0, Math.min(59, date.getSeconds()));

  const dosTime = ((hour & 0x1F) << 11) | ((minute & 0x3F) << 5) | (Math.floor(second / 2) & 0x1F);
  const dosDate = (((year - 1980) & 0x7F) << 9) | ((month & 0x0F) << 5) | (day & 0x1F);
  return { dosTime, dosDate };
}

function sanitizeZipPath(pathText) {
  const normalized = normalizeLocalRelativePath(pathText);
  return normalized.replace(/[^a-zA-Z0-9._/-]+/g, "_");
}

function normalizeZipEntryInput(entries) {
  const output = [];
  const seen = new Set();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const path = sanitizeZipPath(entry.path);
    if (!path || seen.has(path)) {
      return;
    }
    const bytesRaw = entry.bytes;
    if (!(bytesRaw instanceof Uint8Array)) {
      return;
    }
    seen.add(path);
    output.push({
      path,
      bytes: bytesRaw,
      lastModified: Number(entry.lastModified || Date.now()),
    });
  });
  return output;
}

function buildZipBlob(entries) {
  const safeEntries = normalizeZipEntryInput(entries);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  safeEntries.forEach((entry) => {
    const pathBytes = UTF8_ENCODER.encode(entry.path);
    const contentBytes = entry.bytes;
    const crc = crc32OfBytes(contentBytes);
    const { dosTime, dosDate } = dosDateTime(new Date(entry.lastModified));

    const localHeader = concatUint8Arrays([
      uint32le(0x04034B50),
      uint16le(20),
      uint16le(0x0800),
      uint16le(0),
      uint16le(dosTime),
      uint16le(dosDate),
      uint32le(crc),
      uint32le(contentBytes.byteLength),
      uint32le(contentBytes.byteLength),
      uint16le(pathBytes.byteLength),
      uint16le(0),
      pathBytes,
      contentBytes,
    ]);

    const centralHeader = concatUint8Arrays([
      uint32le(0x02014B50),
      uint16le(0x0314),
      uint16le(20),
      uint16le(0x0800),
      uint16le(0),
      uint16le(dosTime),
      uint16le(dosDate),
      uint32le(crc),
      uint32le(contentBytes.byteLength),
      uint32le(contentBytes.byteLength),
      uint16le(pathBytes.byteLength),
      uint16le(0),
      uint16le(0),
      uint16le(0),
      uint16le(0),
      uint32le(0),
      uint32le(offset),
      pathBytes,
    ]);

    localParts.push(localHeader);
    centralParts.push(centralHeader);
    offset += localHeader.byteLength;
  });

  const centralDirectory = concatUint8Arrays(centralParts);
  const localSection = concatUint8Arrays(localParts);
  const eocd = concatUint8Arrays([
    uint32le(0x06054B50),
    uint16le(0),
    uint16le(0),
    uint16le(safeEntries.length),
    uint16le(safeEntries.length),
    uint32le(centralDirectory.byteLength),
    uint32le(localSection.byteLength),
    uint16le(0),
  ]);

  return new Blob([localSection, centralDirectory, eocd], { type: "application/zip" });
}

function triggerBlobDownload(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}
