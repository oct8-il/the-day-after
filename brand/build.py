"""Build the היום שאחרי logo asset pack: outlined SVG wordmarks, favicon set, OG source.
Glyphs are shaped with HarfBuzz and outlined with fontTools, so nothing depends on a font at view time."""
import json, math, os, io
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = 'brand'
os.makedirs(OUT, exist_ok=True)
FS = 'node_modules/@fontsource'
FRANK = f'{FS}/frank-ruhl-libre/files/frank-ruhl-libre-hebrew-500-normal.woff2'
PLEX = f'{FS}/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2'

# Site tokens (app/globals.css)
DARK = dict(bg='#121519', text='#e9e6df', muted='#8a939e', accent='#e0a44a')
LIGHT = dict(bg='#f6f4ef', text='#1d2126', muted='#6c7580', accent='#b97a1c')

def load(path):
    tt = TTFont(path); tt.flavor = None
    buf = io.BytesIO(); tt.save(buf)          # HarfBuzz reads sfnt, not woff2
    blob = hb.Blob(buf.getvalue())
    face = hb.Face(blob); font = hb.Font(face)
    return tt, font

def shape_outline(tt, hbfont, text, size, x_right, baseline, rtl):
    """Return (path d, advance width) for `text` set at `size` units, with its RIGHT edge at x_right
    (RTL) or LEFT edge at x_right (LTR, then x_right is the left edge)."""
    upm = tt['head'].unitsPerEm; s = size / upm
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(hbfont, buf, {'kern': True, 'liga': True})
    infos, poss = buf.glyph_infos, buf.glyph_positions
    total = sum(p.x_advance for p in poss) * s
    gs = tt.getGlyphSet(); order = tt.getGlyphOrder()
    pen = SVGPathPen(gs, ntos=lambda v: f'{v:.2f}')
    # HarfBuzz returns glyphs in visual (left-to-right) order for RTL runs too.
    x0 = (x_right - total) if rtl else x_right
    x = x0
    for i, p in zip(infos, poss):
        g = gs[order[i.codepoint]]
        tp = TransformPen(pen, (s, 0, 0, -s, x + p.x_offset * s, baseline - p.y_offset * s))
        g.draw(tp)
        x += p.x_advance * s
    return pen.getCommands(), total

frank_tt, frank_hb = load(FRANK)
plex_tt, plex_hb = load(PLEX)
def metrics(tt, size):
    upm = tt['head'].unitsPerEm; h = tt['hhea']
    return h.ascent * size / upm, -h.descent * size / upm

# ---------- geometry (1em = 100 units, matching the CSS in the approved page) ----------
BAR_W, GAP, WORD, LH = 13, 11, 50, 49          # .13em bar, .11em gap, .5em words, .98 line-height
DATE, DATE_LH, DATE_GAP, DATE_PAD = 17, 20.4, 6, 4

def stacked(theme):
    asc, desc = metrics(frank_tt, WORD); lead = (LH - (asc + desc)) / 2
    # widths: measure first
    _, w1 = shape_outline(frank_tt, frank_hb, 'היום', WORD, 0, 0, True)
    _, w2 = shape_outline(frank_tt, frank_hb, 'שאחרי', WORD, 0, 0, True)
    _, wd = shape_outline(plex_tt, plex_hb, '7.10.2023', DATE, 0, 0, False)
    words_w = max(w1, w2)
    W = words_w + GAP + BAR_W
    H = 2 * LH + DATE_GAP + DATE_LH
    xr = W - BAR_W - GAP                          # right edge of the words
    p1, _ = shape_outline(frank_tt, frank_hb, 'היום', WORD, xr, lead + asc, True)
    p2, _ = shape_outline(frank_tt, frank_hb, 'שאחרי', WORD, xr, LH + lead + asc, True)
    dasc, ddesc = metrics(plex_tt, DATE); dlead = (DATE_LH - (dasc + ddesc)) / 2
    pd, _ = shape_outline(plex_tt, plex_hb, '7.10.2023', DATE, W - DATE_PAD - wd, 2 * LH + DATE_GAP + dlead + dasc, False)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.2f} {H:.2f}" width="{W:.0f}" height="{H:.0f}">'
           f'<title>היום שאחרי · 7.10.2023</title>'
           f'<rect x="{W-BAR_W:.2f}" y="0" width="{BAR_W}" height="{2*LH}" rx="1" fill="{theme["accent"]}"/>'
           f'<path fill="{theme["text"]}" d="{p1} {p2}"/>'
           f'<path fill="{theme["muted"]}" d="{pd}"/></svg>')
    return svg, W, H

