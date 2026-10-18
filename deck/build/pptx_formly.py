"""Turn the Google Slides export into the PowerPoint pitch deck.

Reads deck/Formly-gslides-export.pptx and writes deck/Formly-deck.pptx:
Formly brand colors, real logos, two-QR try-it slide, hands-on demo
comparison, real research on the problem slide, video beats moved to backup.
Run: python3.12 deck/build/pptx_formly.py
"""
import copy
from pathlib import Path
from pptx import Presentation
from pptx.util import Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "deck/Formly-gslides-export.pptx"
OUT = ROOT / "deck/Formly-deck.pptx"
PNG = ROOT / "brand/formly/png"
if not PNG.exists():  # self-contained copy in the team repo keeps brand files in deck/brand
    PNG = Path(__file__).resolve().parents[1] / "brand/png"

NAVY, GREEN, GREEN_DK = "0F1A2A", "0FA968", "22C985"  # Ink, Fern, Volt
PAPER = "F6F7F9"
REMAP = {  # Google export color -> Formly brand color
    "141414": NAVY, "E20074": GREEN_DK, "F6288F": GREEN_DK,
    "6A6A6A": "5B6575", "8C8C8C": "8A94A3", "CCCCCC": "CBD1DA",
    "F5F5F5": PAPER, "222222": "1B2A3D", "E6E6E6": "E9ECF1",
}
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"

prs = Presentation(SRC)
S = list(prs.slides)
DARK = {2, 7, 8, 9, 10, 11, 12, 13, 14}  # 1-based, from the export


def recolor(root):
    for el in root.iter(A + "srgbClr"):
        v = el.get("val").upper()
        if v in REMAP:
            el.set("val", REMAP[v])


def rgb(h):
    return RGBColor.from_string(h)


def shape_by_text(slide, text):
    for sh in slide.shapes:
        if sh.has_text_frame and sh.text_frame.text.strip().startswith(text):
            return sh
    raise KeyError(text)


def drop(sh):
    sh._element.getparent().remove(sh._element)


