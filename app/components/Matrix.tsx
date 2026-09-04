'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import type { ParentCell } from '@/lib/home';

/**
 * The failure matrix: who failed x when, and the tray that opens inside it.
 *
 * The DOM is grouped by WHO - domain first, then the phases within it. That is
 * the order a phone reads, because a single column cannot show two dimensions
 * at once and "which part of the state failed" is the one worth keeping; the
 * phase survives as a label on each tile rather than as a heading. On a wide
 * screen the same elements are placed explicitly into the grid by the --col and
 * --row custom properties below, so the desktop still reads as a table with
 * domains across and phases down. One DOM, two readings, no duplicated markup.
 *
 * The tray is a full-width row of that same grid, inserted directly beneath the
 * row of tiles it belongs to, with a notch pointing at the tile that opened it.
 * On desktop the rows below it are pushed down a line to make room; on a phone
 * it simply follows the tile that was tapped.
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

  useEffect(() => {
    if (!open || !trayRef.current) return;
    const r = trayRef.current.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      trayRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [open]);

  const all = Object.values(cells).flat();
  const current = all.find((p) => p.id === open) ?? null;
  const openKey = current
    ? Object.entries(cells).find(([, list]) => list.some((p) => p.id === current.id))?.[0]
    : null;
  const [openDomain, openPhase] = openKey ? openKey.split('/') : [null, null];
  const openPhaseIndex = openPhase ? phases.findIndex((p) => p.id === openPhase) : -1;

  /** Desktop rows shift down by one below the tray, to make room for it. */
  const rowOf = (phaseIndex: number) =>
    phaseIndex + 2 + (openPhaseIndex >= 0 && phaseIndex > openPhaseIndex ? 1 : 0);

  return (
    <div className="matrix" id="matrix">
      {/* Phase names, down the side. Placed explicitly; on a phone they give way
          to the label each tile carries. */}
      {phases.map((ph, pi) => (
        <div className="rowh" key={ph.id} style={{ ['--col' as string]: 1, ['--row' as string]: rowOf(pi) }}>
          {ph.he}
        </div>
      ))}

      {domains.map((d, di) => (
        <Fragment key={d.id}>
          <div className="colh" style={{ ['--col' as string]: di + 2, ['--row' as string]: 1 }}>
            {d.he}
          </div>

          {phases.map((ph, pi) => {
            const list = cells[`${d.id}/${ph.id}`] ?? [];
            const place = { ['--col' as string]: di + 2, ['--row' as string]: rowOf(pi) };
            if (!list.length) return <div className="cell empty" key={ph.id} style={place}>·</div>;
            return (
              <Fragment key={ph.id}>
                <div className="cell" style={place}>
                  {list.map((p) => (
                    <Tile
                      key={p.id}
                      parent={p}
                      phase={ph.he}
                      isOpen={open === p.id}
                      onToggle={close}
                    />
                  ))}
                </div>

                {current && openDomain === d.id && openPhase === ph.id && (
                  <div
                    className="drawer"
                    id="drawer"
                    ref={trayRef}
                    style={{
                      ['--c' as string]: current.color,
                      ['--row' as string]: openPhaseIndex + 3,
                    }}
                  >
                    <div className="notchrow" aria-hidden="true">
                      <div />
                      {domains.map((x) => (
                        <div key={x.id}>{x.id === openDomain && <i className="notch" />}</div>
                      ))}
                    </div>
                    <Tray parent={current} onClose={close} />
                  </div>
                )}
              </Fragment>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

function Tile({
  parent, phase, isOpen, onToggle,
}: {
  parent: ParentCell; phase: string; isOpen: boolean; onToggle: () => void;
}) {
  return (
    <a
      className={`tile${isOpen ? ' on' : ''}`}
      href={`#${parent.id}`}
      aria-expanded={isOpen}
      aria-controls="drawer"
      style={{ ['--c' as string]: parent.color }}
      onClick={(e) => {
        // Pressing the open failure again closes it. Anything else would leave
        // the only way out of a tray being to find some neutral pixel, which on
        // a phone there may not be.
        if (isOpen) { e.preventDefault(); onToggle(); }
      }}
    >
      {/* The other half of the matrix, for a screen too narrow to draw it. */}
      <span className="when">{phase}</span>
      <div className="ico"><Icon name={parent.icon} /></div>
      <div className="lab">{parent.short}</div>
      <div className="foot">
        <div className="score" title="חלוקת האירועים לפי שלב">
          {parent.distribution.map((d) => (
            <span key={d.stage} style={{ width: `${d.share}%`, background: d.color }} />
          ))}
        </div>
        <div className="st num">{parent.implemented} מ־{parent.count} יושמו</div>
      </div>
    </a>
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
