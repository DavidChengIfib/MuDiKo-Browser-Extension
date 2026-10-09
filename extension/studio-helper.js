// Inserts generated texts into Google AI Studio: the system instruction into
// "System Instructions → Custom Instructions", prompts and building blocks into the chat input.
// AI Studio's markup is not documented, so fields are recognised by their labels and surroundings.
// If the field is not open yet we wait; clicking into the field also works. The text is always on
// the clipboard as a fallback.
(() => {
  if (window !== window.top) return;

  // Visible texts (English and German UI) and technical names (tags, classes, ids) of the system field.
  const SYSTEM_TEXT = /system\s*instructions?|custom\s*instructions?|systemanweisung|benutzerdefinierte\s*anweisung|systemprompt|system\s*prompt/i;
  const SYSTEM_NAME = /system[-_ ]?instruction|custom[-_ ]?instruction|system[-_ ]?prompt/i;
  const PROMPT_HINT = /prompt|describe|beschreib|message|nachricht|chat|frag|ask|type|eingeben|enter/i;
  const OVERLAY = '[role="dialog"], [aria-modal="true"], mat-dialog-container, .cdk-overlay-pane, .cdk-overlay-container, mat-drawer, mat-sidenav, [role="complementary"]';
  const EDITABLE = 'textarea, [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""]';
  const WAIT_MS = 3 * 60 * 1000;
  const LABELS = {
    system: {
      name: 'System Instruction',
      wait: 'Öffne in AI Studio die Einstellungen → System Instructions → Custom Instructions und klicke in das Textfeld. MuDiKo fügt den Text dann ein. Er liegt auch in der Zwischenablage (Strg+V).',
    },
    prompt: {
      name: 'Text',
      wait: 'Klicke in AI Studio in das Chat-Eingabefeld deines Projekts. MuDiKo fügt den Text dann ein. Er liegt auch in der Zwischenablage (Strg+V).',
    },
  };
  let pending = null;

  const log = (message) => {
    chrome.runtime.sendMessage({ type: 'mudiko:log', source: 'ai-studio', message }).catch(() => {});
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'mudiko:insert' || !LABELS[message.target]) return false;
    sendResponse(startInsert(message.target, String(message.text || '')));
    return false;
  });

  function startInsert(target, text) {
    stopWaiting();
    const field = findField(target);
    if (field) return offer(field, target, text);

    const toast = globalThis.mudikoToast({
      title: `MuDiKo: ${LABELS[target].name} bereit`,
      text: LABELS[target].wait,
      actions: [{ label: 'Abbrechen', onClick: () => stopWaiting() }],
      timeout: WAIT_MS,
    });
    const job = { target, text, toast };
    // Coalesce DOM changes: AI Studio re-renders often, a check every 250 ms is plenty.
    const observer = new MutationObserver(() => {
      if (job.scheduled) return;
      job.scheduled = setTimeout(() => {
        job.scheduled = 0;
        if (pending !== job) return;
        const found = findField(target);
        if (found) finishWith(found);
      }, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'disabled', 'readonly'] });

    // Clicking into a field always works, even if we cannot recognise it by its labels.
    const onFocusIn = (event) => {
      if (pending !== job) return;
      const focused = editableFrom(event.composedPath?.()[0] || event.target);
      if (!focused) return;
      if (target === 'prompt' || looksLikeSystemField(focused) || focused.closest(OVERLAY)) {
        finishWith(focused);
      } else if (!looksLikeChat(focused)) {
        askForField(focused);
      }
    };
    document.addEventListener('focusin', onFocusIn, true);
    const timer = setTimeout(() => {
      stopWaiting();
      log(`Kein Feld eingefügt (${LABELS[target].name}), Wartezeit abgelaufen. Sichtbare Textfelder: ${describeCandidates()}`);
    }, WAIT_MS);
    Object.assign(job, { observer, timer, onFocusIn });
    pending = job;
    log(`Warte auf das Feld für ${LABELS[target].name}. Sichtbare Textfelder gerade: ${describeCandidates()}`);
    return { status: 'waiting' };

    function finishWith(found) {
      stopWaiting({ keepToast: true });
      offer(found, target, text);
    }
  }

  function stopWaiting({ keepToast = false } = {}) {
    if (!pending) return;
    pending.observer.disconnect();
    clearTimeout(pending.timer);
    clearTimeout(pending.scheduled);
    document.removeEventListener('focusin', pending.onFocusIn, true);
    if (!keepToast) pending.toast.close();
    pending = null;
  }

  // The teacher clicked into a field we cannot identify: let them confirm it.
  function askForField(field) {
    const { target, text } = pending;
    globalThis.mudikoToast({
      title: `MuDiKo: ${LABELS[target].name} hier einfügen?`,
      text: `Feld: ${describe(field)}`,
      timeout: 0,
      actions: [
        { label: 'Ja, hier einfügen', primary: true, onClick: (toast) => { toast.close(); stopWaiting({ keepToast: true }); offer(field, target, text); } },
        { label: 'Nein', onClick: (toast) => toast.close() },
      ],
    });
    log(`Unbekanntes Feld angeklickt, Nachfrage angezeigt: ${describe(field)}`);
  }

  // Never overwrite existing text without asking.
  function offer(field, target, text) {
    const existing = currentText(field).trim();
    if (!existing || existing === text.trim()) {
      writeText(field, text);
      return done(field, target, 'eingefügt');
    }
    globalThis.mudikoToast({
      title: 'MuDiKo: Im Feld steht schon Text',
      text: 'Soll der vorhandene Text ersetzt werden oder der neue Text angehängt werden?',
      timeout: 0,
      actions: [
        { label: 'Ersetzen', primary: true, onClick: (toast) => { toast.close(); writeText(field, text); done(field, target, 'ersetzt'); } },
        { label: 'Anhängen', onClick: (toast) => { toast.close(); writeText(field, `${existing}\n\n${text}`); done(field, target, 'angehängt'); } },
        { label: 'Abbrechen', onClick: (toast) => toast.close() },
      ],
    });
    log(`Feld für ${LABELS[target].name} gefunden, enthält schon Text, Nachfrage angezeigt: ${describe(field)}`);
    return { status: 'confirm' };
  }

  function done(field, target, how) {
    field.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const outline = field.style.outline;
    field.style.outline = '3px solid #87BDCF';
    setTimeout(() => { field.style.outline = outline; }, 2500);
    globalThis.mudikoToast({
      title: `MuDiKo: ${LABELS[target].name} ${how} ✓`,
      text: target === 'system'
        ? 'Bitte kurz prüfen und die Einstellungen in AI Studio übernehmen bzw. speichern.'
        : 'Bitte prüfen und dann in AI Studio selbst absenden.',
      timeout: 8000,
    });
    log(`${LABELS[target].name} ${how}: ${describe(field)}`);
    return { status: 'inserted' };
  }

  // --- Finding fields ----------------------------------------------------------

  function findField(target) {
    const fields = editableFields();
    if (target === 'system') return fields.find(looksLikeSystemField) || null;
    const chatFields = fields.filter((field) => !looksLikeSystemField(field));
    const focused = chatFields.find((field) => field === deepActiveElement() || field.contains(deepActiveElement()));
    return focused || chatFields.find((field) => PROMPT_HINT.test(ownLabel(field))) || null;
  }

  function looksLikeSystemField(field) {
    if (SYSTEM_TEXT.test(ownLabel(field)) || SYSTEM_NAME.test(technicalName(field))) return true;
    // Walk up the surroundings: a heading "System instructions" or an element like
    // <ms-system-instructions> near the field marks it, as long as the area stays small.
    let node = field;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      node = parentOf(node);
      if (!node || node === document.body) break;
      if (SYSTEM_NAME.test(technicalName(node))) return true;
      if (node.querySelectorAll?.(EDITABLE).length > 3) break;
      const text = (node.textContent || '').replace(currentText(field), '');
      if (text.length < 1500 && SYSTEM_TEXT.test(text)) return true;
    }
    return false;
  }

  function looksLikeChat(field) {
    return PROMPT_HINT.test(ownLabel(field)) && !field.closest(OVERLAY);
  }

  function editableFields() {
    return deepQuery(document, EDITABLE).filter(isUsable);
  }

  function editableFrom(node) {
    if (!(node instanceof Element)) return null;
    const field = node.matches(EDITABLE) ? node : node.closest(EDITABLE);
    return field && isUsable(field) ? field : null;
  }

  function isUsable(field) {
    if (field.closest('[data-mudiko-toast]')) return false;
    if (field.disabled || field.readOnly || field.getAttribute('aria-disabled') === 'true') return false;
    const box = field.getBoundingClientRect();
    return box.width > 4 && box.height > 4 && getComputedStyle(field).visibility !== 'hidden';
  }

  // querySelectorAll that also looks inside shadow roots.
  function deepQuery(root, selector) {
    const found = [...root.querySelectorAll(selector)];
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) found.push(...deepQuery(element.shadowRoot, selector));
    }
    return found;
  }

  function deepActiveElement() {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
  }

  function parentOf(node) {
    return node.parentElement || node.getRootNode?.().host || null;
  }

  // The field's own name: aria-label, placeholder, linked labels.
  function ownLabel(field) {
    const parts = [field.getAttribute('aria-label'), field.getAttribute('placeholder'), field.getAttribute('title'), field.getAttribute('name')];
    for (const id of (field.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)) {
      parts.push(document.getElementById(id)?.textContent);
    }
    if (field.id) parts.push(document.querySelector(`label[for="${CSS.escape(field.id)}"]`)?.textContent);
    parts.push(field.closest('label')?.textContent);
    return parts.filter(Boolean).join(' ');
  }

  function technicalName(element) {
    return [element.tagName, element.id, typeof element.className === 'string' ? element.className : '', element.getAttribute?.('aria-label'), element.getAttribute?.('data-test-id')]
      .filter(Boolean).join(' ');
  }

  // --- Writing -------------------------------------------------------------------

  function currentText(field) {
    return 'value' in field && typeof field.value === 'string' ? field.value : field.textContent || '';
  }

  // AI Studio is an Angular app: set the value natively and send the events it listens for.
  function writeText(field, text) {
    field.focus();
    if (field instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, text);
      field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      field.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      return;
    }
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(field);
    selection.removeAllRanges();
    selection.addRange(range);
    if (!document.execCommand('insertText', false, text)) field.textContent = text;
    field.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
  }

  // --- Diagnostics ---------------------------------------------------------------

  // Short description for the diagnostics log: label plus the nearest named ancestors.
  function describe(field) {
    const label = (field.getAttribute('aria-label') || field.getAttribute('placeholder') || '').trim().slice(0, 60);
    const path = [];
    let node = field;
    for (let depth = 0; depth < 10 && node && path.length < 3; depth += 1) {
      node = parentOf(node);
      if (!node || node === document.body) break;
      const tag = node.tagName.toLowerCase();
      if (tag.includes('-') || node.getAttribute('role')) path.push(node.getAttribute('role') ? `${tag}[role=${node.getAttribute('role')}]` : tag);
    }
    return `${field.tagName.toLowerCase()}${label ? ` „${label}“` : ''}${path.length ? ` in ${path.join(' < ')}` : ''}`;
  }

  function describeCandidates() {
    const fields = editableFields();
    return fields.length ? `${fields.length} (${fields.slice(0, 6).map(describe).join(' | ')})` : 'keine';
  }
})();
