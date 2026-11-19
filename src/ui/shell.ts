import { h, s } from '../app/dom';
import { routeToHash } from '../app/routes';
import type { Screen } from '../app/types';
import { getLocale, localeLabel, LOCALES, setLocale, t } from '../i18n';

export interface Shell {
  /** Puts a screen into the page. `focus` moves keyboard focus to it (used after navigation). */
  show(screen: Screen, options?: { focus?: boolean }): void;
  /** Shows a short placeholder while a lazily loaded screen arrives. */
  showLoading(): void;
  /** Updates the browser tab title, e.g. after a screen re-translated itself. */
  setTitle(title: string): void;
  /** Re-translates the header and footer. */
  refreshChrome(): void;
}

function brandIcon(): SVGSVGElement {
  return s(
    'svg',
    { class: 'brand__icon', viewBox: '0 0 32 32', 'aria-hidden': 'true', focusable: 'false' },
    s('rect', { width: 32, height: 32, rx: 7, fill: '#1c1c27' }),
    s('rect', { x: 5, y: 6, width: 22, height: 3, rx: 1.5, fill: '#f2f2f6' }),
    s('rect', { x: 9, y: 13, width: 14, height: 9, rx: 3, fill: '#f5b942' }),
    s('rect', { x: 7, y: 20, width: 18, height: 5, rx: 2.5, fill: '#c98f1c' }),
  );
}

/** The frame around every screen: header with the language switcher, main area, footer. */
export function createShell(root: HTMLElement): Shell {
  const main = h('main', { id: 'main', class: 'app-main', tabindex: -1 });

  // A real link to "#main" would collide with hash routing, so this is a button.
  const skipLink = h('button', {
    type: 'button',
    class: 'skip-link',
    onclick: () => main.focus(),
  });

  const brandFull = h('span', { class: 'brand__text brand__text--full' });
  const brandShort = h('span', { class: 'brand__text brand__text--short' });
  const brand = h(
    'a',
    { class: 'brand', href: routeToHash({ name: 'home' }) },
    brandIcon(),
    brandFull,
    brandShort,
  );

  const languages = h('div', { class: 'lang-switch', role: 'group' });
  const disclaimer = h('p', { class: 'app-footer__text' });

  root.classList.add('app');
  root.replaceChildren(
    skipLink,
    h('header', { class: 'app-header' }, brand, languages),
    main,
    h('footer', { class: 'app-footer' }, disclaimer),
  );

  const renderLanguages = (): void => {
    const hadFocus = languages.contains(document.activeElement);
    languages.setAttribute('aria-label', t('app.language'));
    languages.replaceChildren(
      ...LOCALES.map((code) => {
        const label = localeLabel(code);
        return h(
          'button',
          {
            type: 'button',
            class: 'lang-switch__btn',
            lang: code,
            title: label.name,
            'aria-label': label.name,
            'aria-pressed': code === getLocale() ? 'true' : 'false',
            onclick: () => setLocale(code),
          },
          label.short,
        );
      }),
    );
    // Rebuilding the buttons drops focus, so hand it back to the active language.
    if (hadFocus) languages.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  };

  const setTitle = (title: string): void => {
    document.title = title ? `${title} · ${t('app.title')}` : t('app.title');
  };

  const refreshChrome = (): void => {
    skipLink.textContent = t('app.skipToContent');
    brandFull.textContent = t('app.title');
    brandShort.textContent = t('app.titleShort');
    brand.setAttribute('aria-label', t('app.title'));
    disclaimer.textContent = t('app.disclaimer');
    renderLanguages();
  };
  refreshChrome();

  return {
    show(screen, options = {}) {
      root.classList.toggle('app--immersive', screen.immersive === true);
      main.replaceChildren(screen.el);
      setTitle(screen.title);
      if (options.focus) {
        window.scrollTo(0, 0);
        main.focus({ preventScroll: true });
      }
    },
    showLoading() {
      main.replaceChildren(h('p', { class: 'loading', role: 'status' }, t('app.loading')));
    },
    setTitle,
    refreshChrome,
  };
}
