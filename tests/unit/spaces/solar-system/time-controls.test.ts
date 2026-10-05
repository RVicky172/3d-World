import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimeControls } from '../../../../src/spaces/solar-system/time-controls';
import { daysFromEpochMs, type SimTime } from '../../../../src/spaces/solar-system/time';

// Spec 021, AC-6–AC-8 (plan §7): a "Time" group with the date (not live), play/pause, speed and direction, each
// reporting its state, announcing changes politely and keeping focus.

const day = (iso: string) => daysFromEpochMs(Date.parse(`${iso}T12:00:00Z`));
const START: SimTime = { days: day('2026-10-05'), speed: 'week', backwards: false, playing: true };

describe('createTimeControls', () => {
  let overlay: HTMLElement;
  let space: AbortController;
  let onChange: ReturnType<typeof vi.fn<(time: SimTime) => void>>;

  beforeEach(() => {
    overlay = document.createElement('div');
    document.body.replaceChildren(overlay);
    space = new AbortController();
    onChange = vi.fn<(time: SimTime) => void>();
  });

  const create = (time: SimTime = START) =>
    createTimeControls({ overlay, signal: space.signal, time, onChange });
  const group = () => overlay.querySelector<HTMLElement>('[role="group"]')!;
  const date = () => group().querySelector('time')!;
  const play = () => group().querySelector<HTMLButtonElement>('button.time-play')!;
  const speed = () => group().querySelector<HTMLSelectElement>('select')!;
  const backwards = () => group().querySelector<HTMLButtonElement>('button.time-direction')!;
  const announcer = () => group().querySelector<HTMLElement>('[aria-live="polite"]')!;

  it('is a group named "Time"', () => {
    create();
    expect(group().getAttribute('aria-label')).toBe('Time');
    expect(group().classList.contains('time-controls')).toBe(true);
  });

  it('shows the date as <time datetime>, as text that is not announced on every change (AC-7)', () => {
    create();
    expect(date().textContent).toBe('5 Oct 2026');
    expect(date().getAttribute('datetime')).toBe('2026-10-05');
    expect(date().closest('[aria-live]')).toBeNull();
  });

  it('play/pause is a button named for what it will do', () => {
    create();
    expect(play().type).toBe('button');
    expect(play().textContent).toBe('Pause time');
    create({ ...START, playing: false });
    expect(overlay.querySelectorAll<HTMLButtonElement>('button.time-play')[1]!.textContent).toBe('Play time');
  });

  it('offers four speeds in a labelled select, 1 week per second by default (Q2)', () => {
    create();
    expect(speed().getAttribute('aria-label')).toBe('Speed');
    expect([...speed().options].map((o) => [o.value, o.textContent])).toEqual([
      ['day', '1 day per second'],
      ['week', '1 week per second'],
      ['month', '1 month per second'],
      ['year', '1 year per second'],
    ]);
    expect(speed().value).toBe('week');
  });

  it('direction is a "Backwards" toggle with aria-pressed', () => {
    create();
    expect(backwards().textContent).toBe('Backwards');
    expect(backwards().getAttribute('aria-pressed')).toBe('false');
  });

  it('play/pause reports the new state, renames itself, announces it and keeps focus', () => {
    create();
    play().focus();
    play().click();
    expect(onChange).toHaveBeenLastCalledWith({ ...START, playing: false });
    expect(play().textContent).toBe('Play time');
    expect(announcer().textContent).toBe('Time paused');
    expect(document.activeElement).toBe(play());
    play().click();
    expect(onChange).toHaveBeenLastCalledWith({ ...START, playing: true });
    expect(announcer().textContent).toBe('Time playing');
  });

  it('a speed choice reports the new speed (the select announces itself)', () => {
    create();
    speed().focus();
    speed().value = 'year';
    speed().dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith({ ...START, speed: 'year' });
    expect(announcer().textContent).toBe('');
    expect(document.activeElement).toBe(speed());
  });

  it('the direction toggle reports, presses, announces and keeps focus', () => {
    create();
    backwards().focus();
    backwards().click();
    expect(onChange).toHaveBeenLastCalledWith({ ...START, backwards: true });
    expect(backwards().getAttribute('aria-pressed')).toBe('true');
    expect(announcer().textContent).toBe('Time runs backwards');
    expect(document.activeElement).toBe(backwards());
    backwards().click();
    expect(announcer().textContent).toBe('Time runs forwards');
  });

  it('keeps working from the latest state set from outside', () => {
    const controls = create();
    controls.set({ ...START, speed: 'month', backwards: true, playing: false });
    play().click();
    expect(onChange).toHaveBeenLastCalledWith({ ...START, speed: 'month', backwards: true, playing: true });
  });

  it('set() shows a state without reporting or announcing it (restores, range limits, every frame)', () => {
    const controls = create();
    controls.set({ days: day('2031-03-12'), speed: 'day', backwards: true, playing: false });
    expect(date().textContent).toBe('12 Mar 2031');
    expect(date().getAttribute('datetime')).toBe('2031-03-12');
    expect(play().textContent).toBe('Play time');
    expect(speed().value).toBe('day');
    expect(backwards().getAttribute('aria-pressed')).toBe('true');
    expect(onChange).not.toHaveBeenCalled();
    expect(announcer().textContent).toBe('');
  });

  it('writes the date only when the shown day changes', () => {
    const controls = create();
    const node = date().firstChild;
    controls.set({ ...START, days: START.days + 0.2 });
    expect(date().firstChild).toBe(node);
    controls.set({ ...START, days: START.days + 1 });
    expect(date().textContent).toBe('6 Oct 2026');
  });

  it('announces a range limit politely (AC-8)', () => {
    const controls = create();
    controls.announceLimit('end');
    expect(announcer().textContent).toBe('Reached 2050, the end of the supported dates. Time paused.');
    controls.announceLimit('start');
    expect(announcer().textContent).toBe('Reached 1800, the start of the supported dates. Time paused.');
  });

  it('dispose removes the group and its listeners', () => {
    const controls = create();
    const button = play();
    controls.dispose();
    expect(overlay.querySelector('.time-controls')).toBeNull();
    button.click();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('the Space’s signal also removes the listeners', () => {
    create();
    space.abort();
    play().click();
    expect(onChange).not.toHaveBeenCalled();
  });
});
