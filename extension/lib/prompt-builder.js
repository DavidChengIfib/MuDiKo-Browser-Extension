// Turns the teacher's answers into a system instruction and a first prompt for Google AI Studio.
// Pure functions, so the texts can be tested without a browser.

export const APP_TYPES = {
  lernpfad: {
    label: 'Lernpfad (mehrere Schritte)',
    noun: 'einen Lernpfad',
    structure: [
      '4 bis 6 Schritte als Karten-Lernpfad mit Fortschrittsanzeige oben und Weiter/Zurück unten:',
      '1. Einstieg mit Alltagsbezug, der neugierig macht.',
      '2. bis 4. Erarbeitung mit je einer interaktiven Station (hören, ausprobieren, zuordnen).',
      '5. Kurzes Quiz mit sofortigem Feedback.',
      '6. Abschluss mit Zusammenfassung und Merksatz.',
    ],
  },
  quiz: {
    label: 'Quiz / Übung',
    noun: 'ein Quiz',
    structure: [
      '8 bis 10 Fragen in gemischten Formen: Multiple Choice, Hörbeispiel (Klang abspielen und bestimmen) und Zuordnen per Drag & Drop.',
      'Nach jeder Frage sofortiges Feedback mit kurzer Erklärung.',
      'Am Ende eine Auswertung mit Punktzahl, Lob und einem Button zum Wiederholen.',
    ],
  },
  werkzeug: {
    label: 'Interaktives Werkzeug (z. B. Klaviatur, Rhythmus-Trainer)',
    noun: 'ein interaktives Werkzeug',
    structure: [
      'Ein Werkzeug, das im Unterricht frei genutzt wird: zum Ausprobieren, Üben oder Vorführen an der Tafel.',
      'Große, gut bedienbare Bedienelemente und kurze Bedienhinweise direkt im Werkzeug.',
      'Keine Punktewertung nötig; ein Zurücksetzen-Button.',
    ],
  },
  spiel: {
    label: 'Lernspiel',
    noun: 'ein kurzes Lernspiel',
    structure: [
      '3 Level mit steigender Schwierigkeit, sofortigem Feedback und Sternen als Belohnung.',
      'Kein Zeitdruck als Standard (höchstens optional zuschaltbar).',
      'Ein Abschlussbildschirm mit Ergebnis und „Nochmal spielen“.',
    ],
  },
};

export const AUDIENCES = ['Grundschule', 'Klasse 5–6', 'Klasse 7–8', 'Klasse 9–10', 'Oberstufe', 'Lehrkräfte / Erwachsene'];
export const DURATIONS = ['10', '20', '45'];

export const DEVICES = {
  ipad: 'iPad / Tablet',
  laptop: 'Laptop / PC',
  phone: 'Smartphone',
  board: 'Interaktive Tafel',
};

export const CONSTRAINTS = {
  noLogin: 'Keine Anmeldung, keine personenbezogenen Daten',
  noMic: 'Kein Mikrofon verwenden',
  silent: 'Auch ohne Ton bedienbar',
  headphones: 'Keine plötzlichen lauten Klänge (Kopfhörer)',
};

export const DIFFERENTIATION = {
  levels: 'Drei Schwierigkeitsstufen',
  hints: 'Hilfen und Tipps auf Abruf',
  extra: 'Zusatzaufgaben für Schnelle',
  simpleLanguage: 'Einfache Sprache',
  readAloud: 'Texte vorlesen lassen',
};

const CONSTRAINT_RULES = {
  noLogin: 'Keine Anmeldung und keine personenbezogenen Daten erfassen oder speichern.',
  noMic: 'Kein Mikrofon verwenden.',
  silent: 'Alles muss auch ohne Ton bedienbar sein; Klang ergänzt nur.',
  headphones: 'Keine plötzlichen lauten Klänge, Lautstärke moderat halten (Kopfhörer im Klassenraum).',
};

const DIFFERENTIATION_RULES = {
  levels: 'Drei Schwierigkeitsstufen (leicht, mittel, schwer), die sich in Menge, Tempo und Hilfen unterscheiden.',
  hints: 'Hilfen und Tipps auf Abruf, die nicht automatisch erscheinen.',
  extra: 'Zusatzaufgaben für Schüler*innen, die schneller fertig sind.',
  simpleLanguage: 'Einfache Sprache: kurze Sätze, Fachbegriffe kurz erklären.',
  readAloud: 'Texte per Button vorlesen lassen (Sprachausgabe des Browsers, speechSynthesis).',
};

