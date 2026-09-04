import { Fragment } from 'react';
import { Header } from './components/Header';
import { Matrix } from './components/Matrix';
import { HomeIntro } from './components/HomeIntro';
import { MarkSeen } from './components/MarkSeen';
import { daysSince } from '@/lib/days';
import { buildMatrix, buildStrip } from '@/lib/home';
import { placeById } from '@/lib/data';

/**
 * The matrix home. The main view: who failed x when, as a grid of icon tiles,
 * with a headline strip above it. Every number on this page is computed from
 * the ledger - nothing here is typed in by hand.
 */
export default function Home() {
  const strip = buildStrip();
  const { domains, phases, cells } = buildMatrix((id) => placeById(id)?.he);

  return (
    <>
      <Header current="home" />
      <MarkSeen />
      <HomeIntro />
      <div className="wrap">
        <section className="view active">
          <div className="strip">
            <div className="days">
              <div className="k">ימים מאז 7.10.2023</div>
              <div className="data"><div className="v num">{daysSince().toLocaleString('he-IL')}</div></div>
            </div>
            <div>
              <div className="k">כשלים במעקב</div>
              <div className="data">
                <div className="v num">
                  {strip.incidents}
                  <small>ב־<span id="pcount">{strip.parents}</span> כשלים מערכתיים</small>
                </div>
              </div>
            </div>
            <div className="wide">
              <div className="k">היכן הם עומדים לפי המקורות</div>
              <div className="data">
                <div className="ladder6">
                  {/* Fragments, not wrapper elements: .ladder6 is a grid whose
                      end caps are :first-child and :nth-child(5), so the cells
                      must be its real children. A wrapper - even one with
                      display:contents - makes every cell the first child of its
                      own box, and the five stages stop reading as one bar. */}
                  {strip.ladder.map((s) => (
                    <Fragment key={s.stage}>
                      {s.stage === 6 && <span className="div" />}
                      <div
                        className={`cell6${s.count ? '' : ' zero'}${s.stage === 6 ? ' exit' : ''}`}
                        style={{ ['--c' as string]: s.color }}
                        title={s.full}
                      >
                        <span className="c num">{s.count}</span>
                        <span className="l">{s.he}</span>
                      </div>
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
            <div className="gap">
              <div className="k">במחלוקת</div>
              <div className="data">
                <div className="v num">
                  {strip.contested}
                  <small>כשלים שהמקורות עליהם סותרים זה את זה</small>
                </div>
              </div>
            </div>
          </div>

          <div className="pagehead">
            <h2>מפת הכשלים</h2>
            <span className="sub">מי נכשל × מתי · לחיצה על ריבוע פותחת את האירועים</span>
          </div>

          <Matrix domains={domains} phases={phases} cells={cells} />
        </section>
      </div>
    </>
  );
}
