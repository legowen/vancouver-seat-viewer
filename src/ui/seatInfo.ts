/** The seat's rating, verdict and numbers: shared by the seat map card and the seated view. */
import { h } from '../app/dom';
import { formatDegrees, formatMeters, t } from '../i18n';
import { bandLabelKey, verdictKey } from '../metrics/rating';
import type { SeatEvaluation } from '../metrics/seats';
import type { SeatPosition } from '../geometry/layout';

export function seatName(seat: SeatPosition): string {
  return t('seat.name', { row: seat.rowLabel, seat: seat.number });
}

export function bandChip(evaluation: SeatEvaluation): HTMLElement {
  const { band } = evaluation.rating;
  return h('span', { class: `band-chip band-chip--${band}` }, t(bandLabelKey(band)));
}

export function verdictText(evaluation: SeatEvaluation): string {
  return t(verdictKey(evaluation.rating));
}

/** "Distance 21.8 m · Viewing angle 76°" */
export function metricSummary(evaluation: SeatEvaluation): string {
  return t('metric.summary', {
    distance: formatMeters(evaluation.metrics.distance_m),
    angle: formatDegrees(evaluation.metrics.viewingAngle_deg),
  });
}

/** All four numbers as a definition list, for the seat map card. */
export function metricList(evaluation: SeatEvaluation): HTMLElement {
  const { metrics } = evaluation;
  const item = (label: string, value: string) =>
    h('div', { class: 'metric' }, h('dt', null, label), h('dd', null, value));
  return h(
    'dl',
    { class: 'metrics' },
    item(t('metric.distance'), formatMeters(metrics.distance_m)),
    item(t('metric.viewingAngle'), formatDegrees(metrics.viewingAngle_deg)),
    item(t('metric.offAxis'), formatDegrees(metrics.offAxis_deg)),
    item(t('metric.vertical'), formatDegrees(metrics.verticalAngle_deg)),
  );
}
