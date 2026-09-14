'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { DeckItem, StagePage } from '@/lib/mobile';

/**
 * The item as a six-slide post (DIA-360).
 *
 * Horizontal scroll-snap, one slide per screen, the page itself never scrolling.
 * Slides 3 and 4 carry a vertical stack of stage pages inside them, snapped the
 * same way. Everything renders as HTML at build time; the only client work is
 * knowing which slide is in view, so the deck is readable before hydration.
 *
 * The chrome - breadcrumb, locator, back-to-current pill, dots, footer - belongs
 * to the deck, not to the slides. It is rendered once and stays put while the
 * slides move under it. The gate is the one screen whose ground differs: its
 * field is a deck-level backdrop that fades out across the first swipe, so the
 * same docked chrome can sit on it in white ink and on the slides in the
 * palette's.
 *
 * Every measurement here is taken from the live screens embedded in
 * docs/mobile-item.html, not from its prose.
 */
const NAMES = ['השער', 'סקירת הכשל', 'מה נעשה מאז', 'מה עוד לא נעשה', 'דעת הציבור', 'הלאה'];

/** The fragment each slide answers to. A shared link can open the deck on any
 *  slide, and on any single stage page inside slides 3 and 4 - `#stage-4` finds
 *  whichever of the two slides holds stage 4. The gate is the bare URL, so the
 *  link a reader shares from slide 1 carries no fragment at all. */
const SLUG: Record<string, string> = {
  gate: '', overview: 'overview', reached: 'done', unreached: 'notyet', ask: 'ask', onward: 'onward',
};

