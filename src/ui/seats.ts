import { h } from '../app/dom';
import { navigate, rememberRoute } from '../app/navigation';
import { routeToHash, type Route } from '../app/routes';
import type { AppContext, Screen } from '../app/types';
import { BANDS, RATING, type Band } from '../config/rating';
import { findAuditorium, findTheatre } from '../data/loader';
import { fmt, t } from '../i18n';
import { pickDefaultSeat, rateLayout } from '../metrics';
import { resolveAuditorium } from '../metrics/layout';
import { auditoriumBadges, auditoriumName, backLink, theatreName } from './common';
import { notFoundScreen } from './notFound';
import { createSeatMap } from './seatMap';
import { bandLabel, bandPill, seatName, seatStats, verdictText } from './seatInfo';

type SeatsRoute = Extract<Route, { name: 'seats' }>;

/** "45–60°", "under 30°" … for the legend, built from the tunable thresholds. */
function bandRange(band: Band): string {
  const range = (from: number, to: number) => `${fmt.count(from)}–${fmt.degrees(to)}`;
  switch (band) {
    case 'prime':
      return range(RATING.primeFrom, RATING.maxViewingAngle);
    case 'recommended':
      return range(RATING.recommendedFrom, RATING.primeFrom);
    case 'ok':
      return range(RATING.okFrom, RATING.recommendedFrom);
    case 'meh':
      return t('legend.below', { value: fmt.degrees(RATING.okFrom) });
    case 'avoid':
      return t('legend.avoid');
  }
}

/** Step 3: the 2D seat map, coloured by rating band. */
export function seatsScreen(context: AppContext, route: SeatsRoute): Screen {
  const entry = findTheatre(context.data, route.theatreId);
  if (!entry) return notFoundScreen('error.theatre');
  const auditorium = findAuditorium(entry, route.auditoriumId);
  if (!auditorium) return notFoundScreen('error.auditorium');

  const layout = resolveAuditorium(auditorium);
  const rated = rateLayout(layout);
  let selected =
    route.seatKey && layout.seatIndex.has(route.seatKey)
      ? route.seatKey
      : (pickDefaultSeat(rated) ?? layout.seats[0]?.key ?? '');

  const takeSeat = (seatKey: string): void =>
    navigate({
      name: 'view',
      theatreId: route.theatreId,
      auditoriumId: route.auditoriumId,
      seatKey,
      videoId: route.videoId,
      forceFallback: false,
    });

  const card = h('section', {
    class: 'seat-card seat-card--panel',
    'aria-labelledby': 'seat-card-title',
  });
  const legend = h('ul', { class: 'legend' });
  const legendTitle = h('h2', { class: 'legend__title' });
  const map = createSeatMap({
    layout,
    rated,
    selected,
    onSelect: (key) => {
      selected = key;
      renderCard();
      // Keep the choice in the address so reloading or going back returns to it.
      rememberRoute({ ...route, seatKey: key });
    },
    onActivate: takeSeat,
  });

  const backHref = routeToHash({ name: 'theatre', theatreId: route.theatreId });
  const back = h('div', { class: 'page__back' });
  const eyebrow = h('p', { class: 'eyebrow' });
  const title = h('h1', { class: 'page__title' });
  const badges = h('div', { class: 'card__badges' });

  function renderCard(): void {
    const current = rated.get(selected);
    if (!current) {
      card.replaceChildren();
      return;
    }
    const { metrics } = current;
    card.replaceChildren(
      h('div', { class: 'seat-card__top' }, bandPill(current.rating.band)),
      h('h2', { class: 'seat-card__title', id: 'seat-card-title' }, seatName(current.seat)),
      h('p', { class: 'seat-card__verdict' }, verdictText(current)),
      h('p', { class: 'seat-card__stats' }, seatStats(current)),
      h(
        'p',
        { class: 'seat-card__stats seat-card__stats--minor' },
        [
          t('seat.sideAngle', { value: fmt.degrees(metrics.offAxis) }),
          t('seat.lookUp', { value: fmt.degrees(Math.max(0, metrics.verticalToTop)) }),
        ].join(' · '),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'button button--block seat-card__take',
          onclick: () => takeSeat(selected),
        },
        t('seats.take'),
      ),
    );
  }

  const renderText = (): string => {
    back.replaceChildren(backLink(backHref, theatreName(entry.theatre)));
    eyebrow.textContent = `${theatreName(entry.theatre)} · ${auditoriumName(auditorium)}`;
    title.textContent = t('seats.title');
    badges.replaceChildren(...auditoriumBadges(auditorium).filter((badge) => badge !== null));
    legendTitle.textContent = t('seats.legend');
    legend.replaceChildren(
      ...BANDS.map((band) =>
        h(
          'li',
          { class: 'legend__item', 'data-band': band },
          h('span', { class: 'legend__swatch', 'aria-hidden': 'true' }),
          h('span', { class: 'legend__label' }, bandLabel(band)),
          h('span', { class: 'legend__range' }, bandRange(band)),
        ),
      ),
    );
    map.relocalize();
    renderCard();
    return t('seats.title');
  };

  const el = h(
    'div',
    { class: 'page page--wide page--seats' },
    back,
    h('header', { class: 'page__header' }, eyebrow, title, badges),
    h(
      'div',
      { class: 'seats-layout' },
      h(
        'div',
        { class: 'seats-layout__map' },
        map.el,
        h('div', { class: 'legend-block' }, legendTitle, legend),
      ),
      card,
    ),
  );

  return { el, title: renderText(), relocalize: renderText };
}
