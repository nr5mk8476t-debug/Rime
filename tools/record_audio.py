"""Record the game's real audio output while scripted events fire; writes shots/audio_preview.webm"""
import asyncio, base64, json
from playwright.async_api import async_playwright
TRAY = json.load(open('/home/claude/vel/src/art/plates/tray.json'))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1600, 'height': 960})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto('file:///home/claude/vel/dist-single/rime.html'); await pg.wait_for_timeout(400)
        L, T, S = await pg.evaluate("(() => { const r = document.getElementById('game').getBoundingClientRect(); return [r.left, r.top, r.width / 1280]; })()")
        await pg.mouse.click(L + 20, T + 20)   # first gesture starts audio
        await pg.evaluate("""(() => { const s = window.__sound; const d = s.ctx.createMediaStreamDestination();
          (s.outNode || s.master).connect(d); const rec = new MediaRecorder(d.stream, { mimeType: 'audio/webm' }); window.__chunks = []; window.__marks = [];
          rec.ondataavailable = e => window.__chunks.push(e.data); rec.start(); window.__rec = rec; window.__t0 = s.ctx.currentTime; })()""")
        mark = lambda name: pg.evaluate(f"window.__marks.push(['{name}', window.__sound.ctx.currentTime - window.__t0])")
        cell = lambda c, r: (L + (TRAY['x'] + (c + 0.5) * TRAY['cw']) * S, T + (TRAY['y'] + (r + 0.5) * TRAY['ch']) * S)
        async def drag(a, z):
            await pg.mouse.move(*a); await pg.mouse.down(); await pg.mouse.move(*z, steps=10); await pg.mouse.up()
        await mark('ambience'); await pg.wait_for_timeout(6000)
        await mark('kell speaks'); await pg.keyboard.press('1'); await pg.wait_for_timeout(2500)
        await mark('pick+drop metal'); await drag(cell(2, 0), cell(12, 3)); await pg.wait_for_timeout(900)
        await mark('locket'); await drag(cell(5, 2), cell(9, 3)); await pg.wait_for_timeout(900)
        await mark('deny'); await drag(cell(4, 0), cell(0, 0)); await pg.wait_for_timeout(1000)
        await mark('scan tagged')
        bx = await pg.evaluate("(() => { const s = window.__scene, it = s.inv.items.find(i => i.id === 'bundle'), p = s.itemDrawPos(it), im = s.imgFor(it); return [p.x + im.width / 2, p.y + im.height / 2]; })()")
        await drag((L + bx[0] * S, T + bx[1] * S), (L + 1158 * S, T + 372 * S)); await pg.wait_for_timeout(3500)
        await mark('buttons + offer')
        r = await pg.evaluate("window.__scene.__labels['+10']")
        for _ in range(3): await pg.mouse.click(L + (r[0] + r[2] / 2) * 2 * S, T + (r[1] + 6) * 2 * S); await pg.wait_for_timeout(180)
        r = await pg.evaluate("window.__scene.__labels['Make offer']"); await pg.mouse.click(L + (r[0] + r[2] / 2) * 2 * S, T + (r[1] + 6) * 2 * S); await pg.wait_for_timeout(3000)
        await mark('register'); await pg.evaluate("(() => { const e = window.__scene.enc; e.busy = 0; e.offer = 87; e.makeOffer(); e.busy = 0; if (e.deal.open) e.acceptHis(); })()"); await pg.wait_for_timeout(3000)
        await mark('tremor'); await pg.keyboard.press('t'); await pg.wait_for_timeout(3000)
        await mark('voss'); await pg.keyboard.press('2'); await pg.wait_for_timeout(5000)
        await mark('after hours'); await pg.keyboard.press('n'); await pg.wait_for_timeout(5000)
        await pg.evaluate("window.__rec.stop()"); await pg.wait_for_timeout(600)
        data = await pg.evaluate("""(async () => { const b = new Blob(window.__chunks, { type: 'audio/webm' }); const buf = new Uint8Array(await b.arrayBuffer());
          let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]); return btoa(s); })()""")
        open('/home/claude/vel/shots/audio_preview.webm', 'wb').write(base64.b64decode(data))
        marks = await pg.evaluate("window.__marks")
        json.dump(marks, open('/home/claude/vel/shots/audio_marks.json', 'w'))
        print('marks', [(m[0], round(m[1], 1)) for m in marks]); print('errors', errs)
        await b.close()
asyncio.run(main())
