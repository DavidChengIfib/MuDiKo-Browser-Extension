import {
  DEFAULT_HUB_URL,
  createHubClient,
  normalizeHubUrl,
  parseTags,
} from './lib/hub-client.js';
import { readAiStudioMetadata } from './lib/zip-reader.js';

const PENDING_KEY = 'pendingZip';
const LOG_KEY = 'diagnostics';
const SENDER_KEY = 'submitterName';

const OUTDATED_HUB_HINT = 'Dieser Hub hat noch keine Warteliste. Bitte den Hub aktualisieren.';

const SOURCE_LABELS = { download: 'Download', 'ai-studio': 'AI Studio', hub: 'Hub', upload: 'Upload', panel: 'Seitenleiste' };

const $ = (id) => document.getElementById(id);

const state = {
  hubUrl: DEFAULT_HUB_URL,
  hub: createHubClient(DEFAULT_HUB_URL),
  hubReady: false,
  maxUploadBytes: null,
  knownTags: [],
  tagsLoadedFor: '',
  zipFile: null,
  zipNote: '',
  zipFromAiStudio: false,
  loadedCaptureAt: '',
  autofill: { name: '', description: '' },
  busy: false,
  checkRun: 0,
  lastHubLog: '',
  diagnostics: [],
};

function log(source, message) {
  chrome.runtime.sendMessage({ type: 'mudiko:log', source, message }).catch(() => {});
}

// --- Hub connection -------------------------------------------------------

function setHub(url) {
  state.hubUrl = url;
  state.hub = createHubClient(url);
  state.hubReady = false;
  $('hub-address').textContent = url;
}

function renderHub({ tone, text, hint = '' }) {
  $('hub-dot').className = `dot ${tone}`;
  $('hub-status').textContent = text;
  $('hub-hint').textContent = hint;
  $('hub-hint').hidden = !hint;
  $('hub-actions').hidden = tone === 'ok' || tone === '';
}

async function checkHub({ quiet = false } = {}) {
  const run = ++state.checkRun;
  if (!quiet) renderHub({ tone: '', text: 'Verbinde …' });
  try {
    const status = await state.hub.getStatus();
    if (run !== state.checkRun) return;
    state.maxUploadBytes = status.maxUploadBytes ?? null;
    state.hubReady = Boolean(status.submissionsEnabled);
    loadTagSuggestions();
    if (state.hubReady) {
      renderHub({ tone: 'ok', text: 'Mit dem Hub verbunden' });
      logHubOnce('Hub erreichbar, die Warteliste ist bereit.');
    } else {
      renderHub({ tone: 'error', text: 'Hub zu alt', hint: OUTDATED_HUB_HINT });
      logHubOnce('Hub erreichbar, hat aber noch keine Warteliste.');
    }
  } catch (error) {
    if (run !== state.checkRun) return;
    state.hubReady = false;
    renderHub({ tone: 'error', text: 'Hub nicht erreichbar', hint: error.message });
    logHubOnce(`Hub nicht erreichbar: ${error.message}`);
  }
  renderZip();
  updateSubmitButton();
}

function logHubOnce(message) {
  if (state.lastHubLog === message) return;
  state.lastHubLog = message;
  log('hub', message);
}

async function saveHubUrl(event) {
  event.preventDefault();
  const errorBox = $('hub-form-error');
  errorBox.hidden = true;
  let url;
  try {
    url = normalizeHubUrl($('hub-url').value);
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    return;
  }
  // Called straight from the submit gesture; Chrome only asks for origins not granted yet.
  const granted = await chrome.permissions.request({ origins: [`${url}/*`] }).catch(() => false);
  if (!granted) {
    errorBox.textContent = 'Ohne diese Erlaubnis kann die Extension den Hub nicht erreichen.';
    errorBox.hidden = false;
    return;
  }
  await chrome.storage.local.set({ hubUrl: url });
  setHub(url);
  toggleHubForm(false);
  checkHub();
}

function toggleHubForm(open) {
  $('hub-form').hidden = !open;
  $('hub-edit').hidden = open;
  $('hub-form-error').hidden = true;
  if (open) {
    $('hub-url').value = state.hubUrl;
    $('hub-url').focus();
  }
}

// --- ZIP selection ---------------------------------------------------------

async function selectZip(file, { fromAiStudio = false } = {}) {
  if (!file || state.busy) return;
  hideError();
  if (!/\.zip$/i.test(file.name)) {
    showError('Bitte nur eine .zip-Datei auswählen.');
    return;
  }
  if (state.maxUploadBytes && file.size > state.maxUploadBytes) {
    showError(`Die ZIP-Datei darf höchstens ${formatBytes(state.maxUploadBytes)} groß sein.`);
    return;
  }

  state.zipFile = file;
  state.zipFromAiStudio = fromAiStudio;
  $('result').hidden = true;
  state.zipNote = fromAiStudio ? 'Automatisch aus AI Studio übernommen' : '';
  if (!fromAiStudio) chrome.storage.session.remove(PENDING_KEY).catch(() => {});
  renderZip();
  updateSubmitButton();

  let metadata = null;
  try {
    metadata = await readAiStudioMetadata(file);
  } catch (error) {
    if (state.zipFile === file) showError(`${error.message} Der Hub wird sie vermutlich ablehnen.`);
  }
  if (state.zipFile !== file) return;
  applyMetadata(metadata);
  state.zipNote = [
    state.zipNote,
    metadata ? 'Name und Beschreibung aus metadata.json' : 'Keine metadata.json gefunden, bitte Namen selbst eintragen',
  ].filter(Boolean).join(' · ');
  renderZip();
}

