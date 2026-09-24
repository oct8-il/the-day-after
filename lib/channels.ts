/**
 * Where the item page sends a reader who wants to be told (DIA-447, §8).
 *
 * Derived once in next.config.mjs and handed in through NEXT_PUBLIC_* exactly
 * as the environment and the pool are - so there is one rule in one place,
 * nothing to set in a dashboard, and no account name or invite link written
 * into the repo.
 *
 * **No provider is chosen here.** Which mail list the form posts to is
 * DIA-435's decision and it has not been made; what this file knows is that a
 * mail list takes a POST with an address in it. So the endpoint is a whole URL
 * and the field names are values, not code: Buttondown, Kit, Mailchimp and a
 * plain form service each want a different spelling of the same three things,
 * and every one of them is reachable from here without a commit.
 *
 * The rule over all of it is **nothing ships dead**: a control that cannot do
 * what it says is not drawn. With no endpoint neither slide 5's pill nor the
 * sheet behind it exists and the slide ends at the ballot; with no WhatsApp
 * invite that row is not drawn. Instagram has no dependency.
 */

/**
 * The form's action: the whole URL, because that is the whole integration.
 *
 * A real form submission into a hidden iframe rather than a fetch - a static
 * export has no key to keep, a form endpoint wants none, and a navigation
 * would throw the reader out of Instagram's in-app browser and lose the page
 * they were on. What comes back cannot be read, because it is another origin,
 * so the iframe's `load` is the receipt - which is why the mail that follows
 * it has to be a confirmation rather than a welcome (DIA-435).
 */
export const NEWSLETTER_ACTION = process.env.NEXT_PUBLIC_NEWSLETTER_ACTION ?? '';

/** What the endpoint calls the address. `email` on most of them, not all. */
export const NEWSLETTER_EMAIL_FIELD = process.env.NEXT_PUBLIC_NEWSLETTER_EMAIL_FIELD || 'email';

/**
 * What the endpoint calls the page the reader was on, so a mail sent later
 * can say which failure it is about. Empty means the endpoint has nowhere to
 * put it, and it is not sent - the sign-up still works.
 */
export const NEWSLETTER_PAGE_FIELD = process.env.NEXT_PUBLIC_NEWSLETTER_PAGE_FIELD ?? '';

/**
 * Whatever else that endpoint needs, as a query string - `embed=1` for one of
 * them, a list id or a bot-trap for another. Parsed rather than interpreted:
 * they are hidden fields and this page has no opinion about them.
 */
export const NEWSLETTER_HIDDEN: [string, string][] = [
  ...new URLSearchParams(process.env.NEXT_PUBLIC_NEWSLETTER_HIDDEN ?? ''),
];

/** DIA-446's group. Low priority and droppable: empty is a shipping state. */
export const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP_INVITE_URL ?? '';

export const INSTAGRAM = process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? '';
