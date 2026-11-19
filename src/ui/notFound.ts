import { routeToHash } from '../app/routes';
import type { Screen } from '../app/types';
import { t, type MessageKey } from '../i18n';
import { messagePage } from './common';

/** Shown for unknown routes and for links to theatres, auditoriums or seats that no longer exist. */
export function notFoundScreen(reason: MessageKey = 'error.notFoundBody'): Screen {
  return {
    el: messagePage(t('error.notFoundTitle'), t(reason), {
      href: routeToHash({ name: 'home' }),
      label: t('error.backHome'),
    }),
    title: t('error.notFoundTitle'),
  };
}
