import type { AppData } from '../data/loader';

/** Shared, read-only state handed to every screen. */
export interface AppContext {
  data: AppData;
}

/** One page of the app. Screens build their own DOM and clean up after themselves. */
export interface Screen {
  el: HTMLElement;
  /** Short title for the browser tab, already translated. */
  title: string;
  /** Fills the viewport without page scrolling (the 3D view). */
  immersive?: boolean;
  /**
   * Re-translates the screen in place and returns its new tab title. Screens without it
   * are simply rebuilt from the URL when the language changes.
   */
  relocalize?(): string;
  destroy?(): void;
}
