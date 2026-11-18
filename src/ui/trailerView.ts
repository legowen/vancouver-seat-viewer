/** Step 3: choose the trailer that plays on the screen, from the list or by pasting a link. */
import { h } from '../app/dom';
import { navigate, routes } from '../app/router';
import type { View } from '../app/view';
import type { TheatreEntry } from '../data/catalog';
import type { Auditorium } from '../data/resolve';
import type { Movie } from '../data/schema';
import { t } from '../i18n';
import { parseYouTubeUrl, thumbnailUrl } from '../youtube/url';
import { auditoriumHeader } from './auditoriumView';
import { auditoriumNotes, backLink, theatreName } from './common';
import { roomDetails } from './roomDetails';

function movieList(theatre: TheatreEntry, auditorium: Auditorium, movies: readonly Movie[]) {
  return h(
    'ul',
    { class: 'movies' },
    movies.map((movie) => {
      const thumb = h('img', {
        class: 'movie__thumb',
        src: thumbnailUrl(movie.youtubeId),
        alt: '',
        loading: 'lazy',
        decoding: 'async',
        width: 120,
        height: 90,
      });
      // A blocked or missing thumbnail leaves a plain tile instead of a broken image.
      thumb.addEventListener('error', () => thumb.remove(), { once: true });
      return h(
        'li',
        null,
        h(
          'a',
          {
            class: 'movie',
            href: routes.seats(theatre.id, auditorium.id, { video: movie.youtubeId }),
          },
          h('span', { class: 'movie__frame' }, thumb),
          h(
            'span',
            { class: 'movie__text' },
            h('span', { class: 'movie__title', lang: 'en' }, movie.title),
            h('span', { class: 'movie__channel' }, movie.channel),
          ),
        ),
      );
    }),
  );
}

function pasteForm(theatre: TheatreEntry, auditorium: Auditorium): HTMLElement {
  const inputId = 'trailer-url';
  const errorId = 'trailer-url-error';
  const helpId = 'trailer-url-help';
  const input = h('input', {
    id: inputId,
    class: 'field__input',
    type: 'text',
    inputmode: 'url',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    placeholder: 'https://youtu.be/…',
    'aria-describedby': `${helpId} ${errorId}`,
  });
  const error = h('p', { id: errorId, class: 'field__error', 'aria-live': 'polite' });
  const form = h(
    'form',
    { class: 'paste', novalidate: true },
    h('label', { class: 'field__label', for: inputId }, t('trailer.pasteLabel')),
    input,
    h('p', { id: helpId, class: 'field__help' }, t('trailer.pasteHelp')),
    error,
    h('button', { type: 'submit', class: 'btn btn--block' }, t('trailer.use')),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = parseYouTubeUrl(input.value);
    if (!result.ok) {
      const message = t(result.reason === 'empty' ? 'trailer.errorEmpty' : 'trailer.errorInvalid');
      // Clear first so a repeated message is announced again.
      error.textContent = '';
      window.setTimeout(() => (error.textContent = message), 50);
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    navigate(routes.seats(theatre.id, auditorium.id, { video: result.id }));
  });
  input.addEventListener('input', () => {
    if (!error.textContent) return;
    error.textContent = '';
    input.removeAttribute('aria-invalid');
  });
  return form;
}

export function createTrailerView(
  theatre: TheatreEntry,
  auditorium: Auditorium,
  movies: readonly Movie[],
): View {
  const hasList = movies.length > 0;
  const paste = h(
    'section',
    { class: 'trailer-section' },
    h('h2', { class: 'page__heading' }, t('trailer.pasteHeading')),
    hasList ? null : h('p', { class: 'trailer-section__note' }, t('trailer.noList')),
    pasteForm(theatre, auditorium),
  );
  const list = hasList
    ? h(
        'section',
        { class: 'trailer-section' },
        h('h2', { class: 'page__heading' }, t('trailer.listHeading')),
        movieList(theatre, auditorium, movies),
      )
    : null;

  const el = h(
    'section',
    { class: 'page' },
    backLink(routes.theatre(theatre.id), theatreName(theatre)),
    h('h1', { class: 'page__title', tabindex: '-1' }, t('trailer.heading')),
    h('p', { class: 'page__intro' }, t('trailer.intro')),
    auditoriumHeader(theatre, auditorium),
    auditoriumNotes(auditorium),
    // Without a verified list, pasting a link is the main path.
    hasList ? [list, paste] : [paste],
    h(
      'p',
      { class: 'trailer-skip' },
      h(
        'a',
        { class: 'btn btn--ghost btn--block', href: routes.seats(theatre.id, auditorium.id) },
        t('trailer.skip'),
      ),
    ),
    roomDetails(auditorium),
  );

  return { el, title: () => t('trailer.heading') };
}
