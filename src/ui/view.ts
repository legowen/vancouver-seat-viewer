import { h, s } from '../app/dom';
import { routeToHash, type Route } from '../app/routes';
import type { AppContext, Screen } from '../app/types';
import { findAuditorium, findTheatre } from '../data/loader';
import { t } from '../i18n';
import { rateLayout } from '../metrics';
import { findSeat, resolveAuditorium } from '../metrics/layout';
import type { VideoState } from '../three/videoScreen';
import { SeatViewer, type ViewerMode } from '../three/viewer';
import { watchUrl } from '../youtube/embed';
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
  const movie = context.data.movies.find((entry) => entry.youtubeId === route.videoId);
  const videoTitle = movie?.title ?? t('trailer.pasted');

  const changeSeatHref = routeToHash({
    name: 'seats',
    theatreId: route.theatreId,
    auditoriumId: route.auditoriumId,
    videoId: route.videoId,
    seatKey: seat.key,
  });

  const reducedMotion = prefersReducedMotion();
  let viewer: SeatViewer | null = null;
  let mode: ViewerMode = 'seated';

  const stage = h('div', { class: 'view__stage', tabindex: 0, role: 'application' });
  const skipButton = h('button', {
    type: 'button',
    class: 'chip chip--accent',
    hidden: true,
    onclick: () => viewer?.skipWalk(),
  });
  const recentreButton = h('button', {
    type: 'button',
    class: 'chip',
    onclick: () => viewer?.recentre(),
  });
  const replayButton = h('button', {
    type: 'button',
    class: 'button button--ghost button--small',
    hidden: reducedMotion,
    onclick: () => {
      viewer?.replayWalk();
      stage.focus({ preventScroll: true });
    },
  });
  // Announces the walk and the arrival to screen readers.
  const status = h('p', { class: 'visually-hidden', role: 'status' });
  stage.append(h('div', { class: 'view__toolbar' }, h('span'), skipButton, recentreButton));

  // Sound is off at first, because browsers only autoplay muted video.
  const soundLabel = h('span');
  const soundButton = h(
    'button',
    {
      type: 'button',
      class: 'chip chip--accent chip--large',
      hidden: true,
      onclick: () => viewer?.unmuteVideo(),
    },
    speakerIcon(),
    soundLabel,
  );
  // Shown when the player cannot run here: the still frame stays on the screen instead.
  const openLabel = h('span');
  const openLink = route.videoId
    ? h(
        'a',
        {
          class: 'chip chip--large',
          href: watchUrl(route.videoId),
          target: '_blank',
          rel: 'noopener noreferrer',
          hidden: true,
        },
        playIcon(),
        openLabel,
      )
    : null;
  const fallbackNote = h('p', { class: 'view__note', hidden: true });
  stage.append(
    h('div', { class: 'view__overlay' }, h('div', null, soundButton, openLink), fallbackNote),
  );

  // Wide screens can show a 16:9 trailer whole (with side bars) or cropped to fill them.
  const screenAspect = layout.screen.width / layout.screen.height;
  let fill = false;
  const fillButton = h('button', {
    type: 'button',
    class: 'link-button',
    'aria-pressed': 'false',
    hidden: !route.videoId || Math.abs(screenAspect - 16 / 9) < 0.1,
    onclick: () => {
      fill = !fill;
      viewer?.setVideoFill(fill);
      fillButton.setAttribute('aria-pressed', String(fill));
      fillButton.textContent = fill ? t('video.fitVideo') : t('video.fillScreen');
    },
  });
  const troubleButton = h('button', {
    type: 'button',
    class: 'link-button',
    hidden: true,
    onclick: () => viewer?.giveUpVideo(),
  });

  // Folding the card hides the details and gives the 3D view more room on small phones.
  let folded = false;
  const foldButton = h('button', {
    type: 'button',
    class: 'seat-card__fold',
    'aria-expanded': 'true',
    onclick: () => {
      folded = !folded;
      applyFold();
    },
  });
  foldButton.append(chevronIcon());

  const card = h('section', { class: 'seat-card' });
  const applyFold = (): void => {
    card.classList.toggle('seat-card--folded', folded);
    foldButton.setAttribute('aria-expanded', String(!folded));
    const label = folded ? t('view.showDetails') : t('view.hideDetails');
    foldButton.setAttribute('aria-label', label);
    foldButton.title = label;
  };
  const el = h('div', { class: 'view' }, stage, card, status);

  let videoState: VideoState = 'idle';
  const applyVideoState = (next: VideoState): void => {
    videoState = next;
    el.dataset.video = next;
    soundButton.hidden = next !== 'muted';
    const showFallback = next === 'failed' && mode === 'seated';
    if (openLink) openLink.hidden = !showFallback;
    fallbackNote.hidden = !showFallback;
    troubleButton.hidden = !['loading', 'muted', 'playing'].includes(next);
  };

  const applyMode = (next: ViewerMode): void => {
    mode = next;
    el.dataset.mode = next;
    applyVideoState(videoState);
    const hadFocus = skipButton.contains(document.activeElement);
    skipButton.hidden = next !== 'walking';
    recentreButton.hidden = next !== 'seated' || !viewer;
    replayButton.disabled = next === 'walking';
    // Hiding the focused Skip button would drop focus to the page; keep it in the view.
    if (hadFocus && skipButton.hidden) stage.focus({ preventScroll: true });
    status.textContent =
      next === 'walking' ? t('view.walking') : t('view.seated', { seat: seatName(seat) });
  };

  const renderText = (): string => {
    const name = seatName(seat);
    stage.setAttribute('aria-label', t('view.stageLabel', { seat: name }));
    skipButton.textContent = t('view.skip');
    recentreButton.textContent = t('view.recentre');
    replayButton.textContent = t('view.replay');
    soundLabel.textContent = t('video.tapForSound');
    openLabel.textContent = t('video.open');
    if (openLink) openLink.title = t('video.openHint');
    fallbackNote.textContent = t('video.openHint');
    fillButton.textContent = fill ? t('video.fitVideo') : t('video.fillScreen');
    troubleButton.textContent = t('video.trouble');
    applyFold();
    card.replaceChildren(
      foldButton,
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
          route.videoId ? h('p', { class: 'seat-card__links' }, fillButton, troubleButton) : null,
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
        replayButton,
      ),
    );
    if (status.textContent) applyMode(mode);
    return `${name} · ${auditoriumName(layout.auditorium)}`;
  };
  const title = renderText();

  /** No 3D view (no WebGL, or the context never came back): say so, keep the trailer link. */
  function showUnavailable(): void {
    viewer?.dispose();
    viewer = null;
    skipButton.hidden = true;
    recentreButton.hidden = true;
    replayButton.hidden = true;
    soundButton.hidden = true;
    fillButton.hidden = true;
    troubleButton.hidden = true;
    if (!stage.querySelector('.view__error')) {
      stage.append(h('p', { class: 'view__error', role: 'alert' }, t('view.noWebgl')));
    }
    if (openLink) openLink.hidden = false;
  }

  try {
    viewer = new SeatViewer({
      stage,
      layout,
      seat,
      videoId: route.videoId,
      videoTitle: t('video.iframeTitle', { title: videoTitle }),
      forceVideoFallback: route.forceFallback,
      reducedMotion,
      onModeChange: applyMode,
      onVideoStateChange: applyVideoState,
      onContextLost: () => showUnavailable(),
    });
    applyMode(viewer.currentMode);
    applyVideoState(viewer.videoState);
  } catch (cause) {
    console.error('Could not start the 3D view', cause);
    showUnavailable();
  }

  return {
    el,
    title,
    immersive: true,
    relocalize: renderText,
    destroy: () => viewer?.dispose(),
  };
}

function speakerIcon(): SVGSVGElement {
  return s(
    'svg',
    { class: 'chip__icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
    s('path', { d: 'M4 9h4l5-4v14l-5-4H4z', fill: 'currentColor' }),
    s('path', {
      d: 'M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
    }),
  );
}

function chevronIcon(): SVGSVGElement {
  return s(
    'svg',
    { class: 'chip__icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
    s('path', {
      d: 'M6 9l6 6 6-6',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2.4,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  );
}

function playIcon(): SVGSVGElement {
  return s(
    'svg',
    { class: 'chip__icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
    s('path', { d: 'M8 5v14l11-7z', fill: 'currentColor' }),
  );
}
