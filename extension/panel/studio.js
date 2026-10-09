// "AI Studio": generator for system instruction and prompts, building blocks and remix.
import {
  APP_TYPES, AUDIENCES, CONSTRAINTS, DEFAULT_FORM, DEVICES, DIFFERENTIATION, DURATIONS, FOLLOW_UP_PROMPTS,
  buildPrompt, buildSystemInstruction, followUpText, templateContext, validateForm,
} from '../lib/prompt-builder.js';
import { hub, onHubChange } from './hub.js';
import { sendToAiStudio } from './insert.js';
import { $, copyText, el, flash, formatBytes, log } from './util.js';

const FORM_KEY = 'generatorForm';
const TEMPLATES = globalThis.MUDIKO_TEMPLATES || [];

let remixApps = [];
let remixLoadedFor = '';
let saveTimer = 0;

export async function initStudio() {
  bindTabs();
  buildForm();
  const { [FORM_KEY]: saved } = await chrome.storage.local.get(FORM_KEY);
  writeForm({ ...DEFAULT_FORM, ...(saved || {}) });
  if (saved?.topic) generate({ quiet: true });
  renderTemplates();
  $('remix-search').addEventListener('input', () => renderRemix());
  $('remix-refresh').addEventListener('click', () => loadRemix({ force: true }));
  onHubChange(() => {
    if (!$('pane-remix').hidden) loadRemix();
  });
}

// --- Sub navigation ----------------------------------------------------------

function bindTabs() {
  for (const tab of document.querySelectorAll('.studio-tab')) {
    tab.addEventListener('click', () => showPane(tab.dataset.pane));
  }
}

function showPane(name) {
  for (const tab of document.querySelectorAll('.studio-tab')) {
    const active = tab.dataset.pane === name;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  }
  for (const pane of document.querySelectorAll('.studio-pane')) pane.hidden = pane.id !== `pane-${name}`;
  if (name === 'remix') loadRemix();
}

// --- Generator ---------------------------------------------------------------

function buildForm() {
  $('gen-type').replaceChildren(...Object.entries(APP_TYPES).map(([value, type]) => el('option', { value }, type.label)));
  $('gen-audience').replaceChildren(...AUDIENCES.map((value) => el('option', { value }, value)));
  $('gen-duration').replaceChildren(...DURATIONS.map((value) => el('option', { value }, `${value} Minuten`)));
  fillChecks('gen-devices', 'devices', DEVICES);
  fillChecks('gen-constraints', 'constraints', CONSTRAINTS);
  fillChecks('gen-differentiation', 'differentiation', DIFFERENTIATION);

  $('gen-form').addEventListener('input', scheduleSave);
  $('gen-form').addEventListener('change', scheduleSave);
  $('gen-form').addEventListener('submit', (event) => {
    event.preventDefault();
    generate();
  });
  $('gen-reset').addEventListener('click', () => {
    writeForm(DEFAULT_FORM);
    $('gen-output').hidden = true;
    scheduleSave();
  });
  bindOutput('system', 'system');
  bindOutput('prompt', 'prompt');
}

function fillChecks(containerId, name, options) {
  $(containerId).replaceChildren(...Object.entries(options).map(([value, label]) => el(
    'label', { className: 'check-chip' },
    el('input', { type: 'checkbox', name, value }),
    el('span', {}, label),
  )));
}

function readForm() {
  const checked = (name) => [...document.querySelectorAll(`#gen-form input[name="${name}"]:checked`)].map((input) => input.value);
  return {
    appType: $('gen-type').value,
    topic: $('gen-topic').value,
    audience: $('gen-audience').value,
    duration: $('gen-duration').value,
    devices: checked('devices'),
    goals: $('gen-goals').value,
    constraints: checked('constraints'),
    constraintsText: $('gen-constraints-text').value,
    differentiation: checked('differentiation'),
    differentiationText: $('gen-differentiation-text').value,
    wishes: $('gen-wishes').value,
    language: $('gen-language').value,
  };
}

function writeForm(form) {
  $('gen-type').value = form.appType;
  $('gen-topic').value = form.topic;
  $('gen-audience').value = form.audience;
  $('gen-duration').value = form.duration;
  $('gen-goals').value = form.goals;
  $('gen-constraints-text').value = form.constraintsText;
  $('gen-differentiation-text').value = form.differentiationText;
  $('gen-wishes').value = form.wishes;
  $('gen-language').value = form.language;
  for (const name of ['devices', 'constraints', 'differentiation']) {
    for (const input of document.querySelectorAll(`#gen-form input[name="${name}"]`)) {
      input.checked = (form[name] || []).includes(input.value);
    }
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ [FORM_KEY]: readForm() }).catch(() => {}), 300);
}

function generate({ quiet = false } = {}) {
  const form = readForm();
  const problem = validateForm(form);
  $('gen-error').textContent = problem;
  $('gen-error').hidden = !problem;
  if (problem) {
    if (!quiet) $('gen-topic').focus();
    return;
  }
  $('gen-system').value = buildSystemInstruction(form);
  $('gen-prompt').value = buildPrompt(form);
  renderFollowUps(form);
  $('gen-output').hidden = false;
  if (!quiet) {
    $('gen-output').scrollIntoView({ behavior: 'smooth', block: 'start' });
    log('studio', `System Instruction und Prompt erstellt (${APP_TYPES[form.appType].label}, „${form.topic.trim()}“).`);
  }
}

