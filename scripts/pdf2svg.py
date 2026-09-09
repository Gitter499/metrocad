#!/usr/bin/env python3
"""Convert page 1 of a PDF map to SVG with text preserved (for MetroCAD's official-map import).
usage: pip install pymupdf && python scripts/pdf2svg.py map.pdf map.svg"""
import sys, pymupdf
src, dst = sys.argv[1], sys.argv[2]
page = pymupdf.open(src)[0]
open(dst, 'w').write(page.get_svg_image(text_as_path=False))
print(f'{dst}: {page.rect.width:.0f} x {page.rect.height:.0f} pt')
