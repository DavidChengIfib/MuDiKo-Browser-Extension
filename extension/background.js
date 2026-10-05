import {
  AI_STUDIO_TAB_PATTERNS,
  describeDownload,
  downloadFileName,
  isAiStudioZipDownload,
  isZipDownload,
} from './lib/downloads.js';

const PENDING_KEY = 'pendingZip';
const LOG_KEY = 'diagnostics';
const LOG_LIMIT = 80;
// chrome.storage.session holds 10 MB and the ZIP is stored as base64 (+33 %).
const MAX_CAPTURE_BYTES = 7 * 1024 * 1024;

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.action.setBadgeBackgroundColor({ color: '#87BDCF' }).catch(() => {});

let logQueue = Promise.resolve();

function log(source, message) {
  logQueue = logQueue
    .then(async () => {
      const { [LOG_KEY]: entries = [] } = await chrome.storage.session.get(LOG_KEY);
      entries.push({ at: new Date().toISOString(), source, message });
      await chrome.storage.session.set({ [LOG_KEY]: entries.slice(-LOG_LIMIT) });
    })
    .catch(() => {});
  return logQueue;
}

chrome.storage.session.onChanged.addListener((changes) => {
  if (PENDING_KEY in changes) {
    chrome.action.setBadgeText({ text: changes[PENDING_KEY].newValue ? '1' : '' }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'mudiko:log') {
    log(message.source || 'unbekannt', String(message.message || ''));
    return false;
  }
  if (message?.type === 'mudiko:open-panel' && sender.tab) {
    // Must run synchronously in the handler, otherwise Chrome drops the user gesture.
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).then(
      () => sendResponse({ opened: true }),
      (error) => {
        log('ai-studio', `Seitenleiste ließ sich nicht automatisch öffnen: ${error.message}`);
        sendResponse({ opened: false });
      },
    );
    return true;
  }
  return false;
});

chrome.downloads.onChanged.addListener(async (delta) => {
  if (delta.state?.current !== 'complete') return;
  const [item] = await chrome.downloads.search({ id: delta.id });
  if (!item || !isZipDownload(item)) return;
  if (!isAiStudioZipDownload(item)) {
    log('download', `ZIP ohne AI-Studio-Bezug ignoriert: ${describeDownload(item)}`);
    return;
  }

  log('download', `ZIP aus AI Studio heruntergeladen: ${describeDownload(item)}`);
  try {
    const capture = await readDownload(item);
    if (capture.size > MAX_CAPTURE_BYTES) {
      throw new Error(`Die ZIP ist mit ${formatBytes(capture.size)} zu groß für die automatische Übernahme. Bitte von Hand in die Seitenleiste ziehen.`);
    }
    const name = downloadFileName(item);
    await chrome.storage.session.set({
      [PENDING_KEY]: { name, size: capture.size, dataUrl: capture.dataUrl, capturedAt: new Date().toISOString() },
    });
    log('download', `ZIP automatisch übernommen (${formatBytes(capture.size)}, Weg: ${capture.via}).`);
    if (capture.tabId) {
      chrome.tabs.sendMessage(capture.tabId, { type: 'mudiko:captured', name }).catch(() => {});
    }
  } catch (error) {
    log('download', `ZIP-Inhalt konnte nicht übernommen werden: ${error.message}`);
  }
});

async function readDownload(item) {
  const url = item.finalUrl || item.url;
  if (url.startsWith('blob:')) return readBlobFromAiStudioTabs(url);

  // data: URLs and normal https downloads can be fetched again from here.
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`Erneuter Abruf fehlgeschlagen (HTTP ${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    size: bytes.byteLength,
    dataUrl: `data:application/zip;base64,${bytesToBase64(bytes)}`,
    via: url.startsWith('data:') ? 'data-URL' : 'erneuter Abruf',
  };
}

// Blob URLs only live inside the page, so the content script hands over the captured ZIP.
async function readBlobFromAiStudioTabs(blobUrl) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tabs = await chrome.tabs.query({ url: AI_STUDIO_TAB_PATTERNS });
    for (const tab of tabs) {
      const reply = await chrome.tabs.sendMessage(tab.id, { type: 'mudiko:read-blob', url: blobUrl }).catch(() => null);
      if (reply?.dataUrl) return { size: reply.size, dataUrl: reply.dataUrl, via: 'AI-Studio-Tab', tabId: tab.id };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Die ZIP wurde im AI-Studio-Tab nicht gefunden (Seite vor der Installation geladen? Dann AI Studio neu laden).');
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
