'use client';

import { useEffect, useRef, useState } from 'react';
import {
  NEWSLETTER_ACTION, NEWSLETTER_EMAIL_FIELD, NEWSLETTER_PAGE_FIELD, NEWSLETTER_HIDDEN,
  WHATSAPP, INSTAGRAM,
} from '@/lib/channels';

/**
 * The updates sheet - docs/mobile-item.html §8, behind slide 5's button
 * (DIA-447, design DIA-435).
 *
 * The sealed ballot promises that the answer opens later. This is the one
 * control on the item page that completes the promise, and it is the reader
 * asking the project to keep its word rather than doing it a favour - which
 * is why the button says `עדכנו אותי כשהמענה ייפתח` and not "subscribe".
 *
 * It is §7's submission sheet again, down to the class names: the same bar
 * with a neutral pill and an ×, the same body in the reading type, the same
 * exits (DIA-427), and the same one piece of state - where it was opened
 * from, which it uses once, for the way back. The deck opens and closes it
 * exactly as it opens a reading, so nothing here touches history, focus or
 * `inert`.
 *
 * Three channels, and what makes them one screen is that each says what it
 * will and will not do: a confirmation mail and no advertising; a group only
 * we write in; a post when the answer opens. Nothing here asks for a name.
 */

const OUT = 'M7 17L17 7M9 7h8v8';

/** A speech bubble with a handset in it - not the brand's glyph. */
const WA = [
  'M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z',
  'M9.5 8.5c.2-.5.5-.5.8-.5h.5c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c.4.9 1.3 1.8 2.3 2.3l.6-.5c.2-.1.4-.2.6-.1l1.6.7c.3.1.4.3.4.5v.6c0 .3-.1.6-.5.8-.6.4-1.4.5-2.2.2a8 8 0 0 1-4.6-4.6c-.3-.8-.2-1.6.2-2.2z',
];

/**
 * How long a submission into the iframe is given before it is called a
 * failure.
 *
 * Nothing can be read back from another origin, so there is no error to wait
 * for - only a load that does not come. Eight seconds is long enough that a
 * slow network is not called a failure and short enough that a reader is not
 * left looking at `שולח…`.
 */
const WAIT = 8000;

/** What the field has to look like before the form is allowed to leave. */
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Row = { href: string; name: string; say: string; icon: string[]; ltr?: boolean };

