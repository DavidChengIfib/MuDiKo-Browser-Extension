export const AI_STUDIO_ORIGINS = ['https://aistudio.google.com', 'https://ai.studio'];
export const AI_STUDIO_TAB_PATTERNS = AI_STUDIO_ORIGINS.map((origin) => `${origin}/*`);

export function isAiStudioUrl(value) {
  if (!value) return false;
  const url = value.startsWith('blob:') ? value.slice('blob:'.length) : value;
  try {
    return AI_STUDIO_ORIGINS.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

export function isZipDownload(item) {
  return /zip/i.test(item.mime || '') || /\.zip$/i.test(item.filename || '');
}

// The ZIP may be served from another Google host; the referrer still points to AI Studio.
export function isAiStudioZipDownload(item) {
  return isZipDownload(item) && [item.url, item.finalUrl, item.referrer].some(isAiStudioUrl);
}

export function downloadFileName(item) {
  const base = String(item.filename || '').split(/[\\/]/).pop() || 'ai-studio-projekt.zip';
  return /\.zip$/i.test(base) ? base : `${base}.zip`;
}

// Scheme and host only: download URLs can carry tokens that do not belong in the log.
export function describeDownload(item) {
  const url = item.finalUrl || item.url || '';
  let source = 'unbekannt';
  if (url.startsWith('blob:')) source = `blob von ${safeOrigin(url.slice('blob:'.length))}`;
  else if (url.startsWith('data:')) source = 'data-URL';
  else if (url) source = safeOrigin(url);
  return `${downloadFileName(item)} · Quelle: ${source} · Typ: ${item.mime || 'unbekannt'}`;
}

function safeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return 'unbekannt';
  }
}
