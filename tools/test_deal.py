"""Play Kell's encounter through the real UI and check credits, stock and outcomes."""
import asyncio, json, sys
from playwright.async_api import async_playwright
URL = 'file:///home/claude/vel/dist-single/rime.html'
TRAY = json.load(open('/home/claude/vel/src/art/plates/tray.json'))

async def run(script):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1600, 'height': 960})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.evaluate("localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(300); await pg.evaluate("(() => { const sc = window.__scene; sc.begin(false); let k = 1; do { sc.run.newRun(k++); } while (!sc.run.dayPlan(1).length); sc.run.fixedStock(); sc.resetView(); })()"); await pg.wait_for_timeout(4500)
        L, T, S = await pg.evaluate("(() => { const r = document.getElementById('game').getBoundingClientRect(); return [r.left, r.top, r.width / 1280]; })()")
        async def btn(label):
            r = await pg.evaluate("""(label) => { const s = window.__scene;
              // buttons are rebuilt each frame; find by drawing order via a label map
              return s.__labels ? s.__labels[label] : null }""", label)
            if not r: raise RuntimeError('no button ' + label)
            await pg.mouse.click(L + (r[0] + r[2] / 2) * 2 * S, T + (r[1] + 6) * 2 * S)
            await pg.wait_for_timeout(650)
        async def st():
            return await pg.evaluate("""(() => { const s = window.__scene, e = s.enc || { deal: {}, say: {} };
              return { phase: e ? e.phase : 'gone', ask: e.deal.ask, limit: e.deal.limit, pat: e.deal.patience, sus: e.deal.suspicion, out: e.deal.outcome,
                credits: s.wallet.credits, mins: s.wallet.minutes, say: e.say.line, note: s.note && s.note.text, offer: e.offer,
                items: s.inv.items.map(i => [i.uid, i.id, i.owner, i.where]), errs: s.inv.validate() } })()""")
        async def dragItem(uid, to):
            a = await pg.evaluate(f"(() => {{ const s = window.__scene, it = s.inv.get({uid}), p = s.itemDrawPos(it), im = s.imgFor(it); return [p.x + im.width / 2, p.y + im.height / 2]; }})()")
            await pg.mouse.move(L + a[0] * S, T + a[1] * S); await pg.mouse.down()
            await pg.mouse.move(L + to[0] * S, T + to[1] * S, steps=10); await pg.mouse.up(); await pg.wait_for_timeout(400)
        async def setOffer(v):
            await pg.wait_for_timeout(50)
            await pg.evaluate(f"window.__scene.enc.offer = {v}")
        res = await script(pg, btn, st, dragItem, setOffer, L, T, S)
        res.append(('no page errors', not errs, errs))
        await b.close()
        return res

async def happy(pg, btn, st, dragItem, setOffer, L, T, S):
    out = []
    s0 = await st()
    bundle = next(i for i in s0['items'] if i[1] == 'bundle')
    await dragItem(bundle[0], (1158, 372)); await pg.wait_for_timeout(300); s = await st()
    out.append(('scan reveals the shard', any(i[1] == 'vel' and i[2] == 'customer' for i in s['items']) and s['mins'] == s0['mins'] + 10, s['items'][-1]))
    lab = await pg.evaluate("(() => { const e = window.__scene.enc; const t = e.deal.def.tactics.find(t => t.id === 'pressure'); return t.label; })()")
    await btn(lab); s = await st()
    out.append(('tactic lowers his minimum', s['limit'] < s0['limit'], (s0['limit'], s['limit'], s['say'])))
    await setOffer(200); await btn('Make offer'); s = await st()
    out.append(('offer above credits refused, nothing spent', s['note'] == "You don't have that much." and s['credits'] == 87 and s['out'] == 'open', s['note']))
    await setOffer(5); await btn("Make offer"); s = await st()
    out.append(('lowball gets reaction', s['out'] == 'open', s['say']))
    await pg.evaluate("window.__scene.run.wallet.credits = 500"); bought = next(i[0] for i in s['items'] if i[2] == 'customer')
    s = await st()
    if s['out'] == 'open': await btn(f"Pay {s['ask']}"); s = await st()
    paid = 500 - s['credits']
    if not any(i[0] == bought for i in s['items']):
        out.append(('deal: credits paid, shard in stock', False, ('he left first', s['say']))); return out
    vel = next(i for i in s['items'] if i[0] == bought)
    out.append(('deal: credits paid, shard in stock', s['out'] == 'deal' and paid > 0 and vel[2] == 'player' and vel[3] == 'grid', (paid, vel)))
    await pg.wait_for_timeout(2600); s = await st()
    wants = await pg.evaluate("window.__scene.enc && window.__scene.enc.step && window.__scene.enc.step.wants")
    if not wants:
        out.append(('he asks to buy something (optional this seed)', True, '')); return out
    out.append(('he asks to buy something', s['phase'] == 'request', s['say']))
    stim = next(i for i in s['items'] if i[1] in wants and i[3] == 'grid')
    await dragItem(stim[0], (700, 440)); s = await st()
    out.append(('item on counter starts sale', s['phase'] == 'sell', s['phase']))
    before = s['credits']
    await setOffer(35); await btn('Name price'); s = await st()
    if s['out'] == 'open': await btn(f"Take {s['ask']}"); s = await st()
    out.append(('item sold: credits in, item gone', s['credits'] > before and not any(i[0] == stim[0] for i in s['items']), (before, s['credits'])))
    out.append(('inventory valid', not s['errs'], s['errs']))
    await pg.wait_for_timeout(7000)
    served = await pg.evaluate("window.__scene.run.served")
    out.append(('he leaves', 'Kell Abernathy' in served, served))
    return out

async def impatient(pg, btn, st, dragItem, setOffer, L, T, S):
    out = []
    for v in [20, 20, 20, 20, 20, 20]:
        s = await st()
        if s['out'] != 'open': break
        await setOffer(v); await btn('Make offer')
    s = await st()
    out.append(('repeated lowballs: he leaves with his goods', s['out'] == 'left' and not any(i[2] == 'customer' for i in s['items']) and s['credits'] == 87, (s['out'], s['say'])))
    return out

async def fullstock(pg, btn, st, dragItem, setOffer, L, T, S):
    out = []
    # fill every empty cell with rations
    await pg.evaluate("(() => { const s = window.__scene; let c; while ((c = s.inv.firstFit('ration'))) s.inv.add('ration', 'player', c); })()")
    await setOffer(80); await btn('Make offer'); s = await st()
    out.append(('full stock blocks the deal', s['note'] == 'No room in stock. Clear a space first.' and s['out'] == 'open' and s['credits'] == 87, s['note']))
    return out

async def spam(pg, btn, st, dragItem, setOffer, L, T, S):
    out = []
    r = await pg.evaluate("window.__scene.__labels['Make offer']")
    await setOffer(60)
    for _ in range(8): await pg.mouse.click(L + (r[0] + r[2] / 2) * 2 * S, T + (r[1] + 6) * 2 * S, delay=5)
    await pg.wait_for_timeout(300); s = await st()
    out.append(('8 rapid clicks = 1 action', s['mins'] == 8 * 60 + 10, s['mins']))
    await pg.wait_for_timeout(400); await btn('Walk away'); s = await st()
    out.append(('walk away: no money moved', s['out'] == 'walked' and s['credits'] == 87, s['say']))
    return out

async def main():
    allr = []
    for name, sc in [('happy path', happy), ('impatient', impatient), ('full stock', fullstock), ('spam & walk', spam)]:
        r = await run(sc); allr += [(name + ': ' + a, ok, info) for a, ok, info in r]
    for a, ok, info in allr: print('PASS' if ok else 'FAIL', a, '' if ok else info)
asyncio.run(main())
