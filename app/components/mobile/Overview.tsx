import { Annotated } from '@/app/components/Annotated';
import { citedIds } from '@/lib/annotation';
import { TYPES, type Claim } from '@/lib/data';
import { cardAndSheet, type Parts, type SourceCard } from './Card';

/**
 * Slide 2 - docs/mobile-item.html §5, סקירת הכשל.
 *
 * The failure at the systemic level: had the attack been on 8 October instead
 * of 7, this text would not change, only the manifestation would. The text is
 * `incident.summary` itself rather than a field beside it, so the desktop page
 * and the link preview carry the same sentences.
 *
 * Since DIA-413 the slide is a card that fits the frame and the reading
 * continues in a sheet above the deck. The two carry the same blocks; only the
 * sheet's copy has the drawers. It hands back both, because the sheet is not
 * rendered inside the track - see Card.tsx.
 */

/** §5: the slide's own name. A label on the card, a pill in the sheet's bar. */
const TITLE = 'סקירת הכשל';

export function overviewParts({ summary, claims }: { summary: string; claims: Claim[] }): Parts {
  // In order of first appearance, which is the order the citations are met in.
  // A span resting on two claims therefore lands two adjacent cards.
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

  return cardAndSheet({
    id: 'ov',
    label: TITLE,
    count: cards.length,
    cards,
    chip: <span className="deck-ov-title">{TITLE}</span>,
    card: <Annotated text={summary} claims={claims} chip="glyph" opens="ov" />,
    sheet: <Annotated text={summary} claims={claims} chip="glyph" drawers="ov" />,
  });
}
