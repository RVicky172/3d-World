export type MessageKind = 'not-found' | 'load-error';

const MESSAGE_CLASS = 'space-message';

const COPY: Record<MessageKind, { heading: string; body: (id: string) => string }> = {
  'not-found': {
    heading: 'Space not found',
    body: (id) => `There is no space called “${id}”.`,
  },
  'load-error': {
    heading: 'Failed to load this space',
    body: (id) => `“${id}” could not be loaded. Check your connection and try again.`,
  },
};

/** Shows a single accessible alert in the overlay, replacing any previous one. */
export function showMessage(overlay: HTMLElement, kind: MessageKind, spaceId: string): void {
  clearMessage(overlay);
  const { heading, body } = COPY[kind];

  const box = document.createElement('div');
  box.className = MESSAGE_CLASS;
  box.setAttribute('role', 'alert');
  box.dataset.kind = kind;

  const title = document.createElement('h2');
  title.textContent = heading;
  const text = document.createElement('p');
  text.textContent = body(spaceId);

  box.append(title, text);
  overlay.append(box);
}

/** Removes the message, if any, leaving other overlay content alone. */
export function clearMessage(overlay: HTMLElement): void {
  overlay.querySelector(`:scope > .${MESSAGE_CLASS}`)?.remove();
}