// Fill name/description, but never overwrite what the user typed themselves.
function applyMetadata(metadata) {
  for (const [key, input] of [['name', $('app-name')], ['description', $('app-description')]]) {
    if (input.value.trim() === '' || input.value === state.autofill[key]) {
      input.value = metadata?.[key] || '';
      state.autofill[key] = input.value;
    }
  }
}

function renderZip() {
  const file = state.zipFile;
  const limit = state.maxUploadBytes ? ` · max. ${formatBytes(state.maxUploadBytes)}` : '';
  $('dropzone').classList.toggle('filled', Boolean(file));
  $('drop-title').textContent = file ? file.name : 'ZIP hier ablegen';
  $('drop-hint').textContent = file ? `${formatBytes(file.size)} · zum Ändern klicken` : `oder klicken und auswählen${limit}`;
  $('zip-source').textContent = state.zipNote;
  $('zip-source').hidden = !file || !state.zipNote;
}

async function loadPendingCapture() {
  if (state.busy) return;
  const { [PENDING_KEY]: pending } = await chrome.storage.session.get(PENDING_KEY);
  if (!pending || pending.capturedAt === state.loadedCaptureAt) return;
  state.loadedCaptureAt = pending.capturedAt;
  const blob = await (await fetch(pending.dataUrl)).blob();
  await selectZip(new File([blob], pending.name, { type: 'application/zip' }), { fromAiStudio: true });
  log('panel', `ZIP aus AI Studio ins Formular geladen: ${pending.name}`);
}

// --- Tags ------------------------------------------------------------------

async function loadTagSuggestions() {
  if (state.tagsLoadedFor === state.hubUrl) return;
  state.tagsLoadedFor = state.hubUrl;
  try {
    const apps = await state.hub.listApps();
    state.knownTags = [...new Set(apps.flatMap((app) => app.tags || []))].sort((a, b) => a.localeCompare(b, 'de'));
  } catch {
    state.knownTags = [];
    state.tagsLoadedFor = '';
  }
  renderTagChips();
}

function renderTagChips() {
  const selected = new Set(parseTags($('app-tags').value).map((tag) => tag.toLowerCase()));
  $('tag-suggestions').replaceChildren(...state.knownTags.map((tag) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = selected.has(tag.toLowerCase()) ? 'chip selected' : 'chip';
    chip.textContent = tag;
    chip.addEventListener('click', () => toggleTag(tag));
    return chip;
  }));
}

function toggleTag(tag) {
  const tags = parseTags($('app-tags').value);
  const index = tags.findIndex((entry) => entry.toLowerCase() === tag.toLowerCase());
  if (index >= 0) tags.splice(index, 1);
  else tags.push(tag);
  $('app-tags').value = tags.join(', ');
  renderTagChips();
}

// --- Submission ------------------------------------------------------------

async function submit(event) {
  event.preventDefault();
  const name = $('app-name').value.trim();
  if (!state.zipFile) {
    showError('Bitte zuerst eine ZIP-Datei auswählen.');
    return;
  }
  if (!name) {
    showError('Bitte einen App-Namen eintragen.');
    $('app-name').focus();
    return;
  }
  if (!state.hubReady) {
    showError('Der Hub ist gerade nicht erreichbar.');
    return;
  }

  hideError();
  $('result').hidden = true;
  setBusy(true);
  try {
    const submission = await state.hub.submitProject({
      name,
      description: $('app-description').value.trim(),
      tags: parseTags($('app-tags').value),
      zipFile: state.zipFile,
      submitterName: $('submitter-name').value.trim(),
    });
    log('upload', `In der Warteliste: "${submission.name}" (${formatBytes(state.zipFile.size)}), ${(submission.review?.warnings || []).length} Hinweise.`);
    if (state.zipFromAiStudio) chrome.storage.session.remove(PENDING_KEY).catch(() => {});
    showResult(submission);
    resetForm();
  } catch (error) {
    showError(error.message);
    log('upload', `Einreichen abgelehnt (HTTP ${error.status}): ${error.message}`);
    if (error.status === 0) checkHub({ quiet: true });
  } finally {
    setBusy(false);
    loadPendingCapture();
  }
}