function parseHash(hash: string, item: DeckItem): { slide: string; stage: number | null } | null {
  const h = decodeURIComponent(hash.replace(/^#/, ''));
  if (!h) return null;
  const m = /^stage-([1-6])$/.exec(h);
  if (m) {
    const n = Number(m[1]);
    if (item.reached.some((p) => p.n === n)) return { slide: 'reached', stage: n };
    if (item.unreached.some((p) => p.n === n)) return { slide: 'unreached', stage: n };
    return null;
  }
  const k = Object.keys(SLUG).find((key) => SLUG[key] === h && key !== 'gate');
  return k ? { slide: k, stage: null } : null;
}

/**
 * Chevrons as paths, never as characters.
 *
 * A literal > or < carries the Unicode mirrored property, so the bidi algorithm
 * flips it inside a Hebrew line and the footer ends up pointing the wrong way in
 * both directions at once. A path has no directionality to mirror.
 */
const CHEVRON = {
  prev: 'M9 5l7 7-7 7',    // towards the previous slide, which in RTL is to the right
  next: 'M15 5l-7 7 7 7',  // towards the next slide, to the left
  down: 'M6 9l6 6 6-6',
  up: 'M18 15l-6-6-6 6',
};

const Chevron = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
);

export function ItemDeck({ item, map }: { item: DeckItem; map: ReactNode }) {
  // Slide 4 is skipped entirely for an item with nothing left to reach - a
  // slide with nothing to say is not shown.
  const keys = ['gate', 'overview', 'reached', ...(item.unreached.length ? ['unreached'] : []), 'ask', 'onward'] as const;
  const names = keys.map((k) => NAMES[['gate', 'overview', 'reached', 'unreached', 'ask', 'onward'].indexOf(k)]);

  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  // How much of the gate is still on screen, 1 to 0 across the first swipe. The
  // gate's field is a deck-level backdrop, so this is what fades it.
  const [gate, setGate] = useState(1);
  // Which stage page each stack is showing. State, not a ref: the locator and
  // the pill are docked outside the stacks and render from it.
  const [seen, setSeen] = useState<Record<string, number>>({});

  // Where the fragment says to open. Read once, on the client's first render,
  // so the stacks inside slides 3 and 4 can honour it in their own mount effect
  // rather than being scrolled twice. The server always renders slide 1.
  const entry = useMemo(
    () => (typeof window === 'undefined' ? null : parseHash(window.location.hash, item)),
    [item],
  );

  // Each stack lends the deck a way to scroll itself to one stage, so a
  // fragment that arrives later - a link followed inside the page, the back
  // button - is honoured the same way the first one was.
  const jumpers = useRef<Record<string, (n: number) => void>>({});
  const seenRef = useRef<Record<string, number>>({});

  const hash = (i: number) => {
    const k = keys[i];
    const n = seenRef.current[k];
    const frag = k === 'gate' ? '' : (k === 'reached' || k === 'unreached') && n ? `#stage-${n}` : `#${SLUG[k]}`;
    const url = location.pathname + location.search + frag;
    if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
  };

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let t = false;
    const read = () => {
      if (t) return;
      t = true;
      requestAnimationFrame(() => {
        t = false;
        const x = Math.abs(el.scrollLeft) / el.clientWidth;
        const i = Math.min(keys.length - 1, Math.max(0, Math.round(x)));
        setAt(i);
        setGate(Math.min(1, Math.max(0, 1 - x)));
        hash(i);
      });
    };
    el.addEventListener('scroll', read, { passive: true });
    return () => el.removeEventListener('scroll', read);
  }, [keys.length]);

  const apply = (target: { slide: string; stage: number | null } | null, smooth: boolean) => {
    const el = track.current;
    if (!el || !target) return;
    const i = (keys as readonly string[]).indexOf(target.slide);
    if (i <= 0) return;
    const dir = getComputedStyle(el).direction === 'rtl' ? -1 : 1;
    const left = dir * i * el.clientWidth;
    if (smooth) el.scrollTo({ left, behavior: 'smooth' });
    else el.scrollLeft = left;
    setAt(i);
    setGate(0);
    if (target.stage !== null) jumpers.current[target.slide]?.(target.stage);
  };

  // Jump to the slide the fragment named - on arrival, and whenever the
  // fragment changes afterwards. Runs after the stacks have placed themselves,
  // so nothing fights it. Our own writes use replaceState, which fires no
  // hashchange, so this never loops.
  useEffect(() => {
    apply(entry, false);
    const onHash = () => apply(parseHash(location.hash, item), true);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    // RTL: scrollLeft runs negative in this direction in most engines.
    const dir = getComputedStyle(el).direction === 'rtl' ? -1 : 1;
    el.scrollTo({ left: dir * i * el.clientWidth, behavior: 'smooth' });
  };

  // Read from the DOM rather than from `at`: the stacks call this from a mount
  // effect that captured the first render's state.
  const slideNow = () => {
    const el = track.current;
    if (!el) return 0;
    return Math.min(keys.length - 1, Math.max(0, Math.round(Math.abs(el.scrollLeft) / el.clientWidth)));
  };

  const onStage = (k: string, n: number) => {
    seenRef.current[k] = n;
    setSeen((s) => (s[k] === n ? s : { ...s, [k]: n }));
    const i = slideNow();
    if (keys[i] === k) hash(i);
  };

  /* ---------------------------------------------------------- docked chrome */
  const here = keys[at];
  const stacked = here === 'reached' || here === 'unreached';
  const pages = here === 'reached' ? item.reached : here === 'unreached' ? item.unreached : [];
  const viewed = seen[here] ?? pages[0]?.n;
  const curIndex = pages.findIndex((p) => p.n === item.currentStage);
  const viewedIndex = pages.findIndex((p) => p.n === viewed);

  // Shown only when the reader is somewhere other than the current stage. On
  // the reached slide it walks the stack; on the unreached slide, where the
  // current stage never appears, it walks back a slide instead.
  const away = stacked && (curIndex < 0 || viewedIndex !== curIndex);
  const backPath = curIndex < 0 ? CHEVRON.prev : curIndex > viewedIndex ? CHEVRON.down : CHEVRON.up;
  const back = () => {
    if (curIndex < 0) go(at - 1);
    else jumpers.current[here]?.(item.currentStage);
  };

  return (
    <div className={'deck' + (at === 0 ? ' on-gate' : '') + (stacked ? ' stacked' : '')} style={{ ['--gate' as string]: gate }}>
      <GateField item={item} />

      <div className="crumbs">
        <span>7 באוקטובר</span><i>›</i>
        <span>{item.parent}</span><i>›</i>
        <b>כשל מס׳ {item.number}</b>
      </div>

      <div className="deck-track" ref={track} dir="rtl">
        {keys.map((k, i) => {
          if (k === 'gate') return <Gate key={k} item={item} />;
          if (k === 'overview') return <Overview key={k} item={item} />;
          if (k === 'reached') return <Stack key={k} item={item} pages={item.reached} title="מה נעשה מאז" map={map} openStage={entry?.slide === 'reached' ? entry.stage : null} onStage={(n) => onStage('reached', n)} lend={(to) => { jumpers.current.reached = to; }} />;
          if (k === 'unreached') return <Stack key={k} item={item} pages={item.unreached} title="מה עוד לא נעשה" map={null} openStage={entry?.slide === 'unreached' ? entry.stage : null} onStage={(n) => onStage('unreached', n)} lend={(to) => { jumpers.current.unreached = to; }} />;
          if (k === 'ask') return <Ask key={k} item={item} />;
          return <Onward key={k} item={item} />;
        })}
      </div>

      {/* The locator keeps a slot per stage whether or not this slide draws it,
          so a rung never moves position between slide 3 and slide 4. */}
      {stacked && (
        <div className="locator">
          {item.rail.map((r) => {
            const mine = pages.some((p) => p.n === r.n);
            const cls = [mine ? '' : 'hidden', r.reached ? '' : 'off', viewed === r.n ? 'viewed' : ''].filter(Boolean).join(' ');
            return <i key={r.n} className={cls} style={{ ['--c' as string]: r.color }} />;
          })}
        </div>
      )}

      <div className="pillrow">
        {away && (
          <button className="backnow" onClick={back}>
            <Chevron d={backPath} />חזרה לשלב הנוכחי
          </button>
        )}
      </div>

      <div className="deck-dots">
        {keys.map((_, n) => <span key={n} className={n === at ? 'on' : ''} />)}
      </div>

      <div className="deck-foot">
        <div className="prev">
          {at === 0
            ? <span className="hint">החליקו לצדדים</span>
            : <button onClick={() => go(at - 1)}><Chevron d={CHEVRON.prev} />{names[at - 1]}</button>}
        </div>
        <div className="mid">
          {stacked && pages.length > 1 && <><span dir="ltr">↑↓</span><span>שלבים</span></>}
        </div>
        <div className="next">
          {at > 0 && at < keys.length - 1 && (
            <button onClick={() => go(at + 1)}>{names[at + 1]}<Chevron d={CHEVRON.next} /></button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------- the gate's ground layer */
/**
 * Rendered by the deck, not by the gate slide, so the field runs the whole
 * height of the screen and the docked chrome sits on it exactly as it does in
 * the spec's screen. It fades out across the first swipe.
 *
 * No photograph exists for any incident yet, so every gate renders the
 * fallback: the stage-colour field with the item number as a ghost. Nothing on
 * the screen announces that a photo is missing (DIA-366).
 */
function GateField({ item }: { item: DeckItem }) {
  const c = item.gate.color;
  return (
    <div className="gatefield" aria-hidden="true">
      <div className="field" style={{ background: `linear-gradient(175deg, color-mix(in srgb,${c} 52%,#0b0f0b) 0%, color-mix(in srgb,${c} 34%,#0b0f0b) 24%, color-mix(in srgb,${c} 18%,#0b0f0b) 48%, #141a11 72%, #0d150b 100%)` }} />
      <div className="field" style={{ background: 'repeating-linear-gradient(180deg,rgba(255,255,255,.032) 0,rgba(255,255,255,.032) 1px,transparent 1px,transparent 9px)' }} />
      <div className="field" style={{ background: `radial-gradient(120% 70% at 78% 6%, color-mix(in srgb,${c} 34%,transparent) 0%, transparent 60%)` }} />
      <div className="ghost"><b className="serif">{item.number}</b><span>מתוך {item.total}</span></div>
      <div className="field" style={{ background: 'linear-gradient(to left,rgba(6,10,6,.72) 0%,rgba(6,10,6,.5) 7%,rgba(6,10,6,.28) 16%,rgba(6,10,6,.1) 26%,rgba(6,10,6,0) 36%)' }} />
      <div className="field" style={{ background: 'linear-gradient(180deg,rgba(10,16,8,.45) 0%,rgba(10,16,8,.18) 14%,rgba(10,16,8,.06) 30%,rgba(10,16,8,.16) 46%,rgba(10,16,8,.5) 62%,rgba(10,16,8,.8) 76%,rgba(10,16,8,.92) 90%,rgba(10,16,8,.95) 100%)' }} />
    </div>
  );
}

/* ---------------------------------------------------------------- slide 1 */
function Gate({ item }: { item: DeckItem }) {
  const last = item.rail.findIndex((r) => !r.reached);
  return (
    <section className="slide deck-gate">
      {/* A two-column grid: rung, then label. Emitted as flat cells - a wrapper
          per row would break the grid, and display:contents on that wrapper
          breaks :first-child, which is how the gap before the first unreached
          rung is placed. */}
      <div className="deck-ladder">
        {item.rail.map((r, n) => {
          const gap = n === last ? ' gap' : '';
          return (
            <Fragment key={r.n}>
              <i className={(r.reached ? '' : 'off') + (r.current ? ' now' : '') + gap} style={{ ['--c' as string]: r.color }} />
              <label className={(r.current ? 'now' : r.reached ? '' : 'off') + gap} style={{ ['--c' as string]: r.color }}>
                {r.he}
                {r.current && item.gate.ageLine && <span className="age">{item.gate.ageLine}</span>}
              </label>
            </Fragment>
          );
        })}
      </div>
      <div className="title">
        <h1 className="serif">{item.title}</h1>
        <div className="src">{item.gate.sourceLine}</div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- slide 2 */
function Overview({ item }: { item: DeckItem }) {
  // The systemic description is not written for any incident yet. Until it is,
  // the slide carries the incident's own summary - real, editor-written, and
  // about the failure rather than the day. Source chips and the carousel arrive
  // with the cited markdown.
  return (
    <section className="slide">
      <div className="sheet sheet-2">
        <div><span className="slidetitle chip">סקירת הכשל</span></div>
        <div className="prose"><p className="lead">{item.summary}</p></div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ slides 3, 4 */
function Stack({
  item, pages, title, map, openStage, onStage, lend,
}: {
  item: DeckItem; pages: StagePage[]; title: string; map: ReactNode;
  openStage: number | null; onStage: (n: number) => void;
  lend: (to: (n: number) => void) => void;
}) {
  const stack = useRef<HTMLDivElement>(null);
  // The reached stack opens on the current stage; the unreached one on the next.
  // A fragment naming one stage overrides both.
  const named = openStage === null ? -1 : pages.findIndex((p) => p.n === openStage);
  const cur = pages.findIndex((p) => p.n === item.currentStage);
  const opensAt = Math.max(0, named >= 0 ? named : cur);

  useEffect(() => {
    const el = stack.current;
    if (!el) return;
    if (opensAt > 0) el.scrollTop = opensAt * el.clientHeight;
    onStage(pages[opensAt].n);
    lend((n) => {
      const j = pages.findIndex((q) => q.n === n);
      if (j >= 0) el.scrollTo({ top: j * el.clientHeight, behavior: 'smooth' });
    });
    const read = () => {
      const i = Math.min(pages.length - 1, Math.max(0, Math.round(el.scrollTop / el.clientHeight)));
      onStage(pages[i].n);
    };
    el.addEventListener('scroll', read, { passive: true });
    return () => el.removeEventListener('scroll', read);
  }, [opensAt]);

  return (
    <section className="slide">
      <div className="stack" ref={stack}>
        {pages.map((p) => (
          <article className="stage" key={p.n} style={{ ['--c' as string]: p.color }}>
            <div className="sheet locatored">
              <div className="slidetitle">{title}</div>
              <div className="head">
                <div className="tagrow">
                  <span className={`tag${p.reached ? '' : ' off'}`}>{p.n} · {p.he}</span>
                  {p.n === item.currentStage && <span className="now">סטטוס נוכחי</span>}
                </div>
                <div className="def">{p.definition}</div>
                {p.reached
                  ? p.date && <div className="when">{p.date} · {p.days?.toLocaleString('he-IL')} ימים אחרי 7.10</div>
                  : <div className="when">טרם תועד</div>}
              </div>

              {p.reached ? (
                <>
                  {p.overview && (
                    <div className="prose">
                      {p.overview.split('\n\n').map((t, k) => <p key={k} className={k === 0 ? 'lead' : undefined}>{t}</p>)}
                    </div>
                  )}
                  {p.hasMap && map}
                  {p.sources.length > 0 && (
                    <div className="carousel">
                      {p.sources.map((s) => (
                        <a className="scard" key={s.id} href={s.url ?? undefined} target="_blank" rel="noopener noreferrer nofollow" style={{ ['--c' as string]: s.color }}>
                          <div className="o"><i />{s.outlet}</div>
                          {s.quote && <div className="sq">„{s.quote}“</div>}
                          <div className="d">{s.date}</div>
                        </a>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="absence">
                  <p className="statement"><b>{p.statement}</b></p>
                  <p className="who">{p.who}</p>
                  {p.sinceDays !== undefined && (
                    <div className="since">
                      <div className="glass"><Hourglass /></div>
                      <div className="n">{p.sinceDays.toLocaleString('he-IL')}</div>
                      <div className="nlbl">{p.sinceLabel}</div>
                    </div>
                  )}
                  <div className="know">
                    <b>יודעים אחרת?</b>
                    <p>אם פורסם מקור כזה ולא מצאנו אותו — הגישו אותו, והשלב ישתנה.</p>
                    <Link href="/about/#corrections">הגישו מקור</Link>
                  </div>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** The spec's hourglass: four straight paths, no curves. */
const Hourglass = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 3h10" /><path d="M7 21h10" />
    <path d="M8 3v4l4 5 4-5V3" /><path d="M8 21v-4l4-5 4 5v4" />
  </svg>
);

/** The spec's timer: a clock face, not an hourglass and never an emoji. */
const Timer = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="timer">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
);

/* ---------------------------------------------------------------- slide 5 */
function Ask({ item }: { item: DeckItem }) {
  return (
    <section className="slide">
      <div className="sheet sheet-ask">
        <div className="askhead">
          <div className="slidetitle">דעת הציבור</div>
          <h2>{item.question.he}</h2>
        </div>
        <div className="askbody">
          <div className="soonbox">
            <div className="soonlbl"><Timer />המענה ייפתח בהמשך</div>
            <div className="dimmed">
              <div className="deck-scale">{[1, 2, 3, 4, 5].map((n) => <span key={n}>{n}</span>)}</div>
              <div className="anchors"><span>{item.question.lo ?? 'בכלל לא'}</span><span>{item.question.hi ?? 'במידה מלאה'}</span></div>
            </div>
            <p className="note">
              כרגע האתר מציג את הרישום בלבד. כשהמענה ייפתח, כאן תדרגו עד כמה מה שנעשה נותן מענה — והתפלגות התשובות תוצג לצד השאלה.
            </p>
          </div>
          <div className="asknow">
            <p>{item.question.sub}</p>
            <Link href="/about/#corrections">הגישו מקור</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- slide 6 */
function Onward({ item }: { item: DeckItem }) {
  return (
    <section className="slide onward">
      <div className="sheet">
        <div className="signoff">תודה על הקריאה.</div>
        <div className="secrow">
          <b>עוד כשלים במעקב</b>
          <span>{item.onward.length} מתוך {item.total}</span>
        </div>
        <div className="cards">
          {item.onward.map((o) => (
            <Link className="icard" key={o.id} href={`/item/${o.id}/`} style={{ ['--c' as string]: o.color }}>
              <div className="bc"><span>7 באוקטובר</span><i>›</i><span>{o.parent}</span><i>›</i><b>כשל מס׳ {o.number}</b></div>
              <div className="st">{o.he}</div>
              <span className="chip">{o.stage} · {o.stageHe}</span>
            </Link>
          ))}
        </div>
        <div className="acts">
          <Link className="all" href="/">כל {item.total} הכשלים</Link>
          <ShareButton item={item} />
        </div>
        <div className="deck-mark"><i /><span>היום שאחרי</span></div>
      </div>
    </section>
  );
}

function ShareButton({ item }: { item: DeckItem }) {
  return (
    <button
      className="share"
      onClick={async () => {
        const url = location.href.split('#')[0];
        const title = `כשל מס׳ ${item.number} · ${item.title}`;
        try {
          if (navigator.share) await navigator.share({ title, url });
          else await navigator.clipboard.writeText(url);
        } catch { /* the reader dismissed the sheet */ }
      }}
    >
      שיתוף כשל מס׳ {item.number}
    </button>
  );
}
