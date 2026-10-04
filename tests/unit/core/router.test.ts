import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HashRouter, SITE_TITLE } from '../../../src/core/router';
import type { OpenResult } from '../../../src/core/types';
import { FakeBrowserLocation } from '../../helpers/fakes';

const TITLES: Record<string, string> = { a: 'Space A', b: 'Space B' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

describe('HashRouter', () => {
  let browser: FakeBrowserLocation;
  let openSpace: ReturnType<typeof vi.fn<(id: string) => Promise<OpenResult>>>;
  let openGallery: ReturnType<typeof vi.fn<() => Promise<OpenResult>>>;
  let setTitle: ReturnType<typeof vi.fn<(title: string) => void>>;
  let router: HashRouter;

  /** Lets queued open() promises settle. */
  const settle = () => new Promise<void>((r) => setTimeout(r, 0));

  const createRouter = (initialHash: string) => {
    browser = new FakeBrowserLocation(initialHash);
    vi.spyOn(browser, 'replaceState');
    router = new HashRouter({
      location: browser,
      history: browser,
      events: browser,
      openSpace,
      openGallery,
      titleOf: (id) => TITLES[id],
      setTitle,
    });
    return router;
  };

  beforeEach(() => {
    openSpace = vi.fn(async (id: string) => (id in TITLES ? 'opened' : 'not-found'));
    openGallery = vi.fn(async () => 'opened' as const);
    setTitle = vi.fn();
  });

  describe('start()', () => {
    it('opens the Space named by a deep link (AC-1)', async () => {
      await createRouter('#/space/a').start();
      expect(openSpace).toHaveBeenCalledExactlyOnceWith('a');
    });

    it.each(['', '#', '#/'])('opens the gallery on the home route %j (003 AC-1)', async (hash) => {
      await createRouter(hash).start();
      expect(openGallery).toHaveBeenCalledOnce();
      expect(openSpace).not.toHaveBeenCalled();
      expect(browser.replaceState).not.toHaveBeenCalled();
    });

    it('redirects an unknown route home, replacing the entry, then opens the gallery once (AC-6)', async () => {
      await createRouter('#/foo').start();
      expect(browser.replaceState).toHaveBeenCalledExactlyOnceWith(null, '', '#/');
      expect(browser.entries).toEqual(['#/']);
      expect(openGallery).toHaveBeenCalledOnce();
      expect(openSpace).not.toHaveBeenCalled();
    });
  });

  describe('hash changes', () => {
    it('opens the Space for the new hash (AC-2)', async () => {
      await createRouter('#/space/a').start();
      browser.hash = '#/space/b';
      await settle();
      expect(openSpace).toHaveBeenLastCalledWith('b');
    });

    it('switches between the gallery and a Space in both directions, including Back/Forward (003 AC-4)', async () => {
      await createRouter('#/').start();
      browser.hash = '#/space/a';
      await settle();
      expect(openSpace).toHaveBeenLastCalledWith('a');

      browser.back();
      await settle();
      expect(openGallery).toHaveBeenCalledTimes(2);

      browser.forward();
      await settle();
      expect(openSpace).toHaveBeenCalledTimes(2);
    });

    it('does not re-open the gallery for an equivalent home address', async () => {
      await createRouter('#/').start();
      browser.replaceState(null, '', '#');
      browser.dispatchEvent(new Event('hashchange'));
      await settle();
      expect(openGallery).toHaveBeenCalledOnce();
    });

    it('back and forward re-open the previous and next Spaces (AC-3)', async () => {
      await createRouter('#/space/a').start();
      browser.hash = '#/space/b';
      browser.back();
      await settle();
      expect(openSpace).toHaveBeenLastCalledWith('a');
      browser.forward();
      await settle();
      expect(openSpace).toHaveBeenLastCalledWith('b');
      expect(openSpace).toHaveBeenCalledTimes(4);
    });

    it('after redirecting an unknown route, Back skips it (AC-6)', async () => {
      await createRouter('#/space/a').start();
      browser.hash = '#/foo';
      await settle();
      expect(browser.entries).toEqual(['#/space/a', '#/']);
      browser.back();
      expect(browser.hash).toBe('#/space/a');
    });

    it('stops listening after dispose()', async () => {
      await createRouter('#/space/a').start();
      router.dispose();
      browser.hash = '#/space/b';
      await settle();
      expect(openSpace).toHaveBeenCalledOnce();
    });
  });

  describe('navigate() (AC-8)', () => {
    it('adds exactly one history entry and opens the Space', async () => {
      await createRouter('#/space/a').start();
      router.navigate('b');
      await settle();
      expect(browser.entries).toEqual(['#/space/a', '#/space/b']);
      expect(openSpace).toHaveBeenLastCalledWith('b');
    });

    it('does nothing for the Space already showing — no entry, no re-open', async () => {
      await createRouter('#/space/a').start();
      router.navigate('a');
      await settle();
      expect(browser.entries).toHaveLength(1);
      expect(openSpace).toHaveBeenCalledOnce();
    });

    it('from the gallery, adds one entry and opens the Space (what a card does)', async () => {
      await createRouter('#/').start();
      router.navigate('a');
      await settle();
      expect(browser.entries).toEqual(['#/', '#/space/a']);
      expect(openSpace).toHaveBeenCalledExactlyOnceWith('a');
    });

    it('encodes ids into the address', async () => {
      await createRouter('#/').start();
      router.navigate('a b');
      expect(browser.hash).toBe('#/space/a%20b');
    });
  });

  describe('failed opens', () => {
    it.each<OpenResult>(['not-found', 'load-error'])(
      'after %s, the same Space can be retried',
      async (failure) => {
        openSpace.mockResolvedValueOnce(failure);
        await createRouter('#/space/a').start();

        router.navigate('a'); // hash unchanged, so no hashchange — the router must retry itself
        await settle();

        expect(openSpace).toHaveBeenCalledTimes(2);
        expect(browser.entries).toHaveLength(1);
      },
    );

    it('after the gallery fails to load, returning home retries it', async () => {
      openGallery.mockResolvedValueOnce('load-error');
      await createRouter('#/').start();
      browser.hash = '#/space/a';
      browser.hash = '#/';
      await settle();
      expect(openGallery).toHaveBeenCalledTimes(2);
    });
  });

  describe('document title (AC-9)', () => {
    it('names the opened Space', async () => {
      await createRouter('#/space/a').start();
      expect(setTitle).toHaveBeenLastCalledWith(`Space A — ${SITE_TITLE}`);
    });

    it('is the site title on the gallery (003 AC-8)', async () => {
      await createRouter('#/').start();
      expect(setTitle).toHaveBeenLastCalledWith(SITE_TITLE);
    });

    it('goes back to the site title when returning from a Space to the gallery', async () => {
      await createRouter('#/space/a').start();
      browser.hash = '#/';
      await settle();
      expect(setTitle).toHaveBeenLastCalledWith(SITE_TITLE);
    });

    it.each<OpenResult>(['not-found', 'load-error'])('is the site title after %s', async (failure) => {
      openSpace.mockResolvedValueOnce(failure);
      await createRouter('#/space/a').start();
      expect(setTitle).toHaveBeenLastCalledWith(SITE_TITLE);
    });

    it('is left alone by a superseded open; the newer request sets it', async () => {
      const slow = deferred<OpenResult>();
      openSpace.mockReturnValueOnce(slow.promise);
      const starting = createRouter('#/space/a').start();

      browser.hash = '#/space/b';
      await settle();
      slow.resolve('superseded');
      await starting;

      expect(setTitle).toHaveBeenCalledExactlyOnceWith(`Space B — ${SITE_TITLE}`);
    });

    it('ignores a late result from an older request even if it is not "superseded"', async () => {
      const slow = deferred<OpenResult>();
      openSpace.mockReturnValueOnce(slow.promise);
      const starting = createRouter('#/space/a').start();

      browser.hash = '#/space/b';
      await settle();
      slow.resolve('not-found');
      await starting;

      expect(setTitle).toHaveBeenCalledExactlyOnceWith(`Space B — ${SITE_TITLE}`);
    });
  });
});
