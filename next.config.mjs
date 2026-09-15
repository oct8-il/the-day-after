/**
 * Which environment a build is comes from the branch it was built from, not
 * from a setting someone has to remember. Vercel puts the branch name in
 * VERCEL_GIT_COMMIT_REF on every build; GitHub Actions passes it in too. So
 * there is nothing to configure in the Vercel dashboard, and nothing that can
 * drift out of sync with the branch model.
 *
 * NEXT_PUBLIC_ENV still wins if it is set, so a local build or a one-off can
 * pretend to be any of the three.
 */
const branch =
  process.env.VERCEL_GIT_COMMIT_REF ??
  process.env.GITHUB_REF_NAME ??
  '';

/**
 * A build that cannot name its branch cannot know which environment it is, and
 * the line below would quietly call it dev - which on dev means the fixture
 * pool. On a laptop that is the right default; in a hosted build it would mean
 * a deployment serving invented records under a real URL, which is the one
 * failure this project cannot recover from. So hosted builds refuse.
 *
 * VERCEL is set by Vercel, CI by GitHub Actions. If this ever fires on Vercel,
 * the cause is "Enable access to System Environment Variables" being off in
 * Project Settings - VERCEL_GIT_COMMIT_REF is what carries the branch name.
 */
if (!process.env.NEXT_PUBLIC_ENV && !branch && (process.env.VERCEL || process.env.CI)) {
  throw new Error(
    'Hosted build with no branch name: neither VERCEL_GIT_COMMIT_REF nor GITHUB_REF_NAME is set, ' +
    'so this build cannot tell which environment it is. Refusing to guess.',
  );
}

const environment =
  process.env.NEXT_PUBLIC_ENV ??
  (branch === 'prod' ? 'prod' : branch === 'staging' ? 'staging' : 'dev');

/**
 * Which pool of ledger data the build reads: data/live (the real ledger) or
 * data/test (fixtures). Derived here so there is one rule in one place, and
 * handed to the app through NEXT_PUBLIC_POOL the same way the environment is.
 *
 * dev reads fixtures, because dev is where the UI is built and the real 33
 * incidents happen not to contain half the states a page has to survive.
 * DATA_POOL=live switches it back for the per-incident authoring loop.
 *
 * staging and prod read the real ledger and nothing else. This is not a
 * default that can be overridden - it is a refusal. A deployment that shows
 * invented records is the one failure this project cannot recover from.
 */
const pool = process.env.DATA_POOL ?? (environment === 'dev' ? 'test' : 'live');

if (pool !== 'live' && pool !== 'test') {
  throw new Error(`DATA_POOL is ${JSON.stringify(process.env.DATA_POOL)}; expected "live" or "test".`);
}
if (pool === 'test' && environment !== 'dev') {
  throw new Error(
    `Refusing to build ${environment} from the test pool. Fixtures are not publishable data.`,
  );
}

/**
 * `next dev` serves /_next/ only to the origin it was opened from, so a phone
 * on the same wi-fi loading http://<laptop-ip>:3000 gets the HTML and none of
 * the JavaScript - the page renders and nothing on it reacts. Every private
 * range is allowed here because the whole point is to open the dev server on
 * the device the design is for. Development only; the production build is a
 * static export and never reads this.
 */
const devOrigins = [
  ...(process.env.DEV_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
  '10.*.*.*',
  '172.16.*.*', '172.17.*.*', '172.18.*.*', '172.19.*.*', '172.2*.*.*', '172.30.*.*', '172.31.*.*',
  '192.168.*.*',
  '*.local',
];

/** @type {import('next').NextConfig} */
export default {
  output: 'export',          // static site; no server at launch
  trailingSlash: true,       // /item/i13/ → item/i13/index.html on any static host
  images: { unoptimized: true },
  reactStrictMode: true,
  allowedDevOrigins: devOrigins,
  env: { NEXT_PUBLIC_ENV: environment, NEXT_PUBLIC_POOL: pool },
};
