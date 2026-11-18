/** Step 4: pick a seat on the 2D map, see its rating, and take it. */
import { h, mount, s } from '../app/dom';
import { navigate, routes } from '../app/router';
import type { View } from '../app/view';
import type { TheatreEntry } from '../data/catalog';
import type { Auditorium } from '../data/resolve';
import type { Movie } from '../data/schema';
import { computeLayout } from '../geometry/layout';
import type { SeatDirection } from '../geometry/navigation';
import { t, type MessageKey } from '../i18n';
import { bandLabelKey } from '../metrics/rating';
import { bestSeat, evaluateSeats } from '../metrics/seats';
import { auditoriumNotes, backLink, theatreName } from './common';
import { bandChip, metricList, seatName, verdictText } from './seatInfo';
import { createSeatMap, seatLegend } from './seatMap';

export interface SeatMapViewParams {
  theatre: TheatreEntry;
  auditorium: Auditorium;
  videoId: string | null;
  seatId: string | null;
  movies: readonly Movie[];
}

/** Writing the address on every arrow press could hit browser limits (Safari: 100 per 10 s). */
const URL_DELAY_MS = 250;
const VERDICT_ID = 'seat-card-verdict';

function arrow(rotation: number): SVGSVGElement {
  return s(
    'svg',
    { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true' },
    s('path', {
      d: 'M6 3l5 5-5 5',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      transform: `rotate(${rotation} 8 8)`,
    }),
  );
}

export function trailerLabel(videoId: string | null, movies: readonly Movie[]): string {
  if (!videoId) return t('trailer.none');
  const movie = movies.find((m) => m.youtubeId === videoId);
  return t('trailer.selected', { title: movie ? movie.title : t('trailer.yourVideo') });
}

export function createSeatMapView(params: SeatMapViewParams): View {
  const { theatre, auditorium, videoId, movies } = params;
  const layout = computeLayout(auditorium);
  const evaluations = evaluateSeats(layout);
  const best = bestSeat(evaluations.values());
  const requested = params.seatId && evaluations.has(params.seatId) ? params.seatId : null;
  const startId = requested ?? best?.seat.id ?? layout.seats[0]?.id ?? '';
  const viewHref = (seatId: string) =>
    routes.view(theatre.id, auditorium.id, seatId, { video: videoId });

  // The card is built once; a new selection only changes its texts, so the arrow button that
  // was just pressed keeps keyboard focus.
  const chipSlot = h('span', { class: 'seat-card__chip' });
  const seatHeading = h('h2', { class: 'seat-card__seat' });
  const verdict = h('p', { class: 'seat-card__verdict', id: VERDICT_ID });
  const metricsSlot = h('div', { class: 'seat-card__metrics' });
  // Runs before the link navigates, so the address of this page remembers the seat.
  const take = h('a', { class: 'btn seat-card__take', onclick: () => flushUrl() });
  const nudgeButtons: { button: HTMLButtonElement; labelKey: MessageKey }[] = [];
  const status = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  let urlTimer = 0;

  const map = createSeatMap({
    layout,
    evaluations,
    selectedId: startId,
    describedBy: VERDICT_ID,
    onSelect: (seatId, source) => {
      updateCard();
      scheduleUrl(seatId);
      // A seat that takes focus is read out by its own label; other changes are announced here.
      const evaluation = evaluations.get(seatId);
      if (evaluation && source !== 'keyboard') {
        status.textContent = t('seatmap.status', {
          seat: seatName(evaluation.seat),
          band: t(bandLabelKey(evaluation.rating.band)),
          verdict: verdictText(evaluation),
        });
      }
    },
    onActivate: (seatId) => {
      flushUrl();
      navigate(viewHref(seatId));
    },
  });

  /** Keep the choice in the address, so Back from the 3D view and a reload return to it. */
  function writeUrl(seatId: string): void {
    try {
      const url = new URL(location.href);
      url.hash = routes.seats(theatre.id, auditorium.id, { video: videoId, seat: seatId });
      history.replaceState(history.state, '', url);
    } catch {
      // Not remembering the seat in the address is harmless.
    }
  }

  let pendingSeat: string | null = null;
  function scheduleUrl(seatId: string): void {
    window.clearTimeout(urlTimer);
    pendingSeat = seatId;
    urlTimer = window.setTimeout(flushUrl, URL_DELAY_MS);
  }

  /** Writes a pending change now: called right before leaving for the 3D view. */
  function flushUrl(): void {
    window.clearTimeout(urlTimer);
    if (pendingSeat) writeUrl(pendingSeat);
    pendingSeat = null;
  }

  function nudge(direction: SeatDirection, labelKey: MessageKey, rotation: number) {
    const button = h(
      'button',
      { type: 'button', class: 'nudge', onclick: () => map.move(direction, { reveal: true }) },
      arrow(rotation),
    );
    nudgeButtons.push({ button, labelKey });
    return button;
  }

  const card = h(
    'section',
    { class: 'seat-card' },
    h('div', { class: 'seat-card__head' }, chipSlot, seatHeading),
    verdict,
    metricsSlot,
    h(
      'div',
      { class: 'seat-card__actions' },
      h(
        'div',
        { class: 'nudges', role: 'group' },
        nudge('left', 'seatmap.nudgeLeft', 180),
        nudge('up', 'seatmap.nudgeUp', -90),
        nudge('down', 'seatmap.nudgeDown', 90),
        nudge('right', 'seatmap.nudgeRight', 0),
      ),
      take,
    ),
  );

  function updateCard(): void {
    const evaluation = evaluations.get(map.selectedId);
    if (!evaluation) return;
    mount(chipSlot, bandChip(evaluation));
    seatHeading.textContent = seatName(evaluation.seat);
    verdict.textContent = verdictText(evaluation);
    mount(metricsSlot, metricList(evaluation));
    take.href = viewHref(map.selectedId);
    take.textContent = t('seatmap.take');
    for (const { button, labelKey } of nudgeButtons) {
      button.setAttribute('aria-label', t(labelKey));
      button.title = t(labelKey);
    }
  }

  const el = h(
    'section',
    { class: 'page page--seatmap' },
    backLink(routes.trailer(theatre.id, auditorium.id), t('trailer.change')),
    h('h1', { class: 'page__title', tabindex: '-1' }, t('seatmap.heading')),
    h(
      'p',
      { class: 'seatmap-context' },
      h('span', { class: 'seatmap-context__room' }, auditorium.name),
      h('span', { class: 'seatmap-context__theatre' }, theatreName(theatre)),
      h('span', { class: 'seatmap-context__trailer' }, trailerLabel(videoId, movies)),
    ),
    map.el,
    requested ? null : h('p', { class: 'seatmap-hint' }, t('seatmap.preselected')),
    seatLegend(),
    auditoriumNotes(auditorium),
    status,
    card,
  );

  updateCard();

  // While the card sticks to the bottom, scrolling a seat into view must stop above it.
  const root = document.documentElement;
  const cardObserver = new ResizeObserver(() => {
    const sticky = getComputedStyle(card).position === 'sticky';
    root.style.scrollPaddingBottom = sticky
      ? `${Math.ceil(card.getBoundingClientRect().height) + 12}px`
      : '';
  });
  cardObserver.observe(card);

  return {
    el,
    title: () => t('seatmap.heading'),
    destroy() {
      window.clearTimeout(urlTimer);
      cardObserver.disconnect();
      root.style.scrollPaddingBottom = '';
    },
  };
}
