import { h } from '../app/dom';
import type { Band } from '../config/rating';
import type { RatedSeat } from '../metrics';
import type { SeatPosition } from '../metrics/layout';
import { fmt, t } from '../i18n';

/** "Row K, Seat 23" in the current language. */
export function seatName(seat: Pick<SeatPosition, 'row' | 'number'>): string {
  return t('seat.name', { row: seat.row, seat: seat.number });
}

export function bandLabel(band: Band): string {
  return t(`band.${band}`);
}

/** A coloured label for a rating band. */
export function bandPill(band: Band): HTMLElement {
  return h('span', { class: 'band-pill', 'data-band': band }, bandLabel(band));
}

/** "Distance 21.8 m · Viewing angle 76°" */
export function seatStats(rated: RatedSeat): string {
  return [
    t('seat.distance', { value: fmt.meters(rated.metrics.distance) }),
    t('seat.viewingAngle', { value: fmt.degrees(rated.metrics.viewingAngle) }),
  ].join(' · ');
}

export function verdictText(rated: RatedSeat): string {
  return t(rated.rating.verdict);
}
