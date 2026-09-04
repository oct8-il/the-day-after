import { ENV } from './env';

/**
 * Where this build believes it lives. Share cards, canonical links and the
 * sitemap all need absolute URLs, and they have to point at the environment
 * that produced them - a staging build must never advertise prod's URLs, or a
 * link shared from staging quietly becomes a link to a page that is not there.
 */
export const SITE_URL = {
  prod: 'https://oct8.co.il',
  staging: 'https://staging.oct8.co.il',
  dev: 'https://dev.oct8.co.il',
}[ENV];

export const SITE_NAME = 'היום שאחרי';
