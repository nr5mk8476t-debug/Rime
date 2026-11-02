"""Screenshot the running dev build at real scale for visual review.
usage: python3 tools/shot.py out.png [wait_seconds] [js_to_run_before]
Also writes out_native.png (1:1 canvas pixels) for close inspection."""
import sys, asyncio
from playwright.async_api import async_playwright

out = sys.argv[1]
wait = float(sys.argv[2]) if len(sys.argv) > 2 else 2
js = sys.argv[3] if len(sys.argv) > 3 else ''

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1920, 'height': 1110})
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        import os; await pg.goto(os.environ.get('URL', 'file:///home/claude/vel/dist-single/rime.html'))
        await pg.wait_for_timeout(500)
        if js:
            await pg.evaluate(js)
        await pg.wait_for_timeout(wait * 1000)
        await pg.screenshot(path=out)
        data = await pg.evaluate("document.getElementById('game').toDataURL()")
        import base64
        open(out.replace('.png', '_native.png'), 'wb').write(base64.b64decode(data.split(',')[1]))
        for l in logs: print(l)
        await b.close()

asyncio.run(main())

# zoomed crop of an area of interest (native coords) for close inspection
from PIL import Image
if len(sys.argv) > 4:
    x, y, w, h = map(int, sys.argv[4].split(','))
    im = Image.open(out.replace('.png', '_native.png')).crop((x, y, x + w, y + h))
    z = max(1, min(1600 // w, 1000 // h))
    im.resize((w * z, h * z), Image.NEAREST).save(out.replace('.png', '_zoom.png'))
