#!/usr/bin/env python3
"""
VMTOP – Convertidor CSV → productos.json
Uso: python3 generar_json.py
"""

import csv
import json
import re
import os

CSV_PATH  = 'data/catalogo.csv'
JSON_PATH = 'productos.json'

def limpiar_precio(valor):
    """Convierte '$1,234.00' o '1234' a float. Devuelve 0 si falla."""
    if not valor:
        return 0
    limpio = re.sub(r'[$,\s]', '', str(valor))
    try:
        return float(limpio)
    except ValueError:
        return 0

def limpiar_descuento(valor):
    """Convierte '20%' o '20' a float."""
    if not valor:
        return 0
    limpio = re.sub(r'[%\s]', '', str(valor))
    try:
        return float(limpio)
    except ValueError:
        return 0

def main():
    if not os.path.exists(CSV_PATH):
        print(f"❌ No se encontró {CSV_PATH}")
        return

    productos = []

    with open(CSV_PATH, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, 1):
            # Normalizar nombres de columnas (quitar espacios y @)
            row = {k.strip().lstrip('@'): v.strip() for k, v in row.items()}

            producto = {
                'sku':                  row.get('SKU', ''),
                'nombre':               row.get('NOMBRE', ''),
                'imagen':               row.get('IMAGEN', '').lower(),
                'precio_publico':       limpiar_precio(row.get('Publico',      row.get('PUBLICO', 0))),
                'precio_mayoreo':       limpiar_precio(row.get('Mayoreo',      row.get('MAYOREO', 0))),
                'precio_distribuidor':  limpiar_precio(row.get('Distribuidor', row.get('DISTRIBUIDOR', 0))),
                'precio_caja':          limpiar_precio(row.get('Caja',         row.get('CAJA', 0))),
                'piezas_caja':          int(float(re.sub(r'[,$\s]', '', str(row.get('PZAS', row.get('piezas', 0)))) or 0)),
                'categoria':            row.get('Categoría', row.get('Categoria', row.get('CATEGORIA', ''))),
                'descuento':            limpiar_descuento(row.get('Descuento', row.get('DESCUENTO', 0))),
            }

            productos.append(producto)

    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(productos, f, ensure_ascii=False, indent=2)

    print(f"✅ {len(productos)} productos exportados a {JSON_PATH}")

if __name__ == '__main__':
    main()
