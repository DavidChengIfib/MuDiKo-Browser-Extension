import assert from 'node:assert/strict';
import test from 'node:test';
import { createHubClient, normalizeHubUrl, parseTags } from '../extension/lib/hub-client.js';

const jsonResponse = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

test('normalizeHubUrl keeps only the origin', () => {
  assert.equal(normalizeHubUrl(' http://localhost:3000/admin/ '), 'http://localhost:3000');
  assert.equal(normalizeHubUrl('https://music.ifib.eu'), 'https://music.ifib.eu');
});

test('normalizeHubUrl rejects incomplete or non-web addresses', () => {
  assert.throws(() => normalizeHubUrl('localhost:3000'), /http:\/\/ oder https:\/\//);
  assert.throws(() => normalizeHubUrl('music hub'), /vollständige Adresse/);
});

test('parseTags trims, drops empty entries and duplicates', () => {
  assert.deepEqual(parseTags(' Lernpfad, ,Klasse 7, Lernpfad '), ['Lernpfad', 'Klasse 7']);
});

test('submitProject sends the ZIP to the waiting list, not straight to deployment', async () => {
  const calls = [];
  const client = createHubClient('http://localhost:3000', async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(201, { success: true, submission: { id: 'a'.repeat(32), name: 'Quiz', status: 'pending' } });
  });
  const zipFile = new File(['PK'], 'projekt.zip', { type: 'application/zip' });

  const submission = await client.submitProject({
    name: 'Quiz', description: 'Ein Quiz', tags: ['Lernpfad'], zipFile, submitterName: 'Frau Müller',
  });

  assert.equal(submission.status, 'pending');
  const [{ url, options }] = calls;
  assert.equal(url, 'http://localhost:3000/api/app-hub/submissions');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers, undefined, 'no login token is needed');
  assert.equal(options.body.get('submitterName'), 'Frau Müller');
  assert.equal(options.body.get('name'), 'Quiz');
  assert.equal(options.body.get('description'), 'Ein Quiz');
  assert.equal(options.body.get('tags'), '["Lernpfad"]');
  assert.equal(options.body.get('source'), 'browser-extension');
  assert.equal(options.body.get('projectZip').name, 'projekt.zip');
  assert.equal(client.submissionsUrl, 'http://localhost:3000/admin/submissions');
});

test('hub error messages are passed on together with the HTTP status', async () => {
  const client = createHubClient('http://localhost:3000', async () => (
    jsonResponse(400, { success: false, error: 'Unsicherer Dateipfad im ZIP-Archiv erkannt (Zip Slip).' })
  ));
  const zipFile = new File(['PK'], 'projekt.zip', { type: 'application/zip' });
  await assert.rejects(
    client.submitProject({ name: 'Quiz', description: '', tags: [], zipFile }),
    (error) => error.message.includes('Zip Slip') && error.status === 400,
  );
});

test('remix apps are listed and downloaded from the hub without login', async () => {
  const calls = [];
  const client = createHubClient('http://localhost:3000', async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, { success: true, apps: [{ slug: 'pitch-piano', name: 'Pitch Piano' }] });
  });
  const apps = await client.listRemixApps();
  assert.deepEqual(apps.map((app) => app.slug), ['pitch-piano']);
  assert.equal(calls[0].url, 'http://localhost:3000/api/app-hub/remix');
  assert.equal(client.remixDownloadUrl('pitch piano'), 'http://localhost:3000/api/app-hub/remix/pitch%20piano/download');
});

test('an unreachable hub is reported with status 0', async () => {
  const client = createHubClient('http://localhost:3000', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(client.getStatus(), (error) => error.status === 0 && /nicht erreichbar/.test(error.message));
});