def inline(theme):
    asc, desc = metrics(frank_tt, WORD); lh = WORD; lead = (lh - (asc + desc)) / 2
    SP = 20                                        # .2em gap between the two words
    _, w1 = shape_outline(frank_tt, frank_hb, 'היום', WORD, 0, 0, True)
    _, w2 = shape_outline(frank_tt, frank_hb, 'שאחרי', WORD, 0, 0, True)
    W = w1 + SP + w2 + GAP + BAR_W; H = lh
    xr = W - BAR_W - GAP
    p1, _ = shape_outline(frank_tt, frank_hb, 'היום', WORD, xr, lead + asc, True)
    p2, _ = shape_outline(frank_tt, frank_hb, 'שאחרי', WORD, xr - w1 - SP, lead + asc, True)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.2f} {H:.2f}" width="{W:.0f}" height="{H:.0f}">'
           f'<title>היום שאחרי</title>'
           f'<rect x="{W-BAR_W:.2f}" y="0" width="{BAR_W}" height="{H}" rx="1" fill="{theme["accent"]}"/>'
           f'<path fill="{theme["text"]}" d="{p1} {p2}"/></svg>')
    return svg, W, H

# ---------- favicon: inverted tile, bar, outlined 8 ----------
EIGHT = json.load(open('eight.json'))['700-13']
def tile_svg(tile, bar, glyph, rx=4, size=None, media=None):
    """32-grid tile. `media`: optional (dark_colors, light_colors) → theme-aware SVG via prefers-color-scheme."""
    dim = f' width="{size}" height="{size}"' if size else ''
    style = ''
    if media:
        d, l = media
        style = (f'<style>rect.t{{fill:{l[0]}}}rect.b{{fill:{l[1]}}}path.g{{fill:{l[2]}}}'
                 f'@media (prefers-color-scheme:dark){{rect.t{{fill:{d[0]}}}rect.b{{fill:{d[1]}}}path.g{{fill:{d[2]}}}}}</style>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"{dim}>{style}'
            f'<rect class="t" width="32" height="32" rx="{rx}" fill="{tile}"/>'
            f'<g transform="translate(4 4)"><rect class="b" x="17.5" y="2" width="4" height="20" rx=".4" fill="{bar}"/>'
            f'<path class="g" d="{EIGHT}" fill="{glyph}"/></g></svg>')

# canonical static = ink tile (light-theme tokens); alternate = cream tile (dark-theme tokens)
INK = (LIGHT['text'], LIGHT['accent'], LIGHT['bg'])
CREAM = (DARK['text'], DARK['accent'], DARK['bg'])

files = {}
for name, theme in (('dark', DARK), ('light', LIGHT)):
    s, W, H = stacked(theme); files[f'logo-stacked-{name}.svg'] = s
    s, W, H = inline(theme);  files[f'logo-inline-{name}.svg'] = s
files['favicon.svg'] = tile_svg(*INK, media=(CREAM, INK))
files['favicon-ink.svg'] = tile_svg(*INK)
files['favicon-cream.svg'] = tile_svg(*CREAM)
# full-bleed (no rounded corners) for platforms that mask the icon themselves
files['icon-square-ink.svg'] = tile_svg(*INK, rx=0)
files['icon-square-cream.svg'] = tile_svg(*CREAM, rx=0)

for k, v in files.items():
    open(f'{OUT}/{k}', 'w').write(v)
json.dump({k: len(v) for k, v in files.items()}, open('brand-manifest.json', 'w'), indent=1)
print('\n'.join(f'{k:28} {len(v):7} bytes' for k, v in files.items()))
