import { routeToHash, type Route } from './routes';

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

/** Rewrites the address bar without re-rendering, so a reload comes back to the same state. */
export function rememberRoute(route: Route): void {
  const url = new URL(window.location.href);
  url.hash = routeToHash(route);
  window.history.replaceState(window.history.state, '', url);
}
