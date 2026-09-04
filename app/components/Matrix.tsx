'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import type { ParentCell } from '@/lib/home';

/**
 * The failure matrix: who failed x when. A port of the prototype's matrix and
 * openParent - clicking a tile opens the drawer beneath the grid with that
 * failure's incidents.
 *
 * The open parent lives in the URL hash, so a drawer can be linked to and the
 * back button closes it, exactly as the prototype's #/parent/<id> did.
 */
export function Matrix({
  domains, phases, cells,
}: {
  domains: { id: string; he: string }[];
  phases: { id: string; he: string }[];
  cells: Record<string, ParentCell[]>;
}) {
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      const h = location.hash.replace(/^#/, '');
      setOpen(h && /^p\d+$/.test(h) ? h : null);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const all = Object.values(cells).flat();
  const current = all.find((p) => p.id === open) ?? null;

  return (
    <>
      <div className="matrix" id="matrix">
        <div />
        {domains.map((d) => <div className="colh" key={d.id}>{d.he}</div>)}
        {phases.map((ph) => (
          <Row key={ph.id} phase={ph} domains={domains} cells={cells} open={open} />
        ))}
      </div>

      <div className="drawer" hidden={!current} style={current ? { ['--c' as string]: current.color } : undefined}>
        {current && (
          <>
            <div className="dh">
              <div><Icon name={current.icon} /></div>
              <div>
                <div className="t">{current.he}</div>
                <div className="d">
                  {current.description} · {current.count} אירועים · שלב ממוצע {current.stage} · {current.stageHe}
                </div>
              </div>
              <button
                className="close"
                aria-label="סגירה"
                onClick={() => { history.pushState(null, '', location.pathname); setOpen(null); }}
              >
                ×
              </button>
            </div>
            <div className="kids">
              {current.children.map((k) => (
                <Link className="row" href={`/item/${k.id}/`} key={k.id}>
                  <div>
                    <span>{k.he}</span>
                    <span className="pl">
                      {k.places.length
                        ? k.places.slice(0, 3).join(', ') + (k.places.length > 3 ? ` +${k.places.length - 3}` : '')
                        : 'ארצי'}
                    </span>
                  </div>
                  <span className="chip" style={{ ['--c' as string]: k.color }}>
                    {k.stage} · {k.stageHe}{k.contested ? ' · במחלוקת' : ''}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Row({
  phase, domains, cells, open,
}: {
  phase: { id: string; he: string };
  domains: { id: string; he: string }[];
  cells: Record<string, ParentCell[]>;
  open: string | null;
}) {
  return (
    <>
      <div className="rowh">{phase.he}</div>
      {domains.map((d) => {
        const list = cells[`${d.id}/${phase.id}`] ?? [];
        if (!list.length) return <div className="cell empty" key={d.id}>·</div>;
        return (
          <div className="cell" key={d.id}>
            {list.map((p) => (
              <a
                className={`tile${open === p.id ? ' on' : ''}`}
                data-id={p.id}
                key={p.id}
                href={`#${p.id}`}
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
    </>
  );
}
