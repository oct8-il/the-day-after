'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import type { ParentCell } from '@/lib/home';

/**
 * The failure matrix: who failed x when, and the tray that opens inside it.
 *
 * The tray is a full-width row of the same grid, inserted directly beneath the
 * row of tiles it belongs to, with a notch pointing at the tile that opened it.
 * That is the whole idea: the grid opens rather than pushing a separate panel
 * to the bottom of the page, so the answer arrives where the reader's eye
 * already is - and on a phone, where the grid stacks, right under the tile they
 * tapped.
 *
 * The open failure lives in the URL hash, so a tray can be linked to and the
 * back button closes it, as #/parent/<id> did in the prototype.
 */
export function Matrix({
  domains, phases, cells,
}: {
  domains: { id: string; he: string }[];
  phases: { id: string; he: string }[];
  cells: Record<string, ParentCell[]>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const trayRef = useRef<HTMLDivElement>(null);

  const close = () => {
    if (location.hash) history.pushState(null, '', location.pathname);
    setOpen(null);
  };

  useEffect(() => {
    const read = () => {
      const h = location.hash.replace(/^#/, '');
      setOpen(h && /^p\d+$/.test(h) ? h : null);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    // Anywhere outside the tray or a tile closes it. A reader who has finished
    // with a failure should not have to find a small x to say so.
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.drawer') || t.closest('.tile')) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  // Keep the tray in view when it opens below the fold - on a phone the grid is
  // a tall single column and the tray can otherwise open off-screen.
  useEffect(() => {
    if (!open || !trayRef.current) return;
    const r = trayRef.current.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      trayRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [open]);

  const all = Object.values(cells).flat();
  const current = all.find((p) => p.id === open) ?? null;
  const openPhase = current
    ? Object.entries(cells).find(([, list]) => list.some((p) => p.id === current.id))?.[0].split('/')[1]
    : null;
  const openDomain = current
    ? Object.entries(cells).find(([, list]) => list.some((p) => p.id === current.id))?.[0].split('/')[0]
    : null;

  return (
    <div className="matrix" id="matrix">
      <div />
      {domains.map((d) => <div className="colh" key={d.id}>{d.he}</div>)}

      {phases.map((ph) => (
        <Fragment key={ph.id}>
          <div className="rowh">{ph.he}</div>
          {domains.map((d) => {
            const list = cells[`${d.id}/${ph.id}`] ?? [];
            if (!list.length) return <div className="cell empty" key={d.id}>·</div>;
            return (
              <div className="cell" key={d.id}>
                {list.map((p) => (
                  <a
                    className={`tile${open === p.id ? ' on' : ''}`}
                    key={p.id}
                    href={`#${p.id}`}
                    aria-expanded={open === p.id}
                    aria-controls="drawer"
                    style={{ ['--c' as string]: p.color }}
                  >
                    <div className="ico"><Icon name={p.icon} /></div>
                    <div className="lab">{p.short}</div>
                    <div className="foot">
                      <div className="score" title="חלוקת האירועים לפי שלב">
                        {p.distribution.map((d2) => (
                          <span key={d2.stage} style={{ width: `${d2.share}%`, background: d2.color }} />
                        ))}
                      </div>
                      <div className="st num">{p.implemented} מ־{p.count} יושמו</div>
                    </div>
                  </a>
                ))}
              </div>
            );
          })}

          {current && openPhase === ph.id && (
            <div
              className="drawer"
              id="drawer"
              ref={trayRef}
              style={{ ['--c' as string]: current.color }}
            >
              <div className="notchrow" aria-hidden="true">
                <div />
                {domains.map((d) => (
                  <div key={d.id}>{d.id === openDomain && <i className="notch" />}</div>
                ))}
              </div>
              <Tray parent={current} onClose={close} />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

function Tray({ parent, onClose }: { parent: ParentCell; onClose: () => void }) {
  return (
    <>
      <div className="dh">
        <div className="ico"><Icon name={parent.icon} /></div>
        <div>
          <div className="t">{parent.he}</div>
          <div className="d">{spread(parent)}</div>
        </div>
        <button className="close" aria-label="סגירת הכשל" onClick={onClose}>×</button>
      </div>

      {parent.children.length === 0 ? (
        <div className="kids empty">
          עדיין לא פורסם כאן אף אירוע. אירוע מופיע רק אחרי שכל טענה בו קושרה למקור.
        </div>
      ) : (
        <div className="kids">
          {parent.children.map((k, n) => (
            <Link
              className="row"
              href={`/item/${k.id}/`}
              key={k.id}
              style={{ ['--c' as string]: k.color, ['--d' as string]: `${Math.min(n, 8) * 0.035}s` }}
            >
              <div className="tx">
                <span className="t">{k.he}</span>
                <small>
                  {k.places.length
                    ? k.places.slice(0, 3).join(', ') + (k.places.length > 3 ? ` +${k.places.length - 3}` : '')
                    : 'ארצי'}
                  {' · '}{k.claims} טענות
                  <Since iso={k.lastSource} />
                </small>
              </div>
              <span className="chips">
                {k.contested && <span className="chip" style={{ ['--c' as string]: 'var(--flag)' }}>במחלוקת</span>}
                <span className="chip" style={{ ['--c' as string]: k.color }}>{k.stage} · {k.stageHe}</span>
              </span>
              <span className="go" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * The header line the prototype spent on an average stage. A mean of stage
 * ordinals is the one number on this site no source can vouch for - a parent
 * whose incidents sit at 3 and 5 is not "at 4" - so this says what the
 * distribution actually says instead.
 */
function spread(p: ParentCell): string {
  const parts = [`${p.count} אירועים`];
  if (p.regressed) parts.push(`${p.regressed} נסוגו`);
  if (p.atStageOne) parts.push(`${p.atStageOne} עדיין רק זוהו`);
  parts.push(p.verified ? `${p.verified} אומתו עצמאית` : 'אף אחד לא אומת עצמאית');
  return parts.join(' · ');
}

/**
 * How long since any source said anything. Computed in the reader's browser:
 * a static build bakes in the day it was built, and this number is the point.
 */
function Since({ iso }: { iso: string | null }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!iso) return;
    const months = Math.floor((Date.now() - new Date(iso).getTime()) / 2.6298e9);
    if (months < 1) return setText('מקור מהחודש האחרון');
    if (months < 12) return setText(`ללא מקור חדש ${months} חודשים`);
    const years = Math.floor(months / 12);
    setText(years === 1 ? 'ללא מקור חדש למעלה משנה' : `ללא מקור חדש למעלה מ־${years} שנים`);
  }, [iso]);
  if (!text) return null;
  return <> · <b className="since">{text}</b></>;
}
