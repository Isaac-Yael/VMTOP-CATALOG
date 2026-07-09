#!/usr/bin/env python3
"""
VMTOP – Verificador de integridad Catálogo <-> Imágenes
Uso: python3 scripts/verificar_catalogo.py

Corre esto ANTES de cada push para saber si las fotos nuevas
realmente van a aparecer en el sitio.

Explica 3 cosas que casi siempre causan "subí fotos y no se ven":
  1. Fotos en img/ que ningún producto del CSV usa (huérfanas).
     -> Subiste la foto pero nunca creaste/editaste la fila en el CSV.
  2. Filas del CSV que apuntan a una foto que no existe en img/.
     -> El link de imagen está roto (nombre mal escrito, falta subir el archivo).
  3. SKUs del CSV que no están en productos.json.
     -> El CSV se editó pero nunca se hizo push de data/catalogo.csv,
        o el GitHub Action no corrió / falló.
"""

import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, "data", "catalogo.csv")
JSON_PATH = os.path.join(ROOT, "productos.json")
IMG_DIR = os.path.join(ROOT, "img")


def cargar_csv():
    with open(CSV_PATH, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def cargar_json():
    with open(JSON_PATH, encoding="utf-8") as f:
        return json.load(f)


def main():
    rows = cargar_csv()
    productos = cargar_json()
    img_files = {f for f in os.listdir(IMG_DIR) if not f.startswith(".")}

    skus_csv = {r.get("SKU", "").strip().upper() for r in rows if r.get("SKU")}
    img_csv = {r.get("@IMAGEN", "").strip() for r in rows if r.get("@IMAGEN")}
    skus_json = {p.get("sku", "").strip().upper() for p in productos if p.get("sku")}

    huerfanas = sorted(img_files - img_csv)
    rotas = sorted(img_csv - img_files)
    csv_sin_json = sorted(skus_csv - skus_json)

    print(f"Productos en CSV:        {len(rows)}")
    print(f"Productos en JSON:       {len(productos)}")
    print(f"Archivos en img/:        {len(img_files)}")
    print()

    print(f"[1] Fotos SIN fila en el CSV (huérfanas): {len(huerfanas)}")
    if huerfanas:
        print("    Estas fotos NO aparecerán en el sitio hasta que agregues una")
        print("    fila en data/catalogo.csv con @IMAGEN = nombre exacto del archivo.")
        for f in huerfanas[:30]:
            print(f"    - {f}")
        if len(huerfanas) > 30:
            print(f"    ... y {len(huerfanas) - 30} más")
    print()

    print(f"[2] Filas del CSV con foto que NO existe en img/ (rotas): {len(rotas)}")
    if rotas:
        for f in rotas[:30]:
            print(f"    - {f}")
        if len(rotas) > 30:
            print(f"    ... y {len(rotas) - 30} más")
    print()

    print(f"[3] SKUs en CSV que faltan en productos.json: {len(csv_sin_json)}")
    if csv_sin_json:
        print("    El CSV tiene productos que el JSON todavía no refleja.")
        print("    Corre: python3 scripts/csv_to_json.py  (o espera el GitHub Action)")
        for s in csv_sin_json[:30]:
            print(f"    - {s}")
        if len(csv_sin_json) > 30:
            print(f"    ... y {len(csv_sin_json) - 30} más")
    print()

    if not huerfanas and not rotas and not csv_sin_json:
        print("Todo sincronizado: cada foto tiene producto y cada producto tiene foto.")


if __name__ == "__main__":
    main()
