import { places, placeById, TYPES, type Claim } from '@/lib/data';

/**
 * Where the evidence was documented. A port of the prototype's drawMap: the
 * frame defaults to the Gaza envelope and widens if a source sits outside it,
 * the aspect ratio is held so the coastline never distorts, and every pin is a
 * source rather than an incident - the place belongs to the claim.
 *
 * Rendered on the server as plain SVG. No map library, no tiles, no third-party
 * requests from a reader's browser.
 */
const W = 640;
const H = 420;

const COAST: [number, number][] = [
  [32.6, 34.85], [32.2, 34.8], [31.9, 34.7], [31.66, 34.56], [31.62, 34.52], [31.6, 34.5],
  [31.56, 34.48], [31.5, 34.42], [31.42, 34.33], [31.34, 34.27], [31.3, 34.23], [31.25, 34.18], [31.0, 34.0],
];
const GAZA: [number, number][] = [
  [31.6, 34.5], [31.59, 34.53], [31.555, 34.545], [31.5, 34.5], [31.47, 34.478], [31.42, 34.45],
  [31.37, 34.385], [31.31, 34.37], [31.26, 34.33], [31.22, 34.28], [31.3, 34.23], [31.34, 34.27],
  [31.42, 34.33], [31.5, 34.42], [31.56, 34.48], [31.6, 34.5],
];

export type Pin = { place: string; type: Claim['source_type']; src: string };

export function pinsOf(claims: Claim[]): Pin[] {
  return claims
    .filter((c) => c.place)
    .map((c) => ({ place: c.place as string, type: c.source_type, src: c.source }));
}

export function EvidenceMap({ pins }: { pins: Pin[] }) {
  const pts = pins.map((p) => placeById(p.place)!).filter(Boolean);
  const lons = pts.map((p) => p.lon);
  const lats = pts.map((p) => p.lat);

  let lon0 = 34.18, lon1 = 34.86, lat0 = 31.66, lat1 = 31.17;
  const pad = 0.06;
  lon0 = Math.min(lon0, ...lons.map((v) => v - pad));
  lon1 = Math.max(lon1, ...lons.map((v) => v + pad));
  lat0 = Math.max(lat0, ...lats.map((v) => v + pad));
  lat1 = Math.min(lat1, ...lats.map((v) => v - pad));

  const kx = (lon1 - lon0) * Math.cos((31.4 * Math.PI) / 180);
  const ky = lat0 - lat1;
  const asp = W / H;
  if (kx / ky > asp) {
    const need = kx / asp, c = (lat0 + lat1) / 2;
    lat0 = c + need / 2; lat1 = c - need / 2;
  } else {
    const need = (ky * asp) / Math.cos((31.4 * Math.PI) / 180), c = (lon0 + lon1) / 2;
    lon0 = c - need / 2; lon1 = c + need / 2;
  }

  const X = (lon: number) => ((lon - lon0) / (lon1 - lon0)) * W;
  const Y = (lat: number) => ((lat0 - lat) / (lat0 - lat1)) * H;
  const path = (p: [number, number][]) =>
    p.map(([la, lo], n) => (n ? 'L' : 'M') + X(lo).toFixed(1) + ' ' + Y(la).toFixed(1)).join(' ') + ' Z';

  const shown = new Set(pins.map((p) => p.place));
  const context = places.filter((p) => {
    if (shown.has(p.id)) return false;
    const x = X(p.lon), y = Y(p.lat);
    return x >= 0 && x <= W && y >= 0 && y <= H;
  });

  const grouped = new Map<string, Pin[]>();
  for (const p of pins) grouped.set(p.place, [...(grouped.get(p.place) ?? []), p]);

  return (
    <svg className="map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="מיקומי המקורות">
      <path d={path([[33, 33.5], ...COAST, [30.5, 33.5]])} fill="var(--sea)" />
      <path d={path(GAZA)} fill="var(--gaza)" stroke="var(--line)" strokeWidth="1" />
      <text className="maplabel" x={X(34.36)} y={Y(31.42)} textAnchor="middle">רצועת עזה</text>

      {context.map((p) => (
        <g key={p.id}>
          <circle cx={X(p.lon)} cy={Y(p.lat)} r="1.8" fill="var(--muted)" />
          <text className="placelabel" x={X(p.lon) + 4} y={Y(p.lat) + 3}>{p.he}</text>
        </g>
      ))}

      {[...grouped.entries()].map(([id, arr]) => {
        const p = placeById(id)!;
        const x = X(p.lon), y = Y(p.lat);
        return (
          <g className="pin" key={id}>
            {arr.map((c, idx) => {
              const ang = (idx / arr.length) * Math.PI * 2;
              const r = arr.length > 1 ? 6 : 0;
              return (
                <circle
                  className="core"
                  key={`${id}-${idx}`}
                  cx={x + Math.cos(ang) * r}
                  cy={y + Math.sin(ang) * r}
                  r="6"
                  fill={TYPES[c.type].color}
                >
                  <title>{c.src}</title>
                </circle>
              );
            })}
            {/* Clear the pin - a place with several sources draws them in a
                ring, and on a phone the dots are bigger than on a desktop. */}
            <text
              x={p.labelLeft ? x - (arr.length > 1 ? 22 : 14) : x + (arr.length > 1 ? 22 : 14)}
              y={y + 4}
              textAnchor={p.labelLeft ? 'end' : 'start'}
            >
              {p.he}{arr.length > 1 ? ` · ${arr.length}` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
