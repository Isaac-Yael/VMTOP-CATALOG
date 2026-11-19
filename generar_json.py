#!/usr/bin/env python3
"""
VMTOP – Convertidor CSV → productos.json
Uso: python3 generar_json.py

Hace lo mismo que el GitHub Action: toda la lógica (categorías reducidas,
orden con Navidad primero, corrección de imágenes) está en scripts/csv_to_json.py
"""
import os
import runpy

runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scripts', 'csv_to_json.py'), run_name='__main__')
