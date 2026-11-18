/**
 * Collects the JSON files under `data/` at build time (they are bundled with the app, so there
 * is nothing to fetch at run time) and validates them when the app starts.
 */
import { buildCatalog, type Catalog, type RawData } from './catalog';

const indexModules = import.meta.glob<unknown>('../../data/theatres.json', {
  eager: true,
  import: 'default',
});
const theatreModules = import.meta.glob<unknown>('../../data/theatres/*/theatre.json', {
  eager: true,
  import: 'default',
});
const auditoriumModules = import.meta.glob<unknown>('../../data/theatres/*/auditoriums/*.json', {
  eager: true,
  import: 'default',
});
const movieModules = import.meta.glob<unknown>('../../data/movies.json', {
  eager: true,
  import: 'default',
});

/** `../../data/x.json` → `data/x.json` */
function repoPath(modulePath: string): string {
  return modulePath.replace(/^(\.\.\/)+/, '');
}

function byRepoPath(modules: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(modules)) out[repoPath(path)] = value;
  return out;
}

export function readRawData(): RawData {
  return {
    theatreIndex: Object.values(indexModules)[0],
    theatres: byRepoPath(theatreModules),
    auditoriums: byRepoPath(auditoriumModules),
    movies: Object.values(movieModules)[0] ?? [],
  };
}

let cached: Catalog | null = null;

export function loadCatalog(): Catalog {
  cached ??= buildCatalog(readRawData());
  return cached;
}
