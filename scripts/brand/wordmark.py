"""
Draws the Fieldwork wordmark and monogram as SVG paths and writes them to
src/ui/brand.ts.

"Field" is cut from Inter Tight, "work" from Newsreader Italic at its display
optical size, scaled so the two x-heights sit together. The full stop is the
grotesk's. Run it again after changing a setting below:

    python3 -m venv .venv && .venv/bin/pip install fonttools brotli uharfbuzz
    .venv/bin/python scripts/brand/wordmark.py
"""
import io
import json
import pathlib

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
FONTS = ROOT / 'node_modules' / '@fontsource-variable'
GROTESK = FONTS / 'inter-tight' / 'files' / 'inter-tight-latin-wght-normal.woff2'
SERIF = FONTS / 'newsreader' / 'files' / 'newsreader-latin-opsz-italic.woff2'

# Units per grotesk em in the output. Every distance below is in grotesk ems.
EM = 100.0

WORDMARK = dict(grotesk=660, serif=500, scale=0.9, track_g=-0.025, track_s=-0.006, gap=0.015, gap_stop=0.012)
MONOGRAM = dict(grotesk=700, serif=560, scale=0.98, gap=-0.06)


def instance(path, axes):
    font = instantiateVariableFont(TTFont(path), axes)
    font.flavor = None
    buf = io.BytesIO()
    font.save(buf)
    data = buf.getvalue()
    return TTFont(io.BytesIO(data)), data


class Face:
    def __init__(self, path, axes):
        self.font, data = instance(path, axes)
        self.hb = hb.Font(hb.Face(data))
        self.order = self.font.getGlyphOrder()
        self.glyphs = self.font.getGlyphSet()
        self.upm = self.font['head'].unitsPerEm
        self.xheight = self.font['OS/2'].sxHeight

    def draw(self, text, x, scale, track=0.0):
        """Shape `text` and draw it from pen position x. Returns (path, bounds, new x)."""
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hb, buf, {'kern': True, 'liga': True})
        d, boxes = [], []
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            glyph = self.glyphs[self.order[info.codepoint]]
            # font units are y-up; SVG is y-down
            m = (scale, 0, 0, -scale, x + pos.x_offset * scale, -pos.y_offset * scale)
            pen = SVGPathPen(self.glyphs, ntos=lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
            glyph.draw(TransformPen(pen, m))
            bp = BoundsPen(self.glyphs)
            glyph.draw(TransformPen(bp, m))
            if bp.bounds:
                boxes.append(bp.bounds)
            d.append(pen.getCommands())
            x += pos.x_advance * scale + track * EM
        return ''.join(d), boxes, x


def build(cfg, field, work, stop):
    g = Face(GROTESK, {'wght': cfg['grotesk']})
    s = Face(SERIF, {'wght': cfg['serif'], 'opsz': 72})
    gs = EM / g.upm
    # match the serif's x-height to the grotesk's, then trim by eye
    ss = (g.xheight * gs) / s.xheight * cfg['scale']
    parts, boxes, x = {}, [], 0.0
    for key, face, text, scale, track, gap in (
        ('field', g, field, gs, cfg.get('track_g', 0), 0),
        ('work', s, work, ss, cfg.get('track_s', 0), cfg['gap']),
        ('stop', g, stop, gs, 0, cfg.get('gap_stop', 0)),
    ):
        if not text:
            continue
        x += gap * EM
        d, b, x = face.draw(text, x, scale, track)
        parts[key] = d
        boxes += b
    x0 = min(b[0] for b in boxes)
    y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes)
    y1 = max(b[3] for b in boxes)
    return parts, (x0, y0, x1 - x0, y1 - y0), g.xheight * gs


def fmt(v):
    return f'{v:.2f}'.rstrip('0').rstrip('.')


def main():
    wm, (x, y, w, h), xh = build(WORDMARK, 'Field', 'work', '.')
    mono, (mx, my, mw, mh), _ = build(MONOGRAM, 'F', 'w', '')
    side = max(mw, mh) * 1.18
    cx, cy = mx + mw / 2, my + mh / 2
    out = f"""/*
 * The Fieldwork wordmark and monogram, drawn by scripts/brand/wordmark.py.
 * Generated: edit the script, not this file.
 *
 * "Field" is the place, set in a grotesk; "work" is the craft, set in an
 * italic serif. Every headline on the site shifts one word the same way.
 */

/** Wordmark viewBox: the ink's bounds. Height {fmt(h)}, baseline at y = 0. */
export const WORDMARK_BOX = [{fmt(x)}, {fmt(y)}, {fmt(w)}, {fmt(h)}] as const;
/** Grotesk x-height, in the wordmark's units. */
export const WORDMARK_XHEIGHT = {fmt(xh)};

export const wordmark = (cls = 'wordmark') =>
  `<svg class="${{cls}}" viewBox="{fmt(x)} {fmt(y)} {fmt(w)} {fmt(h)}" fill="currentColor" role="img" aria-label="Fieldwork"><path class="wordmark__field" d="{wm['field']}"/><path class="wordmark__work" d="{wm['work']}"/><path class="wordmark__stop" d="{wm['stop']}"/></svg>`;

/** The short form: the grotesk F with the italic w tucked under its arm. */
export const MONOGRAM_PATH = {json.dumps(mono['field'] + mono['work'])};
export const MONOGRAM_BOX = [{fmt(cx - side / 2)}, {fmt(cy - side / 2)}, {fmt(side)}, {fmt(side)}] as const;
"""
    (ROOT / 'src' / 'ui' / 'brand.ts').write_text(out)
    # the favicon follows the browser chrome: graphite on light, ashen white on dark
    vb = f'{fmt(cx - side / 2)} {fmt(cy - side / 2)} {fmt(side)} {fmt(side)}'
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">'
        '<style>path{fill:#1b1c1a}@media (prefers-color-scheme:dark){path{fill:#efeee9}}</style>'
        f'<path d="{mono["field"] + mono["work"]}"/></svg>'
    )
    (ROOT / 'public' / 'favicon.svg').write_text(svg)
    print('wrote src/ui/brand.ts and public/favicon.svg')


if __name__ == '__main__':
    main()
