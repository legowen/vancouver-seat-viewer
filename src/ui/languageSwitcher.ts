import { h } from '../app/dom';
import { getLocale, localeLabel, locales, onLocaleChange, setLocale, t } from '../i18n';

export interface LanguageSwitcher {
  el: HTMLElement;
  destroy: () => void;
}

/** EN / 한국어 / 中文 — one button per file in `src/i18n/locales`. */
export function createLanguageSwitcher(): LanguageSwitcher {
  const el = h('div', { class: 'lang-switch', role: 'group' });

  const buttons = locales.map((code) => {
    const button = h(
      'button',
      {
        type: 'button',
        class: 'lang-switch__option',
        // Lets the browser pick the right font for each label and read it correctly.
        lang: code,
        onclick: () => setLocale(code),
      },
      localeLabel(code),
    );
    el.appendChild(button);
    return { code, button };
  });

  const sync = () => {
    el.setAttribute('aria-label', t('app.language'));
    for (const { code, button } of buttons) {
      button.setAttribute('aria-pressed', String(code === getLocale()));
    }
  };
  sync();

  return { el, destroy: onLocaleChange(sync) };
}
