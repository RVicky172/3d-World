import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createControlsUi, HINT_SECONDS } from '../../../../src/shared/controls/controls-ui';

describe('createControlsUi', () => {
  let overlay: HTMLElement;
  let controller: AbortController;
  let onReset: ReturnType<typeof vi.fn<() => void>>;

  const make = (coarsePointer = false) =>
    createControlsUi({ overlay, signal: controller.signal, coarsePointer, onReset });
  const hint = () => overlay.querySelector('.controls-hint');
  const toggle = () => overlay.querySelector<HTMLButtonElement>('button.controls-help-toggle');
  const panel = () => overlay.querySelector<HTMLElement>('.controls-help');
  const resetButton = () => overlay.querySelector<HTMLButtonElement>('button.controls-reset');

  beforeEach(() => {
    overlay = document.createElement('div');
    document.body.append(overlay);
    controller = new AbortController();
    onReset = vi.fn<() => void>();
  });

  describe('hint (AC-10)', () => {
    it('describes mouse and keyboard on fine pointers, politely announced', () => {
      make(false);
      expect(hint()?.getAttribute('aria-live')).toBe('polite');
      expect(hint()?.textContent).toMatch(/Drag to rotate/);
      expect(hint()?.textContent).toMatch(/Scroll to zoom/);
      expect(hint()?.textContent).toMatch(/R to reset/);
    });

    it('describes touch gestures on coarse pointers', () => {
      make(true);
      expect(hint()?.textContent).toMatch(/Pinch to zoom/);
      expect(hint()?.textContent).not.toMatch(/Scroll/);
    });

    it(`disappears after ${HINT_SECONDS} s of Space time`, () => {
      const ui = make();
      ui.tick(HINT_SECONDS - 0.1);
      expect(hint()).not.toBeNull();
      ui.tick(0.1);
      expect(hint()).toBeNull();
    });

    it('disappears on the first interaction', () => {
      const ui = make();
      ui.dismissHint();
      expect(hint()).toBeNull();
      expect(() => ui.dismissHint()).not.toThrow();
    });
  });

  describe('help panel (AC-10)', () => {
    it('is a collapsed disclosure by default', () => {
      make();
      expect(toggle()?.getAttribute('aria-expanded')).toBe('false');
      expect(toggle()?.getAttribute('aria-controls')).toBe(panel()?.id);
      expect(toggle()?.getAttribute('aria-label')).toMatch(/controls/i);
      expect(panel()?.hidden).toBe(true);
    });

    it('opens and closes with the "?" button', () => {
      make();
      toggle()?.click();
      expect(toggle()?.getAttribute('aria-expanded')).toBe('true');
      expect(panel()?.hidden).toBe(false);
      toggle()?.click();
      expect(panel()?.hidden).toBe(true);
    });

    it('lists mouse, touch and keyboard controls', () => {
      make();
      const text = panel()?.textContent ?? '';
      expect(text).toMatch(/Mouse/);
      expect(text).toMatch(/Touch/);
      expect(text).toMatch(/Keyboard/);
      expect(text).toMatch(/Shift/);
    });

    it('closes on Escape and returns focus to the "?" button', () => {
      make();
      toggle()?.click();
      panel()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(panel()?.hidden).toBe(true);
      expect(document.activeElement).toBe(toggle());
    });

    it('gives each instance a unique panel id', () => {
      make();
      make();
      const ids = [...overlay.querySelectorAll('.controls-help')].map((p) => p.id);
      expect(new Set(ids).size).toBe(2);
    });
  });

  describe('reset button (AC-5)', () => {
    it('calls onReset', () => {
      make();
      expect(resetButton()?.textContent).toBe('Reset view');
      resetButton()?.click();
      expect(onReset).toHaveBeenCalledOnce();
    });
  });

  describe('teardown (AC-8)', () => {
    it('dispose() removes everything it added', () => {
      const other = document.createElement('div');
      overlay.append(other);
      make().dispose();
      expect([...overlay.children]).toEqual([other]);
    });

    it('the signal removes its listeners', () => {
      make();
      const button = resetButton();
      controller.abort();
      button?.click();
      expect(onReset).not.toHaveBeenCalled();
    });
  });
});
