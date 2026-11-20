import { h } from '../app/dom';
import { routeToHash } from '../app/routes';
import type { AppContext, Screen } from '../app/types';
import { findTheatre } from '../data/loader';
import type { Auditorium } from '../data/schema';
import { fmt, t } from '../i18n';
import { rateLayout } from '../metrics';
import { resolveAuditorium } from '../metrics/layout';
import {
  auditoriumBadges,
  auditoriumName,
  backLink,
  messagePage,
  theatreArea,
  theatreName,
} from './common';
import { seatMapThumbnail } from './seatMap';

function auditoriumCard(auditorium: Auditorium): HTMLElement {
  const layout = resolveAuditorium(auditorium);
  const name = auditoriumName(auditorium);
  return h(
    'li',
    null,
    h(
      'a',
      {
        class: 'card card--link card--auditorium',
        href: routeToHash({
          name: 'trailer',
          theatreId: auditorium.theatreId,
          auditoriumId: auditorium.id,
        }),
      },
      // A small picture of the seat map, to match against the one seen when booking.
      seatMapThumbnail(layout, rateLayout(layout), {
        label: t('theatre.mapAlt', { name }),
        className: 'card__thumb',
      }),
      h(
        'span',
        { class: 'card__body' },
        h('span', { class: 'card__title' }, name),
        h(
          'span',
          { class: 'card__meta' },
          t('theatre.rows', { count: fmt.count(auditorium.rows.length) }),
          ' · ',
          t('theatre.seats', { count: fmt.count(layout.seatCount) }),
        ),
        h('span', { class: 'card__badges' }, auditoriumBadges(auditorium)),
      ),
      h('span', { class: 'card__chevron', 'aria-hidden': 'true' }, '›'),
    ),
  );
}

/** Step 2: the auditoriums of one theatre. */
export function theatreScreen(context: AppContext, route: { theatreId: string }): Screen {
  const entry = findTheatre(context.data, route.theatreId);
  if (!entry) {
    return {
      el: messagePage(t('error.notFoundTitle'), t('error.theatre'), {
        href: routeToHash({ name: 'home' }),
        label: t('error.backHome'),
      }),
      title: t('error.notFoundTitle'),
    };
  }

  const { theatre, auditoriums } = entry;
  const el = h(
    'div',
    { class: 'page' },
    backLink(routeToHash({ name: 'home' }), t('nav.allTheatres')),
    h(
      'header',
      { class: 'page__header' },
      h('p', { class: 'eyebrow' }, theatreName(theatre), ' · ', theatreArea(theatre)),
      h('h1', { class: 'page__title' }, t('theatre.heading')),
      h('p', { class: 'lead' }, t('theatre.intro')),
    ),
    auditoriums.length === 0
      ? h('p', { class: 'empty' }, t('theatre.empty'))
      : h('ul', { class: 'card-list' }, auditoriums.map(auditoriumCard)),
  );

  return { el, title: theatreName(theatre) };
}
