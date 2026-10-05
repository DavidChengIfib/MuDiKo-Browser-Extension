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

test('startDeployment sends the same form fields as the hub import page', async () => {
  const calls = [];
  const client = createHubClient('http://localhost:3000', async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(202, { success: true, deploymentJobId: 'job-1', job: { id: 'job-1', status: 'queued' } });
  });
  const zipFile = new File(['PK'], 'projekt.zip', { type: 'application/zip' });

  const job = await client.startDeployment({
    name: 'Quiz', description: 'Ein Quiz', tags: ['Lernpfad'], zipFile, csrfToken: 'csrf-123',
  });

  assert.equal(job.id, 'job-1');
  const [{ url, options }] = calls;
  assert.equal(url, 'http://localhost:3000/api/app-hub/deployments');
  assert.equal(options.method, 'POST');
  assert.equal(options.credentials, 'include');
  assert.equal(options.headers['X-CSRF-Token'], 'csrf-123');
  assert.equal(options.body.get('name'), 'Quiz');
  assert.equal(options.body.get('description'), 'Ein Quiz');
  assert.equal(options.body.get('tags'), '["Lernpfad"]');
  assert.equal(options.body.get('projectZip').name, 'projekt.zip');
});

test('hub error messages are passed on together with the HTTP status', async () => {
  const client = createHubClient('http://localhost:3000', async () => (
    jsonResponse(401, { success: false, error: 'Admin-Anmeldung erforderlich.' })
  ));
  await assert.rejects(client.getDeployment('job-1'), (error) => (
    error.message === 'Admin-Anmeldung erforderlich.' && error.status === 401
  ));
});

test('an unreachable hub is reported with status 0', async () => {
  const client = createHubClient('http://localhost:3000', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(client.getSession(), (error) => error.status === 0 && /nicht erreichbar/.test(error.message));
});