export function Updates() {
  const el = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mail, setMail] = useState('');
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);
  const [name, setName] = useState('');
  /**
   * The page the reader was on, carried with the address.
   *
   * React state rather than a value written onto the node: an uncontrolled
   * input is restored to what was last rendered into it whenever the
   * component re-renders, and this sheet re-renders on the very tick it is
   * opened. The field went out empty for exactly that reason.
   */
  const [here, setHere] = useState('');

  const stop = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => stop, []);

  /**
   * Every opening is a first visit. The sheet is one element reused by the
   * whole deck, and a reader who signed up last time is not looking at their
   * own receipt now.
   *
   * Where they came from is read off this element rather than passed in: the
   * opener is inside the track and this sheet is not, so the deck is the only
   * thing that sees both and it writes the name at the moment of opening.
   */
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const watch = new MutationObserver(() => {
      if (node.hasAttribute('hidden')) return;
      setName(node.getAttribute('data-from-name') ?? '');
      // The page's link, with its hash, travels with the address - so a mail
      // that goes out later can say which failure the reader was reading.
      setHere(node.getAttribute('data-from-href') ?? location.href);
      setMail('');
      setBad(false);
      setBusy(false);
      setFailed(false);
      setSent(false);
      stop();
    });
    watch.observe(node, { attributes: true, attributeFilter: ['hidden'] });
    return () => watch.disconnect();
  }, []);

  /**
   * A sideways swipe closes a sheet (DIA-427). On a sheet with a field in it
   * that would throw away what was typed, so the deck is told to leave the
   * axis alone until there is nothing left to lose.
   */
  useEffect(() => {
    el.current?.toggleAttribute('data-form', !sent);
  }, [sent]);

  /**
   * The submission is the browser's, not ours.
   *
   * `submit` runs, and unless it is prevented the form posts itself into the
   * hidden frame below. So the check happens here and the send does not: what
   * this handler does when the address is good is start a clock and get out
   * of the way.
   */
  const send = (e: React.FormEvent<HTMLFormElement>) => {
    if (!ADDRESS.test(mail.trim())) {
      e.preventDefault();
      setBad(true);
      field.current?.focus();
      return;
    }
    setBad(false);
    // Nothing can be read back from another origin, so a frame that loads is
    // the only receipt there is - and a frame that loads the browser's own
    // "no connection" page loads. A reader who is plainly offline would be
    // told their address went somewhere it did not, so the one case that can
    // be known is answered before the form leaves.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      e.preventDefault();
      setFailed(true);
      return;
    }
    setFailed(false);
    setBusy(true);
    stop();
    timer.current = setTimeout(() => { setBusy(false); setFailed(true); }, WAIT);
  };

  /**
   * The frame has loaded something. It is another origin, so what it loaded
   * cannot be read - and a frame fires this for its own empty document too.
   * A load while a submission is in flight is therefore the whole receipt,
   * and a load at any other time is not one.
   */
  const landed = () => {
    if (!busy) return;
    stop();
    setBusy(false);
    setSent(true);
  };

  const rows: Row[] = [
    ...(WHATSAPP ? [{
      href: WHATSAPP,
      name: 'קבוצת עדכונים בוואטסאפ',
      say: 'שקטה. רק אנחנו כותבים, רק כשיש מה.',
      icon: WA,
    }] : []),
    ...(INSTAGRAM ? [{
      href: INSTAGRAM,
      name: '@oct8.co.il',
      say: 'נפרסם שם כשהמענה ייפתח.',
      icon: [],
      ltr: true,
    }] : []),
  ];

  return (
    <div
      className="deck-sheet deck-send deck-nl"
      ref={el}
      id="sheet-nl"
      hidden
      role="dialog"
      aria-modal="true"
      aria-labelledby="sheet-nl-t"
    >
      <div className="deck-sheet-bar">
        <button type="button" className="deck-sheet-x" aria-label="סגירה">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className="deck-sheet-chip" id="sheet-nl-t">
          <span className="deck-send-pill">עדכונים</span>
        </div>
      </div>

      <div className="deck-sheet-scroll">
        <div className="deck-sheet-body">
          {!sent && (
            <div className="deck-read deck-nl-in">
              <p className="deck-send-lead">כשהמענה ייפתח — נכתוב. עד אז, שקט.</p>

              <form
                className="deck-nl-form"
                ref={form}
                onSubmit={send}
                action={NEWSLETTER_ACTION}
                method="post"
                target="deck-nl-sink"
                noValidate
              >
                <label className="deck-send-field">
                  <span>מייל</span>
                  <input
                    ref={field}
                    type="email"
                    name={NEWSLETTER_EMAIL_FIELD}
                    dir="ltr"
                    inputMode="email"
                    autoComplete="email"
                    value={mail}
                    aria-invalid={bad || undefined}
                    aria-describedby={bad ? 'deck-nl-err' : undefined}
                    onChange={(e) => { setMail(e.target.value); setBad(false); }}
                  />
                </label>
                {bad && <p className="deck-send-say" id="deck-nl-err" role="alert">צריך כתובת מייל.</p>}
                {/* Whatever else this endpoint wants, and the page the reader
                    was on where it has somewhere to put it. Neither is
                    anything the reader types, and neither is this page's
                    opinion: which provider these belong to is DIA-435's, and
                    they arrive as configuration (lib/channels.ts). */}
                {NEWSLETTER_HIDDEN.map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} readOnly />
                ))}
                {NEWSLETTER_PAGE_FIELD
                  ? <input type="hidden" name={NEWSLETTER_PAGE_FIELD} value={here} readOnly />
                  : null}
                {failed && (
                  <p className="deck-nl-fail" role="alert">לא נשלח — אין חיבור כרגע. נסו שוב.</p>
                )}
                <button type="submit" className="deck-send-do" disabled={busy}>
                  {busy ? 'שולח…' : 'עדכנו אותי'}
                </button>
                <p className="deck-nl-fine">תגיע הודעת אישור למייל. בלי פרסומות, ואפשר לבטל בכל רגע.</p>
              </form>

              {rows.length > 0 && (
                <div className="deck-nl-alt">
                  <p className="deck-nl-or"><span>או</span></p>
                  {rows.map((r) => (
                    <a
                      key={r.href}
                      className="deck-nl-row"
                      href={r.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <svg className="deck-nl-ic" viewBox="0 0 24 24" aria-hidden="true">
                        {r.icon.length
                          ? r.icon.map((d) => <path key={d} d={d} />)
                          : (
                            <>
                              <rect x="3" y="3" width="18" height="18" rx="5" />
                              <circle cx="12" cy="12" r="4" />
                              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                            </>
                          )}
                      </svg>
                      <span className="deck-nl-tx">
                        {/* A handle is a latin run inside a Hebrew line, and
                            `bdi` isolates it without moving it: `dir="ltr"`
                            would push it to the wrong end of its own row. */}
                        <b>{r.ltr ? <bdi>{r.name}</bdi> : r.name}</b>
                        <small>{r.say}</small>
                      </span>
                      <svg className="deck-send-out deck-nl-go" viewBox="0 0 24 24" aria-hidden="true">
                        <path d={OUT} />
                      </svg>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {sent && (
            <div className="deck-read deck-send-done">
              <span className="deck-send-tick" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
              </span>
              <p className="deck-send-lead">כמעט. בדקו את המייל.</p>
              <p>שלחנו הודעת אישור — לחיצה אחת, ואתם ברשימה.</p>
              {/* The only place the sheet names where the reader came from. */}
              <button
                type="button"
                className="deck-send-go"
                onClick={() => el.current?.querySelector<HTMLElement>('.deck-sheet-x')?.click()}
              >
                {name ? `חזרה ל״${name}״` : 'חזרה לקריאה'}
                <i dir="ltr" aria-hidden="true">←</i>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Where the submission goes. Not `hidden`: a frame that is not rendered
          is not a reliable target, and this one has to load for the receipt to
          arrive. It is taken out of the layout and out of the reading order
          instead. */}
      <iframe
        className="deck-nl-sink"
        name="deck-nl-sink"
        title=""
        aria-hidden="true"
        tabIndex={-1}
        onLoad={landed}
      />
    </div>
  );
}
