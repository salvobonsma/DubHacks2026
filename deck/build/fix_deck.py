"""Apply the Discord fixes to the Formly deck and embed its fonts.

Usage: python3.12 fix_deck.py SRC.pptx OUT.pptx [QR_A_URL QR_B_URL]
Idempotent: always run it on the pristine copy from main.
"""
import copy, os, re, shutil, struct, subprocess, sys, tempfile, zipfile
from pptx import Presentation
from pptx.util import Emu
from fontTools.ttLib import TTFont

SRC, OUT = sys.argv[1], sys.argv[2]
QR_A = sys.argv[3] if len(sys.argv) > 3 else None
QR_B = sys.argv[4] if len(sys.argv) > 4 else None
WORK = tempfile.mkdtemp(prefix="deckfix-")
FONTS = os.path.expanduser("~/Library/Fonts")

# ---------- helpers ----------
def shape_by_id(slide, sid):
    for sh in slide.shapes:
        if sh.shape_id == sid:
            return sh
    raise KeyError(sid)

def set_text(shape, text):
    """Replace the shape's text with `text`, keeping the first run's formatting."""
    tf = shape.text_frame
    first = tf.paragraphs[0]
    runs = first.runs
    runs[0].text = text
    for r in runs[1:]:
        r._r.getparent().remove(r._r)
    for p in tf.paragraphs[1:]:
        p._p.getparent().remove(p._p)

def set_notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text

def remove_shape(shape):
    el = shape._element
    el.getparent().remove(el)

def qr_png(url, path):
    subprocess.run([os.path.expanduser("~/.local/bin/uvx"), "--from", "segno", "segno",
                    "--scale", "12", "--border", "2", "--dark", "#0F1A2A", "--error", "m",
                    "-o", path, url], check=True, capture_output=True)

def display_url(url):
    return re.sub(r"^https?://", "", url).rstrip("/")

# ---------- 1. slide edits ----------
prs = Presentation(SRC)
S = prs.slides

# Slide 1: subtext and the blank in the notes
set_text(shape_by_id(S[0], 55), "The secure, fast form filler")
set_notes(S[0], "0:00-0:15 · Hi, we're Formly, the secure, fast form filler. Switching to T-Mobile is 30 fields "
                "of typing. We make it one tap. The race comes at the end; first, why it matters.")

# Slide 2: QR codes and short links
s2 = S[1]
for sid_box, sid_rect, sid_link, url in ((72, 71, 73, QR_A), (79, 78, 80, QR_B)):
    if not url:
        continue
    box = shape_by_id(s2, sid_box)
    left, top, w, h = box.left, box.top, box.width, box.height
    png = os.path.join(WORK, f"qr{sid_box}.png")
    qr_png(url, png)
    remove_shape(box)
    pic = s2.shapes.add_picture(png, left, top, w, h)
    # keep the picture just above its white rounded rectangle in z-order
    rect = shape_by_id(s2, sid_rect)._element
    pic._element.getparent().remove(pic._element)
    rect.addnext(pic._element)
    set_text(shape_by_id(s2, sid_link), display_url(url))

# Slide 5: "By hand" confused people
set_text(shape_by_id(S[4], 29), "Manually")

# Slide 8: same layout, four facts that each stand alone (no chained calculation)
s8 = S[7]
set_text(shape_by_id(s8, 250), "Put the button on your switch page for one month. We count how many more people finish.")
set_text(shape_by_id(s8, 252), "49%")
set_text(shape_by_id(s8, 253), "of Americans say the hassle of switching puts them off.")
set_text(shape_by_id(s8, 254), "YouGov, Feb 2022")
set_text(shape_by_id(s8, 256), "~5M")
set_text(shape_by_id(s8, 257), "accounts open at T\u2011Mobile every year.")
set_text(shape_by_id(s8, 258), "Our estimate from T\u2011Mobile's Q2 2026 SEC 8-K")
set_text(shape_by_id(s8, 260), "$1,835")
set_text(shape_by_id(s8, 261), "a year from every account that finishes.")
set_text(shape_by_id(s8, 262), "$152.91 ARPA x 12, Q2 2026 SEC 8-K")
set_text(shape_by_id(s8, 264), "+$94M")
set_text(shape_by_id(s8, 265), "a year in new revenue for every 1% more switchers who finish.")
set_text(shape_by_id(s8, 266), "1% of ~5M accounts x $1,835")
set_notes(s8,
    "Bring Formly to T-Mobile. Four facts, no story to argue with. 49% of Americans say the hassle of switching puts "
    "them off. Your switch form is 30 fields and autofill covers 13 of them. You open about 5M accounts a year. Each one "
    "is worth $1,835 a year. The pilot: put the button on the switch page for one month and count completions and "
    "port-in errors against the month before. If asked for the upside: every extra 1% of 5M finishing is about $90M a "
    "year; 10% is about $940M. 34.7M postpaid accounts x 0.99% monthly churn x 12 = about 4.1M, plus about 1M net adds "
    "(2026 guidance 950K to 1.05M) = about 5.1M sign-ups. $152.91 postpaid ARPA x 12 = $1,835. Sources: YouGov, Feb 2022 (49% of Americans find changing carrier too much of a hassle); T-Mobile Q2 2026 Form 8-K on sec.gov (ARPA $152.91, churn 0.99%, 34.7M postpaid accounts).\n"
    "Q&A jump list (type the number, press Enter): 9 how it works, 10 how T-Mobile adds it, 11 wrong answers, "
    "12 what T-Mobile sees, 13 vs autofill and Plaid, 14 business model, 15 what works today, 16 stack, "
    "17 why not build it.")

