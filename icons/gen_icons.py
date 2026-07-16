from PIL import Image, ImageDraw
import math

def make_icon(size, path):
    img = Image.new("RGB", (size, size), (10, 10, 10))
    draw = ImageDraw.Draw(img, "RGBA")

    cx, cy = size / 2, size / 2
    r = size * 0.34

    # soft glow rings
    for i in range(6, 0, -1):
        alpha = int(10 + i * 4)
        rr = r * (1 + i * 0.09)
        draw.ellipse(
            [cx - rr, cy - rr, cx + rr, cy + rr],
            outline=(80, 220, 255, alpha),
            width=max(1, size // 120),
        )

    # light trail spiral (represents a light-painting streak)
    points = []
    turns = 2.3
    steps = 140
    for i in range(steps):
        t = i / (steps - 1)
        angle = t * turns * 2 * math.pi
        rad = r * (0.15 + 0.85 * t)
        x = cx + rad * math.cos(angle)
        y = cy + rad * math.sin(angle)
        points.append((x, y))

    for i in range(len(points) - 1):
        t = i / (len(points) - 2)
        width = max(2, int(size * (0.008 + 0.02 * t)))
        alpha = int(90 + 165 * t)
        color = (
            int(80 + (255 - 80) * t),
            int(220 + (255 - 220) * (1 - abs(t - 0.5) * 2) * 0.3),
            255,
            alpha,
        )
        draw.line([points[i], points[i + 1]], fill=color, width=width)

    # bright core dot at the end of the trail
    end = points[-1]
    core_r = size * 0.045
    draw.ellipse(
        [end[0] - core_r, end[1] - core_r, end[0] + core_r, end[1] + core_r],
        fill=(255, 255, 255, 235),
    )

    img.save(path, "PNG")

make_icon(192, "icon-192.png")
make_icon(512, "icon-512.png")
print("done")
