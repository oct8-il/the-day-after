// Which of the three branch environments this build is. Set per-branch in
// Vercel; anything that is not 'prod' shows a ribbon and is noindex.
export type Env = 'dev' | 'staging' | 'prod';
export const ENV: Env = (process.env.NEXT_PUBLIC_ENV as Env) || 'dev';
export const IS_PROD = ENV === 'prod';
