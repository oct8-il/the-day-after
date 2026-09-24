import type { Metadata } from 'next';
import { ENV, IS_PROD, IS_HELD, LAUNCHED } from './env';
import { POOL } from '@/lib/pool';
import { SITE_NAME, SITE_URL } from './site';
import './globals.css';

/* ------------------------------------------------------------------ type
 * The two faces, served from this origin (DIA-433).
 *
 * They used to come from fonts.googleapis.com, which made the site's own
 * typography a third-party request: whether it answered decided how the
 * Hebrew was measured, and three tests spent weeks asserting the layout of
 * the fallback face because the machine they were verified on could not
 * reach it. A page about what the state failed to do should not depend on
 * Google answering, either - and self-hosting takes the render-blocking
 * request and the swap out with it.
 *
 * Imported one subset and weight at a time rather than by package: this is
 * the whole of what the design uses (§2's type table), and the package's own
 * entry point would ship every weight from 200 to 800 in five alphabets.
 *
 * Both faces are SIL OFL, which is what makes serving them from here legal
 * as well as sensible.
 */
import '@fontsource/assistant/hebrew-300.css';
import '@fontsource/assistant/hebrew-400.css';
import '@fontsource/assistant/hebrew-600.css';
import '@fontsource/assistant/hebrew-700.css';
import '@fontsource/assistant/latin-300.css';
import '@fontsource/assistant/latin-400.css';
import '@fontsource/assistant/latin-600.css';
import '@fontsource/assistant/latin-700.css';
import '@fontsource/frank-ruhl-libre/hebrew-400.css';
import '@fontsource/frank-ruhl-libre/hebrew-500.css';
import '@fontsource/frank-ruhl-libre/hebrew-700.css';
import '@fontsource/frank-ruhl-libre/latin-400.css';
import '@fontsource/frank-ruhl-libre/latin-500.css';
import '@fontsource/frank-ruhl-libre/latin-700.css';

const DESCRIPTION =
  'מעקב אחר הכשלים של השבעה באוקטובר ואחר תיקונם — מקורות מתועדים, שלב אחר שלב.';

export const metadata: Metadata = {
  // Every relative URL below - and every share image - resolves against this.
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  // The favicon self-themes (see brand/logo.html); the .ico fallback and the
  // touch icon are the fixed-ink versions, since old browsers and iOS both
  // ignore prefers-color-scheme for these.
  icons: {
    icon: [
      { url: '/brand/favicon.svg', type: 'image/svg+xml' },
      { url: '/brand/favicon.ico', sizes: '16x16 32x32 48x48' },
    ],
    apple: '/brand/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DESCRIPTION,
    url: '/',
    images: [{ url: '/brand/og-image.png', width: 1200, height: 630 }],
  },
  robots: IS_PROD && LAUNCHED ? undefined : { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      {/* Nothing stands in the head. There was a first-visit gate here - a
          blocking script that sent a bare "/" to the about page - and it is
          retired (DIA-441). It never worked as "first visit": a hard load of
          "/" was redirected before the component that recorded the visit
          could run, so the bounce repeated for every reader who did not
          happen to follow a link, including the main one, who arrives from a
          post to an item and taps the breadcrumb root. DIA-442 is what it
          should do when it comes back, and it does not need a component. */}
      <body>
        {!IS_PROD && <div className="env-ribbon">{`${ENV} · ${POOL}`}</div>}
        {IS_HELD ? <Holding /> : children}
      </body>
    </html>
  );
}

/* Shown on every route of a prod build until LAUNCHED is true. Deliberately
   says nothing about the content: the name, the date, and no way in. */
function Holding() {
  return (
    <main className="holding">
      <p className="holding-name">{SITE_NAME}</p>
      <p className="holding-date">7 באוקטובר 2026</p>
    </main>
  );
}
