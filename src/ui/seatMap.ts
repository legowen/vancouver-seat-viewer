import { h, s } from '../app/dom';
import { t } from '../i18n';
import type { RatedSeat } from '../metrics';
import type { AuditoriumLayout, SeatPosition } from '../metrics/layout';
import { bandLabel, seatName } from './seatInfo';
import { moveSelection, type SeatMove } from './seatNavigation';

/**
 * Map geometry in "slot units", where one unit is one seat width. Seats sit at the same
 * left-to-right positions as in the 3D model, so short or offset rows look the same in both.
 */
interface MapGeometry {
  width: number;
  height: number;
  centerX(seat: SeatPosition): number;
  centerY(rowIndex: number): number;
  screen: { x: number; width: number };
}

function mapGeometry(
  layout: AuditoriumLayout,
  spacing: { gutter: number; top: number; rowPitch: number; bottom: number },
): MapGeometry {
  const width = layout.maxSlots + spacing.gutter * 2;
  const screenWidth = Math.min(layout.screen.width / layout.dims.seatWidth, width - 0.4);
  return {
    width,
    height: spacing.top + layout.rows.length * spacing.rowPitch + spacing.bottom,
    centerX: (seat) => seat.x / layout.dims.seatWidth + width / 2,
    centerY: (rowIndex) => spacing.top + (rowIndex + 0.5) * spacing.rowPitch,
    screen: { x: (width - screenWidth) / 2, width: screenWidth },
  };
}

const percent = (value: number, total: number): string => `${((value / total) * 100).toFixed(3)}%`;

let idCounter = 0;

export interface SeatMapOptions {
  layout: AuditoriumLayout;
  rated: ReadonlyMap<string, RatedSeat>;
  selected: string;
  /**
   * `keyboard`: arrow keys moved focus to the seat, whose own label is read out.
   * `pointer` and `program` (the nudge buttons): nothing was focused, so announce it.
   */
  onSelect(key: string, source: SelectSource): void;
  /** Enter on the selected seat: sit down. */
  onActivate(key: string): void;
  /** Id of an element that describes the selected seat (the card's verdict). */
  describedBy?: string;
}

export type SelectSource = 'keyboard' | 'pointer' | 'program';

export interface SeatMap {
  el: HTMLElement;
  readonly selected: string;
  select(key: string, options?: { focus?: boolean; source?: SelectSource }): void;
  /** Moves the selection like the arrow keys do, without moving focus. */
  move(direction: SeatMove): void;
  relocalize(): void;
}

const KEY_MOVES: Record<string, SeatMove> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Home: 'home',
  End: 'end',
};

