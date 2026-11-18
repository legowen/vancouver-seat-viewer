/**
 * The interactive 2D seat map: the screen at the top, one coloured seat per seat, aisles as gaps.
 * It is an ARIA grid with a roving tab stop: arrow keys move between seats, Home/End jump to the
 * ends of the row, Enter takes the seat. A tap selects the seat under the finger, or the nearest
 * one when the finger lands in a gap, so even small seats on a phone are easy to hit.
 */
import { h } from '../app/dom';
import type { AuditoriumLayout } from '../geometry/layout';
import { nearestSeat, neighbourSeat, type SeatDirection } from '../geometry/navigation';
import { t } from '../i18n';
import { bandLabelKey } from '../metrics/rating';
import type { SeatEvaluation } from '../metrics/seats';

/** What changed the selection. */
export type SelectSource = 'keyboard' | 'pointer' | 'button' | 'program';

export interface SeatMapOptions {
  layout: AuditoriumLayout;
  evaluations: Map<string, SeatEvaluation>;
  selectedId: string;
  /** Id of an element that describes the selected seat (its verdict). */
  describedBy?: string;
  /** The selection changed because of the user. */
  onSelect: (seatId: string, source: SelectSource) => void;
  /** Enter on a seat: take it. */
  onActivate: (seatId: string) => void;
}

export interface SelectOptions {
  focus?: boolean;
  notify?: boolean;
  /** Scroll the seat into view (above a sticky card, thanks to scroll-padding). */
  reveal?: boolean;
  source?: SelectSource;
}

export interface SeatMap {
  el: HTMLElement;
  readonly selectedId: string;
  select(seatId: string, options?: SelectOptions): void;
  move(direction: SeatDirection, options?: SelectOptions): void;
  /** Re-reads the translated labels after a language change. */
  relabel(): void;
}

const KEYS: Record<string, SeatDirection> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Home: 'rowStart',
  End: 'rowEnd',
};

export function createSeatMap(options: SeatMapOptions): SeatMap {
  const { layout, evaluations } = options;
  const cells = layout.maxCells;
  const seatEls = new Map<string, HTMLElement>();
  const rowEls: HTMLElement[] = [];
  let selectedId = options.selectedId;

  const grid = h('div', { class: 'seatmap__grid', role: 'grid' });
  for (const row of layout.rows) {
    const seats = h('div', { class: 'seatmap__seats' });
    for (const seat of row.seats) {
      const band = evaluations.get(seat.id)?.rating.band ?? 'meh';
      const el = h('div', {
        class: `seat seat--${band}`,
        role: 'gridcell',
        tabindex: '-1',
        'aria-selected': 'false',
        dataset: { seat: seat.id },
        style: { '--x': String(seat.gridX + cells / 2 - 0.5) },
      });
      seatEls.set(seat.id, el);
      seats.appendChild(el);
    }
    rowEls.push(seats);
    grid.appendChild(
      h(
        'div',
        { class: 'seatmap__line', role: 'row' },
        h('span', { class: 'seatmap__label', role: 'rowheader' }, row.label),
        seats,
        h('span', { class: 'seatmap__label', 'aria-hidden': 'true' }, row.label),
      ),
    );
  }

  // The screen is drawn to scale against the seat block.
  const screenShare = Math.min(1, layout.screen.width / layout.seatWidth / cells);
  const screenLabel = h('span', { class: 'seatmap__screen-label' });
  const screen = h(
    'div',
    { class: 'seatmap__screen-line', 'aria-hidden': 'true' },
    h('span'),
    h(
      'div',
      { class: 'seatmap__screen-area' },
      h('div', {
        class: 'seatmap__screen',
        style: { width: `${(screenShare * 100).toFixed(2)}%` },
      }),
      screenLabel,
    ),
    h('span'),
  );

  const el = h('div', { class: 'seatmap', style: { '--cells': String(cells) } }, screen, grid);

  function relabel(): void {
    grid.setAttribute('aria-label', t('seatmap.gridLabel'));
    screenLabel.textContent = t('seatmap.screen');
    for (const seat of layout.seats) {
      const band = evaluations.get(seat.id)?.rating.band ?? 'meh';
      seatEls.get(seat.id)?.setAttribute(
        'aria-label',
        t('seatmap.seatAria', {
          row: seat.rowLabel,
          seat: seat.number,
          band: t(bandLabelKey(band)),
        }),
      );
    }
  }

  function select(seatId: string, opts: SelectOptions = {}): void {
    const next = seatEls.get(seatId);
    if (!next) return;
    const previous = seatEls.get(selectedId);
    if (previous && previous !== next) {
      previous.setAttribute('aria-selected', 'false');
      previous.removeAttribute('aria-describedby');
      previous.tabIndex = -1;
    }
    next.setAttribute('aria-selected', 'true');
    if (options.describedBy) next.setAttribute('aria-describedby', options.describedBy);
    next.tabIndex = 0;
    const changed = seatId !== selectedId;
    selectedId = seatId;
    if (opts.focus) next.focus();
    else if (opts.reveal) next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (changed && opts.notify !== false) options.onSelect(seatId, opts.source ?? 'program');
  }

  function move(direction: SeatDirection, opts: SelectOptions = {}): void {
    const target = neighbourSeat(layout, selectedId, direction);
    if (target) select(target.id, { source: 'button', ...opts });
  }

  grid.addEventListener('keydown', (event) => {
    const direction = KEYS[event.key];
    if (direction) {
      event.preventDefault();
      move(direction, { focus: true, source: 'keyboard' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      options.onActivate(selectedId);
    } else if (event.key === ' ') {
      event.preventDefault();
    }
  });

  grid.addEventListener('click', (event) => {
    const target = (event.target as Element).closest<HTMLElement>('.seat');
    if (target?.dataset.seat) {
      select(target.dataset.seat, { source: 'pointer' });
      return;
    }
    // A tap in a gap: convert it to seat-map units (cells across, rows down) and take the
    // nearest seat within reach. Rows can be taller than a cell, so use their real positions.
    let rowIndex = -1;
    let rowDistance = Infinity;
    let rect: DOMRect | null = null;
    rowEls.forEach((rowEl, index) => {
      const box = rowEl.getBoundingClientRect();
      const distance = Math.abs(event.clientY - (box.top + box.height / 2));
      if (distance < rowDistance) {
        rowDistance = distance;
        rowIndex = index;
        rect = box;
      }
    });
    const box = rect as DOMRect | null;
    if (!box || box.width === 0) return;
    const cell = box.width / cells;
    const gridX = (event.clientX - box.left) / cell - cells / 2;
    const row =
      rowIndex + (event.clientY - (box.top + box.height / 2)) / Math.max(cell, box.height);
    const seat = nearestSeat(layout, gridX, row);
    if (seat) select(seat.id, { source: 'pointer' });
  });

  relabel();
  select(selectedId, { notify: false });

  return {
    el,
    get selectedId() {
      return selectedId;
    },
    select,
    move,
    relabel,
  };
}

/** One swatch per band, matching the seat colours. */
export function seatLegend(): HTMLElement {
  const bands = ['prime', 'recommended', 'ok', 'meh', 'avoid'] as const;
  return h(
    'div',
    { class: 'legend' },
    h('h2', { class: 'legend__title' }, t('seatmap.legend')),
    h(
      'ul',
      { class: 'legend__list' },
      bands.map((band) =>
        h(
          'li',
          { class: 'legend__item' },
          h('span', { class: `legend__swatch seat seat--${band}`, 'aria-hidden': 'true' }),
          t(bandLabelKey(band)),
        ),
      ),
    ),
  );
}
