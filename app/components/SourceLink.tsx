import type { Claim } from '@/lib/data';

/**
 * A claim's link to its source. Published claims always have one - the
 * validator refuses them otherwise - so the "no link" branch is only ever seen
 * on dev, where unsourced incidents are still rendered to check layouts.
 */
export function SourceLink({ claim }: { claim: Claim }) {
  if (!claim.url) return <span className="nolink">טרם קושר מקור</span>;
  return (
    <>
      <a href={claim.url} target="_blank" rel="noopener noreferrer nofollow">
        קישור למקור
      </a>
      {claim.archive_url && (
        <>
          {' · '}
          <a href={claim.archive_url} target="_blank" rel="noopener noreferrer nofollow">
            ארכיון
          </a>
        </>
      )}
    </>
  );
}
