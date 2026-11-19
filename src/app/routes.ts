/**
 * The app uses hash routes so it works on GitHub Pages without server rewrites:
 *
 *   #/                                     theatres
 *   #/t/<theatre>                          auditoriums
 *   #/t/<theatre>/<auditorium>/trailer     trailer choice
 *   #/t/<theatre>/<auditorium>/seats       2D seat map      ?v=<youtube id>&seat=<row>-<number>
 *   #/t/<theatre>/<auditorium>/view/<seat> walk-in and POV  ?v=<youtube id>&fallback=1
 *   #/editor                               hidden auditorium editor
 */
export type Route =
  | { name: 'home' }
  | { name: 'theatre'; theatreId: string }
  | { name: 'trailer'; theatreId: string; auditoriumId: string }
  | {
      name: 'seats';
      theatreId: string;
      auditoriumId: string;
      videoId: string | null;
      seatKey: string | null;
    }
  | {
      name: 'view';
      theatreId: string;
      auditoriumId: string;
      seatKey: string;
      videoId: string | null;
      /** Skips the embedded player and shows the poster with an "Open trailer" button. */
      forceFallback: boolean;
    }
  | { name: 'editor' }
  | { name: 'notFound' };

const SEGMENT = /^[A-Za-z0-9_-]+$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const NOT_FOUND: Route = { name: 'notFound' };

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const queryStart = raw.indexOf('?');
  const path = queryStart === -1 ? raw : raw.slice(0, queryStart);
  const query = new URLSearchParams(queryStart === -1 ? '' : raw.slice(queryStart + 1));

  const segments = path.split('/').filter((segment) => segment !== '');
  if (segments.some((segment) => !SEGMENT.test(segment))) return NOT_FOUND;

  if (segments.length === 0) return { name: 'home' };
  if (segments.length === 1 && segments[0] === 'editor') return { name: 'editor' };
  if (segments[0] !== 't') return NOT_FOUND;

  const [, theatreId, auditoriumId, step, seatKey] = segments;
  if (!theatreId) return NOT_FOUND;
  if (segments.length === 2) return { name: 'theatre', theatreId };
  if (!auditoriumId) return NOT_FOUND;
  if (segments.length === 3 || (segments.length === 4 && step === 'trailer')) {
    return { name: 'trailer', theatreId, auditoriumId };
  }

  const video = query.get('v');
  const videoId = video && VIDEO_ID.test(video) ? video : null;

  if (segments.length === 4 && step === 'seats') {
    const seat = query.get('seat');
    return {
      name: 'seats',
      theatreId,
      auditoriumId,
      videoId,
      seatKey: seat && SEGMENT.test(seat) ? seat : null,
    };
  }
  if (segments.length === 5 && step === 'view' && seatKey) {
    return {
      name: 'view',
      theatreId,
      auditoriumId,
      seatKey,
      videoId,
      forceFallback: query.get('fallback') === '1',
    };
  }
  return NOT_FOUND;
}

function withQuery(path: string, params: Record<string, string | null>): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value) query.set(name, value);
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'theatre':
      return `#/t/${route.theatreId}`;
    case 'trailer':
      return `#/t/${route.theatreId}/${route.auditoriumId}/trailer`;
    case 'seats':
      return withQuery(`#/t/${route.theatreId}/${route.auditoriumId}/seats`, {
        v: route.videoId,
        seat: route.seatKey,
      });
    case 'view':
      return withQuery(`#/t/${route.theatreId}/${route.auditoriumId}/view/${route.seatKey}`, {
        v: route.videoId,
        fallback: route.forceFallback ? '1' : null,
      });
    case 'editor':
      return '#/editor';
    case 'notFound':
      return '#/not-found';
  }
}
