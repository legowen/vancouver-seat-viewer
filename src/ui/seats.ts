import { h, s } from '../app/dom';
import { navigate, rememberRoute } from '../app/navigation';
import { routeToHash, type Route } from '../app/routes';
import type { AppContext, Screen } from '../app/types';
import { BANDS, RATING, type Band } from '../config/rating';
import { findAuditorium, findTheatre } from '../data/loader';
import { fmt, t, type MessageKey } from '../i18n';
import { pickDefaultSeat, rateLayout } from '../metrics';
import { resolveAuditorium } from '../metrics/layout';
import { auditoriumBadges, auditoriumName, backLink, theatreName } from './common';
import { notFoundScreen } from './notFound';
import { createSeatMap } from './seatMap';
import type { SeatMove } from './seatNavigation';
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

  // The card is built once and only its texts change, so a nudge button that was just
  // pressed keeps keyboard focus.
  const verdictId = `seat-card-verdict-${++idCounter}`;
  const pillSlot = h('div', { class: 'seat-card__top' });
  const cardTitle = h('h2', { class: 'seat-card__title', id: `seat-card-title-${idCounter}` });
  const cardVerdict = h('p', { class: 'seat-card__verdict', id: verdictId });
  const cardStats = h('p', { class: 'seat-card__stats' });
  const cardMinor = h('p', { class: 'seat-card__stats seat-card__stats--minor' });
  const takeButton = h('button', {
    type: 'button',
    class: 'button seat-card__take',
    onclick: () => takeSeat(selected),
  });
  // Changes made by a tap or a nudge are read out here; arrow keys move focus instead.
  const status = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  const nudges: { button: HTMLButtonElement; labelKey: MessageKey }[] = [];
  const nudgeGroup = h('div', { class: 'nudges', role: 'group' });
  const card = h(
    'section',
    { class: 'seat-card seat-card--panel', 'aria-labelledby': cardTitle.id },
    pillSlot,
    cardTitle,
    cardVerdict,
    cardStats,
    cardMinor,
    h('div', { class: 'seat-card__controls' }, nudgeGroup, takeButton),
  );
  const legend = h('ul', { class: 'legend' });
  const legendTitle = h('h2', { class: 'legend__title' });
  const map = createSeatMap({
    layout,
    rated,
    selected,
    describedBy: verdictId,
    onSelect: (key, source) => {
      selected = key;
      renderCard();
      const current = rated.get(key);
      if (current && source !== 'keyboard') {
        status.textContent = t('seats.status', {
          seat: seatName(current.seat),
          band: bandLabel(current.rating.band),
          verdict: verdictText(current),
        });
      }
      // Keep the choice in the address so reloading or going back returns to it.
      rememberRoute({ ...route, seatKey: key });
    },
    onActivate: takeSeat,
  });

  // Small screens make seats small: these step through them one at a time.
  const NUDGES: [SeatMove, MessageKey, number][] = [
    ['left', 'seats.nudgeLeft', 180],
    ['up', 'seats.nudgeUp', -90],
    ['down', 'seats.nudgeDown', 90],
    ['right', 'seats.nudgeRight', 0],
  ];
  for (const [direction, labelKey, rotation] of NUDGES) {
    const button = h(
      'button',
      { type: 'button', class: 'nudge', onclick: () => map.move(direction) },
      arrowIcon(rotation),
    );
    nudges.push({ button, labelKey });
    nudgeGroup.append(button);
  }

  const backHref = routeToHash({ name: 'theatre', theatreId: route.theatreId });
  const back = h('div', { class: 'page__back' });
  const eyebrow = h('p', { class: 'eyebrow' });
  const title = h('h1', { class: 'page__title' });
  const badges = h('div', { class: 'card__badges' });
  const trailerLine = h('p', { class: 'trailer-line' });
  const trailerHref = routeToHash({
    name: 'trailer',
    theatreId: route.theatreId,
    auditoriumId: route.auditoriumId,
  });
  const movie = context.data.movies.find((entry) => entry.youtubeId === route.videoId);

  function renderCard(): void {
    const current = rated.get(selected);
    card.hidden = !current;
    if (!current) return;
    const { metrics } = current;
    pillSlot.replaceChildren(bandPill(current.rating.band));
    cardTitle.textContent = seatName(current.seat);
    cardVerdict.textContent = verdictText(current);
    cardStats.textContent = seatStats(current);
    cardMinor.textContent = [
      t('seat.sideAngle', { value: fmt.degrees(metrics.offAxis) }),
      t('seat.lookUp', { value: fmt.degrees(Math.max(0, metrics.verticalToTop)) }),
    ].join(' · ');
    takeButton.textContent = t('seats.take');
    nudgeGroup.setAttribute('aria-label', t('seats.nudgeGroup'));
    for (const { button, labelKey } of nudges) {
      button.setAttribute('aria-label', t(labelKey));
      button.title = t(labelKey);
    }
  }

  const renderText = (): string => {
    back.replaceChildren(backLink(backHref, theatreName(entry.theatre)));
    eyebrow.textContent = `${theatreName(entry.theatre)} · ${auditoriumName(auditorium)}`;
    title.textContent = t('seats.title');
    badges.replaceChildren(...auditoriumBadges(auditorium).filter((badge) => badge !== null));
    const trailerTitle = route.videoId ? (movie?.title ?? t('trailer.pasted')) : null;
    trailerLine.replaceChildren(
      h(
        'span',
        null,
        trailerTitle ? t('trailer.chosen', { title: trailerTitle }) : t('trailer.none'),
      ),
      ' · ',
      h('a', { href: trailerHref }, t('trailer.change')),
    );
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
    h('header', { class: 'page__header' }, eyebrow, title, badges, trailerLine),
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
    status,
  );

  // While the card sticks to the bottom of a phone screen, a seat scrolled into view by a
  // nudge must stop above the card rather than behind it.
  const root = document.documentElement;
  const keepSeatsAboveCard = new ResizeObserver(() => {
    const sticky = getComputedStyle(card).position === 'sticky';
    root.style.scrollPaddingBottom = sticky ? `${card.offsetHeight + 16}px` : '';
  });
  keepSeatsAboveCard.observe(card);

  return {
    el,
    title: renderText(),
    relocalize: renderText,
    destroy: () => {
      keepSeatsAboveCard.disconnect();
      root.style.scrollPaddingBottom = '';
    },
  };
}

let idCounter = 0;

/** A chevron pointing right, turned by `rotation` degrees. */
function arrowIcon(rotation: number): SVGSVGElement {
  return s(
    'svg',
    {
      class: 'nudge__icon',
      viewBox: '0 0 24 24',
      'aria-hidden': 'true',
      focusable: 'false',
      style: `transform: rotate(${rotation}deg)`,
    },
    s('path', {
      d: 'M9 5l7 7-7 7',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2.4,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  );
}
