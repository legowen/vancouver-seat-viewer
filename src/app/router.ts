/**
 * Hash routing (`#/t/<theatre>/<auditorium>/seats?v=<id>`): it needs no server rewrites, so it
 * works on GitHub Pages as is. The real query string (`?lang=ko`) stays free for the language.
 */

export interface Route {
  /** Decoded path segments after `#/`. */
  path: string[];
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const queryStart = raw.indexOf('?');
  const pathPart = queryStart === -1 ? raw : raw.slice(0, queryStart);
  const queryPart = queryStart === -1 ? '' : raw.slice(queryStart + 1);
  const path = pathPart
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
  return { path, query: new URLSearchParams(queryPart) };
}

export function buildHash(
  path: readonly string[],
  query: Record<string, string | null | undefined> = {},
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const queryString = params.toString();
  return `#/${path.map(encodeURIComponent).join('/')}${queryString ? `?${queryString}` : ''}`;
}

/** Links to every screen, in one place. */
export const routes = {
  home: () => buildHash([]),
  theatre: (theatreId: string) => buildHash(['t', theatreId]),
  trailer: (theatreId: string, auditoriumId: string) => buildHash(['t', theatreId, auditoriumId]),
  seats: (
    theatreId: string,
    auditoriumId: string,
    options: { video?: string | null; seat?: string | null } = {},
  ) => buildHash(['t', theatreId, auditoriumId, 'seats'], { v: options.video, seat: options.seat }),
  view: (
    theatreId: string,
    auditoriumId: string,
    seat: string,
    options: { video?: string | null } = {},
  ) => buildHash(['t', theatreId, auditoriumId, 'view', seat], { v: options.video }),
  editor: () => buildHash(['editor']),
};

export function navigate(hash: string, options: { replace?: boolean } = {}): void {
  if (options.replace) {
    const url = new URL(location.href);
    url.hash = hash;
    history.replaceState(history.state, '', url);
    // replaceState does not fire hashchange, so announce the change ourselves.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}
