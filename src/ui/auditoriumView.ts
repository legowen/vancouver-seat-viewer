import { h } from '../app/dom';
import type { TheatreEntry } from '../data/catalog';
import type { Auditorium } from '../data/resolve';
import { computeLayout } from '../geometry/layout';
import { t } from '../i18n';
import { auditoriumBadges, auditoriumFacts, theatreName } from './common';
import { renderMiniMap } from './miniMap';

/** Header of the auditorium's own screens: where you are, and what the room looks like. */
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
