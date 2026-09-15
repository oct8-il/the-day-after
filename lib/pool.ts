/**
 * Which pool of ledger data this build reads.
 *
 * There are two, and they are symmetric on disk:
 *
 *   data/live/   the real ledger - what staging and prod publish
 *   data/test/   fixtures - what dev renders while the UI is being built
 *
 * Neither is "the default at the root", because the moment one is, every
 * script and test drifts toward it and the other quietly rots.
 *
 * The pool is derived in next.config.mjs alongside the environment and handed
 * here through NEXT_PUBLIC_POOL, exactly as NEXT_PUBLIC_ENV is. Nothing is set
 * in the Vercel dashboard. The rule is: dev reads fixtures unless DATA_POOL
 * says otherwise; staging and prod read the real ledger and MAY NOT read
 * anything else - next.config.mjs refuses to build such a site at all.
 */
export type Pool = 'live' | 'test';

const raw = process.env.NEXT_PUBLIC_POOL;

// Not a default: an unset value means something built this outside
// next.config.mjs, and guessing is how fixtures end up on a real deployment.
if (raw !== 'live' && raw !== 'test') {
  throw new Error(
    `NEXT_PUBLIC_POOL is ${JSON.stringify(raw)}. It is derived in next.config.mjs ` +
    `and must be "live" or "test".`,
  );
}

export const POOL: Pool = raw;
export const IS_TEST_POOL = POOL === 'test';