# Slide 2 title: apostrophe, sentence case
set_text(shape_by_id(s2, 66), "Let's have a race")
set_notes(s2, "Last slide, about 1:45. Hand the judge the phone on B. A teammate starts A at the same time. Say go. "
              "Cap the race at 60 seconds; nobody has to finish A. While B finishes, have the judge tap a filled "
              "field: it shows the email or file the answer came from. Then questions (jump list is in slide 7's notes).")

# The Fill with Formly button is always set in Sora SemiBold, whatever machine opens the deck
for slide_i, sid in ((0, 803), (1, 76), (4, 36), (8, 501)):
    for para in shape_by_id(S[slide_i], sid).text_frame.paragraphs:
        for r in para.runs:
            r.font.name = "Sora SemiBold"

# Notes that assumed the race was running in the background
set_notes(S[2], "0:15-0:45 · The six address fields type themselves one after another as the slide opens, typos and "
                "all, faster each time (about 20 seconds). Everyone has typed their address a hundred times: the "
                "bank, the landlord, the DMV. T-Mobile's sign-up alone is 30 fields.")
set_notes(S[3], "0:45-1:00 · Forms lose people: 7 in 10 online checkouts never finish. Every field is a place to drop off.")
set_notes(S[4], "1:00-1:15 · Manually isn't a line: typos, wrong PINs, made-up answers, rejected port-ins, start again "
                "or quit. Click: Formly is one straight line, one tap to signed up. Stripe made paying one tap. We "
                "make signing up one tap.")
set_notes(S[5], "1:15-1:30 · The answers already exist. Current carrier (Verizon) and the number to transfer come from "
                "the Verizon bill in Gmail, home address from the personal info PDF, employer (Northwind Robotics) "
                "from the resume in Google Drive. The judge sees this live during the race at the end.")
n7 = S[6].notes_slide.notes_text_frame.text.replace("13 of 33", "13 of 30").replace("all 33", "all 30")
set_notes(S[6], "1:30-1:45 · " + n7 if not n7.startswith("1:30") else n7)

# Slide 7: the 47.8% sentence read "47.8% is all telecom sign-up forms convert"
set_text(shape_by_id(S[6], 66), "of telecom sign-up forms get finished. More than half the people who start one never do.")

# Slide 14: drop the unfilled price placeholder rather than invent a number
tf14 = shape_by_id(S[13], 502).text_frame
for para in list(tf14.paragraphs):
    if "price per completed form" in para.text:
        para._p.getparent().remove(para._p)

# Move the race from slide 2 to the end of the booth pitch (after "Bring Formly to T-Mobile"); hidden Q&A slides stay after it
sldIdLst = prs.slides._sldIdLst
race = list(sldIdLst)[1]
sldIdLst.remove(race)
sldIdLst.insert(7, race)

stage = os.path.join(WORK, "stage.pptx")
prs.save(stage)

