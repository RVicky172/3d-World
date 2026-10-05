import { formatDate, isoDate, SPEEDS, type SimTime, type Speed } from './time';

const SPEED_LABELS: Record<Speed, string> = {
  day: '1 day per second',
  week: '1 week per second',
  month: '1 month per second',
  year: '1 year per second',
};

const LIMIT_MESSAGES = {
  start: 'Reached 1800, the start of the supported dates. Time paused.',
  end: 'Reached 2050, the end of the supported dates. Time paused.',
} as const;

export interface TimeControls {
  /** Shows `time` without reporting or announcing it (restores, range limits, every frame's date). */
  set(time: SimTime): void;
  /** Says politely that time stopped at a range limit (AC-8). */
  announceLimit(limit: 'start' | 'end'): void;
  dispose(): void;
}

/**
 * The time controls (spec 021, AC-6–AC-8, plan §7): a group named "Time" holding the date as `<time datetime>`
 * (visible, not live), a play/pause button named for what it will do, a native speed select, and a "Backwards"
 * toggle (`aria-pressed`). Play/pause, direction and range limits are announced in a visually hidden polite
 * region; the select announces itself. Controls are updated in place, so focus stays on the one used.
 */
export function createTimeControls(options: {
  overlay: HTMLElement;
  signal: AbortSignal;
  time: SimTime;
  onChange(time: SimTime): void;
}): TimeControls {
  const { overlay, onChange } = options;
  const listeners = new AbortController();
  options.signal.addEventListener('abort', () => listeners.abort(), { once: true, signal: listeners.signal });
  const { signal } = listeners;

  const root = document.createElement('div');
  root.className = 'time-controls';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Time');

  const date = document.createElement('time');
  date.className = 'time-date';

  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'time-play';

  const speed = document.createElement('select');
  speed.className = 'time-speed';
  speed.setAttribute('aria-label', 'Speed');
  for (const key of Object.keys(SPEEDS) as Speed[]) {
    speed.append(new Option(SPEED_LABELS[key], key));
  }

  const backwards = document.createElement('button');
  backwards.type = 'button';
  backwards.className = 'time-direction';
  backwards.textContent = 'Backwards';

  const announcer = document.createElement('p');
  announcer.className = 'visually-hidden';
  announcer.setAttribute('aria-live', 'polite');

  root.append(date, play, speed, backwards, announcer);
  overlay.append(root);

  let time = options.time;
  let shownDay = '';
  const show = (next: SimTime) => {
    time = next;
    const iso = isoDate(next.days);
    if (iso !== shownDay) {
      shownDay = iso;
      date.dateTime = iso;
      date.textContent = formatDate(next.days);
    }
    play.textContent = next.playing ? 'Pause time' : 'Play time';
    if (speed.value !== next.speed) speed.value = next.speed;
    backwards.setAttribute('aria-pressed', String(next.backwards));
  };
  const change = (next: SimTime, message?: string) => {
    show(next);
    if (message) announcer.textContent = message;
    onChange(next);
  };
  show(time);

  play.addEventListener(
    'click',
    () => change({ ...time, playing: !time.playing }, time.playing ? 'Time paused' : 'Time playing'),
    { signal },
  );
  speed.addEventListener('change', () => change({ ...time, speed: speed.value as Speed }), { signal });
  backwards.addEventListener(
    'click',
    () =>
      change(
        { ...time, backwards: !time.backwards },
        time.backwards ? 'Time runs forwards' : 'Time runs backwards',
      ),
    { signal },
  );

  return {
    set: show,
    announceLimit(limit) {
      announcer.textContent = LIMIT_MESSAGES[limit];
    },
    dispose() {
      listeners.abort();
      root.remove();
    },
  };
}
