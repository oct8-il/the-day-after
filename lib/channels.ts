/**
 * Where the item page sends a reader who wants to be told (DIA-447, §8).
 *
 * Three values, derived once in next.config.mjs and handed in through
 * NEXT_PUBLIC_* exactly as the environment and the pool are - so there is one
 * rule in one place, nothing to set in a dashboard, and no account name or
 * invite link written into the repo.
 *
 * The rule over all of them is **nothing ships dead**: a control that cannot
 * do what it says is not drawn. With no newsletter username slide 5's button
 * is not drawn and the slide ends at the ballot; with no WhatsApp invite that
 * row is not drawn. Instagram has no dependency - the account is public and
 * carries a default.
 */

/** The Buttondown account the mail form posts to. Empty until one exists. */
export const NEWSLETTER = process.env.NEXT_PUBLIC_NEWSLETTER_USERNAME ?? '';

/**
 * The form's action, which is also the whole of the integration.
 *
 * A real form submission into a hidden iframe rather than a fetch: a static
 * export has no key to keep, the embed endpoint takes no key, and a
 * navigation would throw the reader out of Instagram's in-app browser and
 * lose the page they were on. What comes back cannot be read - it is another
 * origin - so the iframe's `load` is the receipt, which is why the mail that
 * follows it is a confirmation rather than a welcome (DIA-435).
 */
export const NEWSLETTER_ACTION = NEWSLETTER
  ? `https://buttondown.com/api/emails/embed-subscribe/${encodeURIComponent(NEWSLETTER)}`
  : '';

/** DIA-446's group. Low priority and droppable: empty is a shipping state. */
export const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP_INVITE_URL ?? '';

export const INSTAGRAM = process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? '';
