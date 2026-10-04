import { beforeEach, describe, expect, it } from 'vitest';
import { clearMessage, showMessage } from '../../../src/ui/messages';

describe('overlay messages', () => {
  let overlay: HTMLElement;

  beforeEach(() => {
    overlay = document.createElement('div');
  });

  it('shows an accessible "Space not found" alert naming the id (AC-8)', () => {
    showMessage(overlay, 'not-found', 'nope');
    const alert = overlay.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Space not found');
    expect(alert?.textContent).toContain('nope');
  });

  it('shows a "Failed to load" alert', () => {
    showMessage(overlay, 'load-error', 'demo-cube');
    expect(overlay.querySelector('[role="alert"]')?.textContent).toContain('Failed to load');
  });

  it('renders the id as text, never as HTML', () => {
    showMessage(overlay, 'not-found', '<img src=x onerror=alert(1)>');
    expect(overlay.querySelector('img')).toBeNull();
  });

  it('replaces the previous message instead of stacking', () => {
    showMessage(overlay, 'not-found', 'a');
    showMessage(overlay, 'load-error', 'b');
    expect(overlay.querySelectorAll('[role="alert"]')).toHaveLength(1);
  });

  it('clearMessage() removes only the message, leaving other overlay content', () => {
    const spaceUi = document.createElement('div');
    overlay.append(spaceUi);
    showMessage(overlay, 'not-found', 'a');

    clearMessage(overlay);

    expect(overlay.querySelector('[role="alert"]')).toBeNull();
    expect(overlay.contains(spaceUi)).toBe(true);
  });

  it('clearMessage() is safe when no message is shown', () => {
    expect(() => clearMessage(overlay)).not.toThrow();
  });
});
