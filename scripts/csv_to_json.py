#!/usr/bin/env python3
"""
VMTOP – Convertidor data/catalogo.csv → productos.json

Lo usan tanto `python3 generar_json.py` (en tu Mac) como el GitHub Action
"Generar Catalogo JSON", así los dos producen exactamente el mismo archivo.

Además de convertir:
  • Reduce las categorías del CSV (ej. "Hogar / Navidad / Iluminacion") a una
    lista corta de categorías generales (ver CATEGORIAS y reglas abajo).
  • Ordena los productos por categoría (Navidad primero), respetando dentro de
    cada categoría el orden del CSV. La página y el catálogo PDF usan este orden.
  • Corrige nombres de imagen que no coinciden con el archivo en img/
    (mayúsculas, espacio raro, .jpg vs .png).

La categoría original del CSV se conserva en el campo "categoria_origen".
Para cambiar dónde cae un producto, ajusta REGLAS o PALABRAS_CLAVE.
"""
import csv
import json
import os
import re
import unicodedata

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(RAIZ, 'data', 'catalogo.csv')
JSON_PATH = os.path.join(RAIZ, 'productos.json')
IMG_DIR = os.path.join(RAIZ, 'img')
MAS_VENDIDOS_PATH = os.path.join(RAIZ, 'data', 'mas-vendidos.txt')
MAS_VENDIDOS = 'Los más vendidos'

# Orden en que aparecen en la página y en el PDF
CATEGORIAS = [
    MAS_VENDIDOS,      # lista de data/mas-vendidos.txt
    'Navidad',
    'Entretenimiento',
    'Audio',
    'Cargadores y cables',
    'Celulares y tecnología',
    'Iluminación',
    'Hogar',
    'Cocina',
    'Ventiladores',
    'Salud y belleza',
    'Papelería',
    'Ferretería',
    'Otros',
]


