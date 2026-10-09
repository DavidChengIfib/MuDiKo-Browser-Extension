// Small MuDiKo notice in the bottom right corner of AI Studio, shared by the other content scripts.
// actions: [{ label, primary, onClick(toast) }]; returns { close, setText, setActions }.
globalThis.mudikoToast = function mudikoToast({ title, text = '', actions = [], timeout = 15000 }) {
  document.querySelectorAll('[data-mudiko-toast]').forEach((node) => node.remove());

  const host = document.createElement('div');
  host.setAttribute('data-mudiko-toast', '');
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    .toast { font: 14px/1.45 system-ui, sans-serif; color: #fff; background: #2b2b2b; border-radius: 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,.35); padding: 14px 16px; max-width: 340px; display: grid; gap: 8px;
      border-top: 4px solid #87BDCF; }
    .text { opacity: .82; word-break: break-word; }
    .row { display: flex; flex-wrap: wrap; gap: 8px; }
    button { font: inherit; font-weight: 600; border: 0; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
    .primary { background: #87BDCF; color: #222; }
    .secondary { background: #575757; color: #fff; }`;

  const box = document.createElement('div');
  box.className = 'toast';
  const titleElement = document.createElement('strong');
  titleElement.textContent = title;
  const textElement = document.createElement('span');
  textElement.className = 'text';
  const row = document.createElement('div');
  row.className = 'row';
  box.append(titleElement, textElement, row);
  shadow.append(style, box);
  document.documentElement.append(host);

  let timer = 0;
  const toast = {
    close() {
      clearTimeout(timer);
      host.remove();
    },
    setText(value) {
      textElement.textContent = value;
      textElement.hidden = !value;
    },
    setActions(list) {
      row.replaceChildren(...list.map((action) => {
        const button = document.createElement('button');
        button.className = action.primary ? 'primary' : 'secondary';
        button.textContent = action.label;
        button.addEventListener('click', () => action.onClick(toast));
        return button;
      }));
      row.hidden = !list.length;
    },
  };
  toast.setText(text);
  toast.setActions(actions);
  if (timeout) timer = setTimeout(toast.close, timeout);
  return toast;
};
