// Shared hub connection: address, API client and whether the hub is reachable.
import { DEFAULT_HUB_URL, createHubClient, normalizeHubUrl } from '../lib/hub-client.js';
import { log } from './util.js';

export const HUB_STATE_TEXT = {
  checking: 'Verbinde …',
  ok: 'Mit dem Hub verbunden',
  outdated: 'Hub zu alt',
  offline: 'Hub nicht erreichbar',
};

export const hub = {
  url: DEFAULT_HUB_URL,
  client: createHubClient(DEFAULT_HUB_URL),
  state: 'checking',
  message: '',
  maxUploadBytes: null,
  remixEnabled: false,
};

const listeners = new Set();
let checkRun = 0;
let lastLog = '';

export function onHubChange(listener) {
  listeners.add(listener);
}

function notify() {
  listeners.forEach((listener) => listener(hub));
}

function useUrl(url) {
  hub.url = url;
  hub.client = createHubClient(url);
}

export async function loadHub() {
  const { hubUrl } = await chrome.storage.local.get('hubUrl');
  useUrl(hubUrl || DEFAULT_HUB_URL);
  await checkHub();
}

// Must be called straight from a click: Chrome only asks for origins not granted yet.
export async function changeHubUrl(value) {
  const url = normalizeHubUrl(value);
  const granted = await chrome.permissions.request({ origins: [`${url}/*`] }).catch(() => false);
  if (!granted) throw new Error('Ohne diese Erlaubnis kann die Extension den Hub nicht erreichen.');
  await chrome.storage.local.set({ hubUrl: url });
  useUrl(url);
  await checkHub();
}

export async function checkHub({ quiet = false } = {}) {
  const run = ++checkRun;
  if (!quiet) {
    hub.state = 'checking';
    notify();
  }
  try {
    const status = await hub.client.getStatus();
    if (run !== checkRun) return;
    hub.maxUploadBytes = status.maxUploadBytes ?? null;
    hub.remixEnabled = Boolean(status.remixEnabled);
    hub.state = status.submissionsEnabled ? 'ok' : 'outdated';
    hub.message = status.submissionsEnabled ? '' : 'Dieser Hub hat noch keine Warteliste. Bitte den Hub aktualisieren.';
  } catch (error) {
    if (run !== checkRun) return;
    hub.state = 'offline';
    hub.message = error.message;
    hub.remixEnabled = false;
  }
  const entry = `${HUB_STATE_TEXT[hub.state]} (${hub.url})${hub.message ? `: ${hub.message}` : ''}`;
  if (entry !== lastLog) {
    lastLog = entry;
    log('hub', entry);
  }
  notify();
}
