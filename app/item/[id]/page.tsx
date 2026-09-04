import type { Metadata } from 'next';
import Link from 'next/link';
import {
  parentById, placeById, childrenOf, visibleIncidents,
  stageOf, isContested, stageMeta, taxonomy, TYPES, QUESTIONS,
  type Claim, type Incident,
} from '@/lib/data';
import { EvidenceMap, pinsOf } from '@/app/components/EvidenceMap';
import { ItemDock } from '@/app/components/ItemDock';
import { ItemIntro } from '@/app/components/ItemIntro';
import { Header } from '@/app/components/Header';
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
    description: inc.summary.slice(0, 200),
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

  const chapters = [
    { n: 1, t: 'הבעיה', color: 'var(--s2)', d: 'מה נכשל' },
    { n: 2, t: 'ההתקדמות', color: S.color, d: 'מה נעשה מאז' },
    { n: 3, t: 'דעת הציבור', color: 'var(--accent)', d: 'מה הציבור חושב' },
  ];

  return (
    <>
      <Header />

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
              <p className="lead">{inc.summary}</p>

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
      <Header />
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

  // Footnote numbers are per summary and follow the order the claims are cited.
  const order: string[] = [];
  const noteOf = (id: string) => {
    if (!order.includes(id)) order.push(id);
    return order.indexOf(id) + 1;
  };

  return (
    <div className="aisum">
      <div className="lbl"><span>{heading[0]}</span><span>{heading[1]}</span></div>
      {summary.lines.map((line, n) => (
        <p key={n}>
          {line.text}
          {line.cites.map((id) => (
            <sup key={id}><a href={`#${id}`}>[{noteOf(id)}]</a></sup>
          ))}
        </p>
      ))}
    </div>
  );
}
