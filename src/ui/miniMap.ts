import { s } from '../app/dom';
import type { AuditoriumLayout, SeatPosition } from '../geometry/layout';

export interface MiniMapOptions {
  /** Seat to mark as "you are here". */
  highlightSeatId?: string | null;
  /** Accessible name. Without it the map is treated as decoration. */
  label?: string;
  /** Extra class per seat, e.g. a rating band. */
  seatClass?: (seat: SeatPosition) => string | undefined;
}

const PAD = 0.8;
const SCREEN_BAND = 1.7;

/**
 * A small, non-interactive picture of the seat map: the screen as a bar at the top, one square
 * per seat. Used for the auditorium thumbnails and for the "you are here" map in the seated view.
 */
export function renderMiniMap(
  layout: AuditoriumLayout,
  options: MiniMapOptions = {},
): SVGSVGElement {
  const width = layout.maxCells + PAD * 2;
  const height = layout.rows.length + SCREEN_BAND + PAD;

  const svg = s('svg', {
    class: 'mini-map',
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: 'xMidYMid meet',
  });
  if (options.label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', options.label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }

  // The screen bar is drawn to scale against the seat block, so a wide screen looks wide.
  const screenCells = Math.min(layout.maxCells, layout.screen.width / layout.seatWidth);
  svg.appendChild(
    s('rect', {
      class: 'mini-map__screen',
      x: PAD + (layout.maxCells - screenCells) / 2,
      y: 0.55,
      width: screenCells,
      height: 0.34,
      rx: 0.17,
    }),
  );

  let current: SVGRectElement | null = null;
  for (const seat of layout.seats) {
    const isCurrent = seat.id === options.highlightSeatId;
    const size = isCurrent ? 1.5 : 0.8;
    const centreX = PAD + seat.gridX + layout.maxCells / 2;
    const centreY = SCREEN_BAND + seat.rowIndex + 0.5;
    const classes = ['mini-map__seat'];
    const extra = options.seatClass?.(seat);
    if (extra) classes.push(extra);
    if (isCurrent) classes.push('is-current');
    const rect = s('rect', {
      class: classes.join(' '),
      x: centreX - size / 2,
      y: centreY - size / 2,
      width: size,
      height: size,
      rx: size * 0.28,
    });
    if (isCurrent) current = rect;
    else svg.appendChild(rect);
  }
  // Drawn last so the neighbours cannot cover it.
  if (current) svg.appendChild(current);

  return svg;
}
