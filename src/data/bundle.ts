import { buildData, type AppData } from './loader';

// Every JSON file under data/ is bundled as plain text and parsed when the app starts.
// Bundling text (rather than parsed JSON) means a broken file shows a readable message
// in the app instead of failing the whole build.
const files = import.meta.glob<string>('/data/**/*.json', {
  eager: true,
  query: '?raw',
  import: 'default',
});

export function loadData(): AppData {
  return buildData(files);
}
