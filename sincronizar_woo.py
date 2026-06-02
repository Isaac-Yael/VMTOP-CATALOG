#!/usr/bin/env python3
"""
VMTOP – Sincronizador productos.json → WooCommerce
Uso: python3 sincronizar_woo.py
"""

import json
import os
import sys
import time
import requests
from requests.auth import HTTPBasicAuth

# ─── Configuración desde .env ────────────────────────────────────────
def cargar_env(path='.env'):
    config = {}
    if not os.path.exists(path):
        print(f"❌ No se encontró {path}")
        sys.exit(1)
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                config[k.strip()] = v.strip()
    return config

ENV    = cargar_env()
URL    = ENV.get('WC_URL', '').rstrip('/')
KEY    = ENV.get('WC_KEY', '')
SECRET = ENV.get('WC_SECRET', '')
# URL base donde viven las imágenes (tu GitHub Pages o vmtop.mx)
IMG_BASE = ENV.get('IMG_BASE_URL', '').rstrip('/')

if not all([URL, KEY, SECRET]):
    print("❌ Faltan WC_URL, WC_KEY o WC_SECRET en .env")
    sys.exit(1)

AUTH    = HTTPBasicAuth(KEY, SECRET)
API     = f"{URL}/wp-json/wc/v3"
HEADERS = {'Content-Type': 'application/json'}

# ─── Helpers ─────────────────────────────────────────────────────────
def get(endpoint, params=None):
    r = requests.get(f"{API}{endpoint}", auth=AUTH, params=params, timeout=30)
    r.raise_for_status()
    return r.json()

def post(endpoint, data):
    r = requests.post(f"{API}{endpoint}", auth=AUTH, json=data, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()

def put(endpoint, data):
    r = requests.put(f"{API}{endpoint}", auth=AUTH, json=data, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()

# ─── Categorías ───────────────────────────────────────────────────────
def obtener_categorias():
    cats = {}
    page = 1
    while True:
        data = get('/products/categories', {'per_page': 100, 'page': page})
        if not data:
            break
        for c in data:
            cats[c['name'].strip()] = c['id']
        if len(data) < 100:
            break
        page += 1
    return cats

def obtener_o_crear_categoria(nombre, cache):
    nombre = nombre.strip()
    if nombre in cache:
        return cache[nombre]
    # Crear categoría
    nueva = post('/products/categories', {'name': nombre})
    cache[nombre] = nueva['id']
    print(f"  📁 Categoría creada: {nombre}")
    return nueva['id']

# ─── Buscar producto por SKU ──────────────────────────────────────────
def buscar_por_sku(sku):
    resultados = get('/products', {'sku': sku.upper(), 'per_page': 1})
    if resultados:
        return resultados[0]
    # Intentar también en minúsculas
    resultados = get('/products', {'sku': sku.lower(), 'per_page': 1})
    return resultados[0] if resultados else None

# ─── Construir payload del producto ──────────────────────────────────
def construir_payload(p, cat_id):
    payload = {
        'name':          p['nombre'],
        'sku':           p['sku'].upper(),
        'regular_price': str(p.get('precio_publico', 0)),
        'sale_price':    str(p.get('precio_mayoreo', 0)),
        'status':        'publish',
        'catalog_visibility': 'visible',
        'categories':    [{'id': cat_id}] if cat_id else [],
        'meta_data': [
            {'key': '_precio_mayoreo',      'value': str(p.get('precio_mayoreo', 0))},
            {'key': '_precio_distribuidor', 'value': str(p.get('precio_distribuidor', 0))},
            {'key': '_precio_caja',         'value': str(p.get('precio_caja', 0))},
            {'key': '_piezas_caja',         'value': str(p.get('piezas_caja', 0))},
            {'key': '_descuento',           'value': str(p.get('descuento', 0))},
        ],
    }

    # Imagen
    if p.get('imagen') and IMG_BASE:
        img_url = f"{IMG_BASE}/img/{p['imagen'].lower()}"
        payload['images'] = [{'src': img_url, 'alt': p['nombre']}]

    # Descripción con precios
    piezas = p.get('piezas_caja', 0)
    payload['short_description'] = (
        f"SKU: {p['sku']} | "
        f"Mayoreo: ${p.get('precio_mayoreo',0):.2f} | "
        f"Distribuidor: ${p.get('precio_distribuidor',0):.2f} | "
        f"Caja ({piezas} pzas): ${p.get('precio_caja',0):.2f}"
    )

    return payload

# ─── Main ─────────────────────────────────────────────────────────────
def main():
    if not os.path.exists('productos.json'):
        print("❌ No se encontró productos.json")
        sys.exit(1)

    with open('productos.json', encoding='utf-8') as f:
        productos = json.load(f)

    print(f"📦 {len(productos)} productos en el JSON")
    print(f"🔗 Conectando a {URL}...\n")

    # Verificar conexión
    try:
        get('/products', {'per_page': 1})
        print("✅ Conexión exitosa con WooCommerce\n")
    except Exception as e:
        print(f"❌ Error de conexión: {e}")
        sys.exit(1)

    # Cargar categorías existentes
    print("📁 Cargando categorías...")
    cat_cache = obtener_categorias()
    print(f"   {len(cat_cache)} categorías encontradas\n")

    creados   = 0
    actualizados = 0
    errores   = 0

    for i, p in enumerate(productos, 1):
        sku = p.get('sku', '').strip()
        if not sku:
            continue

        try:
            # Obtener o crear categoría
            cat_nombre = p.get('categoria', '').strip()
            cat_id = obtener_o_crear_categoria(cat_nombre, cat_cache) if cat_nombre else None

            payload = construir_payload(p, cat_id)
            existente = buscar_por_sku(sku)

            if existente:
                put(f"/products/{existente['id']}", payload)
                actualizados += 1
                estado = "✏️  actualizado"
            else:
                post('/products', payload)
                creados += 1
                estado = "✨ creado"

            print(f"[{i}/{len(productos)}] {sku} – {estado}")

            # Pequeña pausa para no saturar el servidor
            time.sleep(0.3)

        except Exception as e:
            errores += 1
            print(f"[{i}/{len(productos)}] ❌ {sku} – Error: {e}")

    print(f"\n{'─'*40}")
    print(f"✅ Creados:      {creados}")
    print(f"✏️  Actualizados: {actualizados}")
    print(f"❌ Errores:      {errores}")
    print(f"{'─'*40}")

if __name__ == '__main__':
    main()
