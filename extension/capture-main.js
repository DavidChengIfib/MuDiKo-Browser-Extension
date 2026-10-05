// Runs in the AI Studio page itself (MAIN world). AI Studio builds the export ZIP in the
// browser and downloads it through a blob: URL. We keep a reference to every ZIP blob so
// the extension can read it after the download finished, even if the page revoked the URL.
// Nothing leaves the page here; capture-bridge.js decides what to hand to the extension.
(() => {
  const TAG = 'mudiko-zip-capture';
  if (window[`__${TAG}`]) return;
  Object.defineProperty(window, `__${TAG}`, { value: true });

  const post = (data) => window.postMessage({ source: TAG, ...data }, '*');

  const isZip = async (blob) => {
    if (/zip/i.test(blob.type)) return true;
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  };

  const originalCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = function createObjectURL(object) {
    const url = originalCreateObjectURL.call(this, object);
    try {
      if (object instanceof Blob && object.size >= 22) {
        isZip(object).then((zip) => zip && post({ kind: 'zip-blob', url, blob: object })).catch(() => {});
      }
    } catch {
      // Never break the page.
    }
    return url;
  };

  // Only for diagnostics: if AI Studio ever switches to a save dialog, no download event fires.
  if (typeof window.showSaveFilePicker === 'function') {
    const originalShowSaveFilePicker = window.showSaveFilePicker;
    window.showSaveFilePicker = function showSaveFilePicker(options) {
      post({ kind: 'save-picker', suggestedName: String(options?.suggestedName || '') });
      return originalShowSaveFilePicker.apply(this, arguments);
    };
  }
})();
