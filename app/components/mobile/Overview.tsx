import { Annotated } from '@/app/components/Annotated';
import { citedIds } from '@/lib/annotation';
import { TYPES, type Claim } from '@/lib/data';
import { OverviewShell, type SourceCard } from './OverviewShell';

/**
 * Slide 2 - docs/mobile-item.html §5, סקירת הכשל.
 *
 * The failure at the systemic level: had the attack been on 8 October instead
 * of 7, this text would not change, only the manifestation would. The text is
 * `incident.summary` itself rather than a field beside it, so the desktop page
 * and the link preview carry the same sentences.
 *
 * This half runs on the server because Annotated reads the taxonomy, which is
 * read off disk. The carousel's cards are reduced to plain data here and the
 * interaction lives in OverviewShell.
 */

/** §5: the slide title, and the only slide that wears it in a chip. */
const TITLE = 'סקירת הכשל';

export function Overview({ summary, claims }: { summary: string; claims: Claim[] }) {
  // In order of first appearance, which is the order the chips are met in. A
  // span resting on two claims therefore lands two adjacent cards.
  const cards: SourceCard[] = citedIds(summary)
    .map((id) => claims.find((c) => c.id === id))
    .filter((c): c is Claim => !!c && !!c.quote)
    .map((c) => ({
      id: c.id,
      type: TYPES[c.source_type].he,
      color: TYPES[c.source_type].color,
      outlet: c.source,
      quote: c.quote!,
      date: c.date,
      url: c.url,
    }));

  return (
    <OverviewShell title={TITLE} cards={cards}>
      <Annotated text={summary} claims={claims} chip="named" />
    </OverviewShell>
  );
}
