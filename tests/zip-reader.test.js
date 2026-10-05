import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { listZipEntries, readAiStudioMetadata } from '../extension/lib/zip-reader.js';

const fixture = async (name) => new Blob([await readFile(new URL(`./fixtures/${name}`, import.meta.url))]);

test('reads name and description from an uncompressed AI Studio export', async () => {
  const metadata = await readAiStudioMetadata(await fixture('ai-studio-export.zip'));
  assert.deepEqual(metadata, {
    name: 'Pitch Piano - Tonhöhen-Erkennung',
    description: 'Echtzeit-Tonhöhenerkennung mit digitalem Klavier.',
  });
});

test('reads deflated metadata from a single top-level folder and ignores deeper or __MACOSX copies', async () => {
  const metadata = await readAiStudioMetadata(await fixture('deflated-in-folder.zip'));
  assert.equal(metadata.name, 'Rhythmus-Quiz');
  assert.equal(metadata.description.length, 1000);
});

test('returns null when the ZIP has no metadata.json', async () => {
  assert.equal(await readAiStudioMetadata(await fixture('no-metadata.zip')), null);
});

test('returns null when metadata.json is not valid JSON', async () => {
  assert.equal(await readAiStudioMetadata(await fixture('broken-metadata.zip')), null);
});

test('rejects data that is not a ZIP archive', async () => {
  await assert.rejects(
    readAiStudioMetadata(new Blob(['kein zip, nur text'])),
    /kein gültiges ZIP-Archiv/,
  );
});

test('lists every entry of the archive', async () => {
  const buffer = await (await fixture('ai-studio-export.zip')).arrayBuffer();
  assert.deepEqual(listZipEntries(buffer).map((entry) => entry.name), ['metadata.json', 'package.json', 'src/App.tsx']);
});
