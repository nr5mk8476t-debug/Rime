"""Automated edge-case checks for inventory dragging, run against the built page."""
import asyncio, json
from playwright.async_api import async_playwright
URL = 'file:///home/claude/vel/dist-single/underhold.html'
TRAY = json.load(open('/home/claude/vel/src/art/plates/tray.json'))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1600, 'height': 960})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.evaluate("localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(300); await pg.evaluate("(() => { const sc = window.__scene; sc.begin(false); sc.run.newRun(1); sc.run.fixedStock(); sc.resetView(); })()"); await pg.wait_for_timeout(4500)
        box = await pg.evaluate("(() => { const r = document.getElementById('game').getBoundingClientRect(); return [r.left, r.top, r.width / 1280]; })()")
        L, T, S = box
        def dev(x, y): return (L + x * S, T + y * S)
        def cell(c, r): return dev(TRAY['x'] + (c + 0.5) * TRAY['cw'], TRAY['y'] + (r + 0.5) * TRAY['ch'])
        async def state():
            return await pg.evaluate("(() => { const s = window.__scene; return { items: s.inv.items.map(i => [i.uid, i.id, i.where, i.col, i.row]), errs: s.inv.validate(), note: s.note && s.note.text, sel: s.selected }; })()")
        async def drag(a, z, steps=12, release=True):
            await pg.mouse.move(*a); await pg.mouse.down()
            await pg.mouse.move(*z, steps=steps)
            if release: await pg.mouse.up()
            await pg.wait_for_timeout(260)
        def find(st, uid): return next(i for i in st['items'] if i[0] == uid)
        results = []
        def check(name, ok, info=''): results.append(('PASS' if ok else 'FAIL', name, info))

        s0 = await state(); n0 = len(s0['items'])
        check('starts valid', not s0['errs'], s0['errs'])
        # 1 move a ration to an empty cell
        rid = next(i[0] for i in s0['items'] if i[1] == 'ration' and i[3] == 10)
        await drag(cell(10, 0), cell(12, 3))
        s = await state(); it = find(s, rid)
        check('move to empty cell', it[2] == 'grid' and it[3] == 12 and it[4] == 3, it)
        # 2 drop pistol onto the forearm -> refused, unchanged
        pid = next(i[0] for i in s['items'] if i[1] == 'pistol')
        before = find(s, pid)
        await drag(cell(2, 0), cell(0, 0))
        s = await state(); check('overlap refused', find(s, pid) == before and s['note'] == 'Something is in the way.', (find(s, pid), s['note']))
        # 3 drill (2x2) dragged off the right edge -> out of bounds refused
        did = next(i[0] for i in s['items'] if i[1] == 'drill')
        before = find(s, did)
        await drag(cell(4, 0), cell(12, 2))
        s = await state(); check('out of bounds refused', find(s, did) == before, (find(s, did), s['note']))
        # 4 stim to the counter
        sid = next(i[0] for i in s['items'] if i[1] == 'stim' and i[3] == 2)
        await drag(cell(2, 2), dev(700, 440))
        s = await state(); check('grid -> counter', find(s, sid)[2] == 'counter', find(s, sid))
        # 5 and back to the grid
        cx = await pg.evaluate(f"(() => {{ const s = window.__scene, it = s.inv.get({sid}), p = s.itemDrawPos(it), im = s.imgFor(it); return [p.x + im.width / 2, p.y + im.height / 2]; }})()")
        await drag(dev(*cx), cell(11, 3))
        s = await state(); check('counter -> grid', find(s, sid)[2] == 'grid' and find(s, sid)[3] == 11, find(s, sid))
        # 6 customer's bundle cannot enter stock
        bid = next(i[0] for i in s['items'] if i[1] == 'bundle')
        bx = await pg.evaluate(f"(() => {{ const s = window.__scene, it = s.inv.get({bid}), p = s.itemDrawPos(it), im = s.imgFor(it); return [p.x + im.width / 2, p.y + im.height / 2]; }})()")
        await drag(dev(*bx), cell(9, 3))
        s = await state(); check("customer goods can't be stocked", find(s, bid)[2] == 'counter' and 'Not yours' in (s['note'] or ''), (find(s, bid), s['note']))
        # 7 escape mid-drag returns the item
        lid = next(i[0] for i in s['items'] if i[1] == 'locket')
        before = find(s, lid)
        await drag(cell(5, 2), cell(9, 3), release=False)
        await pg.keyboard.press('Escape'); await pg.mouse.up(); await pg.wait_for_timeout(260)
        s = await state(); check('escape cancels', find(s, lid) == before, find(s, lid))
        # 8 dropped in empty space returns home
        await drag(cell(5, 2), dev(60, 60))
        s = await state(); check('drop outside returns', find(s, lid) == before, find(s, lid))
        # 9 click selects, rapid repeated clicks do nothing destructive
        await pg.mouse.click(*cell(0, 2)); await pg.wait_for_timeout(100)
        s = await state(); eye = next(i[0] for i in s['items'] if i[1] == 'eye')
        check('click selects', s['sel'] == eye, s['sel'])
        for _ in range(12): await pg.mouse.click(*cell(1, 2), delay=5)
        s = await state(); check('rapid clicks harmless', len(s['items']) == n0 and not s['errs'], s['errs'])
        # 10 many random drags never break invariants
        import random
        random.seed(4)
        for k in range(40):
            a = cell(random.randrange(13), random.randrange(4)); z = cell(random.randrange(13), random.randrange(4))
            if random.random() < 0.2: z = dev(560 + random.random() * 200, 430)
            await drag(a, z, steps=4)
        s = await state(); check('40 random drags: no loss/dupes/overlaps', len(s['items']) == n0 and not s['errs'], (len(s['items']), s['errs']))
        check('no page errors', not errs, errs)
        await pg.screenshot(path='/home/claude/vel/shots/after_tests.png')
        for r in results: print(*r)
        await b.close()
asyncio.run(main())
