#!/usr/bin/env python3
"""
Genera el catálogo PDF de VMTOP (mismo diseño que el de InDesign) a partir de productos.json.

Uso (desde la carpeta VMTOP-CATALOG):
    python3 scripts/generar_catalogo_pdf.py
    python3 scripts/generar_catalogo_pdf.py --fecha "17 DE SEPTIEMBRE"   (solo si la portada no trae la fecha)
    python3 scripts/generar_catalogo_pdf.py --salida pdf/CATALOGO.pdf --sin-portada

Requisitos (una sola vez):
    pip3 install playwright pillow
    python3 -m playwright install chromium

Qué hace:
  1. Copia catalogo-pdf.html, productos.json y pdf/portada.jpg a una carpeta temporal.
  2. Reduce las imágenes de img/ a 400 px (para que el PDF pese ~25 MB y no cientos de MB).
  3. Abre la plantilla en Chromium sin ventana y la imprime a PDF A4.
"""
import argparse
import datetime
import functools
import http.server
import json
import os
import shutil
import sys
import tempfile
import threading
import urllib.parse

MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO',
         'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def preparar_imagenes(productos, destino, lado=400):
    from PIL import Image
    faltan = []
    for p in productos:
        nombre = p.get('imagen') or ''
        src = os.path.join(RAIZ, 'img', nombre)
        if not nombre or not os.path.isfile(src):
            faltan.append(p.get('sku'))
            continue
        try:
            im = Image.open(src)
            if im.mode in ('RGBA', 'LA', 'P'):
                im = im.convert('RGBA')
                fondo = Image.new('RGB', im.size, 'white')
                fondo.paste(im, mask=im.split()[-1])
                im = fondo
            else:
                im = im.convert('RGB')
            im.thumbnail((lado, lado), Image.LANCZOS)
            im.save(os.path.join(destino, nombre), 'JPEG', quality=80, optimize=True)
        except Exception as e:  # imagen dañada o no descargada de iCloud
            faltan.append(f"{p.get('sku')} ({e.__class__.__name__})")
    return faltan


def main():
    hoy = datetime.date.today()
    ap = argparse.ArgumentParser(description='Genera el catálogo PDF de VMTOP')
    ap.add_argument('--fecha', default='',
                    help='Sobrepone un banner con este texto en la portada (no hace falta si pdf/portada.jpg ya trae la fecha)')
    ap.add_argument('--salida', default=os.path.join(RAIZ, 'pdf', f'CATALOGO-{hoy:%Y-%m-%d}.pdf'))
    ap.add_argument('--sin-portada', action='store_true')
    args = ap.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit('Falta Playwright: pip3 install playwright pillow && python3 -m playwright install chromium')

    with open(os.path.join(RAIZ, 'productos.json'), encoding='utf-8') as f:
        productos = json.load(f)

    tmp = tempfile.mkdtemp(prefix='vmtop-pdf-')
    try:
        os.makedirs(os.path.join(tmp, 'img'))
        shutil.copy(os.path.join(RAIZ, 'catalogo-pdf.html'), tmp)
        shutil.copy(os.path.join(RAIZ, 'productos.json'), tmp)
        shutil.copytree(os.path.join(RAIZ, 'pdf', 'fonts'), os.path.join(tmp, 'pdf', 'fonts'))
        shutil.copy(os.path.join(RAIZ, 'pdf', 'portada.jpg'), os.path.join(tmp, 'pdf'))
        shutil.copy(os.path.join(RAIZ, 'pdf', 'sombra.png'), os.path.join(tmp, 'pdf'))
        print(f'Preparando {len(productos)} imágenes…')
        faltan = preparar_imagenes(productos, os.path.join(tmp, 'img'))

        class Silencioso(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a):
                pass
        handler = functools.partial(Silencioso, directory=tmp)
        srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()

        q = {'fecha': args.fecha} if args.fecha else {}
        if args.sin_portada:
            q['portada'] = '0'
        url = f'http://127.0.0.1:{srv.server_port}/catalogo-pdf.html?' + urllib.parse.urlencode(q)

        print('Generando PDF…')
        with sync_playwright() as pw:
            nav = pw.chromium.launch()
            page = nav.new_page()
            page.goto(url)
            page.wait_for_selector('body[data-listo="1"]', timeout=180_000)
            os.makedirs(os.path.dirname(os.path.abspath(args.salida)), exist_ok=True)
            page.pdf(path=args.salida, format='A4', print_background=True,
                     margin={'top': '0', 'right': '0', 'bottom': '0', 'left': '0'},
                     prefer_css_page_size=True)
            nav.close()
        srv.shutdown()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    mb = os.path.getsize(args.salida) / 1e6
    print(f'Listo: {args.salida} ({mb:.1f} MB)')
    if faltan:
        print(f'Productos sin imagen ({len(faltan)}): ' + ', '.join(map(str, faltan)))


if __name__ == '__main__':
    main()
