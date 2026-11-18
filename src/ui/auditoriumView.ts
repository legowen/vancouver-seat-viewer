import { h } from '../app/dom';
import { routes } from '../app/router';
import type { View } from '../app/view';
import type { TheatreEntry } from '../data/catalog';
import type { Auditorium } from '../data/resolve';
import { computeLayout } from '../geometry/layout';
import { t } from '../i18n';
import {
  auditoriumBadges,
  auditoriumFacts,
  auditoriumNotes,
  backLink,
  theatreName,
} from './common';
import { renderMiniMap } from './miniMap';
import { roomDetails } from './roomDetails';

/** Header shared by the auditorium's own screens: where you are, and what the room looks like. */
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

/** Step 3 starts here: the chosen auditorium. The trailer picker is added to this screen. */
export function createAuditoriumView(theatre: TheatreEntry, auditorium: Auditorium): View {
  const el = h(
    'section',
    { class: 'page' },
    backLink(routes.theatre(theatre.id), theatreName(theatre)),
    h('h1', { class: 'page__title', tabindex: '-1' }, auditorium.name),
    auditoriumHeader(theatre, auditorium),
    auditoriumNotes(auditorium),
    roomDetails(auditorium),
  );
  return { el, title: () => auditorium.name };
}
