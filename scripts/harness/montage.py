"""Contact sheet: python scripts/harness/montage.py DIR SUFFIX COLS OUT [name1,name2,...]  (files DIR/<name>-SUFFIX.png)"""
import sys, os
from PIL import Image, ImageDraw
d, suf, cols, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
names = sys.argv[5].split(',') if len(sys.argv) > 5 else sorted(f[: -len(suf) - 5] for f in os.listdir(d) if f.endswith(f'-{suf}.png'))
ims = [(n, Image.open(os.path.join(d, f'{n}-{suf}.png')).convert('RGB')) for n in names if os.path.exists(os.path.join(d, f'{n}-{suf}.png'))]
w, h = ims[0][1].size
sc = min(1.0, 1900 / (cols * w))
tw, th = int(w * sc), int(h * sc)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * (th + 14)), (30, 30, 30))
dr = ImageDraw.Draw(sheet)
for i, (n, im) in enumerate(ims):
    x, y = (i % cols) * tw, (i // cols) * (th + 14)
    sheet.paste(im.resize((tw, th)), (x, y + 14))
    dr.text((x + 3, y + 1), n, fill=(255, 255, 0))
sheet.save(out)
