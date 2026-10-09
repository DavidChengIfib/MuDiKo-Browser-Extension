// "Einstellungen": hub address and the diagnostics log for testing.
import { HUB_STATE_TEXT, changeHubUrl, checkHub, hub, onHubChange } from './hub.js';
import { $, el, flash } from './util.js';

const LOG_KEY = 'diagnostics';
const SOURCE_LABELS = { download: 'Download', 'ai-studio': 'AI Studio', hub: 'Hub', upload: 'Upload', panel: 'Seitenleiste', studio: 'AI-Studio-Helfer' };

let diagnostics = [];

export function initSettings() {
  onHubChange(renderHub);
  $('hub-form').addEventListener('submit', saveHubUrl);
  $('hub-recheck').addEventListener('click', () => checkHub());
  $('diag-copy').addEventListener('click', copyDiagnostics);
  $('diag-clear').addEventListener('click', () => chrome.storage.session.remove(LOG_KEY));
  chrome.storage.session.onChanged.addListener((changes) => {
    if (changes[LOG_KEY]) renderDiagnostics();
  });
  return renderDiagnostics();
}

function renderHub() {
  const tone = { ok: 'ok', outdated: 'error', offline: 'error' }[hub.state] || '';
  $('hub-dot').className = `dot ${tone}`;
  $('hub-status').textContent = HUB_STATE_TEXT[hub.state];
  $('hub-hint').textContent = hub.message;
  $('hub-hint').hidden = !hub.message;
  if (document.activeElement !== $('hub-url')) $('hub-url').value = hub.url;
}

async function saveHubUrl(event) {
  event.preventDefault();
  const errorBox = $('hub-form-error');
  errorBox.hidden = true;
  try {
    await changeHubUrl($('hub-url').value);
    flash($('hub-save'), 'Gespeichert ✓');
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  }
}

async function renderDiagnostics() {
  const { [LOG_KEY]: entries = [] } = await chrome.storage.session.get(LOG_KEY);
  diagnostics = entries;
  const items = entries.slice().reverse().map((entry) => el(
    'li', {},
    el('span', { className: 'meta' }, `${formatTime(entry.at)} · ${SOURCE_LABELS[entry.source] || entry.source} · `),
    entry.message,
  ));
  $('diag-list').replaceChildren(...(items.length ? items : [el('li', {}, 'Noch keine Einträge.')]));
}

async function copyDiagnostics() {
  const lines = [
    `MuDiKo für AI Studio ${chrome.runtime.getManifest().version}`,
    `Browser: ${navigator.userAgent}`,
    `Hub: ${hub.url}`,
    ...diagnostics.map((entry) => `${entry.at} [${entry.source}] ${entry.message}`),
  ];
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    flash($('diag-copy'), 'Kopiert ✓');
  } catch {
    flash($('diag-copy'), 'Kopieren nicht möglich');
  }
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
