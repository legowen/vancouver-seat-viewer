import { h } from '../app/dom';
import { navigate } from '../app/navigation';
import { routeToHash, type Route } from '../app/routes';
import type { AppContext, Screen } from '../app/types';
import { findAuditorium, findTheatre } from '../data/loader';
import type { Movie } from '../data/schema';
import { t, type MessageKey } from '../i18n';
import { parseYouTubeUrl } from '../youtube/parse';
import { auditoriumName, backLink, theatreName } from './common';
import { notFoundScreen } from './notFound';

type TrailerRoute = Extract<Route, { name: 'trailer' }>;

const ERROR_MESSAGES: Record<'empty' | 'notYouTube' | 'noVideo', MessageKey> = {
  empty: 'trailer.error.empty',
  notYouTube: 'trailer.error.notYouTube',
  noVideo: 'trailer.error.noVideo',
};

let idCounter = 0;

/** Step 3: pick a trailer from the list, paste any YouTube link, or skip. */
export function trailerScreen(context: AppContext, route: TrailerRoute): Screen {
  const entry = findTheatre(context.data, route.theatreId);
  if (!entry) return notFoundScreen('error.theatre');
  const auditorium = findAuditorium(entry, route.auditoriumId);
  if (!auditorium) return notFoundScreen('error.auditorium');

  const { movies } = context.data;
  const toSeats = (videoId: string | null): void =>
    navigate({
      name: 'seats',
      theatreId: route.theatreId,
      auditoriumId: route.auditoriumId,
      videoId,
      seatKey: null,
    });

  const ids = { input: `trailer-link-${++idCounter}`, help: `trailer-help-${idCounter}` };
  const errorId = `trailer-error-${idCounter}`;
  const input = h('input', {
    id: ids.input,
    class: 'paste-form__input',
    type: 'url',
    inputmode: 'url',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    placeholder: 'https://youtu.be/…',
    'aria-describedby': `${ids.help} ${errorId}`,
  });
  const error = h('p', { id: errorId, class: 'paste-form__error', role: 'alert' });
  const label = h('label', { class: 'paste-form__label', for: ids.input });
  const help = h('p', { id: ids.help, class: 'paste-form__help' });
  const submit = h('button', { type: 'submit', class: 'button' });
  let lastError: MessageKey | null = null;

  const showError = (key: MessageKey | null): void => {
    lastError = key;
    error.textContent = key ? t(key) : '';
    input.setAttribute('aria-invalid', key ? 'true' : 'false');
  };

  const form = h(
    'form',
    {
      class: 'paste-form',
      novalidate: true,
      onsubmit: (event: SubmitEvent) => {
        event.preventDefault();
        const result = parseYouTubeUrl(input.value);
        if (result.ok) {
          showError(null);
          toSeats(result.id);
        } else {
          showError(ERROR_MESSAGES[result.reason]);
          input.focus();
        }
      },
    },
    label,
    h('div', { class: 'paste-form__row' }, input, submit),
    help,
    error,
  );
  input.addEventListener('input', () => {
    if (lastError) showError(null);
  });

  const movieButton = (movie: Movie): HTMLElement =>
    h(
      'li',
      null,
      h(
        'button',
        { type: 'button', class: 'movie', onclick: () => toSeats(movie.youtubeId) },
        h('img', {
          class: 'movie__thumb',
          src: `https://i.ytimg.com/vi/${encodeURIComponent(movie.youtubeId)}/mqdefault.jpg`,
          alt: '',
          width: 320,
          height: 180,
          loading: 'lazy',
          decoding: 'async',
          referrerpolicy: 'no-referrer',
        }),
        h(
          'span',
          { class: 'movie__body' },
          h('span', { class: 'movie__title' }, movie.title),
          h('span', { class: 'movie__channel' }, movie.channel),
        ),
      ),
    );

  const listHeading = h('h2', { class: 'section-title' });
  const pasteHeading = h('h2', { class: 'section-title' });
  const intro = h('p', { class: 'lead' });
  const eyebrow = h('p', { class: 'eyebrow' });
  const title = h('h1', { class: 'page__title' });
  const back = h('div', { class: 'page__back' });
  const skip = h('button', {
    type: 'button',
    class: 'button button--ghost',
    onclick: () => toSeats(null),
  });
  const emptyNote = h('p', { class: 'notice' });

  const list = movies.length > 0 ? h('ul', { class: 'movie-list' }, movies.map(movieButton)) : null;
  const listSection = list ? h('section', { class: 'trailer-section' }, listHeading, list) : null;
  const pasteSection = h('section', { class: 'trailer-section' }, pasteHeading, form);

  const renderText = (): string => {
    back.replaceChildren(
      backLink(
        routeToHash({ name: 'theatre', theatreId: route.theatreId }),
        theatreName(entry.theatre),
      ),
    );
    eyebrow.textContent = `${theatreName(entry.theatre)} · ${auditoriumName(auditorium)}`;
    title.textContent = t('trailer.title');
    intro.textContent = t('trailer.intro');
    listHeading.textContent = t('trailer.listHeading');
    pasteHeading.textContent = list ? t('trailer.pasteHeading') : t('trailer.pasteHeadingOnly');
    label.textContent = t('trailer.pasteLabel');
    help.textContent = t('trailer.pasteHelp');
    submit.textContent = t('trailer.use');
    skip.textContent = t('trailer.skip');
    emptyNote.textContent = t('trailer.empty');
    if (lastError) error.textContent = t(lastError);
    return t('trailer.title');
  };

  const el = h(
    'div',
    { class: 'page page--trailer' },
    back,
    h('header', { class: 'page__header' }, eyebrow, title, intro),
    // With no listed trailers, pasting a link is the main path.
    list ? null : emptyNote,
    list ? [listSection, pasteSection] : pasteSection,
    h('div', { class: 'trailer-skip' }, skip),
  );

  return { el, title: renderText(), relocalize: renderText };
}