def _n(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', ' ', s).strip()


# Palabras en el NOMBRE que mandan el producto a una categoría sin importar la
# categoría del CSV (se revisan en este orden).
PALABRAS_CLAVE = [
    ('Navidad', r'navide|navidad|santa claus|arbol de navidad|nacimiento|serie de luces|serie led|cascada de \d+ focos|cortina de luces'),
]

# Palabras para productos de categorías genéricas del CSV
# (Novedades, Oferta, Todo, Temporada, Renombre, 1HORA, Accesorios…)
PALABRAS_GENERICAS = [
    ('Entretenimiento', r'consola|control (ps|play|xbox)|naipes|juguete'),
    ('Audio',           r'bocina|audifon|diadema|airpods|microfono|receptor de audio|lentes .*audifon'),
    ('Ventiladores',    r'ventilador'),
    ('Cargadores y cables', r'cable|cargador|cubo|combo|power ?bank|magsafe|adaptador|otg'),
    ('Celulares y tecnologia', r'smart ?watch|reloj inteligente|soporte para celular|teclado|mouse|memoria|transmisor|camara'),
    ('Iluminación',     r'\bled\b|foco|lampara|luz|panel'),
    ('Cocina',          r'termo|vaso|taza|cocina|licuadora'),
    ('Ferretería',      r'cutter|cuter|desarmador|destornillador|llave'),
    ('Hogar',           r'escritorio|organizador|antena|multicontacto'),
]

# Categoría del CSV → categoría nueva. Se busca primero la ruta completa más
# larga que coincida (ej. "hogar / navidad" antes que "hogar").
REGLAS = {
    'hogar / navidad': 'Navidad',
    'hogar / cocina': 'Cocina',
    'hogar / papeleria': 'Papelería',
    'hogar / ventiladores': 'Ventiladores',
    'hogar': 'Hogar',
    'temporada': None,           # regalos de temporada → palabras clave / Otros
    'juguetes': 'Entretenimiento',
    'entretenimiento': 'Entretenimiento',
    'audifonos': 'Audio',
    'bocinas': 'Audio',
    'bafles': 'Audio',
    'diademas': 'Audio',
    'renombre / audifonos': 'Audio',
    'renombre / cables': 'Cargadores y cables',
    'renombre / combo cargador': 'Cargadores y cables',
    'renombre / cubo de carga': 'Cargadores y cables',
    'renombre / power bank': 'Cargadores y cables',
    'renombre / smartwatch': 'Celulares y tecnología',
    'cables': 'Cargadores y cables',
    'cargadores': 'Cargadores y cables',
    'power banks': 'Cargadores y cables',
    '1hora / cables': 'Cargadores y cables',
    'computo': 'Celulares y tecnología',
    'memorias': 'Celulares y tecnología',
    'smartwatch': 'Celulares y tecnología',
    'soportes para celular': 'Celulares y tecnología',
    'accesorios para celular': 'Celulares y tecnología',
    'transmisores': 'Celulares y tecnología',
    'seguridad': 'Celulares y tecnología',
    'iluminacion': 'Iluminación',
    'ventiladores': 'Ventiladores',
    'salud y belleza': 'Salud y belleza',
    'ferreteria': 'Ferretería',
}


def categoria_nueva(cat_csv, nombre):
    nom = _n(nombre)
    for cat, patron in PALABRAS_CLAVE:
        if re.search(patron, nom):
            return cat
    partes = [p.strip() for p in _n(cat_csv).split('/') if p.strip()]
    for k in range(len(partes), 0, -1):
        clave = ' / '.join(partes[:k])
        if clave in REGLAS:
            if REGLAS[clave]:
                # micrófonos y receptores de audio viven en "Cómputo"/"Accesorios" del CSV
                if REGLAS[clave] == 'Celulares y tecnología' and re.search(r'microfono|receptor de audio', nom):
                    return 'Audio'
                return REGLAS[clave]
            break
    for cat, patron in PALABRAS_GENERICAS:
        if re.search(patron, nom):
            return 'Celulares y tecnología' if cat == 'Celulares y tecnologia' else cat
    return 'Otros'


def limpiar_precio(valor):
    limpio = re.sub(r'[$,\s]', '', str(valor or ''))
    try:
        return float(limpio)
    except ValueError:
        return 0.0


def limpiar_descuento(valor):
    limpio = re.sub(r'[%\s]', '', str(valor or ''))
    try:
        return float(limpio)
    except ValueError:
        return 0.0


def entero(valor, defecto):
    limpio = re.sub(r'[,$\s]', '', str(valor or ''))
    try:
        return int(float(limpio))
    except ValueError:
        return defecto


def resolver_imagen(nombre, imgs, por_base):
    """Devuelve el archivo real de img/ que corresponde al nombre del CSV."""
    n = (nombre or '').replace('\xa0', ' ').strip()
    if not n:
        return ''
    if n in imgs:
        return n
    low = n.lower()
    if low in imgs:
        return low
    base = os.path.splitext(low)[0].strip()
    if base in por_base:
        return por_base[base]
    return low


def main():
    if not os.path.exists(CSV_PATH):
        print(f'❌ No se encontró {CSV_PATH}')
        return
    imgs = set(os.listdir(IMG_DIR)) if os.path.isdir(IMG_DIR) else set()
    por_base = {}
    for f in sorted(imgs):
        b = os.path.splitext(f.lower())[0].replace('\xa0', ' ').strip()
        # preferimos .jpg si hay varias extensiones
        if b not in por_base or f.lower().endswith('.jpg'):
            por_base[b] = f

    productos = []
    with open(CSV_PATH, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            row = {(k or '').strip().lstrip('@'): (v or '').strip() for k, v in row.items()}
            sku = row.get('SKU', '')
            if not sku:
                continue
            cat_csv = row.get('Categoría', row.get('Categoria', row.get('CATEGORIA', '')))
            nombre = row.get('NOMBRE', '')
            inv = row.get('Inventario', row.get('inventario', row.get('INVENTARIO', '')))
            productos.append({
                'sku': sku,
                'nombre': nombre,
                'imagen': resolver_imagen(row.get('IMAGEN', ''), imgs, por_base),
                'precio_publico': limpiar_precio(row.get('Publico', row.get('PUBLICO'))),
                'precio_mayoreo': limpiar_precio(row.get('Mayoreo', row.get('MAYOREO'))),
                'precio_distribuidor': limpiar_precio(row.get('Distribuidor', row.get('DISTRIBUIDOR'))),
                'precio_caja': limpiar_precio(row.get('Caja', row.get('CAJA'))),
                'piezas_caja': entero(row.get('PZAS', row.get('piezas')), 0),
                'categoria': categoria_nueva(cat_csv, nombre),
                'categoria_origen': cat_csv,
                'descuento': limpiar_descuento(row.get('Descuento', row.get('DESCUENTO'))),
                'inventario': entero(inv, -1) if inv else -1,
            })

    # Los más vendidos: se pasan a su propia categoría, al inicio,
    # en el orden de data/mas-vendidos.txt
    top = []
    if os.path.exists(MAS_VENDIDOS_PATH):
        with open(MAS_VENDIDOS_PATH, encoding='utf-8-sig') as f:
            top = [l.strip().upper() for l in f if l.strip() and not l.strip().startswith('#')]
    pos_top = {s: i for i, s in enumerate(top)}
    for p in productos:
        if p['sku'].strip().upper() in pos_top:
            p['categoria'] = MAS_VENDIDOS

    orden = {c: i for i, c in enumerate(CATEGORIAS)}
    productos = [p for _, p in sorted(enumerate(productos),
                                      key=lambda ip: (orden.get(ip[1]['categoria'], len(orden)),
                                                      pos_top.get(ip[1]['sku'].strip().upper(), 0), ip[0]))]
    no_encontrados = [s for s in top if s not in {p['sku'].strip().upper() for p in productos}]
    if no_encontrados:
        print('⚠ Más vendidos que no están en el CSV: ' + ', '.join(no_encontrados))

    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(productos, f, ensure_ascii=False, indent=2)

    conteo = {}
    for p in productos:
        conteo[p['categoria']] = conteo.get(p['categoria'], 0) + 1
    print(f'✅ {len(productos)} productos exportados a productos.json')
    for c in CATEGORIAS:
        if c in conteo:
            print(f'   {conteo[c]:5d}  {c}')
    sin = [p['sku'] for p in productos if p['imagen'] and p['imagen'] not in imgs]
    if imgs and sin:
        print(f'⚠ Sin foto en img/ ({len(sin)}): ' + ', '.join(sin))


if __name__ == '__main__':
    main()