/** The interactive 2D seat map. Every seat is a labelled button; arrow keys move between them. */
export function createSeatMap(options: SeatMapOptions): SeatMap {
  const { layout, rated } = options;
  const SEAT = 0.8;
  const geometry = mapGeometry(layout, { gutter: 1.5, top: 2.4, rowPitch: 1.25, bottom: 0.4 });
  const place = (x: number, y: number, width: number, height: number): string =>
    [
      `left:${percent(x, geometry.width)}`,
      `top:${percent(y, geometry.height)}`,
      `width:${percent(width, geometry.width)}`,
      `height:${percent(height, geometry.height)}`,
    ].join(';');

  const hintId = `seat-map-hint-${++idCounter}`;
  const hint = h('p', { id: hintId, class: 'visually-hidden' });
  const screenLabel = h('span', { class: 'seat-map__screen-label' });
  const field = h('div', {
    class: 'seat-map',
    role: 'group',
    'aria-describedby': hintId,
    style: `--units:${geometry.width};aspect-ratio:${geometry.width} / ${geometry.height}`,
  });

  field.append(
    h(
      'div',
      {
        class: 'seat-map__screen',
        'aria-hidden': 'true',
        style: place(geometry.screen.x, 0.5, geometry.screen.width, 1.4),
      },
      h('span', { class: 'seat-map__screen-bar' }),
      screenLabel,
    ),
  );

  const buttons = new Map<string, HTMLButtonElement>();
  for (const row of layout.rows) {
    const y = geometry.centerY(row.index);
    for (const x of [0.75, geometry.width - 0.75]) {
      field.append(
        h(
          'span',
          {
            class: 'seat-map__row-label',
            'aria-hidden': 'true',
            style: place(x - 0.75, y - 0.5, 1.5, 1),
          },
          row.label,
        ),
      );
    }
    for (const seat of row.slots) {
      if (!seat) continue;
      const button = h('button', {
        type: 'button',
        class: 'seat',
        tabindex: -1,
        'data-key': seat.key,
        'data-band': rated.get(seat.key)?.rating.band,
        'aria-pressed': 'false',
        'aria-describedby': options.describedBy,
        style: place(geometry.centerX(seat) - SEAT / 2, y - SEAT / 2, SEAT, SEAT),
      });
      buttons.set(seat.key, button);
      field.append(button);
    }
  }

  let selected = buttons.has(options.selected) ? options.selected : (layout.seats[0]?.key ?? '');

  const select = (
    key: string,
    selectOptions: { focus?: boolean; source?: SelectSource } = {},
  ): void => {
    const next = buttons.get(key);
    if (!next) return;
    const previous = buttons.get(selected);
    if (previous && previous !== next) {
      previous.setAttribute('aria-pressed', 'false');
      previous.tabIndex = -1;
    }
    next.setAttribute('aria-pressed', 'true');
    next.tabIndex = 0;
    if (key !== selected) {
      selected = key;
      // Update the card first, so its verdict (this seat's description) is current when the
      // seat takes focus and a screen reader reads it.
      options.onSelect(key, selectOptions.source ?? 'program');
    }
    if (selectOptions.focus) next.focus();
    else next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  field.addEventListener('click', (event) => {
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>('.seat') : null;
    if (target?.dataset.key) {
      select(target.dataset.key, { source: 'pointer' });
      return;
    }
    // A tap that misses every seat picks the nearest one, so small seats stay easy to hit.
    const box = field.getBoundingClientRect();
    const ux = ((event.clientX - box.left) / box.width) * geometry.width;
    const uy = ((event.clientY - box.top) / box.height) * geometry.height;
    let nearest: SeatPosition | null = null;
    let best = 1.1;
    for (const seat of layout.seats) {
      const distance = Math.hypot(
        geometry.centerX(seat) - ux,
        geometry.centerY(seat.rowIndex) - uy,
      );
      if (distance < best) {
        best = distance;
        nearest = seat;
      }
    }
    if (nearest) select(nearest.key, { focus: true, source: 'pointer' });
  });

  field.addEventListener('keydown', (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const key = target?.dataset.key;
    if (!key) return;
    const move = KEY_MOVES[event.key];
    if (move) {
      event.preventDefault();
      select(moveSelection(layout, key, move), { focus: true, source: 'keyboard' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (key === selected) options.onActivate(key);
      else select(key, { source: 'keyboard' });
    }
  });

  const relocalize = (): void => {
    field.setAttribute('aria-label', t('seats.mapLabel'));
    hint.textContent = t('seats.hint');
    screenLabel.textContent = t('seats.screen');
    for (const [key, button] of buttons) {
      const entry = rated.get(key);
      if (!entry) continue;
      button.setAttribute(
        'aria-label',
        t('seats.seatLabel', { seat: seatName(entry.seat), band: bandLabel(entry.rating.band) }),
      );
    }
  };
  relocalize();
  // Mark the initial seat without reporting it as a change.
  const initial = buttons.get(selected);
  if (initial) {
    initial.setAttribute('aria-pressed', 'true');
    initial.tabIndex = 0;
  }

  return {
    el: h('div', { class: 'seat-map-wrap' }, hint, field),
    get selected() {
      return selected;
    },
    select,
    move: (direction) => select(moveSelection(layout, selected, direction)),
    relocalize,
  };
}

/** A small, non-interactive picture of the seat map, coloured by rating band. */
export function seatMapThumbnail(
  layout: AuditoriumLayout,
  rated: ReadonlyMap<string, RatedSeat>,
  options: { label: string; highlight?: string | null; className?: string },
): SVGSVGElement {
  const geometry = mapGeometry(layout, { gutter: 0.6, top: 1.7, rowPitch: 1.2, bottom: 0.4 });
  const svg = s('svg', {
    class: ['seat-thumb', options.className].filter(Boolean).join(' '),
    viewBox: `0 0 ${geometry.width} ${geometry.height}`,
    role: 'img',
    'aria-label': options.label,
    focusable: 'false',
  });
  svg.append(
    s('rect', {
      class: 'seat-thumb__screen',
      x: geometry.screen.x,
      y: 0.5,
      width: geometry.screen.width,
      height: 0.35,
      rx: 0.17,
    }),
  );
  let current: SVGElement | null = null;
  for (const seat of layout.seats) {
    const cx = geometry.centerX(seat);
    const cy = geometry.centerY(seat.rowIndex);
    const rect = s('rect', {
      class: 'seat-thumb__seat',
      x: cx - 0.4,
      y: cy - 0.4,
      width: 0.8,
      height: 0.8,
      rx: 0.2,
      'data-band': rated.get(seat.key)?.rating.band,
    });
    svg.append(rect);
    if (seat.key === options.highlight) {
      current = s('circle', { class: 'seat-thumb__current', cx, cy, r: 1.05 });
    }
  }
  if (current) svg.append(current);
  return svg;
}