function bindOutput(name, target) {
  $(`gen-${name}-copy`).addEventListener('click', async (event) => {
    flash(event.currentTarget, (await copyText($(`gen-${name}`).value)) ? 'Kopiert ✓' : 'Kopieren nicht möglich');
  });
  $(`gen-${name}-insert`).addEventListener('click', () => insert(target, $(`gen-${name}`).value, $(`gen-${name}-status`)));
}

function renderFollowUps(form) {
  $('gen-followups').replaceChildren(...FOLLOW_UP_PROMPTS.map((prompt) => {
    const text = followUpText(prompt, form);
    const status = el('p', { className: 'status', hidden: true });
    return el('li', { className: 'followup' },
      el('div', { className: 'followup-head' },
        el('strong', {}, prompt.label),
        el('div', { className: 'mini-actions' },
          el('button', { type: 'button', className: 'mini', onclick: async (event) => flash(event.currentTarget, (await copyText(text)) ? '✓' : '!') }, 'Kopieren'),
          el('button', { type: 'button', className: 'mini primary', onclick: () => insert('prompt', text, status) }, 'Einfügen'),
        )),
      el('p', { className: 'followup-text' }, text),
      status);
  }));
}

async function insert(target, text, statusElement) {
  const result = await sendToAiStudio(target, text);
  statusElement.textContent = result.message;
  statusElement.className = result.ok ? 'status' : 'status warn';
  statusElement.hidden = false;
  clearTimeout(Number(statusElement.dataset.timer));
  statusElement.dataset.timer = String(setTimeout(() => { statusElement.hidden = true; }, 12000));
}

// --- Building blocks ---------------------------------------------------------

function renderTemplates() {
  $('template-list').replaceChildren(...TEMPLATES.map((template) => {
    const status = el('p', { className: 'status', hidden: true });
    return el('li', { className: 'card template' },
      el('div', { className: 'template-head' },
        el('strong', {}, template.title),
        el('div', { className: 'tags' }, ...template.tags.map((tag) => el('span', { className: 'tag' }, tag)))),
      el('p', { className: 'muted' }, template.summary),
      el('div', { className: 'actions' },
        el('button', { type: 'button', className: 'secondary', onclick: () => chrome.tabs.create({ url: chrome.runtime.getURL(`preview.html?id=${template.id}`) }) }, 'Vorschau'),
        el('button', { type: 'button', className: 'secondary', onclick: async (event) => flash(event.currentTarget, (await copyText(templateContext(template))) ? 'Kopiert ✓' : 'Nicht möglich') }, 'Kopieren'),
        el('button', { type: 'button', onclick: () => insert('prompt', templateContext(template), status) }, 'In AI Studio einfügen')),
      status);
  }));
}

// --- Remix -------------------------------------------------------------------

async function loadRemix({ force = false } = {}) {
  if (hub.state !== 'ok') {
    remixApps = [];
    remixLoadedFor = '';
    renderRemix(hub.state === 'checking' ? 'Verbinde mit dem Hub …' : 'Der Hub ist nicht erreichbar. Adresse unter „Einstellungen“ prüfen.');
    return;
  }
  if (!hub.remixEnabled) {
    remixApps = [];
    remixLoadedFor = '';
    renderRemix('Dieser Hub unterstützt noch keinen Remix. Bitte den Hub aktualisieren.');
    return;
  }
  if (!force && remixLoadedFor === hub.url) {
    renderRemix();
    return;
  }
  renderRemix('Lade Lernpfade aus dem Hub …');
  try {
    remixApps = await hub.client.listRemixApps();
    remixLoadedFor = hub.url;
    renderRemix();
  } catch (error) {
    remixApps = [];
    renderRemix(error.message);
  }
}

function renderRemix(message = '') {
  const query = $('remix-search').value.trim().toLowerCase();
  const visible = remixApps.filter((app) => !query
    || [app.name, app.description, ...(app.tags || [])].join(' ').toLowerCase().includes(query));
  let note = message;
  if (!note && !remixApps.length) note = 'Noch keine Apps zum Remixen freigegeben. Admins schalten Remix pro App in den App-Details im Hub ein.';
  else if (!note && !visible.length) note = 'Keine App passt zur Suche.';
  $('remix-message').textContent = note;
  $('remix-message').hidden = !note;
  $('remix-list').replaceChildren(...(message ? [] : visible.map(remixCard)));
}

function remixCard(app) {
  const status = el('p', { className: 'status', hidden: true });
  return el('li', { className: 'card remix' },
    el('strong', {}, app.name),
    app.description ? el('p', { className: 'muted' }, app.description) : null,
    el('div', { className: 'tags' }, ...(app.tags || []).map((tag) => el('span', { className: 'tag' }, tag))),
    el('p', { className: 'meta-line' }, [app.fileCount ? `${app.fileCount} Dateien` : '', app.sizeBytes ? formatBytes(app.sizeBytes) : ''].filter(Boolean).join(' · ')),
    el('div', { className: 'actions' },
      el('button', { type: 'button', onclick: () => downloadRemix(app, status) }, 'ZIP herunterladen')),
    status);
}

async function downloadRemix(app, status) {
  try {
    await chrome.downloads.download({ url: hub.client.remixDownloadUrl(app.slug), filename: `${app.slug}-remix.zip` });
    status.textContent = 'Download gestartet ✓ Die ZIP liegt gleich in deinem Download-Ordner.';
    status.className = 'status';
    log('studio', `Remix heruntergeladen: ${app.slug}`);
  } catch (error) {
    status.textContent = `Download nicht möglich: ${error.message}`;
    status.className = 'status warn';
  }
  status.hidden = false;
}
