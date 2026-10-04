import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HashRouter, SITE_TITLE } from '../../../src/core/router';
import type { OpenResult } from '../../../src/core/types';
import { FakeBrowserLocation } from '../../helpers/fakes';

const TITLES: Record<string, string> = { a: 'Space A', b: 'Space B', home: 'Home Space' };
const DEFAULT_ID = 'home';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

describe('HashRouter', () => {
  let browser: FakeBrowserLocation;
  let openSpace: ReturnType<typeof vi.fn<(id: string) => Promise<OpenResult>>>;
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
      defaultSpaceId: DEFAULT_ID,
      titleOf: (id) => TITLES[id],
      setTitle,
    });
    return router;
  };

  beforeEach(() => {
    openSpace = vi.fn(async (id: string) => (id in TITLES ? 'opened' : 'not-found'));
    setTitle = vi.fn();
  });

  describe('start()', () => {
    it('opens the Space named by a deep link (AC-1)', async () => {
      await createRouter('#/space/a').start();
      expect(openSpace).toHaveBeenCalledExactlyOnceWith('a');
    });

    it.each(['', '#', '#/'])('opens the default Space on the home route %j (AC-5)', async (hash) => {
      await createRouter(hash).start();
      expect(openSpace).toHaveBeenCalledExactlyOnceWith(DEFAULT_ID);
      expect(browser.replaceState).not.toHaveBeenCalled();
    });

    it('redirects an unknown route home, replacing the entry, then opens the default once (AC-6)', async () => {
      await createRouter('#/foo').start();
      expect(browser.replaceState).toHaveBeenCalledExactlyOnceWith(null, '', '#/');
      expect(browser.entries).toEqual(['#/']);
      expect(openSpace).toHaveBeenCalledExactlyOnceWith(DEFAULT_ID);
    });
  });

  describe('hash changes', () => {
    it('opens the Space for the new hash (AC-2)', async () => {
      await createRouter('#/space/a').start();
      browser.hash = '#/space/b';
      await settle();
      expect(openSpace).toHaveBeenLastCalledWith('b');
    });

    it('does not re-open when moving between home and the default Space’s own route (AC-5)', async () => {
      await createRouter('#/').start();
      browser.hash = `#/space/${DEFAULT_ID}`;
      browser.hash = '#/';
      await settle();
      expect(openSpace).toHaveBeenCalledOnce();
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

    it('does nothing for the default Space while it is showing on the home route', async () => {
      await createRouter('#/').start();
      router.navigate(DEFAULT_ID);
      await settle();
      expect(browser.entries).toEqual(['#/']);
      expect(openSpace).toHaveBeenCalledOnce();
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
  });

  describe('document title (AC-9)', () => {
    it('names the opened Space', async () => {
      await createRouter('#/space/a').start();
      expect(setTitle).toHaveBeenLastCalledWith(`Space A — ${SITE_TITLE}`);
    });

    it('names the default Space on the home route', async () => {
      await createRouter('#/').start();
      expect(setTitle).toHaveBeenLastCalledWith(`Home Space — ${SITE_TITLE}`);
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
