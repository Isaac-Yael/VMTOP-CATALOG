import csv
import json

productos = []

with open("data/catalogo.csv", "r", encoding="utf-8-sig") as archivo:
    lector = csv.DictReader(archivo)

    for fila in lector:

        producto = {
            "sku": fila.get("SKU", "").strip(),
            "nombre": fila.get("NOMBRE", "").strip(),
            "imagen": fila.get("@IMAGEN", "").strip(),

            "precio_publico": fila.get("Publico", "").replace("$", "").strip(),
            "precio_mayoreo": fila.get("Mayoreo", "").replace("$", "").strip(),
            "precio_distribuidor": fila.get("Distribuidor", "").replace("$", "").strip(),
            "precio_caja": fila.get("Caja", "").replace("$", "").strip(),

            "piezas_caja": fila.get("PZAS", "").strip(),

            "categoria": fila.get("Categoría", "").strip(),

            "descuento": fila.get("Descuento", "").replace("%", "").strip()
        }

        productos.append(producto)

with open("productos.json", "w", encoding="utf-8") as salida:
    json.dump(
        productos,
        salida,
        ensure_ascii=False,
        indent=2
    )

print(f"Generados {len(productos)} productos")
