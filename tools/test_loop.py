"""Five-day loop tests: an automated shopkeeper plays whole runs through the game's own controls."""
import asyncio, json
from playwright.async_api import async_playwright
URL = 'file:///home/claude/vel/dist-single/rime.html'

BOT = """async ({ policy, maxSec }) => {
  const sc = window.__scene, r = sc.run; window.__speed = 12;
  const log = []; const t0 = performance.now();
  const wait = (ms) => new Promise(res => setTimeout(res, ms));
  while (performance.now() - t0 < maxSec * 1000) {
    await wait(40);
    if (r.mode === 'dead') { log.push('DEAD day ' + r.day); break; }
    if (r.mode === 'closed') {
      log.push(`closed day ${r.day} credits ${r.wallet.credits} paid ${r.paid}`);
      if (r.day >= policy.days) break;
      r.nextDay(); sc.resetView(); continue;
    }
    if (sc.vs) { if (sc.shown >= sc.line.text.length && !sc.vs.lines[sc.vs.i].kill) sc.advanceVoss(); continue; }
    if (policy.payEarly && !r.paid && r.wallet.credits >= r.rent && !r.enc) { r.payRent(); log.push(`paid early on day ${r.day}`); }
    const e = r.enc; if (!e || e.busy > 0) continue;
    if (e.phase === 'buy') {
      if (e.canScan && e.item) { const it = e.item; e.inspect(); continue; }
      const t = e.deal.def.tactics.find(t => e.deal.canUse(t) && t.shift > 0 && t.suspicion <= 1 && (!t.needsInspect || e.scanned));
      if (t && policy.tactics) { e.useTactic(t); continue; }
      e.offer = Math.min(r.wallet.credits, Math.round((e.deal.ask * 0.75) / 5) * 5);
      if (policy.refuseBuys || e.offer <= 0 || !r.inv.firstFit(e.item.id)) { e.walkAway(); continue; }
      e.makeOffer(); continue;
    }
    if (e.phase === 'request') {
      const st = e.step; const it = r.inv.onGrid().find(i => st.wants.includes(i.id));
      if (!it || policy.refuseSells) { e.walkAway(); continue; }
      r.inv.moveToCounter(it.uid, 600, 405); e.itemOffered(it); continue;
    }
    if (e.phase === 'sell') {
      e.offer = Math.max(1, Math.round((e.deal.ask * 1.25) / 5) * 5);
      if (e.deal.patience <= 2) { e.acceptHis(); continue; }
      e.makeOffer(); continue;
    }
  }
  window.__speed = 1;
  return { log, day: r.day, mode: r.mode, credits: r.wallet.credits, errs: r.inv.validate(), cause: r.deathCause };
}"""