export const DEFAULT_FORM = {
  appType: 'lernpfad',
  topic: '',
  audience: 'Klasse 7–8',
  duration: '20',
  devices: ['ipad', 'laptop'],
  goals: '',
  constraints: ['noLogin'],
  constraintsText: '',
  differentiation: ['levels', 'hints'],
  differentiationText: '',
  wishes: '',
  language: 'Deutsch',
};

export function validateForm(form) {
  return String(form.topic || '').trim() ? '' : 'Bitte zuerst ein Thema eintragen.';
}

export function buildSystemInstruction(form) {
  const values = withDefaults(form);
  const devices = pick(DEVICES, values.devices);
  const constraints = pick(CONSTRAINT_RULES, values.constraints);
  const differentiation = pick(DIFFERENTIATION_RULES, values.differentiation);
  return [
    'Du entwickelst didaktische Musik-Lern-Apps für das Projekt MuDiKo. Die App entsteht in Google AI Studio und wird danach im MuDiKo Musik Hub für Schulen veröffentlicht.',
    '',
    '## Projektrahmen',
    `- Zielgruppe: ${values.audience}. Sprache und Schwierigkeit passen zu dieser Gruppe.`,
    `- Geräte: ${devices.join(', ') || 'iPad / Tablet'}.`,
    `- Sprache der App: ${values.language}.`,
    `- App-Typ: ${APP_TYPES[values.appType].label}.`,
    '',
    '## Technik (Pflicht, sonst kann der MuDiKo Hub die App nicht veröffentlichen)',
    '- React + TypeScript + Vite, Pakete nur über npm. package.json braucht das Skript "build": "vite build".',
    '- Reine Browser-App: kein eigener Server, keine Datenbank, kein Login, kein Firebase oder Supabase.',
    '- Keine API-Schlüssel und keine Gemini-API im fertigen Code (@google/genai nicht verwenden). Die App muss ohne Schlüssel vollständig funktionieren.',
    '- Klänge mit der Web Audio API erzeugen (oder Tone.js). Keine Audio- oder Bilddateien von fremden Servern; eigene Dateien in public/ sind erlaubt.',
    '- Tailwind CSS möglichst als npm-Paket (@tailwindcss/vite) statt über ein CDN einbinden.',
    '- Die App läuft im Hub in einem iframe: keine Pop-ups, keine neuen Fenster, kein erzwungenes Vollbild.',
    ...constraints.map((rule) => `- ${rule}`),
    ...extraLines(values.constraintsText),
    '',
    '## Didaktik',
    `- Eine klare Aufgabe pro Bildschirm, kurze Texte in Du-Ansprache, passend für ${values.audience}.`,
    '- Interaktion vor Text: hören, ausprobieren, zuordnen.',
    '- Sofortiges, freundliches Feedback. Fehler sind Lernchancen und werden nie bloßgestellt.',
    '- Am Ende eine kurze Zusammenfassung mit Merksatz.',
    ...differentiation.map((rule) => `- Differenzierung: ${rule}`),
    ...extraLines(values.differentiationText, 'Differenzierung: '),
    '',
    '## Gestaltung (MuDiKo-Designrichtlinie)',
    '- Ruhiges, dunkles Design: Hintergrund bg-slate-950, Karten bg-slate-900/90 mit border border-slate-800 und rounded-xl, viel Abstand.',
    '- Pro Bildschirm genau zwei Überschriften-Ebenen: eine kleine Pill „Schritt X · Name“ in der Sektionsfarbe, darunter eine prägnante Überschrift (text-lg sm:text-2xl font-bold text-slate-50). Keine zusätzlichen Box-Überschriften in den Karten.',
    '- Jede Sektion hat eine eigene Signaturfarbe (amber, emerald, cyan, orange, indigo, fuchsia), sparsam eingesetzt: Pill, Fortschrittspunkte, Haupt-Button.',
    '- Icons aus lucide-react. Fließtext text-sm text-slate-200 leading-relaxed.',
    '- Touch-Ziele mindestens 44 px, Buttons einzeilig. Funktioniert im Hoch- und Querformat und ohne Hover.',
    '- Drag & Drop mit Pointer-Events umsetzen, damit es auch auf dem iPad funktioniert.',
    '',
    '## Arbeitsweise',
    '- Ändere nur, was verlangt wird, und erhalte bestehende Funktionen.',
    '- Erkläre Änderungen kurz auf Deutsch.',
    '- Bei Unklarheiten triff eine sinnvolle didaktische Annahme und nenne sie.',
  ].join('\n');
}

