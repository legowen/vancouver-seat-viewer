import { h } from '../app/dom';
import { routes } from '../app/router';
import type { View } from '../app/view';
import type { Catalog } from '../data/catalog';
import { t, tPlural } from '../i18n';
import { issueNotice, theatreName } from './common';

/** Step 1: the list of theatres, laid out like a listings board. */
export function createHomeView(catalog: Catalog): View {
  const el = h(
    'section',
    { class: 'page' },
    h('h1', { class: 'page__title', tabindex: '-1' }, t('home.heading')),
    h('p', { class: 'page__intro' }, t('home.intro')),
    catalog.issues.length > 0 ? issueNotice(catalog.issues) : null,
    catalog.theatres.length === 0
      ? h('p', { class: 'empty' }, t('home.empty'))
      : h(
          'ul',
          { class: 'listing' },
          catalog.theatres.map((theatre) =>
            h(
              'li',
              { class: 'listing__item' },
              h(
                'a',
                { class: 'listing__row', href: routes.theatre(theatre.id) },
                h('span', { class: 'listing__name' }, theatreName(theatre)),
                h('span', { class: 'listing__leader', 'aria-hidden': 'true' }),
                h(
                  'span',
                  { class: 'listing__meta' },
                  h('span', { class: 'listing__area' }, theatre.area),
                  h(
                    'span',
                    { class: 'listing__count' },
                    tPlural('home.auditoriums', theatre.auditoriums.length),
                  ),
                ),
              ),
            ),
          ),
        ),
  );

  return { el, title: () => t('home.heading') };
}
