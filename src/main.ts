import './styles.css';
import { startRouter } from './app/router';
import { loadData } from './data/bundle';
import { initLocale } from './i18n';
import { createShell } from './ui/shell';

const root = document.getElementById('app');
if (root) {
  initLocale();
  startRouter(createShell(root), { data: loadData() });
}
