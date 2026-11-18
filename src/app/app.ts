/** The app shell: header with the language switcher, the current screen, and the footer. */
import { findAuditorium, findTheatre, type Catalog } from '../data/catalog';
import { loadCatalog } from '../data/loader';
import { initI18n, onLocaleChange, t, type MessageKey } from '../i18n';
import { createAuditoriumView } from '../ui/auditoriumView';
import { backLink, brokenAuditoriumNotice, messagePage, theatreName } from '../ui/common';
import { createHomeView } from '../ui/homeView';
import { createLanguageSwitcher } from '../ui/languageSwitcher';
import { createTheatreView } from '../ui/theatreView';
import { h, mount, s } from './dom';
import { parseHash, routes, type Route } from './router';
import type { View } from './view';

function messageView(messageKey: MessageKey, href: string, linkKey: MessageKey): View {
  return { el: messagePage(messageKey, href, linkKey), title: () => t(messageKey) };
}

function resolveView(route: Route, catalog: Catalog): View {
  const [section, theatreId, auditoriumId, step] = route.path;

  if (route.path.length === 0) return createHomeView(catalog);

  if (section === 't' && theatreId) {
    const theatre = findTheatre(catalog, theatreId);
    if (!theatre) return messageView('error.theatreNotFound', routes.home(), 'app.theatreList');
    if (!auditoriumId) return createTheatreView(theatre);

    const entry = findAuditorium(theatre, auditoriumId);
    if (!entry) {
      return messageView('error.auditoriumNotFound', routes.theatre(theatre.id), 'app.back');
    }
    if (!entry.ok) {
      return {
        el: h(
          'section',
          { class: 'page' },
          backLink(routes.theatre(theatre.id), theatreName(theatre)),
          h('h1', { class: 'page__title', tabindex: '-1' }, t('app.errorTitle')),
          brokenAuditoriumNotice(entry),
        ),
        title: () => t('app.errorTitle'),
      };
    }
    if (!step) return createAuditoriumView(theatre, entry.auditorium);
  }

  return messageView('app.notFound', routes.home(), 'app.theatreList');
}

/** A cinema seat seen from the front: backrest, cushion, two armrests. */
function seatGlyph(): SVGSVGElement {
  return s(
    'svg',
    {
      class: 'wordmark__glyph',
      viewBox: '0 0 28 28',
      width: 28,
      height: 28,
      'aria-hidden': 'true',
    },
    s('rect', { x: 6, y: 3, width: 16, height: 14, rx: 5, fill: 'var(--velvet)' }),
    s('rect', { x: 2, y: 12, width: 5, height: 11, rx: 2.5, fill: 'var(--sconce)' }),
    s('rect', { x: 21, y: 12, width: 5, height: 11, rx: 2.5, fill: 'var(--sconce)' }),
    s('rect', { x: 6, y: 16, width: 16, height: 7, rx: 3, fill: 'var(--velvet-deep)' }),
  );
}

export function startApp(root: HTMLElement): void {
  initI18n();
  const catalog = loadCatalog();

  const switcher = createLanguageSwitcher();
  const wordmarkSmall = h('span', { class: 'wordmark__small' });
  const wordmarkBig = h('span', { class: 'wordmark__big' });
  const wordmark = h(
    'a',
    { class: 'wordmark', href: routes.home() },
    seatGlyph(),
    h('span', { class: 'wordmark__text' }, wordmarkSmall, wordmarkBig),
  );
  const header = h('header', { class: 'topbar' }, wordmark, switcher.el);

  const main = h('main', { class: 'shell__main', id: 'main', tabindex: '-1' });

  const disclaimer = h('p', { class: 'footer__disclaimer' });
  const dataNote = h('p', { class: 'footer__note' });
  const footer = h('footer', { class: 'footer' }, disclaimer, dataNote);

  mount(root, header, main, footer);
  root.classList.add('shell');

  let current: View | null = null;

  const updateShellText = () => {
    const [first, ...rest] = t('app.title').split(' ');
    wordmarkSmall.textContent = rest.length > 0 ? first : '';
    wordmarkBig.textContent = rest.length > 0 ? rest.join(' ') : first;
    wordmark.setAttribute('aria-label', t('app.title'));
    disclaimer.textContent = t('app.disclaimer');
    dataNote.textContent = t('app.dataNote');
  };

  const updateTitle = () => {
    document.title = current ? `${current.title()} – ${t('app.title')}` : t('app.title');
  };

  const show = (moveFocus: boolean) => {
    current?.destroy?.();
    current = resolveView(parseHash(location.hash), catalog);
    mount(main, current.el);
    document.body.classList.toggle('is-immersive', Boolean(current.immersive));
    updateTitle();
    if (moveFocus) {
      window.scrollTo(0, 0);
      // Screen readers announce the new screen when its heading takes focus.
      const heading = main.querySelector<HTMLElement>('h1[tabindex]');
      (heading ?? main).focus({ preventScroll: true });
    }
  };

  window.addEventListener('hashchange', () => show(true));

  onLocaleChange(() => {
    updateShellText();
    if (current?.onLocaleChange) {
      current.onLocaleChange();
      updateTitle();
    } else {
      show(false);
    }
  });

  updateShellText();
  show(false);
}
