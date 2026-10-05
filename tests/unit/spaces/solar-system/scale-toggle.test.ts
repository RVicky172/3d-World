import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createScaleToggle } from '../../../../src/spaces/solar-system/scale-toggle';
import type { ScaleMode } from '../../../../src/spaces/solar-system/types';

// Spec 020, AC-7 and the accessibility NFR: a labelled toggle that reports its state, announces the change
// politely, keeps focus, and puts the current scale into the 3D view's description.

describe('createScaleToggle', () => {
  let overlay: HTMLElement;
  let canvas: HTMLCanvasElement;
  let space: AbortController;
  let onChange: ReturnType<typeof vi.fn<(mode: ScaleMode) => void>>;

  beforeEach(() => {
    overlay = document.createElement('div');
    canvas = document.createElement('canvas');
    document.body.replaceChildren(canvas, overlay);
    space = new AbortController();
    onChange = vi.fn<(mode: ScaleMode) => void>();
  });

  const create = (mode: ScaleMode = 'stylised') =>
    createScaleToggle({ overlay, canvas, signal: space.signal, mode, onChange });
  const button = () => overlay.querySelector<HTMLButtonElement>('button.scale-toggle')!;
  const description = () => document.getElementById(canvas.getAttribute('aria-describedby') ?? '');

  it('is a "True scale" toggle button, not pressed at stylised scale', () => {
    create('stylised');
    expect(button().type).toBe('button');
    expect(button().textContent).toBe('True scale');
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });

  it('is pressed when it opens at real scale (a remembered choice)', () => {
    create('real');
    expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(description()?.textContent).toMatch(/^True scale/);
  });

  it('describes the current scale in a polite region that the 3D view points at', () => {
    create('stylised');
    expect(description()).not.toBeNull();
    expect(overlay.contains(description())).toBe(true);
    expect(description()?.getAttribute('aria-live')).toBe('polite');
    expect(description()?.textContent).toMatch(/^Stylised scale/);
  });

  it('a click switches scale, reports it, announces it and keeps focus', () => {
    create('stylised');
    button().focus();
    button().click();
    expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(description()?.textContent).toMatch(/^True scale/);
    expect(onChange).toHaveBeenLastCalledWith('real');
    expect(document.activeElement).toBe(button());

    button().click();
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(description()?.textContent).toMatch(/^Stylised scale/);
    expect(onChange).toHaveBeenLastCalledWith('stylised');
  });

  it('set() updates the state from outside without reporting a change', () => {
    const toggle = create('stylised');
    toggle.set('real');
    expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(description()?.textContent).toMatch(/^True scale/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('two toggles get distinct description ids', () => {
    create();
    const first = canvas.getAttribute('aria-describedby');
    const otherCanvas = document.createElement('canvas');
    createScaleToggle({ overlay, canvas: otherCanvas, signal: space.signal, mode: 'stylised', onChange });
    expect(otherCanvas.getAttribute('aria-describedby')).not.toBe(first);
  });

  it('dispose() removes its DOM, the 3D view’s description and its listener (AC-12)', () => {
    const toggle = create();
    const kept = button();
    toggle.dispose();
    expect(overlay.querySelector('.scale-toggle')).toBeNull();
    expect(canvas.hasAttribute('aria-describedby')).toBe(false);
    kept.click();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('aborting the Space signal also removes the listener', () => {
    create();
    const kept = button();
    space.abort();
    kept.click();
    expect(onChange).not.toHaveBeenCalled();
  });
});
