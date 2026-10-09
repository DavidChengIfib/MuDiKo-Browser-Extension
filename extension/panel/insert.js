// Puts a text into the open Google AI Studio tab. It always lands on the clipboard first,
// so the teacher can paste it by hand if AI Studio's page cannot be filled automatically.
import { isAiStudioUrl } from '../lib/downloads.js';
import { copyText, log } from './util.js';

const RESULT_TEXT = {
  inserted: 'In AI Studio eingefügt ✓ Bitte dort prüfen.',
  waiting: 'Kopiert ✓ Jetzt in AI Studio das Feld öffnen, MuDiKo fügt den Text dann ein.',
  confirm: 'Im Feld steht schon Text. Entscheide in AI Studio: ersetzen oder anhängen.',
};

export async function sendToAiStudio(target, text) {
  const copied = await copyText(text);
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !isAiStudioUrl(tab.url || '')) {
    return {
      ok: false,
      message: copied
        ? 'Kopiert ✓ Öffne dein Projekt in Google AI Studio und klicke dann noch einmal auf „In AI Studio einfügen“, oder füge mit Strg+V ein.'
        : 'Bitte zuerst dein Projekt in Google AI Studio öffnen.',
    };
  }
  try {
    const reply = await chrome.tabs.sendMessage(tab.id, { type: 'mudiko:insert', target, text }, { frameId: 0 });
    return { ok: true, message: RESULT_TEXT[reply?.status] || RESULT_TEXT.waiting };
  } catch {
    log('ai-studio', 'Einfügen nicht möglich: Die Extension ist im AI-Studio-Tab noch nicht aktiv.');
    return {
      ok: false,
      message: `${copied ? 'Kopiert ✓ ' : ''}Bitte den AI-Studio-Tab einmal neu laden (F5), dann klappt das Einfügen.`,
    };
  }
}
