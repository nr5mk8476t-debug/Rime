"""Seeds: determinism, variety, and balance across many random runs."""
import asyncio, json, sys
from playwright.async_api import async_playwright
URL = 'file:///home/claude/vel/dist-single/underhold.html'
N = int(sys.argv[1]) if len(sys.argv) > 1 else 16

BOT = """async ({ seed, policy, maxSec }) => {
  const sc = window.__scene, r = sc.run; sc.begin(false); r.newRun(seed); sc.resetView(); window.__speed = 30;
  const t0 = performance.now(); const wait = (ms) => new Promise(res => setTimeout(res, ms));
  const met = new Set(); let bought = 0, sold = 0;
  while (performance.now() - t0 < maxSec * 1000) {
    await wait(25);
    if (r.mode === 'dead') break;
    if (r.mode === 'closed') { if (r.day >= policy.days) break; r.nextDay(); sc.resetView(); continue; }
    if (sc.vs) { if (sc.shown >= sc.line.text.length && !sc.vs.lines[sc.vs.i].kill) sc.advanceVoss(); continue; }
    const e = r.enc; if (!e || e.busy > 0) continue;
    met.add(e.cust.name);
    if (e.phase === 'buy') {
      if (e.canScan) { e.inspect(); continue; }
      const it = e.item, val = it ? (window.__inv ? 0 : 0) : 0;
      const v = it ? r.inv.constructor.value(it) : [0, 0];
      const t = e.deal.def.tactics.find(t => e.deal.canUse(t) && t.shift > 0 && t.suspicion <= 1 && (!t.needsInspect || e.scanned) && t.patience >= -1);
      if (t && e.deal.patience > 2) { e.useTactic(t); continue; }
      const fair = Math.round(v[0] * 0.75);
      e.offer = Math.min(r.wallet.credits - (policy.reserve || 0), fair, e.deal.ask);
      if (policy.refuse || e.offer <= 5 || !r.inv.firstFit(it.id)) { e.walkAway(); continue; }
      const before = r.wallet.credits; e.makeOffer(); if (r.wallet.credits < before) bought++; continue;
    }
    if (e.phase === 'request') {
      const st = e.step; const it = r.inv.onGrid().find(i => st.wants.includes(i.id));
      if (!it || policy.refuse) { e.walkAway(); continue; }
      r.inv.moveToCounter(it.uid, 600, 405); e.itemOffered(it); continue;
    }
    if (e.phase === 'sell') {
      if (e.deal.patience <= 2) { const b = r.wallet.credits; e.acceptHis(); if (r.wallet.credits > b) sold++; continue; }
      e.offer = Math.max(1, Math.round((e.deal.ask * 1.3) / 5) * 5);
      const b = r.wallet.credits; e.makeOffer(); if (r.wallet.credits > b) sold++; continue;
    }
  }
  window.__speed = 1;
  return { seed, day: r.day, mode: r.mode, credits: r.wallet.credits, met: [...met], bought, sold, errs: r.inv.validate() };
}"""

async def main():
    out = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(); await pg.goto(URL); await pg.wait_for_timeout(400)
        # ---- determinism & variety (pure generation, instant)
        det = await pg.evaluate("""(() => { const r = window.__scene.run; const plans = (seed) => { r.newRun(seed); return { stock: r.inv.items.map(i => i.id + i.col + ',' + i.row + ':' + (i.cond||1).toFixed(2)).join(' '), days: [1,2,3,4,5,6,7,8,9,10].map(d => r.dayPlan(d).join(',')).join(' | ') }; };
          const a = plans(12345), a2 = plans(12345), b = plans(999);
          const many = []; for (let s = 1; s <= 40; s++) many.push(plans(s * 7919));
          const vossDays = []; for (let s = 1; s <= 40; s++) { r.newRun(s * 31); for (let d = 1; d <= 5; d++) if (r.dayPlan(d).includes('voss')) vossDays.push(d); }
          return { same: a.stock === a2.stock && a.days === a2.days, diff: a.days !== b.days && a.stock !== b.stock,
            uniqueStocks: new Set(many.map(m => m.stock)).size, uniqueWeeks: new Set(many.map(m => m.days)).size,
            vossDays: [...new Set(vossDays)].sort(), sample: [a.days, b.days] }; })()""")
        out.append(('same seed, same run', det['same'], ''))
        out.append(('different seeds differ', det['diff'], ''))
        out.append(('40 seeds -> 40 different starting stocks', det['uniqueStocks'] == 40, det['uniqueStocks']))
        out.append(('40 seeds -> 40 different weeks of customers', det['uniqueWeeks'] == 40, det['uniqueWeeks']))
        out.append(("Voss's early visit moves between days 2-4", det['vossDays'] == [2, 3, 4], det['vossDays']))
        print('seed 12345:', det['sample'][0][:120]); print('seed 999:  ', det['sample'][1][:120])
        # ---- visits differ for the same customer across seeds
        vis = await pg.evaluate("""(() => { const r = window.__scene.run; const res = new Set();
          for (let s = 1; s <= 12; s++) { r.newRun(s); r.day = 2; r.startDay(); r.plan = ['marrow']; r.queueIdx = 0; r.gap = 0; r.update(0.01);
            const st = r.enc.visit.steps[0]; res.add(st.kind === 'sell' ? st.item + '@' + st.deal.open + (st.inst.fault ? '/' + st.inst.fault : '') : st.kind); r.enc = null; r.current = null; }
          return [...res]; })()""")
        out.append(('Old Marrow brings different things each run', len(vis) >= 8, vis))
        print('Marrow across 12 seeds:', vis)
        await pg.close()
        # ---- balance: a careful trader across N seeds, 4 at a time
        async def play(seed):
            q = await b.new_page(); await q.goto(URL); await q.evaluate("localStorage.clear()"); await q.wait_for_timeout(300)
            res = await q.evaluate(BOT, { 'seed': seed, 'policy': { 'days': 5, 'reserve': 0 }, 'maxSec': 200 }); await q.close(); return res
        seeds = [1000 + 37 * i for i in range(N)]
        results = []
        for i in range(0, N, 4): results += await asyncio.gather(*[play(s) for s in seeds[i:i + 4]])
        alive = [r for r in results if r['mode'] == 'closed' and r['day'] == 5]
        for r in results: print(f"seed {r['seed']}: {'SURVIVED' if r in alive else 'DIED day ' + str(r['day'])} credits {r['credits']} bought {r['bought']} sold {r['sold']} met {len(r['met'])}: {', '.join(r['met'])[:90]}")
        rate = len(alive) / len(results)
        out.append((f'careful trader survives most seeds but not all ({len(alive)}/{len(results)})', 0.5 <= rate <= 0.95, rate))
        out.append(('no inventory errors in any run', all(not r['errs'] for r in results), [r['errs'] for r in results if r['errs']]))
        await b.close()
    for n, ok, info in out: print('PASS' if ok else 'FAIL', n, '' if ok else info)
asyncio.run(main())
