'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { DeckItem, StagePage } from '@/lib/mobile';

/**
 * The item as a six-slide post (DIA-360).
 *
 * Horizontal scroll-snap, one slide per screen, the page itself never scrolling.
 * Slides 3 and 4 carry a vertical stack of stage pages inside them, snapped the
 * same way. Everything renders as HTML at build time; the only client work is
 * knowing which slide is in view, so the deck is readable before hydration.
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

/** Down to a later stage, up to an earlier one, right to the previous slide. */
const CHEVRON = { down: 'M6 9l6 6 6-6', up: 'M18 15l-6-6-6 6', back: 'M9 5l7 7-7 7' };

export function ItemDeck({ item, map }: { item: DeckItem; map: ReactNode }) {
  // Slide 4 is skipped entirely for an item with nothing left to reach - a
  // slide with nothing to say is not shown.
  const keys = ['gate', 'overview', 'reached', ...(item.unreached.length ? ['unreached'] : []), 'ask', 'onward'] as const;
  const names = keys.map((k) => NAMES[['gate', 'overview', 'reached', 'unreached', 'ask', 'onward'].indexOf(k)]);

  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);

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

  // Which stage page each stack is showing, so the fragment can name it.
  const seen = useRef<Record<string, number>>({});
  const hash = (i: number) => {
    const k = keys[i];
    const n = seen.current[k];
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
        const i = Math.min(keys.length - 1, Math.max(0, Math.round(Math.abs(el.scrollLeft) / el.clientWidth)));
        setAt(i);
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
    seen.current[k] = n;
    const i = slideNow();
    if (keys[i] === k) hash(i);
  };

  const crumbs = (
    <div className="crumbs">
      <span>7 באוקטובר</span><i>›</i>
      <span>{item.parent}</span><i>›</i>
      <b>כשל מס׳ {item.number}</b>
    </div>
  );

  const foot = (i: number, mid?: ReactNode) => (
    <>
      <div className="deck-dots">
        {keys.map((_, n) => <span key={n} className={n === at ? 'on' : ''} />)}
      </div>
      <div className="deck-foot">
        <div className="prev">
          {i === 0
            ? <span>החליקו לצדדים</span>
            : i === 1 ? null
            : <button onClick={() => go(i - 1)}><span>›</span>{names[i - 1]}</button>}
        </div>
        <div className="mid">{mid}</div>
        <div className="next">
          {i < keys.length - 1 && <button onClick={() => go(i + 1)}>{names[i + 1]}<span>‹</span></button>}
        </div>
      </div>
    </>
  );

  return (
    <div className="deck">
      <div className="deck-track" ref={track} dir="rtl">
        {keys.map((k, i) => {
          if (k === 'gate') return <Gate key={k} item={item} crumbs={crumbs} foot={foot(i)} />;
          if (k === 'overview') return <Overview key={k} item={item} crumbs={crumbs} foot={foot(i)} />;
          if (k === 'reached') return <Stack key={k} item={item} pages={item.reached} crumbs={crumbs} foot={foot} index={i} title="מה נעשה מאז" map={map} go={go} openStage={entry?.slide === 'reached' ? entry.stage : null} onStage={(n) => onStage('reached', n)} lend={(to) => { jumpers.current.reached = to; }} />;
          if (k === 'unreached') return <Stack key={k} item={item} pages={item.unreached} crumbs={crumbs} foot={foot} index={i} title="מה עוד לא נעשה" map={null} go={go} openStage={entry?.slide === 'unreached' ? entry.stage : null} onStage={(n) => onStage('unreached', n)} lend={(to) => { jumpers.current.unreached = to; }} />;
          if (k === 'ask') return <Ask key={k} item={item} crumbs={crumbs} foot={foot(i)} />;
          return <Onward key={k} item={item} crumbs={crumbs} foot={foot(i)} />;
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- slide 1 */
function Gate({ item, crumbs, foot }: { item: DeckItem; crumbs: ReactNode; foot: ReactNode }) {
  // No photograph exists for any incident yet, so every gate renders the
  // fallback: the stage-colour field with the item number as a ghost. Nothing
  // on the screen announces that a photo is missing (DIA-366).
  const c = item.gate.color;
  return (
    <section className="slide deck-gate" style={{ ['--c' as string]: c }}>
      <div className="field" style={{ background: `linear-gradient(175deg, color-mix(in srgb,${c} 52%,#0b0f0b) 0%, color-mix(in srgb,${c} 34%,#0b0f0b) 24%, color-mix(in srgb,${c} 18%,#0b0f0b) 48%, #141a11 72%, #0d150b 100%)` }} />
      <div className="field" style={{ background: 'repeating-linear-gradient(180deg,rgba(255,255,255,.032) 0,rgba(255,255,255,.032) 1px,transparent 1px,transparent 9px)' }} />
      <div className="ghost"><b>{item.number}</b><span>מתוך {item.total}</span></div>
      <div className="field" style={{ background: 'linear-gradient(to left,rgba(6,10,6,.72) 0%,rgba(6,10,6,.5) 7%,rgba(6,10,6,.28) 16%,rgba(6,10,6,.1) 26%,rgba(6,10,6,0) 36%)' }} />
      <div className="field" style={{ background: 'linear-gradient(180deg,rgba(10,16,8,.45) 0%,rgba(10,16,8,.18) 14%,rgba(10,16,8,.06) 30%,rgba(10,16,8,.16) 46%,rgba(10,16,8,.5) 62%,rgba(10,16,8,.8) 76%,rgba(10,16,8,.92) 90%,rgba(10,16,8,.95) 100%)' }} />

      <div className="body">
        {crumbs}
        <div className="rail">
          {item.rail.map((r, n) => {
            const gap = !r.reached && item.rail[n - 1]?.reached ? ' gap' : '';
            return (
              <span key={r.n} style={{ display: 'contents', ['--c' as string]: r.color }}>
                <i className={(r.reached ? '' : 'off') + gap} />
                <label className={(r.current ? 'now' : r.reached ? '' : 'off') + gap}>
                  {r.he}
                  {r.current && item.gate.ageLine && <span className="age">{item.gate.ageLine}</span>}
                </label>
              </span>
            );
          })}
        </div>
        <div className="title">
          <h1>{item.title}</h1>
          <div className="src">{item.gate.sourceLine}</div>
        </div>
        {foot}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- slide 2 */
function Overview({ item, crumbs, foot }: { item: DeckItem; crumbs: ReactNode; foot: ReactNode }) {
  // The systemic description is not written for any incident yet. Until it is,
  // the slide carries the incident's own summary - real, editor-written, and
  // about the failure rather than the day. Source chips and the carousel arrive
  // with the cited markdown.
  return (
    <section className="slide">
      {crumbs}
      <div className="sheet">
        <div className="slidetitle chip">סקירת הכשל</div>
        <div className="prose"><p className="lead">{item.summary}</p></div>
      </div>
      {foot}
    </section>
  );
}

/* ------------------------------------------------------------ slides 3, 4 */
function Stack({
  item, pages, crumbs, foot, index, title, map, go, openStage, onStage, lend,
}: {
  item: DeckItem; pages: StagePage[]; crumbs: ReactNode;
  foot: (i: number, mid?: ReactNode) => ReactNode; index: number; title: string; map: ReactNode;
  go: (i: number) => void; openStage: number | null; onStage: (n: number) => void;
  lend: (to: (n: number) => void) => void;
}) {
  const stack = useRef<HTMLDivElement>(null);
  // The reached stack opens on the current stage; the unreached one on the next.
  // A fragment naming one stage overrides both.
  const named = openStage === null ? -1 : pages.findIndex((p) => p.n === openStage);
  const cur = pages.findIndex((p) => p.n === item.currentStage);
  const opensAt = Math.max(0, named >= 0 ? named : cur);
  const [at, setAt] = useState(Math.max(0, cur));

  useEffect(() => {
    const el = stack.current;
    if (!el) return;
    if (opensAt > 0) el.scrollTop = opensAt * el.clientHeight;
    setAt(opensAt);
    onStage(pages[opensAt].n);
    lend((n) => {
      const j = pages.findIndex((q) => q.n === n);
      if (j >= 0) el.scrollTo({ top: j * el.clientHeight, behavior: 'smooth' });
    });
    const read = () => {
      const i = Math.min(pages.length - 1, Math.max(0, Math.round(el.scrollTop / el.clientHeight)));
      setAt(i);
      onStage(pages[i].n);
    };
    el.addEventListener('scroll', read, { passive: true });
    return () => el.removeEventListener('scroll', read);
  }, [opensAt]);

  const viewed = pages[Math.min(at, pages.length - 1)];
  const mid = pages.length > 1 ? <><span>↑↓</span><span>שלבים</span></> : null;

  // The pill shows only when the reader is somewhere other than the current
  // stage. On the reached slide it walks the stack; on the unreached slide,
  // where the current stage never appears, it walks back a slide instead.
  const away = cur < 0 || at !== cur;
  const path = cur < 0 ? CHEVRON.back : cur > at ? CHEVRON.down : CHEVRON.up;
  const back = () => {
    if (cur < 0) return go(index - 1);
    const el = stack.current;
    el?.scrollTo({ top: cur * el.clientHeight, behavior: 'smooth' });
  };
  const pill = away && (
    <div className="pillrow">
      <button className="backnow" onClick={back}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>
        חזרה לשלב הנוכחי
      </button>
    </div>
  );

  return (
    <section className="slide">
      {crumbs}
      <div className="locator">
        {item.rail.map((r) => {
          const mine = pages.some((p) => p.n === r.n);
          const cls = [
            mine ? '' : 'hidden',
            r.reached ? '' : 'off',
            viewed?.n === r.n ? 'viewed' : '',
            r.current && viewed?.n !== r.n ? 'current' : '',
          ].filter(Boolean).join(' ');
          return <i key={r.n} className={cls} style={{ ['--c' as string]: r.color }} />;
        })}
      </div>

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
                          {s.quote && <div className="q">„{s.quote}“</div>}
                          <div className="d">{s.date}</div>
                        </a>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="absence">
                  <p className="statement">{p.statement}</p>
                  <p className="who">{p.who}</p>
                  <div className="glass">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10M7 21h10M8 3v3.5a4 4 0 0 0 1.6 3.2L12 12l2.4-2.3A4 4 0 0 0 16 6.5V3M8 21v-3.5a4 4 0 0 1 1.6-3.2L12 12l2.4 2.3A4 4 0 0 1 16 17.5V21" /></svg>
                  </div>
                  {p.sinceDays !== undefined && (
                    <div>
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
      {pill}
      {foot(index, mid)}
    </section>
  );
}

/* ---------------------------------------------------------------- slide 5 */
function Ask({ item, crumbs, foot }: { item: DeckItem; crumbs: ReactNode; foot: ReactNode }) {
  return (
    <section className="slide">
      {crumbs}
      <div className="sheet">
        <div className="slidetitle">דעת הציבור</div>
        <div className="ask">
          <p className="q">{item.question.he}</p>
          <p className="sub">{item.question.sub}</p>
          <div className="soonbox">
            <div className="soonlbl"><span>⏳</span>המענה ייפתח בהמשך</div>
            <div className="deck-scale">{[1, 2, 3, 4, 5].map((n) => <span key={n}>{n}</span>)}</div>
            <div className="anchors"><span>{item.question.lo ?? 'בכלל לא'}</span><span>{item.question.hi ?? 'במידה מלאה'}</span></div>
          </div>
          <p className="note">
            כרגע האתר מציג את הרישום בלבד. התשובות לא ישנו את השלב — רק בדיקה מתועדת של גורם חיצוני משנה אותו.
          </p>
        </div>
      </div>
      {foot}
    </section>
  );
}

/* ---------------------------------------------------------------- slide 6 */
function Onward({ item, crumbs, foot }: { item: DeckItem; crumbs: ReactNode; foot: ReactNode }) {
  return (
    <section className="slide onward">
      {crumbs}
      <div className="sheet">
        <div className="signoff">תודה על הקריאה.</div>
        <div className="secrow">
          <b>עוד כשלים במעקב</b>
          <span>{item.onward.length} מתוך {item.total}</span>
        </div>
        <div className="cards">
          {item.onward.map((o) => (
            <Link className="icard" key={o.id} href={`/item/${o.id}/`} style={{ ['--c' as string]: o.color }}>
              <div className="bc"><span>7 באוקטובר</span><span style={{ opacity: .45 }}>›</span><span>{o.parent}</span><span style={{ opacity: .45 }}>›</span><b>כשל מס׳ {o.number}</b></div>
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
      {foot}
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
