import { h } from '../app/dom';
import { routeToHash } from '../app/routes';
import type { AppContext, Screen } from '../app/types';
import { fmt, t } from '../i18n';
import { dataErrorPanel, theatreArea, theatreName } from './common';

/** Step 1: the list of theatres. */
export function homeScreen(context: AppContext): Screen {
  const { theatres, errors } = context.data;

  const list =
    theatres.length === 0
      ? h('p', { class: 'empty' }, t('home.empty'))
      : h(
          'ul',
          { class: 'card-list' },
          theatres.map(({ theatre, auditoriums }) =>
            h(
              'li',
              null,
              h(
                'a',
                {
                  class: 'card card--link',
                  href: routeToHash({ name: 'theatre', theatreId: theatre.id }),
                },
                h(
                  'span',
                  { class: 'card__body' },
                  h('span', { class: 'card__title' }, theatreName(theatre)),
                  h(
                    'span',
                    { class: 'card__meta' },
                    theatreArea(theatre),
                    ' · ',
                    t('home.auditoriums', { count: fmt.count(auditoriums.length) }),
                  ),
                ),
                h('span', { class: 'card__chevron', 'aria-hidden': 'true' }, '›'),
              ),
            ),
          ),
        );

  const el = h(
    'div',
    { class: 'page' },
    h(
      'header',
      { class: 'page__header' },
      h('p', { class: 'eyebrow' }, t('app.tagline')),
      h('h1', { class: 'page__title' }, t('home.heading')),
      h('p', { class: 'lead' }, t('home.intro')),
    ),
    dataErrorPanel(errors),
    list,
  );

  return { el, title: t('home.heading') };
}
