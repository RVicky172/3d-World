import { describe, expect, it, vi } from 'vitest';
import { FakeBrowserLocation } from '../../helpers/fakes';

// The router tests trust this fake to behave like a browser; these pin that behaviour down.
describe('FakeBrowserLocation', () => {
  const listen = (loc: FakeBrowserLocation) => {
    const onChange = vi.fn();
    loc.addEventListener('hashchange', onChange);
    return onChange;
  };

  it('normalises hashes like location.hash', () => {
    expect(new FakeBrowserLocation('').hash).toBe('');
    expect(new FakeBrowserLocation('#').hash).toBe('');
    expect(new FakeBrowserLocation('/a').hash).toBe('#/a');
  });

  it('assigning a new hash pushes an entry and fires hashchange', () => {
    const loc = new FakeBrowserLocation('#/a');
    const onChange = listen(loc);
    loc.hash = '#/b';
    expect(loc.entries).toEqual(['#/a', '#/b']);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('assigning the current hash does nothing', () => {
    const loc = new FakeBrowserLocation('#/a');
    const onChange = listen(loc);
    loc.hash = '#/a';
    expect(loc.entries).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('replaceState swaps the current entry without an event', () => {
    const loc = new FakeBrowserLocation('#/a');
    const onChange = listen(loc);
    loc.replaceState(null, '', '#/');
    expect(loc.entries).toEqual(['#/']);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('back/forward move through entries and fire hashchange', () => {
    const loc = new FakeBrowserLocation('#/a');
    loc.hash = '#/b';
    const onChange = listen(loc);
    loc.back();
    expect(loc.hash).toBe('#/a');
    loc.forward();
    expect(loc.hash).toBe('#/b');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('back at the first entry and forward at the last do nothing', () => {
    const loc = new FakeBrowserLocation('#/a');
    const onChange = listen(loc);
    loc.back();
    loc.forward();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('navigating after going back drops the forward entries', () => {
    const loc = new FakeBrowserLocation('#/a');
    loc.hash = '#/b';
    loc.back();
    loc.hash = '#/c';
    expect(loc.entries).toEqual(['#/a', '#/c']);
  });
});
