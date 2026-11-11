# -*- coding: utf-8 -*-
"""Génère og.png (1200 × 630), l'image d'aperçu affichée quand le lien du portfolio est partagé
(LinkedIn, courriel, messagerie).

L'écoulement dessiné est le même que celui de la page d'accueil : écoulement potentiel autour
d'un profil de Joukowski, circulation fixée par la condition de Kutta.

    python scripts/build_og.py
"""
import cmath
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
W, H, S = 1200, 630, 2                      # S : suréchantillonnage pour l'anticrénelage
BG, INK, MUTED = (8, 12, 21), (231, 235, 244), (151, 162, 184)
BLUE, TEAL, GREEN = (112, 144, 255), (45, 212, 191), (34, 197, 94)
FONTS = Path('C:/Windows/Fonts')


def font(size, bold=False):
    for name in (('segoeuib.ttf', 'arialbd.ttf') if bold else ('segoeui.ttf', 'arial.ttf')):
        try:
            return ImageFont.truetype(str(FONTS / name), size * S)
        except OSError:
            continue
    return ImageFont.load_default()


def lerp(a, b, k):
    return tuple(round(a[i] + (b[i] - a[i]) * k) for i in range(3))


def background():
    img = Image.new('RGB', (W * S, H * S), BG)
    glow = Image.new('RGB', img.size, BG)
    d = ImageDraw.Draw(glow)
    d.ellipse([-260 * S, -330 * S, 420 * S, 300 * S], fill=lerp(BG, BLUE, .42))
    d.ellipse([760 * S, -300 * S, 1420 * S, 260 * S], fill=lerp(BG, TEAL, .26))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(110 * S)), .9)
    grid = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(grid)
    for x in range(0, W, 56):
        d.line([x * S, 0, x * S, H * S], fill=(120, 140, 190, 16), width=S)
    for y in range(0, H, 56):
        d.line([0, y * S, W * S, y * S], fill=(120, 140, 190, 16), width=S)
    return Image.alpha_composite(img.convert('RGBA'), grid)


def flow(img, cx, cy, scale, x0, x1, y0, y1, alpha_deg=6.0):
    """Lignes de courant et profil, dans le rectangle [x0, x1] × [y0, y1]."""
    mu = complex(-0.09, 0.075)
    a = abs(1 - mu)
    al = math.radians(alpha_deg)
    s = 1 - mu
    gamma = ((cmath.exp(-1j * al) - a * a * cmath.exp(1j * al) / (s * s)) * s * 2j * math.pi).real

    def dw(z):
        d = z - mu
        return cmath.exp(-1j * al) - a * a * cmath.exp(1j * al) / (d * d) + 1j * gamma / (2 * math.pi * d)

    def to_screen(zeta):
        r = (zeta + 1 / zeta) * cmath.exp(-1j * al)
        return cx + r.real * scale, cy - r.imag * scale

    def from_screen(x, y):
        z = complex((x - cx) / scale, -(y - cy) / scale) * cmath.exp(1j * al)
        q = cmath.sqrt(z * z - 4)
        s1, s2 = (z + q) / 2, (z - q) / 2
        return s1 if abs(s1) >= abs(s2) else s2

    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    n = 22
    for i in range(n):
        zeta = from_screen(x0, y0 + (i + .5) / n * (y1 - y0))
        if abs(zeta - mu) < a * 1.002:
            continue
        pts = []
        for _ in range(2400):
            w = dw(zeta)
            j = max(abs(1 - 1 / (zeta * zeta)) ** 2, .04)
            zeta += w.conjugate() / j * .006
            x, y = to_screen(zeta)
            if x > x1:
                break
            pts.append((x, y))
        for k in range(len(pts) - 1):
            (xa, ya), (xb, yb) = pts[k], pts[k + 1]
            t = (xa - x0) / (x1 - x0)
            fade = min(1, t / .22, (1 - t) / .12)            # fondu aux deux extrémités
            if fade <= 0:
                continue
            col = lerp(BLUE, TEAL, t) + (round(150 * fade),)
            d.line([xa * S, ya * S, xb * S, yb * S], fill=col, width=round(1.6 * S))
    foil = [to_screen(mu + a * cmath.exp(2j * math.pi * k / 240)) for k in range(241)]
    foil = [(x * S, y * S) for x, y in foil]
    d.polygon(foil, fill=(16, 23, 38, 255))
    d.line(foil, fill=BLUE + (255,), width=round(2.4 * S), joint='curve')
    return Image.alpha_composite(img, layer)


def gradient_text(img, xy, text, fnt, c0, c1):
    d = ImageDraw.Draw(img)
    l, t, r, b = d.textbbox(xy, text, font=fnt)
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).text(xy, text, font=fnt, fill=255)
    grad = Image.new('RGBA', img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for x in range(l, r + 1):
        gd.line([x, t, x, b], fill=lerp(c0, c1, (x - l) / max(1, r - l)) + (255,))
    img.paste(grad, (0, 0), mask)


def main():
    img = background()
    img = flow(img, cx=1005, cy=140, scale=70, x0=800, x1=1200, y0=24, y1=252)
    d = ImageDraw.Draw(img)
    p = lambda *v: [round(x * S) for x in v]

    # marque « ET »
    mark = Image.new('RGBA', (64 * S, 64 * S), (0, 0, 0, 0))
    md = ImageDraw.Draw(mark)
    for x in range(64 * S):
        md.line([x, 0, x, 64 * S], fill=lerp((43, 92, 255), (0, 169, 154), x / (64 * S)) + (255,))
    mask = Image.new('L', mark.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, 64 * S - 1, 64 * S - 1], radius=17 * S, fill=255)
    img.paste(mark, (72 * S, 62 * S), mask)
    d.text(p(104, 93), 'ET', font=font(25, True), fill=(255, 255, 255), anchor='mm')

    d.text(p(72, 168), 'Emmanuel Tchouya', font=font(82, True), fill=INK)
    gradient_text(img, tuple(p(74, 282)), 'Ingénierie système et essais · Aéronautique',
                  font(33, True), BLUE, TEAL)

    stats = [('Exigences', 'traçabilité et vérification'), ('Essais', 'instrumentation et analyse'),
             ('Simulation', 'modèles et calculs publics')]
    x = 72
    for n, label in stats:
        fn, fl = font(50, True), font(21)
        wn = d.textlength(n, font=fn) / S
        wl = d.textlength(label, font=fl) / S
        d.rounded_rectangle(p(x, 398, x + 4, 492), radius=2 * S, fill=lerp(BLUE, TEAL, (x - 72) / 800))
        d.text(p(x + 22, 388), n, font=fn, fill=INK)
        d.text(p(x + 22, 458), label, font=fl, fill=MUTED)
        x += max(wn, wl) + 22 + 54

    d.line(p(72, 540, 1128, 540), fill=(30, 39, 56), width=S)
    d.ellipse(p(72, 569, 86, 583), fill=GREEN)
    d.text(p(98, 560), 'Disponible janvier 2027 · Montréal (Québec)', font=font(23, True), fill=INK)
    d.text(p(1128, 562), 'emmatchouya-source.github.io/portfolio', font=font(21), fill=MUTED, anchor='ra')

    out = img.convert('RGB').resize((W, H), Image.LANCZOS)
    out.save(ROOT / 'og.png', optimize=True)
    print('og.png', out.size, (ROOT / 'og.png').stat().st_size, 'octets')


if __name__ == '__main__':
    main()
