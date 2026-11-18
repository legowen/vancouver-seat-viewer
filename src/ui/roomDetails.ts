import { h } from '../app/dom';
import type { DimensionDefaults } from '../config/defaults';
import type { Auditorium } from '../data/resolve';
import { formatMeters, formatNumber, t, type MessageKey } from '../i18n';
import { chevron } from './common';

const ROWS: { key: keyof DimensionDefaults; label: MessageKey; ratio?: boolean }[] = [
  { key: 'screenWidth_m', label: 'editor.screenWidth' },
  { key: 'screenAspect', label: 'editor.aspect', ratio: true },
  { key: 'screenBottomHeight_m', label: 'editor.bottomHeight' },
  { key: 'firstRowDistance_m', label: 'editor.firstRow' },
  { key: 'rowSpacing_m', label: 'editor.rowSpacing' },
  { key: 'rowRise_m', label: 'editor.rowRise' },
  { key: 'seatWidth_m', label: 'editor.seatWidth' },
  { key: 'eyeHeight_m', label: 'editor.eyeHeight' },
];

function valueOf(auditorium: Auditorium, key: keyof DimensionDefaults): number {
  switch (key) {
    case 'screenWidth_m':
      return auditorium.screen.width_m;
    case 'screenAspect':
      return auditorium.screen.aspect;
    case 'screenBottomHeight_m':
      return auditorium.screen.bottomHeight_m;
    default:
      return auditorium[key];
  }
}

/**
 * A collapsed list of the dimensions the app is using for this room, with the ones that came
 * from defaults marked. It is what the "Estimated dimensions" badge refers to.
 */
export function roomDetails(auditorium: Auditorium): HTMLElement {
  return h(
    'details',
    { class: 'room-details' },
    h(
      'summary',
      { class: 'room-details__summary' },
      h('span', null, t('editor.dimensions')),
      chevron('right'),
    ),
    auditorium.verified ? null : h('p', { class: 'room-details__note' }, t('badge.estimatedHint')),
    h(
      'dl',
      { class: 'room-details__list' },
      ROWS.map(({ key, label, ratio }) => {
        const value = valueOf(auditorium, key);
        const isDefault = auditorium.defaulted.includes(key);
        return h(
          'div',
          { class: 'room-details__row' },
          h('dt', null, t(label)),
          h(
            'dd',
            null,
            ratio ? `${formatNumber(value, 2)}:1` : formatMeters(value, undefined, 2),
            isDefault ? h('span', { class: 'room-details__default' }, t('editor.default')) : null,
          ),
        );
      }),
    ),
  );
}
