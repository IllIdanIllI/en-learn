window.__decorate6 = function (opt, stage) {
  const TODAY = '2026-10-20';
  const YESTERDAY_CORRECT = 3; // example: correct answers yesterday
  const closed = stage === 'closed';
  const night = document.documentElement.classList.contains('dark');
  const PX = window.PX4;
  const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
  const nav = document.querySelector('nav');
  const SPEC = {
    A: { H: 78, spec: { far: [[0.18, 2, 0.3, 10, 3], [0.48, 2, 0.1, 11, 6], [0.72, 2, 0.4, 10, 1], [0.94, 2, 0.2, 11, 4]], near: [[0.08, 3, 0.25, 12, 4], [0.3, 4, 0.05, 13, 2], [0.62, 3, 0.35, 12, 7], [0.82, 4, 0.15, 14, 5]] } },
    B: { H: 58, spec: { far: [[0.25, 2, 0.15, 10, 1], [0.55, 2, 0.05, 11, 4], [0.85, 2, 0.35, 10, 6]], near: [[0.15, 3, 0.2, 11, 3], [0.35, 4, 0.0, 12, 5], [0.7, 3, 0.3, 10, 2]] } },
    C: { H: 92, W: 64, spec: { far: [[0.2, 2, 0.1, 10, 5], [0.45, 2, 0.25, 11, 1], [0.7, 2, 0.0, 10, 3]], near: [[0.1, 3, 0.3, 12, 4], [0.32, 4, 0.02, 13, 2], [0.58, 3, 0.15, 12, 7], [0.8, 3, 0.4, 11, 3]] } },
  }[opt];
  function plant() {
    nav.querySelector('.jp-sky')?.remove();
    const links = nav.querySelectorAll('a');
    const top = links[links.length - 1].getBoundingClientRect().bottom - nav.getBoundingClientRect().top + 12;
    const h = Math.max(80, nav.clientHeight - top);
    const navW = nav.clientWidth;
    const W = SPEC.W || Math.floor(navW / 2);
    const groveH = Math.min(SPEC.H, Math.floor(h / 2) - 10);
    const groveLeft = SPEC.W ? Math.round((navW - W * 2) / 2) - 18 : 0;
    const flies = !night ? '' : [[0.3, 0.74], [0.62, 0.68], [0.48, 0.82], [0.15, 0.66], [0.8, 0.76], [0.38, 0.6], [0.7, 0.86], [0.9, 0.62], [0.22, 0.84], [0.55, 0.58]].slice(0, YESTERDAY_CORRECT).map(([x, y], i) => `<span class="jp-fly" title="Верных ответов вчера: ${YESTERDAY_CORRECT}" style="left:${Math.round(x * navW)}px;top:${Math.round(y * h)}px;animation-delay:${i * 0.7}s"></span>`).join('');
    const moonHtml = night ? `<div class="moon" style="left:18px;right:auto" title="Луна сегодня">${PX.moonPhase(PX.phaseOf(TODAY), 7, 2)}</div>` : '';
    let parts = `<div class="grove" style="left:${groveLeft}px">${PX.grove(W, groveH, 2, SPEC.spec)}</div>`;
    if (opt === 'A') parts += `<div style="position:absolute;left:0;bottom:0">${PX.fence(Math.floor(navW / 2), 2)}</div><div class="toro" style="left:6px;bottom:0;z-index:2">${PX.toro2(night, 3)}</div><div style="position:absolute;right:30px;bottom:2px">${PX.shoot(2)}</div><div style="position:absolute;right:52px;bottom:2px">${PX.shoot(2)}</div>${closed ? `<div style="position:absolute;left:56px;bottom:0;z-index:2;display:flex;gap:3px;filter:drop-shadow(2px 0 0 var(--background)) drop-shadow(-2px 0 0 var(--background)) drop-shadow(0 -2px 0 var(--background))" title="Урок закрыт">${PX.geta(2)}${PX.geta(2)}</div>` : ''}${moonHtml}`;
    if (opt === 'B') parts += `<div style="position:absolute;right:0;top:0">${PX.branch(Math.floor(navW / 2), 46, 2)}</div><div style="position:absolute;left:18px;top:14px">${PX.moon(2)}</div><div style="position:absolute;right:26px;bottom:2px">${PX.shoot(2)}</div><div class="toro" style="left:auto;right:56px;bottom:0">${PX.toro2(true, 2)}</div>`;
    if (opt === 'C') parts += `<div class="toro" style="left:auto;right:20px;bottom:0">${PX.toro2(night, 3)}</div><div style="position:absolute;left:16px;bottom:2px">${PX.shoot(2)}</div>${moonHtml}`;
    nav.appendChild(el(`<div class="jp-sky" style="height:${h}px">${parts}${flies}</div>`));
  }
  plant();
  window.addEventListener('resize', plant);

  const route = location.hash.replace('#/', '');
  const main = document.querySelector('main');
  const header = main.querySelector('header');
  const summary = main.querySelector('section[aria-labelledby="feedback-title"]');
  const SESSION_DATE = '2026-10-20';
  const blocks = [...main.querySelectorAll('section[aria-labelledby^="block-"]')];
  blocks.forEach((b, i) => {
    const h2 = b.querySelector('h2'); if (h2) h2.prepend(el(`<span class="jp-leaf">${PX.leaf(2)}</span>`));
    if (i > 0) b.before(el(`<div class="jp-divider">${PX.divider(Math.floor(b.clientWidth / 2), 2)}</div>`));
  });
  if (route === 'today' && header && !summary && stage !== 'loading') {
    const inputs = [...main.querySelectorAll('input')].filter((i) => i.type === 'text' || !i.type);
    if (inputs.length) {
      const done = inputs.filter((i) => i.value.trim() !== '').length;
      header.appendChild(el(`<div class="jp-meter">${PX.stalkMeter(inputs.map((_, i) => (i < done ? 'ok' : 'empty')))}<span class="label tabular">Ответов: ${done} из ${inputs.length}</span></div>`));
    }
  }
  if (route === 'today' && summary) {
    let right = 0, total = 0;
    summary.querySelectorAll('ul li.label').forEach((li) => { const m = li.textContent.match(/(\d+)\s*из\s*(\d+)/); if (m) { right += +m[1]; total += +m[2]; } });
    summary.querySelector('h2').after(el(`<div class="jp-hero"><div class="num">${right}<span style="font-size:1.2rem;color:var(--muted-foreground)"> / ${total}</span></div><div><div class="jp-sub">Верно ${right} из ${total} · жёлтые колена к повтору</div><div style="margin-top:8px">${PX.stalkMeter(Array.from({ length: total }, (_, i) => (i < right ? 'ok' : 'bad')), 12)}</div></div></div>`));
  }
  if (stage === 'loading') {
    const box = main.querySelector('ol')?.closest('.flex-col');
    if (box && !box.querySelector('section')) box.appendChild(el(`<section class="rounded-md bg-card p-4 jp-mocktip"><h3 class="label text-muted-foreground">Пока вы ждёте</h3><p class="answer mt-2"><span>She is <b style="color:var(--destructive)">an</b> teacher</span> → <span>She is <b style="color:var(--success)">a</b> teacher</span></p></section>`));
  }
  if (route === 'errors') {
    main.querySelectorAll('tbody tr').forEach((tr) => { const td = tr.querySelector('td'); if (td) td.prepend(el(`<span class="jp-chipleaf" style="margin-right:6px">${PX.chipLeaf(true, 2)}</span>`)); });
  }
};
