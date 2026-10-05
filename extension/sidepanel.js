import {
  ACTIVE_JOB_STATUSES,
  DEFAULT_HUB_URL,
  SESSION_COOKIE,
  createHubClient,
  normalizeHubUrl,
  parseTags,
} from './lib/hub-client.js';
import { readAiStudioMetadata } from './lib/zip-reader.js';

const PENDING_KEY = 'pendingZip';
const LOG_KEY = 'diagnostics';
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_FAILURES = 20;

const LOGIN_HINT = 'Zum Hochladen brauchst du die Admin-Anmeldung des Hubs. Nach der Anmeldung aktualisiert sich diese Anzeige von selbst.';
const COOKIE_NOT_SENT_HINT = 'Im Browser liegt ein Login-Cookie, aber der Hub erkennt die Anmeldung nicht. '
  + 'Bist du im Hub-Tab angemeldet? Wenn ja, schickt der Browser das Cookie bei Anfragen der Extension nicht mit. '
  + 'Dann braucht der Hub eine kleine Anpassung. Bitte unten die Diagnose kopieren.';
const NOT_CONFIGURED_HINT = 'Die GitHub-Anmeldung ist auf diesem Hub nicht eingerichtet.';

const STEP_ICONS = { success: '✓', failed: '×', active: '●' };
const SOURCE_LABELS = { download: 'Download', 'ai-studio': 'AI Studio', login: 'Login', upload: 'Upload', panel: 'Seitenleiste' };

const $ = (id) => document.getElementById(id);

const state = {
  hubUrl: DEFAULT_HUB_URL,
  hub: createHubClient(DEFAULT_HUB_URL),
  session: null,
  maxUploadBytes: null,
  knownTags: [],
  tagsLoadedFor: '',
  zipFile: null,
  zipNote: '',
  zipFromAiStudio: false,
  loadedCaptureAt: '',
  autofill: { name: '', description: '' },
  job: null,
  busy: false,
  pollTimer: 0,
  pollFailures: 0,
  checkRun: 0,
  lastLoginLog: '',
  diagnostics: [],
};

function log(source, message) {
  chrome.runtime.sendMessage({ type: 'mudiko:log', source, message }).catch(() => {});
}

// --- Hub connection -------------------------------------------------------

function setHub(url) {
  state.hubUrl = url;
  state.hub = createHubClient(url);
  state.session = null;
  $('hub-address').textContent = url;
}

function renderHub({ tone, text, hint = '', showLogin = false }) {
  $('hub-dot').className = `dot ${tone}`;
  $('hub-status').textContent = text;
  $('hub-hint').textContent = hint;
  $('hub-hint').hidden = !hint;
  $('hub-login').hidden = !showLogin;
  $('hub-actions').hidden = tone === 'ok' || tone === '';
}

async function checkHub({ quiet = false } = {}) {
  const run = ++state.checkRun;
  if (!quiet) renderHub({ tone: '', text: 'Verbinde …' });
  try {
    const [session, status] = await Promise.all([
      state.hub.getSession(),
      state.hub.getStatus().catch(() => null),
    ]);
    if (run !== state.checkRun) return;
    state.session = session.authenticated ? session : null;
    state.maxUploadBytes = status?.maxUploadBytes ?? null;
    loadTagSuggestions();

    if (session.authenticated) {
      renderHub({ tone: 'ok', text: `Angemeldet als @${session.username}` });
      logLoginOnce(`Anmeldung erkannt (@${session.username}): Der Browser schickt das Login-Cookie bei Anfragen der Extension mit.`);
    } else if (session.configured === false) {
      renderHub({ tone: 'error', text: 'Anmeldung nicht möglich', hint: NOT_CONFIGURED_HINT });
      logLoginOnce('Der Hub meldet: GitHub-Anmeldung nicht eingerichtet.');
    } else {
      const cookieExists = await hasSessionCookie();
      if (run !== state.checkRun) return;
      renderHub({
        tone: 'warn',
        text: 'Nicht im Hub angemeldet',
        hint: cookieExists ? COOKIE_NOT_SENT_HINT : LOGIN_HINT,
        showLogin: true,
      });
      logLoginOnce(cookieExists
        ? 'Login-Cookie ist im Browser vorhanden, der Hub erkennt aber keine Anmeldung.'
        : 'Noch kein Login-Cookie für den Hub vorhanden (nicht angemeldet).');
    }
  } catch (error) {
    if (run !== state.checkRun) return;
    state.session = null;
    renderHub({ tone: 'error', text: 'Hub nicht erreichbar', hint: error.message });
    logLoginOnce(`Hub nicht erreichbar: ${error.message}`);
  }
  renderZip();
  updateDeployButton();
}

async function hasSessionCookie() {
  try {
    return Boolean(await chrome.cookies.get({ url: `${state.hubUrl}/api/`, name: SESSION_COOKIE }));
  } catch {
    return false;
  }
}