function showResult(submission) {
  const review = submission.review || {};
  const warnings = review.warnings || [];
  const facts = [
    review.compatible
      ? { text: `Erkannt: ${review.framework} · ${review.language}` }
      : { text: `Nicht deploybar: ${review.compatibilityError}`, warn: true },
    warnings.length
      ? { text: `Automatische Prüfung: ${warnings.length === 1 ? '1 Hinweis. Der Admin sieht ihn' : `${warnings.length} Hinweise. Der Admin sieht sie`} in der Warteliste.`, warn: true }
      : { text: 'Automatische Prüfung: keine Auffälligkeiten' },
  ];
  $('result-text').textContent = `„${submission.name}“ wartet jetzt auf die Prüfung durch einen Admin. Erst danach erscheint die App im Hub.`;
  $('result-facts').replaceChildren(...facts.map((fact) => {
    const item = document.createElement('li');
    item.textContent = fact.text;
    if (fact.warn) item.className = 'warn';
    return item;
  }));
  $('result-link').href = state.hub.submissionsUrl;
  $('result').hidden = false;
}

function resetForm() {
  state.zipFile = null;
  state.zipNote = '';
  state.zipFromAiStudio = false;
  state.autofill = { name: '', description: '' };
  $('app-name').value = '';
  $('app-description').value = '';
  $('app-tags').value = '';
  renderTagChips();
  renderZip();
  updateSubmitButton();
}

function setBusy(busy) {
  state.busy = busy;
  for (const id of ['app-name', 'app-description', 'app-tags', 'submitter-name']) $(id).disabled = busy;
  $('dropzone').setAttribute('aria-disabled', String(busy));
  updateSubmitButton();
}

function updateSubmitButton() {
  const button = $('submit-button');
  button.disabled = state.busy || !state.zipFile || !state.hubReady;
  button.textContent = state.busy ? 'Wird gesendet …' : 'Zur Prüfung senden';
}

function showError(message) {
  $('form-error').textContent = message;
  $('form-error').hidden = false;
}

function hideError() {
  $('form-error').hidden = true;
}

// --- Diagnostics -----------------------------------------------------------

async function renderDiagnostics() {
  const { [LOG_KEY]: entries = [] } = await chrome.storage.session.get(LOG_KEY);
  state.diagnostics = entries;
  const items = entries.slice().reverse().map((entry) => {
    const item = document.createElement('li');
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = `${formatTime(entry.at)} · ${SOURCE_LABELS[entry.source] || entry.source} · `;
    item.append(meta, entry.message);
    return item;
  });
  if (!items.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Noch keine Einträge.';
    items.push(empty);
  }
  $('diag-list').replaceChildren(...items);
}

async function copyDiagnostics() {
  const lines = [
    `MuDiKo Hub-Upload ${chrome.runtime.getManifest().version}`,
    `Browser: ${navigator.userAgent}`,
    `Hub: ${state.hubUrl}`,
    ...state.diagnostics.map((entry) => `${entry.at} [${entry.source}] ${entry.message}`),
  ];
  const button = $('diag-copy');
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    button.textContent = 'Kopiert ✓';
  } catch {
    button.textContent = 'Kopieren nicht möglich';
  }
  setTimeout(() => { button.textContent = 'Kopieren'; }, 2000);
}

// --- Helpers & wiring ------------------------------------------------------

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function bindEvents() {
  $('hub-edit').addEventListener('click', () => toggleHubForm(true));
  $('hub-cancel').addEventListener('click', () => toggleHubForm(false));
  $('hub-form').addEventListener('submit', saveHubUrl);
  $('hub-recheck').addEventListener('click', () => checkHub());
  $('submitter-name').addEventListener('change', (event) => {
    chrome.storage.local.set({ [SENDER_KEY]: event.target.value.trim() }).catch(() => {});
  });

  const dropzone = $('dropzone');
  const pickFile = () => { if (!state.busy) $('zip-input').click(); };
  dropzone.addEventListener('click', pickFile);
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pickFile();
    }
  });
  dropzone.addEventListener('dragenter', (event) => { event.preventDefault(); dropzone.classList.add('active'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('active'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('active');
    selectZip(event.dataTransfer.files?.[0]);
  });
  // Keep a file dropped next to the drop zone from replacing the panel.
  document.addEventListener('dragover', (event) => event.preventDefault());
  document.addEventListener('drop', (event) => event.preventDefault());
  $('zip-input').addEventListener('change', (event) => {
    selectZip(event.target.files?.[0]);
    event.target.value = '';
  });

  $('app-tags').addEventListener('input', renderTagChips);
  $('submit-form').addEventListener('submit', submit);
  $('diag-copy').addEventListener('click', copyDiagnostics);
  $('diag-clear').addEventListener('click', () => chrome.storage.session.remove(LOG_KEY));

  window.addEventListener('focus', () => { if (!state.busy) checkHub({ quiet: true }); });

  chrome.storage.session.onChanged.addListener((changes) => {
    if (changes[LOG_KEY]) renderDiagnostics();
    if (changes[PENDING_KEY]?.newValue) loadPendingCapture();
  });
}

async function init() {
  bindEvents();
  const { hubUrl, [SENDER_KEY]: senderName } = await chrome.storage.local.get(['hubUrl', SENDER_KEY]);
  setHub(hubUrl || DEFAULT_HUB_URL);
  $('submitter-name').value = senderName || '';
  renderZip();
  await checkHub();
  await Promise.all([loadPendingCapture(), renderDiagnostics()]);
}

init();
