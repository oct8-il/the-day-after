import { sourceLineText, type SourceLine } from '@/lib/deck';

/**
 * Slide 1 — the gate (DIA-378, spec §4).
 *
 * The post's slide 1 recomposed for 390 × 844, not the 4:5 post image
 * letterboxed. Top to bottom: breadcrumb, stage rail, then the title block
 * anchored to the bottom — the breadcrumb, dots and footer belong to the deck's
 * docked chrome, so only the rail and the title are here.
 *
 * Nothing on this screen is authored. The rail, the age line, the source line
 * and the number all come from the ledger through helpers written and tested in
 * Phase 1; this file arranges them.
 *
 * Rendered on the server: there is nothing to interact with, and the gate is
 * the first thing a reader sees, so it should not wait for hydration.
 */

export type GateRung = {
  n: number;
  he: string;
  color: string;
  reached: boolean;
  current: boolean;
};

export type GateProps = {
  /** Five rungs, chronological. Stage 6 appears only when it has happened. */
  rail: GateRung[];
  /** `18 ימים אחרי 7.10 · 25.10.2023`, or the date alone when the source dated
   *  itself to a month. Null when the current stage has no dated claim. */
  age: string | null;
  title: string;
  source: SourceLine;
  number: number | null;
  total: number;
  photo: { src: string; alt: string; credit: string } | null;
};

/**
 * The gate's ground, rendered by the deck rather than by this slide.
 *
 * In the spec's screen the field runs to all four edges and the breadcrumb,
 * dots and footer sit on it. The deck's chrome is docked - it is in the deck's
 * own column, outside the track - so a ground painted inside the slide stops
 * where the track stops and leaves a seam under the dots. It is painted at
 * deck level instead, behind everything, and shown only while the gate is the
 * slide in view.
 */
export function GateGround({ rail, number, total, photo }: Pick<GateProps, 'rail' | 'number' | 'total' | 'photo'>) {
  const current = rail.find((r) => r.current);
  // Full-bleed to all four edges, duotoned in the current stage's colour.
  // mix-blend-mode:color takes hue and saturation from the tint and luminosity
  // from the photograph, so the result is monochrome in the stage's hue
  // whatever the original's colours were - which is why any photograph works
  // and legibility never depends on one.
  return (
      <div className="deck-gate-ground" style={{ ['--c' as string]: current?.color ?? 'var(--s1)' }}>
        {photo ? (
          <>
            <img className="deck-gate-photo" src={photo.src} alt={photo.alt} />
            <i className="deck-gate-tint" />
          </>
        ) : (
          <>
            {/* No photograph: the stage-colour field the duotone would have
                left, a hairline texture so the surface is not dead, and the
                item's number as a ghost. Nothing announces the absence. */}
            <i className="deck-gate-field" />
            <i className="deck-gate-grain" />
            <i className="deck-gate-glow" />
            {number !== null && (
              <div className="deck-gate-ghost" aria-hidden="true">
                <span className="serif">{number}</span>
                <span>מתוך {total}</span>
              </div>
            )}
          </>
        )}
        {/* Behind the rail, full height, so the labels hold against a bright
            photograph without a box being drawn around them. */}
        <i className="deck-gate-edge" />
        {/* One continuous shading pass, never a fade to black. */}
        <i className="deck-gate-shade" />
      </div>
  );
}

export function Gate({ rail, age, title, source }: Omit<GateProps, 'number' | 'total' | 'photo'>) {

  return (
    <div className="deck-gate">
      {/* --- the rail ---------------------------------------------------- */}
      <ol className="deck-gate-rail">
        {rail.map((r) => {
          return (
            <li key={r.n} className="deck-gate-rung" style={{ ['--c' as string]: r.color }}>
              <i className={r.reached ? '' : 'off'} />
              <span className={r.current ? 'now' : r.reached ? '' : 'off'}>
                {r.he}
                {r.current && age && <b>{age}</b>}
              </span>
            </li>
          );
        })}
      </ol>

      {/* --- the title block --------------------------------------------- */}
      <div className="deck-gate-title">
        <h1 className="serif">{title}</h1>
        <p>{sourceLineText(source)}</p>
      </div>
    </div>
  );
}