# ---------- 2. embed fonts (EOT, uncompressed) ----------
def eot(ttf_path):
    t = TTFont(ttf_path)
    os2, head, name = t["OS/2"], t["head"], t["name"]
    def nm(i):
        r = name.getName(i, 3, 1, 0x409) or name.getName(i, 1, 0, 0)
        return str(r) if r else ""
    def u16(s):
        b = s.encode("utf-16-le")
        return struct.pack("<H", len(b)) + b
    data = open(ttf_path, "rb").read()
    body = b""
    body += struct.pack("<I", 0x00020001)              # Version
    body += struct.pack("<I", 0)                       # Flags: no compression, no XOR
    body += bytes(os2.panose.__dict__.get("bFamilyType", 0).to_bytes(1, "little") + bytes(9)) if False else bytes([
        os2.panose.bFamilyType, os2.panose.bSerifStyle, os2.panose.bWeight, os2.panose.bProportion,
        os2.panose.bContrast, os2.panose.bStrokeVariation, os2.panose.bArmStyle, os2.panose.bLetterForm,
        os2.panose.bMidline, os2.panose.bXHeight])
    body += struct.pack("<B", 1)                       # Charset DEFAULT
    body += struct.pack("<B", 1 if (os2.fsSelection & 1) else 0)  # Italic
    body += struct.pack("<I", os2.usWeightClass)
    body += struct.pack("<H", os2.fsType)
    body += struct.pack("<H", 0x504C)                  # MagicNumber
    body += struct.pack("<IIII", os2.ulUnicodeRange1, os2.ulUnicodeRange2, os2.ulUnicodeRange3, os2.ulUnicodeRange4)
    body += struct.pack("<II", os2.ulCodePageRange1, os2.ulCodePageRange2)
    body += struct.pack("<I", head.checkSumAdjustment & 0xFFFFFFFF)
    body += struct.pack("<IIII", 0, 0, 0, 0)           # Reserved
    body += struct.pack("<H", 0) + u16(nm(1))          # Padding1, FamilyName
    body += struct.pack("<H", 0) + u16(nm(2))          # StyleName
    body += struct.pack("<H", 0) + u16(nm(5))          # VersionName
    body += struct.pack("<H", 0) + u16(nm(4))          # FullName
    body += struct.pack("<H", 0) + struct.pack("<H", 0)  # Padding5, RootStringSize 0
    total = 8 + len(body) + len(data)
    return struct.pack("<II", total, len(data)) + body + data

# typeface used in the deck -> (regular file, bold file)
EMBED = {
    "Sora SemiBold":  ("Sora-SemiBold.ttf", None),
    "DM Sans":        ("DMSans-Regular.ttf", "DMSans-Bold.ttf"),
    "DM Sans Medium": ("DMSans-Medium.ttf", None),
    "Inter":          ("Inter-Regular.ttf", "Inter-Bold.ttf"),
    "Inter Display":  ("InterDisplay-Bold.ttf", "InterDisplay-Bold.ttf"),
}

zin = zipfile.ZipFile(stage)
names = zin.namelist()
files = {n: zin.read(n) for n in names}
zin.close()

ct = files["[Content_Types].xml"].decode()
if 'Extension="fntdata"' not in ct:
    ct = ct.replace("</Types>", '<Default Extension="fntdata" ContentType="application/x-fontdata"/></Types>')
files["[Content_Types].xml"] = ct.encode()

rels_name = "ppt/_rels/presentation.xml.rels"
rels = files[rels_name].decode()
pres = files["ppt/presentation.xml"].decode()
assert "<p:embeddedFontLst>" not in pres, "deck already has embedded fonts"

existing_ids = [int(x) for x in re.findall(r'Id="rId(\d+)"', rels)]
next_id = max(existing_ids) + 1
font_n = 1
lst = "<p:embeddedFontLst>"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/font"
for typeface, (reg, bold) in EMBED.items():
    entry = f'<p:embeddedFont><p:font typeface="{typeface}" pitchFamily="34" charset="0"/>'
    for tag, fn in (("regular", reg), ("bold", bold)):
        if not fn:
            continue
        part = f"ppt/fonts/font{font_n}.fntdata"
        files[part] = eot(os.path.join(FONTS, fn))
        rid = f"rId{next_id}"
        rels = rels.replace("</Relationships>", f'<Relationship Id="{rid}" Type="{R}" Target="fonts/font{font_n}.fntdata"/></Relationships>')
        entry += f'<p:{tag} r:id="{rid}"/>'
        next_id += 1
        font_n += 1
    lst += entry + "</p:embeddedFont>"
lst += "</p:embeddedFontLst>"

# CT_Presentation order: ... notesSz, smartTags?, embeddedFontLst, custShowLst, photoAlbum, custDataLst, kinsoku, defaultTextStyle ...
m = re.search(r"<p:notesSz[^>]*/>", pres)
assert m, "no notesSz in presentation.xml"
insert_at = m.end()
m2 = re.search(r"<p:smartTags[^>]*/>", pres[insert_at:])
if m2 and m2.start() == 0:
    insert_at += m2.end()
pres = pres[:insert_at] + lst + pres[insert_at:]
if "embedTrueTypeFonts" not in pres:
    pres = pres.replace("<p:presentation ", '<p:presentation embedTrueTypeFonts="1" ', 1)
if 'xmlns:r=' not in pres.split(">", 2)[1] and 'xmlns:r=' not in pres[:2000]:
    pres = pres.replace("<p:presentation ", '<p:presentation xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ', 1)
files[rels_name] = rels.encode()
files["ppt/presentation.xml"] = pres.encode()

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zout:
    # [Content_Types].xml first, as Office expects
    zout.writestr("[Content_Types].xml", files.pop("[Content_Types].xml"))
    for n in names:
        if n in files:
            zout.writestr(n, files.pop(n))
    for n, b in files.items():
        zout.writestr(n, b)

print("wrote", OUT, "fonts embedded:", font_n - 1, "QR A:", bool(QR_A), "QR B:", bool(QR_B))
shutil.rmtree(WORK)
