import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APP_TYPES, DEFAULT_FORM, FOLLOW_UP_PROMPTS, buildPrompt, buildSystemInstruction, followUpText, templateContext,
  validateForm,
} from '../extension/lib/prompt-builder.js';
import '../extension/lib/templates.js';

const form = {
  ...DEFAULT_FORM,
  appType: 'quiz',
  topic: '  Intervalle hören  ',
  audience: 'Klasse 5–6',
  devices: ['ipad'],
  goals: '- große und kleine Terz unterscheiden\n\nIntervalle am Klavier finden',
  constraints: ['noLogin', 'noMic'],
  constraintsText: 'nur ein Gerät pro Gruppe',
  differentiation: ['hints'],
  wishes: 'Urkunde am Ende',
};

test('a topic is required before anything is generated', () => {
  assert.match(validateForm({ ...DEFAULT_FORM, topic: '   ' }), /Thema/);
  assert.equal(validateForm(form), '');
});

test('the system instruction always carries the rules the MuDiKo hub needs', () => {
  const text = buildSystemInstruction(form);
  assert.match(text, /React \+ TypeScript \+ Vite/);
  assert.match(text, /"build": "vite build"/);
  assert.match(text, /Keine API-Schlüssel und keine Gemini-API/);
  assert.match(text, /kein eigener Server/);
  assert.match(text, /iframe/);
  assert.match(text, /Pointer-Events/);
});

test('the system instruction reflects the form answers', () => {
  const text = buildSystemInstruction(form);
  assert.match(text, /Zielgruppe: Klasse 5–6/);
  assert.match(text, /Geräte: iPad \/ Tablet\./);
  assert.match(text, /Kein Mikrofon verwenden\./);
  assert.match(text, /- nur ein Gerät pro Gruppe/);
  assert.match(text, /Differenzierung: Hilfen und Tipps auf Abruf/);
  assert.doesNotMatch(text, /Drei Schwierigkeitsstufen/);
  assert.match(text, /App-Typ: Quiz \/ Übung/);
});

test('the first prompt describes the concrete app', () => {
  const text = buildPrompt(form);
  assert.match(text, /^Erstelle ein Quiz für den Musikunterricht zum Thema „Intervalle hören“\./);
  assert.match(text, /- große und kleine Terz unterscheiden\n- Intervalle am Klavier finden/);
  for (const line of APP_TYPES.quiz.structure) assert.ok(text.includes(line), line);
  assert.match(text, /Besondere Wünsche:\nUrkunde am Ende/);
  assert.match(text, /Halte dich an die System Instructions/);
});

test('missing goals are left to the AI, unknown app types fall back to a learning path', () => {
  const text = buildPrompt({ topic: 'Rhythmus', goals: '', appType: 'unbekannt' });
  assert.match(text, /bitte passende Lernziele vorschlagen/);
  assert.match(text, /^Erstelle einen Lernpfad/);
});

test('follow-up prompts use the chosen target group', () => {
  const simple = FOLLOW_UP_PROMPTS.find((prompt) => prompt.label === 'Einfachere Sprache');
  assert.match(followUpText(simple, form), /für Klasse 5–6:/);
  assert.ok(FOLLOW_UP_PROMPTS.every((prompt) => prompt.label && prompt.text));
});

test('every building block is complete and needs no external resources', () => {
  const templates = globalThis.MUDIKO_TEMPLATES;
  assert.deepEqual(templates.map((template) => template.id), ['lernpfad', 'quiz', 'zuordnen', 'klaviatur']);
  for (const template of templates) {
    assert.ok(template.title && template.summary && template.usage && template.tags.length, template.id);
    assert.match(template.html, /^<!doctype html>/i, template.id);
    assert.match(template.html, /<\/html>\s*$/, template.id);
    assert.doesNotMatch(template.html, /(src|href)=["']https?:/i, `${template.id} loads nothing from the internet`);
  }
});

test('a building block is handed to AI Studio as fenced HTML with instructions', () => {
  const quiz = globalThis.MUDIKO_TEMPLATES.find((template) => template.id === 'quiz');
  const context = templateContext(quiz);
  assert.match(context, /^Hier ist ein Baustein aus der MuDiKo-Bibliothek: „Quiz-Baustein“\./);
  assert.match(context, /React\/TypeScript-App/);
  assert.match(context, /```html\n<!doctype html>[\s\S]*<\/html>\n```$/);
});
