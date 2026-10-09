// Replaces this sandboxed page with the selected building block, e.g. preview.html?id=quiz.
// Runs after parsing: while the page is still being parsed, document.open() would be ignored.
window.addEventListener('DOMContentLoaded', () => {
  const id = new URLSearchParams(window.location.search).get('id');
  const template = (globalThis.MUDIKO_TEMPLATES || []).find((entry) => entry.id === id);
  if (!template) {
    document.getElementById('message').textContent = 'Diesen Baustein gibt es nicht.';
    return;
  }
  document.open();
  document.write(template.html);
  document.close();
  document.title = `Vorschau: ${template.title}`;
});