def box(slide, x, y, w, h, text, size, color, font="Sora", align=PP_ALIGN.LEFT,
        anchor=MSO_ANCHOR.TOP, bold=False):
    tb = slide.shapes.add_textbox(Pt(x), Pt(y), Pt(w), Pt(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    for side in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, side, Pt(3.6))
    lines = text if isinstance(text, list) else [text]
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        segs = line if isinstance(line, list) else [(line, {})]
        for seg, o in segs:
            r = p.add_run()
            r.text = seg
            f = r.font
            f.name = o.get("font", font)
            f.size = Pt(o.get("size", size))
            f.color.rgb = rgb(o.get("color", color))
            f.bold = o.get("bold", bold)
    return tb


def rect(slide, x, y, w, h, fill, line=None, radius=None):
    kind = MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE
    sh = slide.shapes.add_shape(kind, Pt(x), Pt(y), Pt(w), Pt(h))
    sh.shadow.inherit = False
    if fill:
        sh.fill.solid(); sh.fill.fore_color.rgb = rgb(fill)
    else:
        sh.fill.background()
    if line:
        sh.line.color.rgb = rgb(line); sh.line.width = Pt(1)
    else:
        sh.line.fill.background()
    if radius:
        sh.adjustments[0] = radius
    return sh


# 1. brand colors everywhere, off-white paper on light slides
for i, s in enumerate(S, 1):
    recolor(s._element)
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = rgb(NAVY if i in DARK else PAPER)

# 2. title slide: real lockup + the brand's navy "Fill with Formly" button
t = S[0]
drop(shape_by_text(t, "Formly"))
t.shapes.add_picture(str(PNG / "lockup-light.png"), Pt(21.6), Pt(66), height=Pt(66))
btn_text = shape_by_text(t, "Fill with Formly")
for sh in t.shapes:
    if sh.shape_type == 1 and abs(sh.left - Pt(459)) < Pt(1):
        sh.fill.solid(); sh.fill.fore_color.rgb = rgb(NAVY)
        sh.shadow.inherit = False
btn_text.left, btn_text.width = Pt(486), Pt(160)
for p in btn_text.text_frame.paragraphs:
    for r in p.runs:
        r.font.color.rgb = rgb("FFFFFF")
t.shapes.add_picture(str(PNG / "mark-dark.png"), Pt(482), Pt(240.6), height=Pt(23.6))

# 3. Q&A slide: reversed lockup
q = S[13]
drop(shape_by_text(q, "Formly"))
q.shapes.add_picture(str(PNG / "lockup-dark.png"), Pt(21.6), Pt(50), height=Pt(58))

# 4. slide 2: try both. Two QR slots, A = by hand, B = Fill with Formly
s2 = S[1]
for sh in list(s2.shapes):
    drop(sh)
box(s2, 19, 23, 669.6, 40, "Lets have a Race!", 30, "FFFFFF", font="Sora ExtraBold")
for k, (tag, name, how, accent) in enumerate([
        ("A", "The usual way", "Type every field yourself", "8A94A3"),
        ("B", "Fill with Formly", "One button, your Google account", GREEN_DK)]):
    x = 25.2 + k * 342
    rect(s2, x, 100, 327.6, 288, "1B2A3D", radius=0.05)
    box(s2, x + 14, 110, 60, 46, tag, 32, accent, font="Sora ExtraBold")
    box(s2, x + 58, 114, 255, 24, name, 17, "FFFFFF", bold=True)
    box(s2, x + 58, 138, 255, 20, how, 12, "B9C1CC")
    rect(s2, x + 83.8, 170, 160, 160, "FFFFFF", radius=0.04)
    box(s2, x + 83.8, 170, 160, 160, f"[QR {tag}]", 12, "8A94A3",
        align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    box(s2, x + 14, 340, 300, 22, f"[short link {tag}]", 13, "FFFFFF",
        font="IBM Plex Mono", align=PP_ALIGN.CENTER)
box(s2, 25.2 + 342 + 14, 362, 300, 20, "Tap Fill with Formly, connect Google, approve.",
    10.5, "8A94A3", align=PP_ALIGN.CENTER)
box(s2, 25.2 + 14, 362, 300, 20, "Name, address, account number, IMEI ...",
    10.5, "8A94A3", align=PP_ALIGN.CENTER)

# 5. slide 7: the demo is hands-on, so this is the "which was faster" slide
d = S[6]
dt = shape_by_text(d, "Demo")
dt.text_frame.paragraphs[0].runs[0].text = "Which was faster?"
for p in dt.text_frame.paragraphs:
    for r in p.runs:
        r.font.size = Pt(54)
fails = shape_by_text(d, "If the live demo")
fails.text_frame.paragraphs[0].runs[0].text = "Same T-Mobile switch form. Our times on the replica:"
for r in fails.text_frame.paragraphs[0].runs:
    r.font.size = Pt(14)
fails.top = Pt(196)
for label, new in (("By hand", "A · By hand"), ("With Formly", "B · Fill with Formly")):
    sh = shape_by_text(d, label)
    sh.text_frame.paragraphs[0].runs[0].text = new
    for r in sh.text_frame.paragraphs[0].runs:
        r.font.size = Pt(12)
    sh.top = Pt(244)
box(d, 25.2, 340, 327.6, 22, "[N] fields typed", 12, "8A94A3", align=PP_ALIGN.CENTER)
box(d, 365.4, 340, 327.6, 22, "0 fields typed, every answer sourced", 12, "8A94A3",
    align=PP_ALIGN.CENTER)

# 6. slide 3: real research replaces the placeholder stat
p3 = S[2]
for txt in ("[N]", "fields on T-Mobile"):
    drop(shape_by_text(p3, txt))
for sh in p3.shapes:  # field labels were 8.25pt, too small on a laptop
    if sh.has_text_frame:
        for p in sh.text_frame.paragraphs:
            for r in p.runs:
                if r.font.size and r.font.size < Pt(9):
                    r.font.size = Pt(9)
                    sh.top = sh.top - Pt(3)
box(p3, 459, 94, 240, 70, "1 in 2", 54, NAVY, font="Sora ExtraBold")
box(p3, 459, 160, 240, 60,
    "Americans say the hassle of switching puts them off changing carriers.", 12.5, NAVY)
rect(p3, 463, 230, 220, 1, "CBD1DA")
box(p3, 459, 240, 240, 40, "18%", 30, NAVY, font="Sora ExtraBold")
box(p3, 459, 278, 240, 50,
    "of US shoppers who quit a checkout did it because it was too long or complicated.",
    11, "5B6575")
box(p3, 459, 336, 240, 30, "Sources: YouGov, Jan 2023 · Baymard Institute, 2025",
    8.5, "8A94A3")

# 6b. layout fixes found in the PowerPoint render
foot = shape_by_text(S[3], "Formly reads")  # was underlined, read as a link
for p in foot.text_frame.paragraphs:
    for r in p.runs:
        r.font.underline = False; r.font.bold = True; r.font.color.rgb = rgb(NAVY)
lab = shape_by_text(S[4], "only the answers")  # was hidden under the form card
lab.left, lab.top, lab.width, lab.height = Pt(335), Pt(178), Pt(77), Pt(36)
tf = lab.text_frame
tf.paragraphs[0].runs[0].text = "approved answers only"
for r in tf.paragraphs[0].runs[1:]:
    r.text = ""
for r in tf.paragraphs[0].runs:
    r.font.size = Pt(9.5)
shape_by_text(S[9], "hover a field").top = Pt(192)  # title wraps to two lines
qr = shape_by_text(S[13], "[QR code]")
qr.text_frame.paragraphs[0].runs[0].text = "[QR B · Fill with Formly]"
dsub = shape_by_text(d, "Same T-Mobile switch form")
dsub.top = Pt(170)

# 7. slide 5 is about revenue: every field is a place to quit
from pptx.enum.shapes import MSO_CONNECTOR
from lxml import etree


def arrow(slide, x1, y1, x2, y2, color="8A94A3"):
    c = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Pt(x1), Pt(y1), Pt(x2), Pt(y2))
    c.line.color.rgb = rgb(color); c.line.width = Pt(1.5)
    ln = c.line._get_or_add_ln()
    ln.append(etree.SubElement(ln, A + "tailEnd", type="triangle", w="med", len="med"))
    return c


rv = prs.slides.add_slide(S[4].slide_layout)
rv.background.fill.solid(); rv.background.fill.fore_color.rgb = rgb(PAPER)
for ph in list(rv.placeholders):
    drop(ph)
box(rv, 25.2, 20, 669.6, 46, "Formly converts.", 27, NAVY, font="Sora ExtraBold")
# row A: by hand is a tangle, not a line (Arjun's reference: a web of shapes and arrows)
import math
from pptx.enum.shapes import MSO_SHAPE as SH

WEB = {  # name: (shape, cx, cy, w, h, label, fill, text color)
    "start": (SH.OVAL, 56, 178, 52, 52, "Start", NAVY, "FFFFFF"),
    "typo": (SH.RECTANGLE, 170, 112, 86, 26, "Typo", "FFFFFF", NAVY),
    "pin": (SH.RECTANGLE, 300, 112, 86, 26, "Wrong PIN", "FFFFFF", NAVY),
    "call": (SH.RECTANGLE, 180, 196, 90, 26, "Call support", "FFFFFF", NAVY),
    "port": (SH.RECTANGLE, 316, 196, 100, 26, "Port-in rejected", "FFFFFF", NAVY),
    "lie": (SH.RECTANGLE, 200, 262, 104, 26, "Made-up answer", "FFFFFF", NAVY),
    "signed": (SH.OVAL, 408, 120, 60, 60, "Signed up?", None, "8A94A3"),
    "quit": (SH.OVAL, 408, 250, 50, 50, "Quit", "5B6575", "FFFFFF"),
}
EDGES = [("start", "typo"), ("typo", "pin"), ("pin", "port"), ("port", "call"),
         ("call", "start"), ("typo", "start"), ("start", "lie"), ("lie", "signed"),
         ("port", "quit"), ("pin", "signed")]


def edge_point(n, toward, pad=2.5):
    kind, cx, cy, w, h = WEB[n][:5]
    dx, dy = toward[0] - cx, toward[1] - cy
    d = math.hypot(dx, dy) or 1
    ux, uy = dx / d, dy / d
    a, b = w / 2, h / 2
    if kind == SH.OVAL:
        t = 1 / math.sqrt((ux / a) ** 2 + (uy / b) ** 2)
    elif kind == SH.DIAMOND:
        t = 1 / (abs(ux) / a + abs(uy) / b)
    else:
        t = min(a / abs(ux) if ux else 1e9, b / abs(uy) if uy else 1e9)
    return cx + ux * (t + pad), cy + uy * (t + pad)


for a_, b_ in EDGES:  # connectors first so the shapes sit on top
    ca, cb = WEB[a_][1:3], WEB[b_][1:3]
    (x1, y1), (x2, y2) = edge_point(a_, cb), edge_point(b_, ca)
    c = rv.shapes.add_connector(MSO_CONNECTOR.CURVE, Pt(x1), Pt(y1), Pt(x2), Pt(y2))
    c.line.color.rgb = rgb("5B6575"); c.line.width = Pt(1)
    etree.SubElement(c.line._get_or_add_ln(), A + "tailEnd", type="triangle", w="sm", len="sm")
for name, (kind, cx, cy, w, h, label, fill, tc) in WEB.items():
    sh = rv.shapes.add_shape(kind, Pt(cx - w / 2), Pt(cy - h / 2), Pt(w), Pt(h))
    sh.shadow.inherit = False
    if fill:
        sh.fill.solid(); sh.fill.fore_color.rgb = rgb(fill)
    else:
        sh.fill.solid(); sh.fill.fore_color.rgb = rgb(PAPER)
    if fill in ("FFFFFF", None):
        sh.line.color.rgb = rgb("CBD1DA"); sh.line.width = Pt(1)
        if fill is None:
            sh.line.dash_style = 4; sh.line.width = Pt(1.5)
    else:
        sh.line.fill.background()
    box(rv, cx - w / 2 - 6, cy - h / 2, w + 12, h, label, 9, tc, bold=(name in ("start", "quit")),
        align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
box(rv, 25.2, 70, 300, 18, "A · By hand", 11, "5B6575", bold=True)

# row B: Fill with Formly is one straight line
box(rv, 25.2, 292, 300, 18, "B · Fill with Formly", 11, "5B6575", bold=True)
st = rv.shapes.add_shape(SH.OVAL, Pt(28), Pt(312), Pt(48), Pt(48))
st.shadow.inherit = False
st.fill.solid(); st.fill.fore_color.rgb = rgb(NAVY); st.line.fill.background()
box(rv, 22, 312, 60, 48, "Start", 9, "FFFFFF", bold=True, align=PP_ALIGN.CENTER,
    anchor=MSO_ANCHOR.MIDDLE)
arrow(rv, 80, 336, 100, 336)
rect(rv, 104, 321, 150, 30, NAVY, radius=0.23)
rv.shapes.add_picture(str(PNG / "mark-dark.png"), Pt(116), Pt(327.5), height=Pt(17))
box(rv, 132, 321, 120, 30, "Fill with Formly", 11, "FFFFFF", bold=True,
    anchor=MSO_ANCHOR.MIDDLE)
arrow(rv, 258, 336, 300, 336)  # Arjun cut the "Check, approve" step in PowerPoint
rect(rv, 304, 321, 96, 30, GREEN_DK, radius=0.5)
box(rv, 304, 321, 96, 30, "✓ Signed up", 11, NAVY, bold=True, align=PP_ALIGN.CENTER,
    anchor=MSO_ANCHOR.MIDDLE)
# right: what a finished form is worth
box(rv, 466, 92, 230, 50, "$1,835", 36, NAVY, font="Sora ExtraBold")
box(rv, 466, 138, 230, 50,
    "a year from each new account that finishes signing up ($152.91 a month).", 11, "5B6575")
rect(rv, 470, 194, 210, 1, "CBD1DA")
box(rv, 466, 202, 230, 44, "up to 50%", 28, NAVY, font="Sora ExtraBold")
box(rv, 466, 240, 230, 50,
    "more checkouts finished when the form is prefilled (Shop Pay vs. guest checkout).",
    11, "5B6575")
box(rv, 466, 300, 230, 40,
    "Sources: T-Mobile Q2 2026 results, postpaid ARPA",  # Arjun cut the Shopify note
    8.5, "8A94A3")

# 8. the privacy wall becomes an appendix slide for Q&A
wall = S[4]
box(wall, 25.2, 12, 200, 16, "Appendix", 8.25, "5B6575", bold=True)
shape_by_text(wall, "T-Mobile gets answers").top = Pt(24)

# 9. close slide: revenue, not privacy
ct = shape_by_text(S[12], "Every finished form")
ct.text_frame.paragraphs[0].runs[0].text = "Bring Formly to T-Mobile."
for r in ct.text_frame.paragraphs[0].runs[1:]:
    r.text = ""
cs = shape_by_text(S[12], "to a finished switch form")
cs.text_frame.paragraphs[0].runs[0].text = (
    "to a finished switch form, measured on our replica · fewer people quit halfway")
for r in cs.text_frame.paragraphs[0].runs[1:]:
    r.text = ""

# 9b. Arjun's PowerPoint edits (2026-10-17): drop the title-field label, autofill footnote
drop(shape_by_text(S[0], "Full name, address"))
drop(shape_by_text(S[5], "What each tool fills"))
_tm = shape_by_text(S[13], "Khangai Sukhbaatar")  # Arjun matched the Q&A team line to the title slide
_tm.text_frame.paragraphs[0].runs[0].text = "Khangai Sukhbaatar · Salvo Bonsma · Jerry Zheng "
for r in _tm.text_frame.paragraphs[0].runs[1:]:
    r.text = ""

# 10. final order: pitch, Q&A, then hidden answer slides (incl. privacy wall)
by_slide = {id(sl): sid for sl, sid in zip(list(prs.slides), list(prs.slides._sldIdLst))}
order = [S[0], S[1], S[2], rv, S[3], S[6], S[12], S[13],  # 1-8 shown at the booth
         S[5], S[14], S[15], wall]                          # 9-12 hidden, jump to when asked
for sl in order[8:]:
    sl._element.set("show", "0")  # hidden: clicking past Q&A ends the show
box(S[5], 25.2, 12, 200, 16, "Appendix", 8.25, "5B6575", bold=True)
shape_by_text(S[5], "Autofill fills your name").top = Pt(24)
lst = prs.slides._sldIdLst
ids = [by_slide[id(sl)] for sl in order]
for sid in list(lst):
    lst.remove(sid)
for sid in ids:
    lst.append(sid)
# the five recorded-clip backup slides are cut (Arjun: no Wi-Fi backup)
for sl in S[7:12]:
    sid = by_slide[id(sl)]
    prs.part.drop_rel(sid.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"))

# 9d. slide 5 spacing: labels sit on their fields, dots clear the source text, footer left-aligned
S5_LABELS = ("Account number", "Phone model", "Billing address", "Number to transfer")
for lab in S5_LABELS:
    lb = shape_by_text(S[3], lab)
    field_top = lb.top + Pt(16.2)
    lb.left, lb.top, lb.height = Pt(28.8), field_top - Pt(24), Pt(18)
    for p in lb.text_frame.paragraphs:
        for r in p.runs:
            r.font.size = Pt(9.5)
for sh in S[3].shapes:
    if sh.shape_type == 9:  # source lines end 10pt before the source text
        sh.end_x = Pt(420)
foot5 = shape_by_text(S[3], "Formly reads what you connect")
foot5.left, foot5.top, foot5.width = Pt(28.8), Pt(334), Pt(660)
for p in foot5.text_frame.paragraphs:
    p.alignment = PP_ALIGN.LEFT
    for r in p.runs:
        r.font.size = Pt(12)

# 10a. neon highlights: Ink text on Volt, on two moments only
def highlight(shape, word):
    for p in shape.text_frame.paragraphs:
        for r in list(p.runs):
            if word not in r.text:
                continue
            before, after = r.text.split(word, 1)
            r.text = word
            for txt, where in ((before, "before"), (after, "after")):
                if txt:
                    nr = copy.deepcopy(r._r)
                    nr.find(A + "t").text = txt
                    (r._r.addprevious if where == "before" else r._r.addnext)(nr)
            rpr = r._r.get_or_add_rPr()
            for old in rpr.findall(A + "highlight"):
                rpr.remove(old)
            hl = etree.Element(A + "highlight")
            etree.SubElement(hl, A + "srgbClr", val=GREEN_DK)
            anchor_ = None
            for tag in ("uLnTx", "uLn", "uFillTx", "uFill", "latin", "ea", "cs", "sym", "hlinkClick"):
                anchor_ = rpr.find(A + tag)
                if anchor_ is not None:
                    break
            anchor_.addprevious(hl) if anchor_ is not None else rpr.append(hl)
            r.font.color.rgb = rgb(NAVY)
            return
    raise KeyError(word)


# tastefully: only the revenue number (slide 4) and the Formly row (slide 6), per Arjun
# Volt as visual weight (Arjun: "bring visual weight", not a text highlighter), a few slides only
rect(rv, 456, 98, 5, 92, GREEN_DK)  # slide 4: accent bar beside the revenue figure
# slide 3: each stat gets a bar filled to its real share (1 in 2 = 50%, 18%)
for y, share in ((214, 0.5), (318, 0.18)):
    rect(p3, 463, y, 210, 7, "E9ECF1", radius=0.5)
    rect(p3, 463, y, 210 * share, 7, GREEN_DK, radius=0.5)
# slide 5: thicker source lines that land on a Volt dot
for sh in list(S[3].shapes):
    if sh.shape_type == 9:
        sh.line.width = Pt(2.25)
        ex, ey = sh.end_x, sh.end_y
        d = S[3].shapes.add_shape(SH.OVAL, ex - Pt(4.5), ey - Pt(4.5), Pt(9), Pt(9))
        d.shadow.inherit = False
        d.fill.solid(); d.fill.fore_color.rgb = rgb(GREEN_DK); d.line.fill.background()
# slide 7: the Formly timer box is the winner, filled solid
for sh in S[6].shapes:
    try:
        if sh.shape_type == 1 and str(sh.line.color.rgb) == GREEN_DK:
            sh.fill.solid(); sh.fill.fore_color.rgb = rgb(GREEN_DK)
            for t in S[6].shapes:
                if t.has_text_frame and t.text_frame.text.strip() == "[m:ss]" and abs(t.left - sh.left) < Pt(10):
                    for r in t.text_frame.paragraphs[0].runs:
                        r.font.color.rgb = rgb(NAVY)
    except Exception:
        pass
for sh in S[5].shapes:  # the Formly row on the autofill slide gets a Volt fill
    try:
        if sh.shape_type == 1 and str(sh.line.color.rgb) == GREEN_DK:
            sh.fill.solid(); sh.fill.fore_color.rgb = rgb(GREEN_DK)
    except Exception:
        pass

# 10b. typography per the Formly guidelines
def retype(root):
    for rpr in root.iter(A + "rPr", A + "endParaRPr", A + "defRPr"):
        latin = rpr.find(A + "latin")
        face = latin.get("typeface") if latin is not None else None
        if face is None:
            continue
        size = int(rpr.get("sz", "1200")) / 100
        bold = rpr.get("b") == "1"
        if face == "Sora ExtraBold" or (face == "Sora" and bold and size >= 14) \
                or (face == "IBM Plex Mono" and size >= 24):
            new, b = "Sora SemiBold", "0"
        elif face == "Sora" and bold:
            new, b = "DM Sans Medium", "0"
        elif face in ("Sora", "IBM Plex Mono"):
            new, b = "DM Sans", rpr.get("b", "0")
        else:
            continue
        for tag in ("latin", "ea", "cs", "sym"):
            el = rpr.find(A + tag)
            if el is not None:
                el.set("typeface", new)
        rpr.set("b", b)


for sl in prs.slides:
    retype(sl._element)
    for sh in sl.shapes:  # the button label is always Sora SemiBold
        if sh.has_text_frame and sh.text_frame.text.strip() == "Fill with Formly":
            for p in sh.text_frame.paragraphs:
                for r in p.runs:
                    r.font.name = "Sora SemiBold"; r.font.bold = False

# 11. speaker notes (laptop pitch, judges try it on their phones; ~2:40 total)
NOTES = {  # booth cues on a 5-minute clock (judges visit the booth, 2:10 talk + race, rest Q&A)
    id(S[0]): "0:00-0:15 · Hi, we're Formly: Stripe for forms. We are here to making switching to "
              "T-mobile the ______ . We make it one tap. "  # Arjun's wording, blank is his
              "Then straight to: want to try it?",
    id(S[1]): "0:15 · Hand the judge the phone on B. A teammate starts A by hand at the same time. "
              "Say go. Cap the race at 60 seconds; nobody has to finish A.",
    id(S[2]): "0:20-0:50 · Talk while they race. Everyone has typed their address a hundred times. "
              "Half of Americans say the hassle of switching puts them off changing carriers "
              "(YouGov). 18% of shoppers who quit a checkout blame a long or complicated one (Baymard).",
    id(rv): "0:50-1:15 · Still racing. By hand isn't a line: typos, wrong PINs, made-up answers, "
            "rejected port-ins, start again or quit. Each account that finishes is about $1,835 a "
            "year to T-Mobile ($152.91 a month, Q2 2026). Shopify says prefilled checkout finishes "
            "up to 50% more orders; that's their own study, so treat it as a ceiling. Stripe made "
            "paying one tap. We make signing up one tap.",
    id(S[3]): "1:15-1:45 · Race over. Have the judge tap a filled field on the phone: it shows the "
              "email or file the answer came from. Account number from the carrier bill in Gmail, "
              "phone model from the order receipt, address from the lease on Drive.",
    id(S[6]): "1:45-1:55 · Which was faster? Their time against the teammate's. If the race went "
              "wrong, point at our measured times on screen.",
    id(S[12]): "1:55-2:10 · Bring Formly to T-Mobile. Say it out loud: less friction, more "
               "switchers. The ask: a one-month pilot on "
               "T-Mobile's switch flow, measured on completion rate and port-in errors.",
    id(S[13]): "2:10-4:30 · Questions. Slides 9-12 are hidden; type the number and press Enter to "
               "jump. Isn't this just autofill? 9 · How is it built? 10 · What works today? 11 · "
               "Is reading my inbox safe? 12. 4:30-5:00 · Leave them with the QR.",
    id(S[5]): "Answer to: isn't this just autofill? Autofill fills your name, password managers fill "
              "logins, Stripe Link fills payment. Nothing fills the account number, IMEI or the "
              "number you're transferring.",
    id(S[14]): "Answer to: how is it built? Walk the pipeline left to right. Stack line is still a "
               "placeholder for the build team.",
    id(S[15]): "Answer to: what works today? Fill in from the build team before judging.",
    id(wall): "Answer to: is reading my inbox safe? Formly reads the accounts; T-Mobile only "
              "receives the finished answers the customer approved. Read-only Google access, "
              "delete everything in one tap.",
}
for sl in prs.slides:
    if id(sl) in NOTES:
        sl.notes_slide.notes_text_frame.text = NOTES[id(sl)]

prs.save(OUT)
print("wrote", OUT, len(prs.slides), "slides")
