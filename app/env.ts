// Which of the three branch environments this build is. Derived from the git
// branch in next.config.mjs, so nothing needs setting in Vercel: prod is the
// only environment without a ribbon, and the only one search engines index.
export type Env = 'dev' | 'staging' | 'prod';
export const ENV: Env = (process.env.NEXT_PUBLIC_ENV as Env) || 'dev';
export const IS_PROD = ENV === 'prod';
