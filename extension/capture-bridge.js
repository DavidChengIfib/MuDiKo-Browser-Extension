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
    globalThis.mudikoToast({
      title: 'MuDiKo: ZIP übernommen',
      text: fileName,
      actions: [
        {
          label: 'Seitenleiste öffnen',
          primary: true,
          async onClick(toast) {
            const reply = await chrome.runtime.sendMessage({ type: 'mudiko:open-panel' }).catch(() => null);
            if (reply?.opened) toast.close();
            else toast.setText('Bitte oben rechts auf das MuDiKo-Symbol klicken.');
          },
        },
        { label: 'Schließen', onClick: (toast) => toast.close() },
      ],
    });
  }
})();
