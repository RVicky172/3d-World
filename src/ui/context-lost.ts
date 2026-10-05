const PANEL_CLASS = 'context-lost';

const COPY = {
  heading: 'The 3D view stopped',
  body:
    "Your device's graphics were interrupted (this can happen after a driver update or when memory runs low). " +
    'It may come back by itself; if not, reload the page.',
  reload: 'Reload',
};

/**
 * Shows the "3D view stopped" alert above the fader (spec 005, AC-6/AC-7), replacing any previous one.
 * Returns a function that removes it.
 */
export function showContextLost(container: HTMLElement, onReload: () => void): () => void {
  container.querySelector(`:scope > .${PANEL_CLASS}`)?.remove();

  const box = document.createElement('div');
  box.className = PANEL_CLASS;
  box.setAttribute('role', 'alert');

  const title = document.createElement('h2');
  title.textContent = COPY.heading;
  const text = document.createElement('p');
  text.textContent = COPY.body;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = COPY.reload;
  button.addEventListener('click', onReload);

  box.append(title, text, button);
  container.append(box);
  return () => box.remove();
}
