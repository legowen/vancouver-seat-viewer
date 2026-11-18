import { h } from '../app/dom';
import { routes } from '../app/router';
import type { View } from '../app/view';
import type { TheatreEntry } from '../data/catalog';
import type { Auditorium } from '../data/resolve';
import { computeLayout } from '../geometry/layout';
import { t } from '../i18n';
import { bestSeat, evaluateSeats } from '../metrics/seats';
import {
  auditoriumBadges,
  auditoriumFacts,
  auditoriumNotes,
  backLink,
  theatreName,
} from './common';
import { renderMiniMap } from './miniMap';
import { roomDetails } from './roomDetails';
import { bandChip, metricSummary, seatName, verdictText } from './seatInfo';

/** Header shared by the auditorium's own screens: where you are, and what the room looks like. */
export function auditoriumHeader(theatre: TheatreEntry, auditorium: Auditorium): HTMLElement {
  const layout = computeLayout(auditorium);
  return h(
    'header',
    { class: 'aud-header' },
    h(
      'div',
      { class: 'aud-header__map' },
      renderMiniMap(layout, { label: t('theatre.thumbnailAlt', { name: auditorium.name }) }),
    ),
    h(
      'div',
      { class: 'aud-header__body' },
      h('p', { class: 'aud-header__theatre' }, theatreName(theatre)),
      h('p', { class: 'aud-header__name' }, auditorium.name),
      auditoriumFacts(auditorium),
      auditoriumBadges(auditorium),
    ),
  );
}

/** The best-rated seat with a button to sit in it. */
function bestSeatCard(theatre: TheatreEntry, auditorium: Auditorium): HTMLElement | null {
  const best = bestSeat(evaluateSeats(computeLayout(auditorium)).values());
  if (!best) return null;
  return h(
    'section',
    { class: 'best-seat' },
    h(
      'div',
      { class: 'best-seat__head' },
      bandChip(best),
      h('p', { class: 'best-seat__name' }, seatName(best.seat)),
    ),
    h('p', { class: 'best-seat__verdict' }, verdictText(best)),
    h('p', { class: 'best-seat__numbers' }, metricSummary(best)),
    h(
      'a',
      { class: 'btn btn--block', href: routes.view(theatre.id, auditorium.id, best.seat.id) },
      t('seatmap.take'),
    ),
  );
}

/** Step 3 starts here: the chosen auditorium. The trailer picker is added to this screen. */
export function createAuditoriumView(theatre: TheatreEntry, auditorium: Auditorium): View {
  const el = h(
    'section',
    { class: 'page' },
    backLink(routes.theatre(theatre.id), theatreName(theatre)),
    h('h1', { class: 'page__title', tabindex: '-1' }, auditorium.name),
    auditoriumHeader(theatre, auditorium),
    auditoriumNotes(auditorium),
    bestSeatCard(theatre, auditorium),
    roomDetails(auditorium),
  );
  return { el, title: () => auditorium.name };
}
