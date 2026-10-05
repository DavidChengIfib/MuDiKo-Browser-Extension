// Isolated content script on AI Studio: holds the ZIP blobs reported by capture-main.js
// and hands one over when background.js sees the matching download complete.
(() => {
  const TAG = 'mudiko-zip-capture';
  const MAX_BLOBS = 10;
  const zipBlobs = new Map();
  const isTopFrame = window === window.top;

  const log = (message) => {
    chrome.runtime.sendMessage({ type: 'mudiko:log', source: 'ai-studio', message }).catch(() => {});
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== TAG) return;
    const { kind } = event.data;
    if (kind === 'zip-blob' && typeof event.data.blob?.arrayBuffer === 'function') {
      zipBlobs.set(event.data.url, event.data.blob);
      if (zipBlobs.size > MAX_BLOBS) zipBlobs.delete(zipBlobs.keys().next().value);
      log(`ZIP im AI-Studio-Tab erzeugt (${Math.ceil(event.data.blob.size / 1024)} KB).`);
    } else if (kind === 'save-picker') {
      log(`AI Studio hat einen Speichern-Dialog geöffnet (${event.data.suggestedName || 'ohne Namen'}). Diesen Weg kann die Extension nicht mitlesen.`);
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'mudiko:read-blob') {
      const blob = zipBlobs.get(message.url);
      if (!blob) return false;
      const reader = new FileReader();
      reader.onload = () => sendResponse({ dataUrl: reader.result, size: blob.size });
      reader.onerror = () => sendResponse({ error: 'Die ZIP konnte nicht gelesen werden.' });
      reader.readAsDataURL(blob);
      return true;
    }
    if (message?.type === 'mudiko:captured' && isTopFrame) {
      showToast(message.name);
    }
    return false;
  });

  if (isTopFrame) log('AI-Studio-Seite geladen, ZIP-Erkennung ist aktiv.');

  function showToast(fileName) {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      .toast { font: 14px/1.4 system-ui, sans-serif; color: #fff; background: #2b2b2b; border-radius: 14px;
        box-shadow: 0 8px 24px rgba(0,0,0,.35); padding: 14px 16px; max-width: 320px; display: grid; gap: 8px;
        border-top: 4px solid #87BDCF; }
      .file { opacity: .75; word-break: break-all; }
      .row { display: flex; gap: 8px; }
      button { font: inherit; font-weight: 600; border: 0; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
      .primary { background: #87BDCF; color: #222; }
      .secondary { background: #575757; color: #fff; }`;

    const toast = document.createElement('div');
    toast.className = 'toast';
    const title = document.createElement('strong');
    title.textContent = 'MuDiKo: ZIP übernommen';
    const file = document.createElement('span');
    file.className = 'file';
    file.textContent = fileName;
    const row = document.createElement('div');
    row.className = 'row';
    const open = document.createElement('button');
    open.className = 'primary';
    open.textContent = 'Seitenleiste öffnen';
    const close = document.createElement('button');
    close.className = 'secondary';
    close.textContent = 'Schließen';
    row.append(open, close);
    toast.append(title, file, row);
    shadow.append(style, toast);
    document.documentElement.append(host);

    const remove = () => host.remove();
    const timer = setTimeout(remove, 15000);
    close.addEventListener('click', remove);
    open.addEventListener('click', async () => {
      const reply = await chrome.runtime.sendMessage({ type: 'mudiko:open-panel' }).catch(() => null);
      if (reply?.opened) {
        clearTimeout(timer);
        remove();
      } else {
        file.textContent = 'Bitte oben rechts auf das MuDiKo-Symbol klicken.';
      }
    });
  }
})();
