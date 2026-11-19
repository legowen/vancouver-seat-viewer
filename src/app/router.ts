import { onLocaleChange } from '../i18n';
import { homeScreen } from '../ui/home';
import { notFoundScreen } from '../ui/notFound';
import type { Shell } from '../ui/shell';
import { theatreScreen } from '../ui/theatre';
import { parseHash, routeToHash, type Route } from './routes';
import type { AppContext, Screen } from './types';

async function createScreen(route: Route, context: AppContext): Promise<Screen> {
  switch (route.name) {
    case 'home':
      return homeScreen(context);
    case 'theatre':
      return theatreScreen(context, route);
    default:
      return notFoundScreen();
  }
}

/** Goes to a route. `replace` swaps the current history entry instead of adding one. */
export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const hash = routeToHash(route);
  if (!options.replace) {
    window.location.hash = hash;
    return;
  }
  const url = new URL(window.location.href);
  url.hash = hash;
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Rewrites the address bar without re-rendering, to keep a reload on the same state. */
export function rememberRoute(route: Route): void {
  const url = new URL(window.location.href);
  url.hash = routeToHash(route);
  window.history.replaceState(window.history.state, '', url);
}

/** Renders the screen for the current hash and keeps doing so as the hash changes. */
export function startRouter(shell: Shell, context: AppContext): void {
  let current: Screen | null = null;
  let generation = 0;

  const render = async (focus: boolean): Promise<void> => {
    const mine = ++generation;
    current?.destroy?.();
    current = null;

    const pending = createScreen(parseHash(window.location.hash), context);
    // Lazy screens (the 3D view) take a moment to download the first time.
    const loadingTimer = window.setTimeout(() => {
      if (mine === generation && !current) shell.showLoading();
    }, 150);
    let screen: Screen;
    try {
      screen = await pending;
    } catch (cause) {
      console.error('Could not load this screen', cause);
      screen = notFoundScreen();
    } finally {
      window.clearTimeout(loadingTimer);
    }

    // A newer navigation started while this one was loading: discard it.
    if (mine !== generation) {
      screen.destroy?.();
      return;
    }
    current = screen;
    shell.show(screen, { focus });
  };

  window.addEventListener('hashchange', () => void render(true));

  onLocaleChange(() => {
    shell.refreshChrome();
    if (current?.relocalize) shell.setTitle(current.relocalize());
    else void render(false);
  });

  void render(false);
}
