from PIL import Image, ImageDraw
import math

def generate_app_icon(size, output_path):
    img = Image.new("RGBA", (size, size), (15, 23, 42, 255)) # Dark slate background (#0f172a)
    draw = ImageDraw.Draw(img)
    
    # Outer circular glow
    margin = size * 0.05
    cx, cy = size / 2, size / 2
    r_outer = size / 2 - margin
    
    # Subtle background circle
    draw.ellipse([cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer], fill=(20, 30, 55, 255), outline=(6, 182, 212, 180), width=int(size * 0.02))
    
    # Draw mountain silhouettes
    # Back mountain (slate purple)
    m1 = [
        (size * 0.15, size * 0.75),
        (size * 0.42, size * 0.32),
        (size * 0.70, size * 0.75)
    ]
    draw.polygon(m1, fill=(51, 65, 85, 255))
    
    # Middle mountain (emerald Atlas pine)
    m2 = [
        (size * 0.48, size * 0.75),
        (size * 0.72, size * 0.38),
        (size * 0.92, size * 0.75)
    ]
    draw.polygon(m2, fill=(16, 185, 129, 220))

    # Foreground dominant peak (Itzer / Col du Zad crest - cyan gradient)
    m3 = [
        (size * 0.22, size * 0.75),
        (size * 0.50, size * 0.24),
        (size * 0.78, size * 0.75)
    ]
    draw.polygon(m3, fill=(6, 182, 212, 255))
    
    # Snowcap / ridge highlight
    snowcap = [
        (size * 0.50, size * 0.24),
        (size * 0.43, size * 0.37),
        (size * 0.50, size * 0.34),
        (size * 0.57, size * 0.37)
    ]
    draw.polygon(snowcap, fill=(240, 249, 255, 255))
    
    # Mountain shadow side
    shadow = [
        (size * 0.50, size * 0.24),
        (size * 0.78, size * 0.75),
        (size * 0.50, size * 0.75)
    ]
    draw.polygon(shadow, fill=(8, 145, 178, 200))
    
    # 3D Contour curves (rings)
    for rad, alpha in [(0.40, 60), (0.45, 90)]:
        r = size * rad
        draw.arc([cx - r, cy - r, cx + r, cy + r], 210, 330, fill=(6, 182, 212, alpha), width=int(size * 0.015))
    
    # Red GPS Summit Marker
    summit_x, summit_y = size * 0.50, size * 0.24
    dot_r = size * 0.04
    draw.ellipse([summit_x - dot_r, summit_y - dot_r, summit_x + dot_r, summit_y + dot_r], fill=(239, 68, 68, 255), outline=(255, 255, 255, 255), width=int(size * 0.012))
    
    # "3D" text or badge at the bottom
    # Base ground bar
    draw.rectangle([size * 0.12, size * 0.74, size * 0.88, size * 0.78], fill=(6, 182, 212, 255))
    
    img.save(output_path, "PNG")
    print(f"Generated {output_path} ({size}x{size})")

generate_app_icon(192, "icon-192.png")
generate_app_icon(512, "icon-512.png")