async def main():
    results = []
    def check(n, ok, info=''): results.append((n, ok, info))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        async def fresh():
            pg = await b.new_page(viewport={'width': 1600, 'height': 960})
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(URL); await pg.evaluate("localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(500)
            return pg, errs

        # 1 a decent trader survives the first rent
        pg, errs = await fresh()
        await pg.evaluate("(() => { const sc = window.__scene; sc.begin(false); sc.run.newRun(1592); sc.resetView(); })()")
        res = await pg.evaluate(BOT, { 'policy': { 'days': 5, 'tactics': True, 'payEarly': True }, 'maxSec': 150 })
        print('\n'.join(res['log']))
        check('trader survives day 5', res['mode'] == 'closed' and res['day'] == 5, res)
        check('rent paid early during the run', any('paid early' in l for l in res['log']), res['log'])
        check('inventory valid after 5 days', not res['errs'], res['errs'])
        check('no page errors (trader)', not errs, errs)
        await pg.close()

        # 2 someone who refuses every deal dies at the deadline
        pg, errs = await fresh()
        await pg.evaluate("(() => { const sc = window.__scene; sc.begin(false); sc.run.newRun(1592); sc.resetView(); })()")
        res = await pg.evaluate(BOT, { 'policy': { 'days': 5, 'refuseBuys': True, 'refuseSells': True }, 'maxSec': 150 })
        check('broke player dies at the deadline', res['mode'] == 'dead' and 'You owed' in res['cause'], (res['mode'], res['cause'], res['log'][-2:]))
        check('save wiped after death', await pg.evaluate("!localStorage.getItem('rime.save.v1')"))
        check('no page errors (broke)', not errs, errs)
        await pg.close()

        # 3 early payment: settles once, refuses a second payment, survives the deadline without money
        pg, errs = await fresh()
        out = await pg.evaluate("""(() => { const sc = window.__scene, r = sc.run; sc.begin(false); r.wallet.credits = 500;
          const a = r.payRent(); const c1 = r.wallet.credits; const b = r.payRent(); const c2 = r.wallet.credits;
          r.wallet.credits = 0; r.day = 5; r.startDay(); r.queueIdx = r.queue.length; r.closeDay();
          return { a, b, c1, c2, mode: r.mode, note: r.summary && r.summary.rentNote }; })()""")
        check('early pay takes rent once', out['a'] is None and out['c1'] == 500 - 160, out)
        check('second payment refused, no money taken', out['b'] == 'Already paid this cycle.' and out['c2'] == 500 - 160, out)
        check('paid cycle survives deadline with 0 credits', out['mode'] == 'closed' and 'already settled' in out['note'], out)
        # insufficient early payment refused
        out = await pg.evaluate("(() => { const r = window.__scene.run; r.day = 6; r.startDay(); r.wallet.credits = 10; return [r.payRent(), r.wallet.credits, r.rent]; })()")
        check('cycle 2 rent rises, early pay refused when short', out[0] == "You don't have enough." and out[1] == 10 and out[2] > 160, out)
        # auto collect when affordable
        out = await pg.evaluate("(() => { const r = window.__scene.run; r.day = 10; r.startDay(); r.wallet.credits = 1000; r.queueIdx = r.queue.length; r.closeDay(); return [r.mode, r.wallet.credits, r.rent, r.summary.rentNote]; })()")
        check('auto-collect at deadline when affordable', out[0] == 'closed' and out[1] == 1000 - out[2] and 'collected' in out[3], out)
        await pg.close()

        # 4 save and continue between customers restores the same state
        pg, errs = await fresh()
        await pg.evaluate("window.__scene.begin(false)")
        await pg.evaluate(BOT, { 'policy': { 'days': 2, 'tactics': True }, 'maxSec': 60 })
        before = await pg.evaluate("(() => { const r = window.__scene.run; r.nextDay(); return { day: r.day, credits: r.wallet.credits, items: r.inv.onGrid().map(i => [i.id, i.col, i.row]).sort(), paid: r.rentPaid }; })()")
        await pg.reload(); await pg.wait_for_timeout(600)
        has = await pg.evaluate("window.__scene.run.constructor.hasSave()")
        await pg.evaluate("window.__scene.begin(true)")
        after = await pg.evaluate("(() => { const r = window.__scene.run; return { day: r.day, credits: r.wallet.credits, items: r.inv.onGrid().map(i => [i.id, i.col, i.row]).sort(), paid: r.rentPaid }; })()")
        check('continue offered after reload', has)
        check('save/continue restores day, credits, stock', before == after, (before, after))
        check('no page errors (save)', not errs, errs)
        # 5 dev restart day returns to the morning
        out = await pg.evaluate("""(async () => { const r = window.__scene.run; const c0 = r.wallet.credits; r.wallet.credits += 999;
          r.restartDay(); return [c0, r.wallet.credits, r.day, r.queueIdx]; })()""")
        check('dev restart day resets to the morning', out[0] == out[1] and out[3] == 0, out)
        await pg.close()
        await b.close()
    for n, ok, info in results: print('PASS' if ok else 'FAIL', n, '' if ok else info)
asyncio.run(main())