function logLoginOnce(message) {
  if (state.lastLoginLog === message) return;
  state.lastLoginLog = message;
  log('login', message);
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
  state.zipNote = fromAiStudio ? 'Automatisch aus AI Studio übernommen' : '';
  if (!fromAiStudio) chrome.storage.session.remove(PENDING_KEY).catch(() => {});
  renderZip();
  updateDeployButton();

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

// --- Deployment ------------------------------------------------------------

async function deploy(event) {
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
  if (!state.session) {
    showError('Bitte zuerst im Hub anmelden.');
    return;
  }

  hideError();
  setBusy(true);
  showJob(null);
  try {
    const job = await state.hub.startDeployment({
      name,
      description: $('app-description').value.trim(),
      tags: parseTags($('app-tags').value),
      zipFile: state.zipFile,
      csrfToken: state.session.csrfToken,
    });
    log('upload', `Upload angenommen, Deployment läuft: "${job.name}" (${formatBytes(state.zipFile.size)}).`);
    if (state.zipFromAiStudio) chrome.storage.session.remove(PENDING_KEY).catch(() => {});
    state.pollFailures = 0;
    showJob(job);
    schedulePoll();
  } catch (error) {
    setBusy(false);
    showError(error.message);
    log('upload', `Upload abgelehnt (HTTP ${error.status}): ${error.message}`);
    if ([401, 403].includes(error.status)) checkHub({ quiet: true });
  }
}

function schedulePoll() {
  clearTimeout(state.pollTimer);
  state.pollTimer = setTimeout(pollJob, POLL_INTERVAL_MS);
}

async function pollJob() {
  try {
    const job = await state.hub.getDeployment(state.job.id);
    state.pollFailures = 0;
    showJob(job);
    if (ACTIVE_JOB_STATUSES.includes(job.status)) schedulePoll();
    else finishJob(job);
  } catch (error) {
    // The hub can be briefly unreachable while Docker is busy building.
    if (error.status === 0 && ++state.pollFailures < MAX_POLL_FAILURES) {
      schedulePoll();
      return;
    }
    setBusy(false);
    $('job-error').textContent = error.message;
    $('job-error').hidden = false;
    if ([401, 403].includes(error.status)) checkHub({ quiet: true });
  }
}

function finishJob(job) {
  setBusy(false);
  if (job.status === 'success') {
    log('upload', `Deployment erfolgreich, die Kachel ist im Hub: ${job.app?.slug || job.slug}`);
    resetForm();
  } else {
    log('upload', `Deployment ${job.status === 'cancelled' ? 'abgebrochen' : 'fehlgeschlagen'}: ${job.error || 'ohne Meldung'}`);
  }
  loadPendingCapture();
}

function showJob(job) {
  state.job = job;
  $('progress').hidden = !job;
  if (!job) return;

  $('steps').replaceChildren(...(job.steps || []).map(renderStep));
  const failed = ['failed', 'cancelled'].includes(job.status);
  $('job-error').hidden = !failed;
  $('job-error').textContent = failed
    ? `Deployment ${job.status === 'cancelled' ? 'abgebrochen' : 'fehlgeschlagen'}: ${job.error || ''}`
    : '';
  $('job-details').hidden = !job.technicalDetails;
  $('job-log').textContent = job.technicalDetails || '';
  $('job-success').hidden = job.status !== 'success';
  if (job.status === 'success') $('job-link').href = state.hub.appUrl(job.app?.slug || job.slug);
}

function renderStep(step) {
  const item = document.createElement('li');
  item.className = `step ${step.status}`;
  const icon = document.createElement('span');
  icon.className = 'step-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = STEP_ICONS[step.status] ?? '○';
  const text = document.createElement('span');
  const label = document.createElement('strong');
  label.textContent = step.label;
  text.append(label);
  if (step.message) {
    const message = document.createElement('small');
    message.textContent = step.message;
    text.append(message);
  }
  item.append(icon, text);
  return item;
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
  updateDeployButton();
}

function setBusy(busy) {
  state.busy = busy;
  for (const id of ['app-name', 'app-description', 'app-tags']) $(id).disabled = busy;
  $('dropzone').setAttribute('aria-disabled', String(busy));
  updateDeployButton();
}

function updateDeployButton() {
  const button = $('deploy-button');
  button.disabled = state.busy || !state.zipFile || !state.session;
  if (state.busy) button.textContent = 'Wird deployt …';
  else if (!state.session) button.textContent = 'Erst im Hub anmelden';
  else button.textContent = 'An MuDiKo senden';
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
  $('hub-login').addEventListener('click', () => chrome.tabs.create({ url: state.hub.loginUrl }));

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
  $('deploy-form').addEventListener('submit', deploy);
  $('diag-copy').addEventListener('click', copyDiagnostics);
  $('diag-clear').addEventListener('click', () => chrome.storage.session.remove(LOG_KEY));

  // Pick up a login that happened in another tab.
  let cookieTimer = 0;
  chrome.cookies.onChanged.addListener(({ cookie }) => {
    if (cookie.name !== SESSION_COOKIE) return;
    if (!new URL(state.hubUrl).hostname.endsWith(cookie.domain.replace(/^\./, ''))) return;
    clearTimeout(cookieTimer);
    cookieTimer = setTimeout(() => checkHub({ quiet: true }), 300);
  });
  window.addEventListener('focus', () => { if (!state.busy) checkHub({ quiet: true }); });

  chrome.storage.session.onChanged.addListener((changes) => {
    if (changes[LOG_KEY]) renderDiagnostics();
    if (changes[PENDING_KEY]?.newValue) loadPendingCapture();
  });
}

async function init() {
  bindEvents();
  const { hubUrl } = await chrome.storage.local.get('hubUrl');
  setHub(hubUrl || DEFAULT_HUB_URL);
  renderZip();
  await checkHub();
  await Promise.all([loadPendingCapture(), renderDiagnostics()]);
}

init();
