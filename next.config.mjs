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

const environment =
  process.env.NEXT_PUBLIC_ENV ??
  (branch === 'prod' ? 'prod' : branch === 'staging' ? 'staging' : 'dev');

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
  env: { NEXT_PUBLIC_ENV: environment },
};
