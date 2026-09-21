import type { Metadata } from 'next';
import Link from 'next/link';
import {
  parentById, placeById, childrenOf, visibleIncidents,
  stageOf, isContested, stageMeta, taxonomy, TYPES, QUESTIONS, firstDocumented,
  type Claim, type Incident,
} from '@/lib/data';
import { parseAnnotation, plainText } from '@/lib/annotation';
import { Annotated } from '@/app/components/Annotated';
import { EvidenceMap, pinsOf } from '@/app/components/EvidenceMap';
import { ItemDock } from '@/app/components/ItemDock';
import { ItemIntro } from '@/app/components/ItemIntro';
import { CitationLinks } from '@/app/components/CitationLinks';
import { Header } from '@/app/components/Header';
import { Deck } from '@/app/components/mobile/Deck';
import { Gate, GateGround, type GateRung } from '@/app/components/mobile/Gate';
import { overviewParts } from '@/app/components/mobile/Overview';
import { stagesParts } from '@/app/components/mobile/Stages';
import { StageArrows } from '@/app/components/mobile/StagesShell';
import { sourceLine } from '@/lib/deck';
import { reached as reachedStages, unreached as unreachedStages, stageDate } from '@/lib/stage';
import { daysAfter } from '@/lib/days';
import { itemNumberOf, published, STAGES } from '@/lib/data';
import { SourceLink } from '@/app/components/SourceLink';

export const dynamicParams = false;

/**
 * A static export refuses to build a dynamic route that generates no pages, and
 * "nothing is published yet" is a real state of this site - staging and prod
 * exist before the ledger does. So when there is nothing to show, the route
 * generates one page saying exactly that. It is unlinked and noindexed, and it
 * disappears the moment the first incident is published.
 */
const EMPTY = 'none';

export function generateStaticParams() {
  const ids = visibleIncidents.map((i) => ({ id: i.id }));
  return ids.length ? ids : [{ id: EMPTY }];
}

const visible = (id: string) => visibleIncidents.find((i) => i.id === id);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const inc = visible(id);
  if (!inc) return { title: 'אין עדיין כשלים שפורסמו', robots: { index: false, follow: false } };
  const st = stageOf(inc);
  return {
    title: inc.he,
    description: plainText(inc.summary).slice(0, 200),
    alternates: { canonical: `/item/${id}/` },
    openGraph: { title: inc.he, description: `שלב ${st} · ${stageMeta(st).he}`, url: `/item/${id}/` },
  };
}

