/**
 * The seated view: the 3D auditorium from one seat, full screen, with the seat's rating card at
 * the bottom. three.js is loaded here, on demand.
 */
import { h, mount } from '../app/dom';
import { routes, navigate } from '../app/router';
import type { View } from '../app/view';
import type { TheatreEntry } from '../data/catalog';
import type { Auditorium } from '../data/resolve';
import { computeLayout } from '../geometry/layout';
import { t } from '../i18n';
import { evaluateSeats } from '../metrics/seats';
import type { ScenePhase, SeatScene } from '../scene/seatScene';
import { auditoriumBadges, chevron } from './common';
import { createLanguageSwitcher } from './languageSwitcher';
import { renderMiniMap } from './miniMap';
import { bandChip, metricSummary, seatName, verdictText } from './seatInfo';

export interface SeatViewParams {
  theatre: TheatreEntry;
  auditorium: Auditorium;
  seatId: string;
  videoId: string | null;
}

/** Landscape phones: the card starts folded so it does not hide the screen. */
const SHORT_SCREEN = '(max-height: 500px)';
/** How long to wait for the browser to give a lost WebGL context back before giving up. */
const RESTORE_WAIT_MS = 6000;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function createSeatView(params: SeatViewParams): View {
  const { theatre, auditorium, seatId, videoId } = params;
  const layout = computeLayout(auditorium);
  const evaluations = evaluateSeats(layout);
  const evaluation = evaluations.get(seatId);
  const seatMapHref = routes.seats(theatre.id, auditorium.id, { video: videoId, seat: seatId });

  // role=application lets screen readers pass the arrow keys through for looking around.
  const stageEl = h('div', { class: 'stage', tabindex: '0', role: 'application' });
  const status = h('div', { class: 'stage__status', role: 'status' });
  const switcher = createLanguageSwitcher();
  const skip = h('button', { type: 'button', class: 'pill pill--accent view-skip', hidden: true });
  const walking = h('p', { class: 'view-walking', role: 'status', hidden: true });
  const topBar = h(
    'div',
    { class: 'view-top' },
    skip,
    h('span', { class: 'view-top__spacer' }),
    switcher.el,
  );
  const recentre = h('button', { type: 'button', class: 'pill view-recentre', hidden: true });
  const card = h('section', { class: 'view-card' });
  const el = h('div', { class: 'seat-view' }, stageEl, status, topBar, walking, recentre, card);

  let scene: SeatScene | null = null;
  let destroyed = false;
  let collapsed = typeof matchMedia === 'function' && matchMedia(SHORT_SCREEN).matches;
  let failure: 'webgl' | 'seat' | null = evaluation ? null : 'seat';
  let restoreTimer = 0;
  const reducedMotion = prefersReducedMotion();
  let phase: ScenePhase = reducedMotion ? 'seated' : 'walking';

  const goToSeatMap = () => navigate(seatMapHref);

  function renderCard(): void {
    if (failure) {
      const message = failure === 'seat' ? t('view.seatNotFound') : t('view.webglError');
      card.classList.remove('is-collapsed');
      mount(
        card,
        h('p', { class: 'view-card__error', role: 'alert' }, message),
        h('a', { class: 'btn btn--block', href: seatMapHref }, t('view.changeSeat')),
      );
      return;
    }
    if (!evaluation) return;
    const toggleLabel = collapsed ? t('view.showDetails') : t('view.hideDetails');
    const toggle = h(
      'button',
      {
        type: 'button',
        class: 'icon-button view-card__toggle',
        'aria-expanded': String(!collapsed),
        'aria-label': toggleLabel,
        title: toggleLabel,
        onclick: () => {
          collapsed = !collapsed;
          renderCard();
          updateInset();
          // The card was rebuilt: keep keyboard focus on the (new) toggle.
          card.querySelector<HTMLElement>('.view-card__toggle')?.focus();
        },
      },
      chevron(collapsed ? 'left' : 'right'),
    );
    const head = h(
      'div',
      { class: 'view-card__head' },
      bandChip(evaluation),
      h('h1', { class: 'view-card__seat', tabindex: '-1' }, seatName(evaluation.seat)),
      toggle,
    );
    card.classList.toggle('is-collapsed', collapsed);
    if (collapsed) {
      mount(card, head);
      return;
    }
    mount(
      card,
      head,
      h(
        'div',
        { class: 'view-card__body' },
        h(
          'div',
          { class: 'view-card__text' },
          h('p', { class: 'view-card__verdict' }, verdictText(evaluation)),
          h('p', { class: 'view-card__numbers' }, metricSummary(evaluation)),
          auditoriumBadges(auditorium),
        ),
        h(
          'div',
          { class: 'view-card__map' },
          renderMiniMap(layout, {
            highlightSeatId: seatId,
            label: t('view.miniMapLabel'),
            seatClass: (seat) => `seat-band--${evaluations.get(seat.id)?.rating.band ?? 'meh'}`,
          }),
        ),
      ),
      h(
        'div',
        { class: 'view-card__actions' },
        h('a', { class: 'btn btn--ghost', href: seatMapHref }, t('view.changeSeat')),
        // With reduced motion there is no walk to replay.
        reducedMotion
          ? null
          : h(
              'button',
              {
                type: 'button',
                class: 'btn btn--ghost view-replay',
                disabled: phase === 'walking' || !scene,
                onclick: () => scene?.replayWalk(),
              },
              t('view.replay'),
            ),
      ),
    );
  }

  /** Texts outside the card. The top bar itself is built once, so focus survives a language change. */
  function renderChrome(): void {
    recentre.textContent = t('view.recentre');
    skip.textContent = t('view.skip');
    walking.textContent = t('view.walking');
    stageEl.setAttribute(
      'aria-label',
      evaluation ? t('view.canvasLabel', { seat: seatName(evaluation.seat) }) : t('app.title'),
    );
  }

  function updateInset(): void {
    const height = card.getBoundingClientRect().height;
    // Keeps the Recentre button just above the card, and the aim point centred above it.
    el.style.setProperty('--card-height', `${Math.round(height)}px`);
    scene?.setBottomInset(height + 12);
  }

  const cardObserver = new ResizeObserver(() => updateInset());
  cardObserver.observe(card);

  recentre.addEventListener('click', () => scene?.recentre());
  skip.addEventListener('click', () => scene?.skipWalk());

  function setPhase(next: ScenePhase): void {
    phase = next;
    const isWalking = next === 'walking';
    // Do not hide the Skip button while it has focus: hand focus to the view first.
    if (!isWalking && document.activeElement === skip) stageEl.focus();
    skip.hidden = !isWalking;
    walking.hidden = !isWalking;
    el.classList.toggle('is-walking', isWalking);
    const replay = card.querySelector<HTMLButtonElement>('.view-replay');
    if (replay) {
      if (isWalking && document.activeElement === replay) skip.focus();
      replay.disabled = isWalking;
    }
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    // Escape first skips the walk, then leaves for the seat map.
    if (phase === 'walking' && scene) scene.skipWalk();
    else goToSeatMap();
  };
  document.addEventListener('keydown', onKey);

  function setTurned(turned: boolean): void {
    // Do not hide the button while it has focus: hand focus to the view first.
    if (!turned && document.activeElement === recentre) stageEl.focus();
    recentre.hidden = !turned;
  }

  async function start(): Promise<void> {
    if (failure) return;
    status.textContent = t('view.loading');
    try {
      const module = await import('../scene/seatScene');
      if (destroyed) return;
      try {
        scene = module.createSeatScene({
          container: stageEl,
          auditorium,
          layout,
          seatId,
          videoId,
          walkIn: !reducedMotion,
          bottomInset: card.getBoundingClientRect().height + 12,
          onPhaseChange: setPhase,
          onTurnedChange: setTurned,
          onContextLost: () => {
            status.textContent = t('view.loading');
            window.clearTimeout(restoreTimer);
            restoreTimer = window.setTimeout(fail, RESTORE_WAIT_MS);
          },
          onContextRestored: () => {
            window.clearTimeout(restoreTimer);
            status.textContent = '';
          },
        });
      } catch (error) {
        if (error instanceof module.WebGLUnavailableError) {
          fail();
          return;
        }
        throw error;
      }
      status.textContent = '';
      el.classList.add('is-ready');
      setPhase(scene.phase);
      renderCard();
    } catch (error) {
      console.error(error);
      fail();
    }
  }

  function fail(): void {
    window.clearTimeout(restoreTimer);
    failure = 'webgl';
    status.textContent = '';
    scene?.dispose();
    scene = null;
    el.classList.add('is-failed');
    renderCard();
  }

  renderChrome();
  renderCard();
  void start();

  return {
    el,
    immersive: true,
    title: () => (evaluation ? seatName(evaluation.seat) : t('view.seatNotFound')),
    onLocaleChange: () => {
      renderChrome();
      const toggleHadFocus = document.activeElement?.classList.contains('view-card__toggle');
      renderCard();
      if (toggleHadFocus) card.querySelector<HTMLElement>('.view-card__toggle')?.focus();
      if (status.textContent) status.textContent = t('view.loading');
    },
    destroy() {
      destroyed = true;
      window.clearTimeout(restoreTimer);
      document.removeEventListener('keydown', onKey);
      cardObserver.disconnect();
      switcher.destroy();
      scene?.dispose();
      scene = null;
    },
  };
}
