"""Makes the Android launcher icons and splash screens from the Sandveld logo (frontend/src/assets/logo.png).

Run from the project root with the venv (Pillow is installed there):
    venv\\Scripts\\python.exe desktop-app\\scripts\\make-android-icons.py
It rewrites the PNGs under frontend/android/app/src/main/res (mipmap-* = launcher icons, drawable/splash_screen.xml + drawable-nodpi/splash_logo.png = splash)
and the one colour in values/ic_launcher_background.xml. The logo is a round badge, so it sits on a deep green square
(the app's own green): adaptive icons crop to whatever shape the phone uses, so the badge is kept inside the safe middle.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOGO = os.path.join(ROOT, "desktop-app", "frontend", "src", "assets", "logo.png")
RES = os.path.join(ROOT, "desktop-app", "frontend", "android", "app", "src", "main", "res")
GREEN = (18, 61, 47)  # #123d2f, the green scheme's sidebar
DENSITY = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}

logo = Image.open(LOGO).convert("RGBA")


def badge(size):
    return logo.resize((size, size), Image.LANCZOS)


def save(img, *parts):
    path = os.path.join(RES, *parts)
    img.save(path)


for name, scale in DENSITY.items():
    # Adaptive icon: a 108dp canvas, the badge in its middle ~60% (the part every phone shape keeps).
    canvas = round(108 * scale)
    foreground = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    size = round(canvas * 0.60)
    foreground.paste(badge(size), ((canvas - size) // 2, (canvas - size) // 2), badge(size))
    save(foreground, f"mipmap-{name}", "ic_launcher_foreground.png")

    # Older phones (before Android 8) show these as they are: the badge on the green square, or in a circle.
    icon = round(48 * scale)
    square = Image.new("RGBA", (icon, icon), GREEN + (255,))
    inner = round(icon * 0.84)
    square.paste(badge(inner), ((icon - inner) // 2, (icon - inner) // 2), badge(inner))
    save(square, f"mipmap-{name}", "ic_launcher.png")
    round_icon = Image.new("RGBA", (icon, icon), (0, 0, 0, 0))
    mask = Image.new("L", (icon * 4, icon * 4), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).ellipse((0, 0, icon * 4 - 1, icon * 4 - 1), fill=255)
    disc = Image.new("RGBA", (icon, icon), GREEN + (255,))
    disc.paste(badge(round(icon * 0.84)), ((icon - round(icon * 0.84)) // 2,) * 2, badge(round(icon * 0.84)))
    round_icon.paste(disc, (0, 0), mask.resize((icon, icon), Image.LANCZOS))
    save(round_icon, f"mipmap-{name}", "ic_launcher_round.png")

# Splash screen: the window background is a layer-list (the green with the badge centred at a fixed size), because a
# plain image used as a background is stretched to the screen's shape and squashes the round badge into an oval.
os.makedirs(os.path.join(RES, "drawable-nodpi"), exist_ok=True)
badge(512).save(os.path.join(RES, "drawable-nodpi", "splash_logo.png"))
with open(os.path.join(RES, "drawable", "splash_screen.xml"), "w", encoding="utf-8") as f:
    f.write('''<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/ic_launcher_background" />
    <item android:width="200dp" android:height="200dp" android:gravity="center">
        <bitmap android:src="@drawable/splash_logo" android:gravity="fill" />
    </item>
</layer-list>
''')

with open(os.path.join(RES, "values", "ic_launcher_background.xml"), "w", encoding="utf-8") as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#123D2F</color>\n</resources>\n')
print("icons and splash screens written")
