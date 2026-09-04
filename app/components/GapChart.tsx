/**
 * The gap chart's frame: stage by the sources across, public rating up, and the
 * band where the two disagree picked out. A port of the prototype's gap chart
 * with the points left out - each point is an incident's public rating, and
 * voting is Phase 5. The axes ship now because the frame is the argument; the
 * points arrive when there is something honest to plot.
 */
const W = 640, H = 400, L = 40, R = 20, T = 24, B = 48;
const X = (s: number) => L + ((s - 2.5) / 3) * (W - L - R);
const Y = (v: number) => T + ((5 - v) / 4) * (H - T - B);

export function GapChart({ stages }: { stages: { n: number; he: string }[] }) {
  return (
    <svg className="gap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="שלב לפי המקורות מול ציון הציבור">
      <rect className="zone" x={X(3.5)} y={Y(2.5)} width={X(5.5) - X(3.5)} height={Y(1) - Y(2.5)} />
      <text className="zonelbl" x={X(4.5)} y={Y(1.15)} textAnchor="middle">דווח כמיושם, מדורג נמוך</text>

      {[1, 2, 3, 4, 5].map((v) => (
        <g key={v}>
          <line className="ax" x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} />
          <text className="lbl" x={L - 6} y={Y(v) + 4} textAnchor="end">{v}</text>
        </g>
      ))}

      {[3, 4, 5].map((st) => (
        <g key={st}>
          <text className="lbl" x={X(st)} y={H - B + 18} textAnchor="middle">{st}</text>
          <text className="lbl" x={X(st)} y={H - B + 32} textAnchor="middle">
            {stages.find((s) => s.n === st)?.he}
          </text>
        </g>
      ))}

      <text className="lbl" x={L} y={T - 10} textAnchor="start">↑ ציון הציבור למענה (1–5)</text>
      {/* Top right, opposite the y-axis caption: at the bottom it collided with
          the stage-5 label, whose name is the longest of the three. */}
      <text className="lbl" x={W - R} y={T - 10} textAnchor="end">שלב לפי המקורות →</text>

      <text className="gapsoon" x={(L + W - R) / 2} y={Y(3.6)} textAnchor="middle">
        אין עדיין נקודות על הגרף
      </text>
      <text className="gapsoon sub" x={(L + W - R) / 2} y={Y(3.6) + 22} textAnchor="middle">
        כל נקודה היא כשל, וגובהה הוא הדירוג שהציבור נתן למענה
      </text>
    </svg>
  );
}
