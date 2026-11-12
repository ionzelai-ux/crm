"""Genera los QR de los carteles.

Cambia BASE por la dirección donde publiques la página y vuelve a ejecutar:
    python semana-gratis/hacer-qr.py
Cada QR lleva ?src=... para saber en el CRM de qué cartel viene cada reserva.
"""
import re
from pathlib import Path

import segno

BASE = "https://semana.codektraining.es/"
QRS = {
    "qr-puerta.svg": BASE + "?src=puerta",  # puerta de la calle
    "qr-hall.svg": BASE + "?src=hall",      # puerta del gimnasio, dentro del hall
}

aqui = Path(__file__).resolve().parent
for nombre, url in QRS.items():
    # Corrección de errores alta: sigue leyéndose aunque el cartel se ensucie o le dé el sol.
    qr = segno.make(url, error="h")
    destino = aqui / nombre
    qr.save(destino, scale=10, border=0, dark="#0e0f11", light=None)
    # Con viewBox el SVG se escala al tamaño del cartel sin recortarse.
    svg = destino.read_text(encoding="utf-8")
    svg = re.sub(r'width="(\d+)" height="(\d+)"', r'viewBox="0 0 \1 \2"', svg, count=1)
    destino.write_text(svg, encoding="utf-8")
    print(nombre, "->", url, f"(version {qr.version})")