export function buildPrompt(form) {
  const values = withDefaults(form);
  const type = APP_TYPES[values.appType];
  const goals = lines(values.goals);
  const differentiation = [...pick(DIFFERENTIATION, values.differentiation), ...lines(values.differentiationText)];
  const parts = [
    `Erstelle ${type.noun} für den Musikunterricht zum Thema „${values.topic.trim()}“.`,
    '',
    `Zielgruppe: ${values.audience}. Bearbeitungszeit: etwa ${values.duration} Minuten.`,
    '',
    'Lernziele, danach können die Schüler*innen:',
    ...(goals.length ? goals.map((goal) => `- ${goal}`) : ['- (bitte passende Lernziele vorschlagen)']),
    '',
    'Aufbau:',
    ...type.structure.map((line) => (/^\d/.test(line) ? `  ${line}` : `- ${line}`)),
  ];
  if (differentiation.length) parts.push('', 'Differenzierung:', ...differentiation.map((item) => `- ${item}`));
  if (values.wishes.trim()) parts.push('', 'Besondere Wünsche:', values.wishes.trim());
  parts.push('', 'Halte dich an die System Instructions (Technik, Didaktik, Gestaltung). Baue zuerst eine vollständig lauffähige erste Version.');
  return parts.join('\n');
}

export const FOLLOW_UP_PROMPTS = [
  { label: 'Einfachere Sprache', text: 'Überarbeite alle Texte der App in einfacher Sprache für {audience}: kurze Sätze, bekannte Wörter, Fachbegriffe kurz erklären. Ändere sonst nichts.' },
  { label: 'Drei Schwierigkeitsstufen', text: 'Füge eine Auswahl für drei Schwierigkeitsstufen (leicht, mittel, schwer) hinzu. Die Stufen unterscheiden sich in Menge, Tempo und Hilfen.' },
  { label: 'Besseres Feedback', text: 'Verbessere das Feedback: Bei richtigen Antworten kurz loben, bei falschen erklären, warum, und einen Tipp geben. Nichts darf bloßstellen.' },
  { label: 'iPad-Check', text: 'Prüfe die App auf iPad-Tauglichkeit: Touch-Ziele mindestens 44 px, nichts hängt von Hover ab, Drag & Drop mit Pointer-Events, Hoch- und Querformat. Behebe gefundene Probleme.' },
  { label: 'MuDiKo-Hub-Check', text: 'Prüfe, ob die App im MuDiKo Hub laufen kann: React + Vite mit npm, "build"-Skript vorhanden, kein API-Schlüssel, kein Server, keine Gemini-Aufrufe, keine Pop-ups. Entferne ungenutzte Abhängigkeiten wie @google/genai.' },
  { label: 'Barrierearm', text: 'Mach die App barriereärmer: gute Kontraste, aria-label für alle Bedienelemente, Bedienung auch ohne Ton, Schrift mindestens 16 px.' },
  { label: 'Abschluss-Urkunde', text: 'Füge am Ende eine Ergebnis-Karte mit kleiner Urkunde hinzu. Ein Name kann eingetippt werden, wird aber nicht gespeichert.' },
  { label: 'Fehler beheben', text: 'In der App passiert folgender Fehler: [hier beschreiben, was passiert und was passieren sollte]. Finde die Ursache und behebe sie, ohne andere Funktionen zu verändern.' },
];

export function followUpText(prompt, form) {
  return prompt.text.replaceAll('{audience}', withDefaults(form).audience);
}

// Context block for a building block from the library (lib/templates.js).
export function templateContext(template) {
  return [
    `Hier ist ein Baustein aus der MuDiKo-Bibliothek: „${template.title}“.`,
    template.usage,
    'Nutze ihn als Vorlage für Aufbau, Verhalten und Gestaltung und setze ihn in unserer React/TypeScript-App als eigene Komponente um (Tailwind statt eigenem CSS). Passe die Inhalte an unser Thema an.',
    '',
    '```html',
    template.html.trim(),
    '```',
  ].join('\n');
}

function withDefaults(form = {}) {
  const values = { ...DEFAULT_FORM, ...form };
  if (!APP_TYPES[values.appType]) values.appType = DEFAULT_FORM.appType;
  for (const key of ['topic', 'goals', 'constraintsText', 'differentiationText', 'wishes']) values[key] = String(values[key] || '');
  return values;
}

function pick(dictionary, keys = []) {
  return keys.filter((key) => dictionary[key]).map((key) => dictionary[key]);
}

function lines(text) {
  return String(text || '').split('\n').map((line) => line.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
}

function extraLines(text, prefix = '') {
  return lines(text).map((line) => `- ${prefix}${line}`);
}
