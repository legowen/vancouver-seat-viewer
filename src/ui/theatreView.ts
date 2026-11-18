import { h } from '../app/dom';
import { routes } from '../app/router';
import type { View } from '../app/view';
import type { AuditoriumEntry, TheatreEntry } from '../data/catalog';
import { computeLayout } from '../geometry/layout';
import { t } from '../i18n';
import {
  auditoriumBadges,
  auditoriumFacts,
  backLink,
  brokenAuditoriumNotice,
  theatreName,
} from './common';
import { renderMiniMap } from './miniMap';

function auditoriumCard(theatre: TheatreEntry, entry: AuditoriumEntry): HTMLElement {
  if (!entry.ok) {
    return h('li', { class: 'aud-list__item' }, brokenAuditoriumNotice(entry));
  }
  const { auditorium } = entry;
  const layout = computeLayout(auditorium);
  return h(
    'li',
    { class: 'aud-list__item' },
    h(
      'a',
      { class: 'aud-card', href: routes.trailer(theatre.id, auditorium.id) },
      h('span', { class: 'aud-card__map' }, renderMiniMap(layout)),
      h(
        'span',
        { class: 'aud-card__body' },
        h('span', { class: 'aud-card__name' }, auditorium.name),
        auditoriumFacts(auditorium),
        auditoriumBadges(auditorium),
      ),
    ),
  );
}

/** Step 2: the auditoriums of one theatre, each with a seat-map thumbnail. */
export function createTheatreView(theatre: TheatreEntry): View {
  const el = h(
    'section',
    { class: 'page' },
    backLink(routes.home(), t('app.theatreList')),
    h('h1', { class: 'page__title', tabindex: '-1' }, theatreName(theatre)),
    h('p', { class: 'page__sub' }, theatre.area),
    h('h2', { class: 'page__heading' }, t('theatre.heading')),
    h('p', { class: 'page__intro' }, t('theatre.hint')),
    theatre.auditoriums.length === 0
      ? h('p', { class: 'empty' }, t('theatre.empty'))
      : h(
          'ul',
          { class: 'aud-list' },
          theatre.auditoriums.map((entry) => auditoriumCard(theatre, entry)),
        ),
  );

  return { el, title: () => theatreName(theatre) };
}
