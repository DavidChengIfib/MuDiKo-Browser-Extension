// "Hochladen": send an AI Studio ZIP to the hub's waiting list.
import { parseTags } from '../lib/hub-client.js';
import { readAiStudioMetadata } from '../lib/zip-reader.js';
import { HUB_STATE_TEXT, checkHub, hub, onHubChange } from './hub.js';
import { $, el, formatBytes, log } from './util.js';

const PENDING_KEY = 'pendingZip';
const SENDER_KEY = 'submitterName';

const state = {
  knownTags: [],
  tagsLoadedFor: '',
  zipFile: null,
  zipNote: '',
  zipFromAiStudio: false,
  loadedCaptureAt: '',
  autofill: { name: '', description: '' },
  busy: false,
};

let showView = () => {};

export async function initUpload(options) {
  showView = options.showView;
  bindEvents();
  onHubChange(renderHub);
  const { [SENDER_KEY]: senderName } = await chrome.storage.local.get(SENDER_KEY);
  $('submitter-name').value = senderName || '';
  renderZip();
}

export function loadPendingCaptureOnStart() {
  return loadPendingCapture();
}

function renderHub() {
  const tone = { ok: 'ok', outdated: 'error', offline: 'error' }[hub.state] || '';
  $('upload-hub-dot').className = `dot ${tone}`;
  $('upload-hub-status').textContent = HUB_STATE_TEXT[hub.state];
  $('upload-hub-address').textContent = hub.url;
  $('upload-hub-hint').textContent = hub.message;
  $('upload-hub-hint').hidden = !hub.message;
  $('upload-hub-retry').hidden = !['offline', 'outdated'].includes(hub.state);
  if (hub.state === 'ok') loadTagSuggestions();
  renderZip();
  updateSubmitButton();
}

// --- ZIP selection ---------------------------------------------------------

async function selectZip(file, { fromAiStudio = false } = {}) {
  if (!file || state.busy) return;
  hideError();
  if (!/\.zip$/i.test(file.name)) {
    showError('Bitte nur eine .zip-Datei auswählen.');
    return;
  }
  if (hub.maxUploadBytes && file.size > hub.maxUploadBytes) {
    showError(`Die ZIP-Datei darf höchstens ${formatBytes(hub.maxUploadBytes)} groß sein.`);
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
  const limit = hub.maxUploadBytes ? ` · max. ${formatBytes(hub.maxUploadBytes)}` : '';
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
  showView('upload');
  await selectZip(new File([blob], pending.name, { type: 'application/zip' }), { fromAiStudio: true });
  log('panel', `ZIP aus AI Studio ins Formular geladen: ${pending.name}`);
}

// --- Tags ------------------------------------------------------------------

async function loadTagSuggestions() {
  if (state.tagsLoadedFor === hub.url) return;
  state.tagsLoadedFor = hub.url;
  try {
    const apps = await hub.client.listApps();
    state.knownTags = [...new Set(apps.flatMap((app) => app.tags || []))].sort((a, b) => a.localeCompare(b, 'de'));
  } catch {
    state.knownTags = [];
    state.tagsLoadedFor = '';
  }
  renderTagChips();
}

function renderTagChips() {
  const selected = new Set(parseTags($('app-tags').value).map((tag) => tag.toLowerCase()));
  $('tag-suggestions').replaceChildren(...state.knownTags.map((tag) => el('button', {
    type: 'button',
    className: selected.has(tag.toLowerCase()) ? 'chip selected' : 'chip',
    onclick: () => toggleTag(tag),
  }, tag)));
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
  if (hub.state !== 'ok') {
    showError('Der Hub ist gerade nicht erreichbar.');
    return;
  }

  hideError();
  $('result').hidden = true;
  setBusy(true);
  try {
    const submission = await hub.client.submitProject({
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
  $('result-facts').replaceChildren(...facts.map((fact) => el('li', { className: fact.warn ? 'warn' : '' }, fact.text)));
  $('result-link').href = hub.client.submissionsUrl;
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
  button.disabled = state.busy || !state.zipFile || hub.state !== 'ok';
  button.textContent = state.busy ? 'Wird gesendet …' : 'Zur Prüfung senden';
}

function showError(message) {
  $('form-error').textContent = message;
  $('form-error').hidden = false;
}

function hideError() {
  $('form-error').hidden = true;
}

function bindEvents() {
  $('upload-hub-retry').addEventListener('click', () => checkHub());
  $('upload-hub-settings').addEventListener('click', () => showView('settings'));
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

  chrome.storage.session.onChanged.addListener((changes) => {
    if (changes[PENDING_KEY]?.newValue) loadPendingCapture();
  });
}
