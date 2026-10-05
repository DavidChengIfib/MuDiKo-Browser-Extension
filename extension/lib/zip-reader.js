// Minimal ZIP reader: just enough to pull metadata.json out of an AI Studio export.
// AI Studio stores files uncompressed; deflate is supported for re-zipped projects.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_SIZE = 22;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;

// Same limits as the hub (deployment_job_service.create_job).
const NAME_LIMIT = 100;
const DESCRIPTION_LIMIT = 1000;

export function listZipEntries(buffer) {
  const view = new DataView(buffer);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) throw new Error('Die Datei ist kein gültiges ZIP-Archiv.');

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (offset + CENTRAL_HEADER_SIZE > view.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new Error('Das Inhaltsverzeichnis der ZIP-Datei ist beschädigt.');
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    entries.push({
      name: decoder.decode(new Uint8Array(buffer, offset + CENTRAL_HEADER_SIZE, nameLength)),
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      size: view.getUint32(offset + 24, true),
      localOffset: view.getUint32(offset + 42, true),
    });
    offset += CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
  }
  return entries;
}

export async function readZipEntry(buffer, entry) {
  const view = new DataView(buffer);
  const start = entry.localOffset;
  if (start + LOCAL_HEADER_SIZE > view.byteLength || view.getUint32(start, true) !== LOCAL_SIGNATURE) {
    throw new Error(`Der Eintrag ${entry.name} ist beschädigt.`);
  }
  const dataStart = start + LOCAL_HEADER_SIZE + view.getUint16(start + 26, true) + view.getUint16(start + 28, true);
  if (dataStart + entry.compressedSize > view.byteLength) {
    throw new Error(`Der Eintrag ${entry.name} ist unvollständig.`);
  }
  const data = new Uint8Array(buffer, dataStart, entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRaw(data);
  throw new Error(`Die Kompression von ${entry.name} wird nicht unterstützt.`);
}

// Returns { name, description } from metadata.json, or null if the ZIP has none.
// Throws only when the file is not a readable ZIP at all.
export async function readAiStudioMetadata(blob) {
  const buffer = await blob.arrayBuffer();
  const candidates = listZipEntries(buffer)
    .filter((entry) => !entry.name.startsWith('__MACOSX/') && /(^|\/)metadata\.json$/.test(entry.name))
    // Root level, or inside a single top-level folder when the project was re-zipped.
    .filter((entry) => entry.name.split('/').length <= 2)
    .sort((a, b) => a.name.split('/').length - b.name.split('/').length);
  if (!candidates.length) return null;

  try {
    const text = new TextDecoder().decode(await readZipEntry(buffer, candidates[0]));
    const data = JSON.parse(text);
    const metadata = {
      name: cleanText(data?.name, NAME_LIMIT),
      description: cleanText(data?.description, DESCRIPTION_LIMIT),
    };
    return metadata.name || metadata.description ? metadata : null;
  } catch {
    return null;
  }
}

function findEndOfCentralDirectory(view) {
  const last = view.byteLength - EOCD_SIZE;
  const first = Math.max(0, last - 0xffff);
  for (let offset = last; offset >= first; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

async function inflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function cleanText(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}
