// Side panel entry: switches between the areas in the left rail and starts each area.
import { checkHub, loadHub } from './panel/hub.js';
import { initSettings } from './panel/settings.js';
import { initStudio } from './panel/studio.js';
import { initUpload, loadPendingCaptureOnStart } from './panel/upload.js';

const VIEW_KEY = 'lastView';

function showView(name) {
  for (const item of document.querySelectorAll('.rail-item')) {
    const active = item.dataset.view === name;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  for (const view of document.querySelectorAll('.view')) view.hidden = view.id !== `view-${name}`;
  document.querySelector('.content').scrollTop = 0;
  chrome.storage.local.set({ [VIEW_KEY]: name }).catch(() => {});
}

async function init() {
  for (const item of document.querySelectorAll('.rail-item')) {
    item.addEventListener('click', () => showView(item.dataset.view));
  }
  const { [VIEW_KEY]: lastView } = await chrome.storage.local.get(VIEW_KEY);
  if (['upload', 'studio', 'settings'].includes(lastView)) showView(lastView);

  await initUpload({ showView });
  await Promise.all([initStudio(), initSettings()]);
  await loadHub();
  await loadPendingCaptureOnStart();
  window.addEventListener('focus', () => checkHub({ quiet: true }));
}

init();
