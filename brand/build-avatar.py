"""Instagram / social avatar for היום שאחרי: "8.10" (Frank Ruhl Libre 700, outlined) on an ink disc.
Chosen: option 5 — 8 in the site accent, the dot in green, "10" cream. All six colour splits are kept as avatar-alt-N."""
import io, os, uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
OUT='brand'; os.makedirs(OUT, exist_ok=True)
FONT='node_modules/@fontsource/frank-ruhl-libre/files/frank-ruhl-libre-latin-700-normal.woff2'
INK, ACC, CREAM, GREEN = '#1d2126', '#b97a1c', '#f6f4ef', '#67c185'   # --text (light), --accent (light), --bg (light), --s5 (dark)
tt=TTFont(FONT); tt.flavor=None; b=io.BytesIO(); tt.save(b)
f=hb.Font(hb.Face(hb.Blob(b.getvalue()))); gs=tt.getGlyphSet(); order=tt.getGlyphOrder()
def glyphs(text,H,cx,cy):
    buf=hb.Buffer(); buf.add_str(text); buf.guess_segment_properties(); hb.shape(f,buf,{'kern':True})
    items=list(zip(buf.glyph_infos,buf.glyph_positions))
    bp=BoundsPen(gs); x=0
    for i,p in items: gs[order[i.codepoint]].draw(TransformPen(bp,(1,0,0,1,x+p.x_offset,p.y_offset))); x+=p.x_advance
    x0,y0,x1,y1=bp.bounds; sc=H/(y1-y0); tx=cx-(x0+x1)/2*sc; ty=cy+(y0+y1)/2*sc
    out=[]; x=0
    for i,p in items:
        pen=SVGPathPen(gs,ntos=lambda v:f'{v:.2f}')
        gs[order[i.codepoint]].draw(TransformPen(pen,(sc,0,0,-sc,tx+(x+p.x_offset)*sc,ty-p.y_offset*sc))); x+=p.x_advance
        out.append((text[i.cluster],pen.getCommands()))
    return out
GL=glyphs('8.10',10,16,16.4)   # digits 10 units tall on the 32 grid, optically centred
def disc(colors, circle=True):
    paths=''.join(f'<path d="{d}" fill="{colors.get(ch,CREAM)}"/>' for ch,d in GL)
    ground = f'<circle cx="16" cy="16" r="16" fill="{INK}"/>' if circle else f'<rect width="32" height="32" fill="{INK}"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><title>היום שאחרי · 8.10</title>{ground}{paths}</svg>'
OPTIONS = {1:{}, 2:{'8':ACC}, 3:{'8':GREEN}, 4:{'.':GREEN}, 5:{'8':ACC,'.':GREEN}, 6:{'8':GREEN,'.':ACC}}
CHOSEN = 5
for n,c in OPTIONS.items():
    open(f'{OUT}/avatar-alt-{n}.svg','w').write(disc(c))
open(f'{OUT}/avatar.svg','w').write(disc(OPTIONS[CHOSEN]))
open(f'{OUT}/avatar-square.svg','w').write(disc(OPTIONS[CHOSEN], circle=False))   # for platforms that crop their own circle
print('ok')
