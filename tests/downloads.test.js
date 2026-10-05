import assert from 'node:assert/strict';
import test from 'node:test';
import { describeDownload, downloadFileName, isAiStudioZipDownload } from '../extension/lib/downloads.js';

test('a blob ZIP created by AI Studio is recognised', () => {
  assert.equal(isAiStudioZipDownload({
    url: 'blob:https://aistudio.google.com/1f2e3d',
    mime: 'application/zip',
    filename: 'C:\\Users\\lehrkraft\\Downloads\\quiz.zip',
  }), true);
});

test('a ZIP from another host counts when AI Studio is the referrer', () => {
  assert.equal(isAiStudioZipDownload({
    url: 'https://storage.googleapis.com/export/quiz.zip?token=abc',
    referrer: 'https://aistudio.google.com/apps/123',
    filename: '/home/lehrkraft/quiz.zip',
  }), true);
});

test('other downloads are ignored', () => {
  assert.equal(isAiStudioZipDownload({ url: 'blob:https://aistudio.google.com/1', mime: 'image/png', filename: 'bild.png' }), false);
  assert.equal(isAiStudioZipDownload({ url: 'https://example.org/quiz.zip', filename: 'quiz.zip' }), false);
  assert.equal(isAiStudioZipDownload({ url: 'https://aistudio.google.com.evil.example/x.zip', filename: 'x.zip' }), false);
});

test('downloadFileName strips the folder and keeps a .zip ending', () => {
  assert.equal(downloadFileName({ filename: 'C:\\Users\\lehrkraft\\Downloads\\quiz (1).zip' }), 'quiz (1).zip');
  assert.equal(downloadFileName({ filename: '/tmp/export' }), 'export.zip');
  assert.equal(downloadFileName({}), 'ai-studio-projekt.zip');
});

test('describeDownload never logs the full download URL', () => {
  const text = describeDownload({
    url: 'https://storage.googleapis.com/export/quiz.zip?token=geheim',
    filename: 'quiz.zip',
    mime: 'application/zip',
  });
  assert.match(text, /https:\/\/storage\.googleapis\.com/);
  assert.doesNotMatch(text, /geheim/);
});
