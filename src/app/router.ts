import { onLocaleChange } from '../i18n';
import { homeScreen } from '../ui/home';
import { notFoundScreen } from '../ui/notFound';
import type { Shell } from '../ui/shell';
import { seatsScreen } from '../ui/seats';
import { theatreScreen } from '../ui/theatre';
import { trailerScreen } from '../ui/trailer';
import { parseHash, type Route } from './routes';
import type { AppContext, Screen } from './types';

async function createScreen(route: Route, context: AppContext): Promise<Screen> {
  switch (route.name) {
    case 'home':
      return homeScreen(context);
    case 'theatre':
      return theatreScreen(context, route);
    case 'trailer':
      return trailerScreen(context, route);
    case 'seats':
      return seatsScreen(context, route);
    case 'view': {
      // The 3D view pulls in three.js, so it is downloaded only when first needed.
      const { viewScreen } = await import('../ui/view');
      return viewScreen(context, route);
    }
    default:
      return notFoundScreen();
  }
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
