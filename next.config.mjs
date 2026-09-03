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

/** @type {import('next').NextConfig} */
export default {
  output: 'export',          // static site; no server at launch
  trailingSlash: true,       // /item/i13/ → item/i13/index.html on any static host
  images: { unoptimized: true },
  reactStrictMode: true,
  env: { NEXT_PUBLIC_ENV: environment },
};
