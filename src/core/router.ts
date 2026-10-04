import { formatRoute, HOME_ROUTE, parseHash } from './routes';
import type { OpenResult } from './types';

export const SITE_TITLE = '3D World';

/** The bit of `window.location` the router uses. Assigning `hash` adds a history entry. */
export interface RouterLocation {
  hash: string;
}

export interface RouterDeps {
  location: RouterLocation;
  history: Pick<History, 'replaceState'>;
  /** Fires `hashchange` (i.e. `window`). */
  events: EventTarget;
  openSpace(id: string): Promise<OpenResult>;
  /** Shows the gallery, which lives on the home route (spec 003; supersedes 002 AC-5). */
  openGallery(): Promise<OpenResult>;
  titleOf(id: string): string | undefined;
  setTitle(title: string): void;
}

/**
 * Maps the URL hash to the Space that should be showing (spec 002).
 * Back/forward, typed URLs, links and `navigate()` all arrive as `hashchange`, so none reload the page.
 */
export class HashRouter {
  /**
   * What was last requested: "gallery" or "space/<id>" (these cannot collide). Null after a failed open,
   * so the same address can be retried.
   */
  private currentKey: string | null = null;
  private sequence = 0;

  constructor(private readonly deps: RouterDeps) {}

  /** Handles the URL the page loaded with, then follows hash changes. */
  async start(): Promise<void> {
    this.deps.events.addEventListener('hashchange', this.onHashChange);
    await this.handle();
  }

  /** Shows a Space from code (e.g. a gallery card). No-op if it is already showing (AC-8). */
  navigate(spaceId: string): void {
    if (spaceKey(spaceId) === this.currentKey) return;
    const hash = formatRoute({ name: 'space', id: spaceId });
    if (this.deps.location.hash === hash) {
      // Same URL after a failed open: assigning it would fire no event, so retry directly.
      void this.handle();
      return;
    }
    this.deps.location.hash = hash; // adds one history entry; hashchange → handle()
  }

  dispose(): void {
    this.deps.events.removeEventListener('hashchange', this.onHashChange);
  }

  private readonly onHashChange = (): void => {
    void this.handle();
  };

  private async handle(): Promise<void> {
    const route = parseHash(this.deps.location.hash);
    if (route.name === 'unknown') {
      // Replace, so Back never returns to the bad address (AC-6). replaceState fires no event.
      this.deps.history.replaceState(null, '', formatRoute(HOME_ROUTE));
    }
    const spaceId = route.name === 'space' ? route.id : null;
    const key = spaceId === null ? GALLERY_KEY : spaceKey(spaceId);
    if (key === this.currentKey) return; // already showing or opening (AC-5, AC-8)

    const token = ++this.sequence;
    this.currentKey = key;
    const result = spaceId === null ? await this.deps.openGallery() : await this.deps.openSpace(spaceId);
    if (token !== this.sequence || result === 'superseded') return; // a newer request owns the outcome

    if (result !== 'opened') {
      this.currentKey = null;
      this.deps.setTitle(SITE_TITLE);
    } else if (spaceId === null) {
      this.deps.setTitle(SITE_TITLE); // gallery (003 AC-8)
    } else {
      this.deps.setTitle(`${this.deps.titleOf(spaceId) ?? spaceId} — ${SITE_TITLE}`);
    }
  }
}

const GALLERY_KEY = 'gallery';
const spaceKey = (id: string) => `space/${id}`;
