import { h } from '../app/dom';
import { routeToHash, type Route } from '../app/routes';
import type { AppContext, Screen } from '../app/types';
import { findAuditorium, findTheatre } from '../data/loader';
import { t } from '../i18n';
import { rateLayout } from '../metrics';
import { findSeat, resolveAuditorium } from '../metrics/layout';
import { SeatViewer } from '../three/viewer';
import { auditoriumName, estimatedBadge } from './common';
import { notFoundScreen } from './notFound';
import { bandPill, seatName, seatStats, verdictText } from './seatInfo';
import { seatMapThumbnail } from './seatMap';

type ViewRoute = Extract<Route, { name: 'view' }>;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Steps 4 and 5: the 3D auditorium, seen from the chosen seat. */
export function viewScreen(context: AppContext, route: ViewRoute): Screen {
  const entry = findTheatre(context.data, route.theatreId);
  if (!entry) return notFoundScreen('error.theatre');
  const auditorium = findAuditorium(entry, route.auditoriumId);
  if (!auditorium) return notFoundScreen('error.auditorium');
  const layout = resolveAuditorium(auditorium);
  const seat = findSeat(layout, route.seatKey);
  if (!seat) return notFoundScreen('error.seat');
  const ratedSeats = rateLayout(layout);
  const rated = ratedSeats.get(seat.key)!;

  const changeSeatHref = routeToHash({
    name: 'seats',
    theatreId: route.theatreId,
    auditoriumId: route.auditoriumId,
    videoId: route.videoId,
    seatKey: seat.key,
  });

  const stage = h('div', { class: 'view__stage', tabindex: 0, role: 'application' });
  const recentreButton = h('button', { type: 'button', class: 'chip' });
  const toolbar = h('div', { class: 'view__toolbar' }, h('span'), recentreButton);
  stage.append(toolbar);

  const card = h('section', { class: 'seat-card' });
  const el = h('div', { class: 'view' }, stage, card);

  const renderText = (): string => {
    const name = seatName(seat);
    stage.setAttribute('aria-label', t('view.stageLabel', { seat: name }));
    recentreButton.textContent = t('view.recentre');
    card.replaceChildren(
      h(
        'div',
        { class: 'seat-card__summary' },
        h(
          'div',
          { class: 'seat-card__text' },
          h(
            'div',
            { class: 'seat-card__top' },
            bandPill(rated.rating.band),
            estimatedBadge(layout.auditorium),
          ),
          h('h1', { class: 'seat-card__title' }, name),
          h('p', { class: 'seat-card__verdict' }, verdictText(rated)),
          h('p', { class: 'seat-card__stats' }, seatStats(rated)),
        ),
        seatMapThumbnail(layout, ratedSeats, {
          label: t('view.miniMap'),
          highlight: seat.key,
          className: 'seat-card__map',
        }),
      ),
      h(
        'div',
        { class: 'seat-card__actions' },
        h(
          'a',
          { class: 'button button--ghost button--small', href: changeSeatHref },
          t('view.changeSeat'),
        ),
      ),
    );
    return `${name} · ${auditoriumName(layout.auditorium)}`;
  };
  const title = renderText();

  let viewer: SeatViewer | null = null;
  try {
    viewer = new SeatViewer({
      stage,
      layout,
      seat,
      videoId: route.videoId,
      reducedMotion: prefersReducedMotion(),
    });
    recentreButton.addEventListener('click', () => viewer?.recentre());
  } catch (cause) {
    console.error('Could not start the 3D view', cause);
    recentreButton.hidden = true;
    stage.append(h('p', { class: 'view__error', role: 'alert' }, t('view.noWebgl')));
  }

  return {
    el,
    title,
    immersive: true,
    relocalize: renderText,
    destroy: () => viewer?.dispose(),
  };
}
