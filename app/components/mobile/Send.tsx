'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The submission sheet - docs/mobile-item.html §7, "Where הגישו מקור leads"
 * (DIA-421, DIA-439).
 *
 * One sheet for the whole deck rather than one per slide: what it offers is
 * the same everywhere, and a reader who has met it once should meet the same
 * thing again. It is §5's reading-sheet build - the same bar, the same ×, the
 * same exits (DIA-427) - and the deck opens and closes it exactly as it opens
 * a reading, which is why nothing here touches history, focus or `inert`.
 *
 * **Nothing in it names the item or the stage.** The bar's pill is the neutral
 * `הגשת מקור`. The one thing the sheet knows about where it was opened from is
 * a link and a name, and it uses them in three places and nowhere else: the
 * mail body and the copy chip carry the link, and the received state's pill
 * names the place and goes back to it. The deck writes both onto this element
 * when it opens, because the opener is the only thing that knows them.
 */

const BACK = 'M9 5l7 7-7 7';
const OUT = 'M7 17L17 7M9 7h8v8';

/** Where the form posts. Unset in this build: see below. */
const ENDPOINT = process.env.NEXT_PUBLIC_FORM_ENDPOINT ?? '';

const IG = 'https://ig.me/m/oct8.co.il';
const MAIL = 'info@oct8.co.il';
const SUBJECT = 'מקור / הערה — היום שאחרי';

type Stage = 'ways' | 'form' | 'sent';