const placeNames = (claims: Claim[]) => [
  ...new Set(claims.filter((c) => c.place).map((c) => placeById(c.place!)?.he).filter(Boolean) as string[]),
];

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inc = visible(id);
  if (!inc) return <NothingPublished />;

  const parent = parentById(inc.parent)!;
  const st = stageOf(inc);
  const S = stageMeta(st);
  const question = QUESTIONS[String(st)];
  const contested = isContested(inc);
  const evidence = inc.claims.filter((c) => c.asserts_stage === 1);
  const pins = pinsOf(inc.claims);
  const places = placeNames(inc.claims);
  const siblings = childrenOf(inc.parent).filter((x) => x.id !== inc.id);

  /* ---------- slide 1 of the phone deck (DIA-378, spec §4) ----------
     Composed here rather than inside the component: everything on that screen
     is computed by a helper written and tested in Phase 1, and the component's
     job is to arrange what it is handed. */
  /**
   * What shape of deck this item gets.
   *
   * §7: an item at the last stage has no slide 4 - the slide is skipped
   * entirely and the item is a five-slide post with five dots. There is no
   * "nothing left" screen, because a slide with nothing to say is not shown.
   */
  const deck = (() => {
    const gap = unreachedStages(inc);
    return {
      hasGap: gap.length > 0,
      gapPages: gap.length,
      reachedPages: reachedStages(inc).length,
      omit: gap.length ? [] : [4],
    };
  })();

  const gate = (() => {
    const number = itemNumberOf(inc.id);
    const has = new Set<number>(reachedStages(inc));
    // Five rungs. Stage 6 is not a goal an item is failing to reach, so it
    // joins the rail only when it has happened.
    const rungs = STAGES.filter((x) => x.n <= 5 || has.has(x.n));
    const rail: GateRung[] = rungs.map((x) => ({
      n: x.n, he: x.he, color: x.color,
      reached: has.has(x.n),
      current: x.n === st,
    }));

    const on = stageDate(inc, st);
    const after = on ? daysAfter(on) : null;
    const age = on ? (after === null ? on : `${after} ימים אחרי 7.10 · ${on}`) : null;

    const portrait = inc.photo?.portrait ?? null;

    return {
      leaf: number === null ? 'כשל' : `כשל מס׳ ${number}`,
      credit: portrait
        ? `צילום: ${portrait.photographer} · ${portrait.source} · ${portrait.licence}`
        : null,
      props: {
        rail, age, title: inc.he, source: sourceLine(inc),
        number, total: published.length,
        photo: portrait
          ? { src: `/photos/${portrait.file}`, alt: '', credit: '' }
          : null,
      },
    };
  })();

  /** The phone deck's slides 2-4: each hands back a card and its sheet. */
  const phone = {
    ov: overviewParts({ summary: inc.summary, claims: inc.claims }),
    st: stagesParts({ inc, slide: 2, kind: 'reached' }),
    gap: deck.hasGap ? stagesParts({ inc, slide: 3, kind: 'unreached' }) : null,
  };

  const chapters = [
    { n: 1, t: 'הבעיה', color: 'var(--s2)', d: 'מה נכשל' },
    { n: 2, t: 'ההתקדמות', color: S.color, d: 'מה נעשה מאז' },
    { n: 3, t: 'דעת הציבור', color: 'var(--accent)', d: 'מה הציבור חושב' },
  ];

  return (
    <>
      {/* Two item pages live in this one HTML and a media query picks which is
          on screen (spec §11). There is no server to sniff a device and no
          JavaScript swap, so the right one is there on the first paint - see
          the deck block at the foot of globals.css.

          Phase 2 renders the deck's shell only: it reads no incident data, and
          its slides name themselves. The breadcrumb's leaf is the one piece of
          visible chrome that wants data - itemNumber() exists and is tested,
          and Phase 3 wires it. */}
      {/* The reading sheets are rendered beside the track, never in it: a
          sheet inside the horizontal scroller is the crossing every fault of
          these screens came from, and `inert` cannot be lifted off a subtree
          of an inert tree (DIA-413). */}
      <Deck
        crumbs={{ root: '7 באוקטובר', parent: parent.he, leaf: gate.leaf }}
        slides={[
          <Gate key="gate" {...gate.props} />,
          phone.ov.card, phone.st.card, phone.gap?.card ?? null,
        ]}
        sheets={[null, phone.ov.sheet, phone.st.sheet, phone.gap?.sheet ?? null]}
        omit={deck.omit}
        mid={[
          null, null,
          deck.reachedPages > 1 ? <StageArrows key="up" slide={2} /> : null,
          deck.hasGap && deck.gapPages > 1 ? <StageArrows key="down" slide={3} /> : null,
        ]}
        ground={<GateGround {...gate.props} />}
        credit={gate.credit}
      />

      <div className="item-desktop">
      <Header compact />

      {/* ---------- docked failure header and chapter rail ---------- */}
      <div className="dock" id="dock">
        <div className="in">
          <Link className="bk" href={`/#${parent.id}`} aria-label="חזרה לכשל המערכתי">›</Link>
          <div className="tt">{inc.he}</div>
          <span className="chip fill" style={{ ['--c' as string]: S.color }}>{st} · {S.he}</span>
        </div>
        <div className="docksub" id="docksub">
          <span className="no">1</span><span className="nm">מה נכשל</span>
        </div>
      </div>
      <nav className="toc" id="toc" aria-label="פרקי העמוד">
        {chapters.map((c) => (
          <a key={c.n} href={`#chap-${c.n}`} data-ch={String(c.n)} style={{ ['--c' as string]: c.color }}>
            <span className="no">{c.n}</span><span>{c.t}</span>
          </a>
        ))}
      </nav>
      <ItemDock chapters={chapters.map(({ n, color, d }) => ({ n, color, d }))} />
      <CitationLinks />
      <ItemIntro
        stage={st}
        peak={
          // A regressed failure climbs to the highest stage it ever reached
          // before the ladder drops it to 6 - the climb is the story.
          st === 6
            ? Math.max(1, ...inc.claims.filter((c) => c.asserts_stage > 0 && c.asserts_stage < 6).map((c) => c.asserts_stage))
            : st
        }
        stages={taxonomy.stages}
      />

      <div className="wrap">
        <section className="view active">
          <div className="story">
            {/* ---------- hero ---------- */}
            <div className="itemhero">
              <div className="crumb">
                <Link href="/">הכשלים</Link> › <Link href={`/#${parent.id}`}>{parent.he}</Link>
              </div>
              <h1 className="item">{inc.he}</h1>
              <div className="itemmeta">
                <span className="chip fill" style={{ ['--c' as string]: S.color }}>{st} · {S.he}</span>
                {contested && <span className="chip" style={{ ['--c' as string]: 'var(--flag)' }}>במחלוקת</span>}
                <span>{places.length ? places.join(' · ') : 'ארצי · ללא מיקום'}</span>
                <span>·</span>
                <span className="num">{inc.claims.length} טענות במקורות</span>
              </div>
            </div>

            {/* ---------- 01 · the problem ---------- */}
            <section className="chap" id="chap-1" style={{ ['--c' as string]: 'var(--s2)' }}>
              <div className="eyebrow">
                <span className="no">1</span>
                <span className="kk">הבעיה</span>
                <span className="side">
                  {evidence.length} מקורות מתעדים{places.length ? ` · ${places.length} מוקדים` : ''}
                </span>
              </div>
              <h3>מה נכשל</h3>
              <p className="chaplead">
                מה תועד, ומי תיעד אותו. לכל טענה יש מקור, סוג ותאריך — בלי שלושתם היא לא נכנסת.
              </p>
              <div className="clip">
                <div className="kick">
                  <span>{parent.he}</span>
                  <span className="num">תועד לראשונה · {firstDocumented(inc)}</span>
                </div>
                <Annotated text={inc.summary} claims={inc.claims} />
                <div className="by">תיאור הכשל · נכתב על ידי העורך מתוך המקורות המתועדים למטה</div>
              </div>

              <div className="block">
                <div className="bh">
                  <span>העדויות שמתעדות את הכשל</span>
                  <span className="num">{evidence.length} מתוך {inc.claims.length} טענות</span>
                </div>
                <ul className="ev">
                  {evidence.map((c) => (
                    <li key={c.id} style={{ ['--c' as string]: TYPES[c.source_type].color }}>
                      <span className="dot" />
                      <div className="src">
                        {c.source}
                        {c.quote && <q>{c.quote}</q>}
                        <small>{TYPES[c.source_type].he} · {c.date} · <SourceLink claim={c} /></small>
                      </div>
                      <span className="pl">{c.place ? placeById(c.place)?.he : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {pins.length > 0 && (
                <div className="block">
                  <div className="bh">
                    <span>איפה תועד הכשל</span>
                    <span>המיקום שייך למקור, לא לכשל</span>
                  </div>
                  <div className="evmap"><EvidenceMap pins={pins} /></div>
                  <div className="maplg">
                    <span style={{ color: 'var(--text-2)' }}>המקורות על המפה ·</span>
                    {Object.values(TYPES)
                      .filter((t) => pins.some((x) => x.type === t.id))
                      .map((t) => (
                        <span key={t.id}><i style={{ background: t.color }} />{t.he}</span>
                      ))}
                  </div>
                </div>
              )}
            </section>

            {/* ---------- 02 · progress ---------- */}
            <section className="chap" id="chap-2" style={{ ['--c' as string]: S.color }}>
              <div className="eyebrow">
                <span className="no">2</span>
                <span className="kk">ההתקדמות</span>
                <span className="side">מחושב מהמקורות, לא נקבע ידנית</span>
              </div>
              <h3>מה נעשה מאז</h3>
              <p className="chaplead">
                השלב הוא הגבוה ביותר שיש לו טענה ממקור. הציבור לא מזיז אותו, וגם מחלוקת לא מורידה אותו.
              </p>
              <div className="stagerow">
                <span className="big">{st}</span>
                <span style={{ fontWeight: 700, color: S.color }}>{S.he}</span>
                {contested && <span className="chip" style={{ ['--c' as string]: 'var(--flag)' }}>במחלוקת</span>}
              </div>
              <div className="ladder">
                {[1, 2, 3, 4, 5, 6].map((k) => (
                  <span
                    key={k}
                    className={(st === 6 ? k === 6 : k <= st) ? 'on' : ''}
                    style={st === 6 && k === 6 ? ({ ['--c' as string]: 'var(--s6)' }) : undefined}
                  />
                ))}
              </div>

              <StageSummary inc={inc} stage={st} />

              {st === 5 && (
                <details className="trace">
                  <summary>מסלול האימות העצמאי</summary>
                  <div className="in">
                    <ul className="ledger">
                      {inc.claims.filter((c) => c.asserts_stage === 5).map((c) => (
                        <li key={c.id} style={{ ['--c' as string]: 'var(--s5)' }}>
                          <span className="st">אומת</span>
                          <div className="src">
                            {c.source}
                            <small>{TYPES[c.source_type].he} · <SourceLink claim={c} /></small>
                          </div>
                          <span className="dt num">{c.date}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              )}

              <Ledger inc={inc} />
            </section>

            {/* ---------- 03 · the public ---------- */}
            <section className="chap" id="chap-3" style={{ ['--c' as string]: 'var(--accent)' }}>
              <div className="eyebrow">
                <span className="no">3</span>
                <span className="kk">דעת הציבור</span>
                <span className="side">בקרוב</span>
              </div>
              <h3>{question.he}</h3>
              <p className="chaplead">{question.sub}</p>
              <div className="soon">
                <p>
                  ההצבעה תיפתח בקרוב. השאלה משתנה לפי השלב שבו הכשל נמצא, וכל שלב שהכשל עבר שומר
                  את התשובות שניתנו בו.
                </p>
                <p className="small">
                  יצביעו רק משתמשים מאומתים בטלפון. מספר הטלפון נשמר כגיבוב בלבד ואינו מוצג לאיש.
                </p>
              </div>
            </section>

            {/* ---------- closing band ---------- */}
            <section className="chap" style={{ ['--c' as string]: 'var(--line)' }}>
              <div className="closeband">
                <div>
                  <h4>פעולות</h4>
                  <div className="actions">
                    <Link href="/about/#corrections">הגשת מקור או תיקון</Link>
                    <Link href="/about/#method">איך מחושב השלב?</Link>
                  </div>
                </div>
                <div>
                  <h4>עוד ב&quot;{parent.he}&quot;</h4>
                  <ul className="siblings">
                    {siblings.map((x) => {
                      const s2 = stageOf(x);
                      return (
                        <li key={x.id}>
                          <Link href={`/item/${x.id}/`}>
                            <span className="t">{x.he}</span>
                            <span className="chip" style={{ ['--c' as string]: stageMeta(s2).color }}>
                              {s2} · {stageMeta(s2).he}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
      </div>
    </>
  );
}

/** Every claim the incident rests on, in one collapsible list. */
function Ledger({ inc }: { inc: Incident }) {
  return (
    <details className="trace" style={{ ['--c' as string]: 'var(--muted)' }}>
      <summary style={{ color: 'var(--text-2)' }}>כל הטענות במקורות · {inc.claims.length}</summary>
      <div className="in">
        <ul className="ledger">
          {inc.claims.map((c) => {
            const isContest = c.asserts_stage === 0;
            const target = isContest ? inc.claims.find((x) => x.id === c.contests) : null;
            const meta = isContest ? null : stageMeta(c.asserts_stage);
            return (
              <li
                key={c.id}
                id={c.id}
                className={isContest ? 'contest' : ''}
                style={{ ['--c' as string]: isContest ? 'var(--flag)' : meta!.color }}
              >
                <span className="st">{isContest ? 'חולק על' : meta!.he}</span>
                <div className="src">
                  {c.source}
                  {isContest && target && (
                    <span style={{ color: 'var(--muted)' }}>
                      {' '}← על הטענה &quot;{stageMeta(target.asserts_stage).he}&quot;
                    </span>
                  )}
                  <small>
                    {TYPES[c.source_type].he}
                    {c.place ? ` · ${placeById(c.place)?.he}` : ''} · <SourceLink claim={c} />
                  </small>
                </div>
                <span className="dt num">{c.date}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}


/** The item route's empty state: this environment has nothing published yet. */
function NothingPublished() {
  return (
    <>
      <Header compact />
      <div className="wrap">
        <section className="view active">
          <div className="pagehead">
            <h2>אין עדיין כשלים שפורסמו</h2>
            <span className="sub">הפנקס נבנה. כשל מופיע כאן רק אחרי שכל טענה בו קושרה למקור.</span>
          </div>
          <div className="soon">
            <p>
              אפשר לחזור ל<Link href="/">מפת הכשלים</Link> או לקרוא על השיטה
              ב<Link href="/about/">עמוד הפרויקט</Link>.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}


/**
 * What the sources say at the incident's current stage, in the editor's words,
 * with every sentence citing the claims it rests on. A port of the prototype's
 * aisum block. It renders only when such a summary exists: an incident without
 * one is complete, just terser, and an empty summary box would be worse than
 * none.
 */
function StageSummary({ inc, stage }: { inc: Incident; stage: number }) {
  const summary = inc.summaries?.find((s) => s.stage === stage);
  if (!summary) return null;

  const heading =
    stage === 2 ? ['ההכרה בכשל', 'בלשון המקור']
    : stage === 3 ? ['התוכנית שהוכרזה · סיכום', 'כל משפט מקושר למקור']
    : stage === 6 ? ['הנסיגה · סיכום', 'כל משפט מקושר למקור']
    : ['מה יושם בפועל · סיכום', 'כל משפט מקושר למקור'];

  // Footnote numbers are per overview and follow the order the claims are cited.
  const order: string[] = [];
  const noteOf = (id: string) => {
    if (!order.includes(id)) order.push(id);
    return order.indexOf(id) + 1;
  };

  // One paragraph per cite span, which is how the old lines[] rendered. The
  // annotation inside a span is not interpreted here yet - the chips, the
  // highlight and the carousel are DIA-372. Until then the panel shows the
  // words and the sources under them, which is what it showed before.
  const spans = parseAnnotation(summary.text).spans;

  return (
    <div className="aisum">
      <div className="lbl"><span>{heading[0]}</span><span>{heading[1]}</span></div>
      {spans.map((span, n) => (
        <p key={n}>
          {plainText(span.text)}
          {span.ids.map((id) => (
            <sup key={id}><a href={`#${id}`}>[{noteOf(id)}]</a></sup>
          ))}
        </p>
      ))}
    </div>
  );
}