export function Send() {
  const el = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>('ways');
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [say, setSay] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  /** A send that left and did not arrive - not a url that was never sent. */
  const [failed, setFailed] = useState(false);
  const copying = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Where the reader came from, read off this element when it is opened.
   *
   * It is an attribute rather than a prop because the opener is in the track
   * and this sheet is not: the deck is the only thing that sees both, and it
   * writes them at the moment of opening (Deck.tsx, openSheet).
   */
  const from = () => ({
    href: el.current?.getAttribute('data-from-href') ?? '',
    name: el.current?.getAttribute('data-from-name') ?? '',
  });
  const [origin, setOrigin] = useState({ href: '', name: '' });

  // The sheet is reused. Every opening is a first visit: a reader who sent
  // something last time is not looking at their own receipt now.
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const watch = new MutationObserver(() => {
      if (node.hasAttribute('hidden')) return;
      setOrigin(from());
      setStage('ways');
      setSay(null);
      setTried(false);
      setFailed(false);
      setCopied(false);
    });
    watch.observe(node, { attributes: true, attributeFilter: ['hidden'] });
    return () => watch.disconnect();
  }, []);

  // The form page is the deck's business too: a sideways swipe closes a sheet
  // (DIA-427), and on a form that would throw away what was typed.
  useEffect(() => {
    el.current?.toggleAttribute('data-form', stage === 'form');
  }, [stage]);

  useEffect(() => () => { if (copying.current) clearTimeout(copying.current); }, []);

  const copy = useCallback(async () => {
    const link = origin.href || location.href;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // A clipboard the browser will not give us is not worth a message: the
      // address is on the screen above, and the reader can take it.
      return;
    }
    setCopied(true);
    if (copying.current) clearTimeout(copying.current);
    copying.current = setTimeout(() => setCopied(false), 1600);
  }, [origin.href]);

  const mail = () => {
    const link = origin.href || '';
    const body = `${link}\n\nקישור למקור: \n`;
    return `mailto:${MAIL}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(body)}`;
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    // The one thing the form checks, and it checks it on send rather than
    // while the reader is still typing it.
    if (!/^https?:\/\/\S/i.test(url.trim())) { setSay('צריך קישור שמתחיל ב־http.'); return; }
    setSay(null);
    setFailed(false);
    setBusy(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ page: origin.href, source: url.trim(), note: note.trim() }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStage('sent');
    } catch {
      // What was typed is kept: it is the whole of what the reader has.
      setSay('לא נשלח. אפשר לנסות שוב, או לשלוח במייל.');
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="deck-sheet deck-send"
      ref={el}
      id="sheet-send"
      hidden
      role="dialog"
      aria-modal="true"
      aria-labelledby="sheet-send-t"
    >
      <div className="deck-sheet-bar">
        <button type="button" className="deck-sheet-x" aria-label="סגירה">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className="deck-sheet-chip" id="sheet-send-t">
          <span className="deck-send-pill">הגשת מקור</span>
        </div>
        {/* At the bar's start, and only on the form: the way back to the three
            channels, which is not the way out of the sheet. */}
        {stage === 'form' && (
          <button
            type="button"
            className="deck-send-back"
            aria-label="חזרה לדרכי השליחה"
            onClick={() => { setStage('ways'); setSay(null); }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={BACK} /></svg>
          </button>
        )}
      </div>

      <div className="deck-sheet-scroll">
        <div className="deck-sheet-body">
          {stage === 'ways' && (
            <div className="deck-read deck-send-ways">
              <p className="deck-send-lead">מכירים מקור שלא מופיע כאן, או שמשהו שגוי? שלחו לנו.</p>

              <h2 className="deck-sheet-h">הודעה באינסטגרם</h2>
              <p>
                <a className="deck-send-at" href={IG} target="_blank" rel="noopener noreferrer">
                  <span dir="ltr">@oct8.co.il</span>
                  <svg className="deck-send-out" viewBox="0 0 24 24" aria-hidden="true"><path d={OUT} /></svg>
                </a>
              </p>
              {/* The link to this page, for a channel that cannot carry one. */}
              <button type="button" className="deck-send-copy" onClick={copy} data-said={copied ? '' : undefined}>
                {copied ? 'הועתק ✓' : 'העתקת הקישור לעמוד הזה'}
              </button>

              <h2 className="deck-sheet-h">מייל</h2>
              <p>
                {/* The address is the link text, so it can be read and copied
                    where a mail link opens nothing. */}
                <a className="deck-send-at" href={mail()}>
                  <span dir="ltr">{MAIL}</span>
                  <svg className="deck-send-out" viewBox="0 0 24 24" aria-hidden="true"><path d={OUT} /></svg>
                </a>
                <span className="deck-send-aside"> · הקישור לעמוד כבר בפנים.</span>
              </p>

              {/* §7: nothing in the sheet may point at a form that does not
                  exist. Without an endpoint this block is not drawn at all. */}
              {ENDPOINT && (
                <>
                  <h2 className="deck-sheet-h">טופס</h2>
                  <p>קישור והערה. העמוד מצורף לבד.</p>
                  <button type="button" className="deck-send-go" onClick={() => setStage('form')}>
                    מילוי הטופס
                    <i dir="ltr" aria-hidden="true">←</i>
                  </button>
                </>
              )}

              <p className="deck-send-fine">כל מקור נבדק לפני שהוא מופיע באתר. לא צריך שם או חשבון.</p>
            </div>
          )}

          {stage === 'form' && (
            <form className="deck-read deck-send-form" onSubmit={send} noValidate>
              <label className="deck-send-field">
                <span>קישור למקור</span>
                <input
                  type="url"
                  dir="ltr"
                  inputMode="url"
                  required
                  value={url}
                  aria-invalid={tried && !!say ? true : undefined}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
              <label className="deck-send-field">
                <span>הערה · לא חובה</span>
                <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              {say && <p className="deck-send-say" role="alert">{say}</p>}
              <button type="submit" className="deck-send-do" disabled={busy}>
                {busy ? 'שולח…' : failed ? 'לשלוח שוב' : 'שליחה'}
              </button>
              <p className="deck-send-fine">
                העמוד שממנו הגעתם מצורף לבד. כל מקור נבדק לפני שהוא מופיע באתר.
              </p>
            </form>
          )}

          {stage === 'sent' && (
            <div className="deck-read deck-send-done">
              <span className="deck-send-tick" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
              </span>
              <p className="deck-send-lead">התקבל. תודה.</p>
              <p>נבדוק, ואם נדרש — נעדכן כאן.</p>
              {/* The only place the sheet names where the reader came from. */}
              <button
                type="button"
                className="deck-send-go"
                onClick={() => el.current?.querySelector<HTMLElement>('.deck-sheet-x')?.click()}
              >
                {origin.name ? `חזרה ל״${origin.name}״` : 'חזרה לקריאה'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
