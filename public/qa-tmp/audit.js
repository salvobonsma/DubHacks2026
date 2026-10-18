(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
  const rgb = (s) => s.replace(/\s/g,'');
  const MAG = ['rgb(226,0,116)','rgb(246,40,143)','rgb(167,0,90)'];
  const txt = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g,' ').slice(0,50);
  const out = { url: location.pathname + location.search, vw: innerWidth, hscroll: document.documentElement.scrollWidth > innerWidth ? document.documentElement.scrollWidth : false };
  out.buttons = [...document.querySelectorAll('button, a.tm-btn, [role=button], a[href]')].filter(vis).map(b => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return { t: txt(b), w: Math.round(r.width), h: Math.round(r.height), fs: cs.fontSize, fw: cs.fontWeight, rad: cs.borderRadius, bg: rgb(cs.backgroundColor), col: rgb(cs.color), primary: MAG.includes(rgb(cs.backgroundColor)) }; });
  out.primaries = out.buttons.filter(b => b.primary).map(b => b.t);
  out.smallTargets = out.buttons.filter(b => b.h < 44 || b.w < 44).map(b => `${b.t} ${b.w}x${b.h}`);
  const all = [...document.body.querySelectorAll('*')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && vis(e));
  out.magentaSmallText = all.filter(e => { const cs = getComputedStyle(e); return MAG.includes(rgb(cs.color)) && parseFloat(cs.fontSize) < 18; }).map(e => `${txt(e)} ${getComputedStyle(e).fontSize}`);
  out.italic = all.filter(e => getComputedStyle(e).fontStyle === 'italic').map(txt);
  out.headings = [...document.querySelectorAll('h1,h2,h3,legend,.tm-h1,.tm-h2,.tm-h3')].filter(vis).map(h => { const cs = getComputedStyle(h); return `${h.tagName}.${h.className.toString().split(' ')[0]} "${txt(h)}" ${cs.fontSize}/${cs.lineHeight} w${cs.fontWeight} ${cs.fontFamily.split(',')[0]}`; });
  const bodyText = document.body.innerText;
  out.parens = (bodyText.match(/[^\n]{0,30}\([^\n)]{0,40}\)[^\n]{0,10}/g) || []).slice(0,15);
  out.bangs = (bodyText.match(/[^\n]{0,40}![^\n]{0,10}/g) || []).slice(0,10);
  out.inputs = [...document.querySelectorAll('input, select, textarea')].filter(vis).map(i => { const cs = getComputedStyle(i); const r = i.getBoundingClientRect(); return { id: i.id || i.name, type: i.type, im: i.inputMode || '', ac: i.autocomplete || '', ml: i.maxLength > 0 ? i.maxLength : '', h: Math.round(r.height), rad: cs.borderRadius, fs: cs.fontSize, border: cs.borderTopWidth + ' ' + rgb(cs.borderTopColor) }; });
  out.cards = [...document.querySelectorAll('.tm-card,.tm-plan,.tm-option,.tm-tile,.tm-chip,[class*=rounded]')].filter(vis).slice(0,40).map(c => `${c.className.toString().split(' ').filter(x=>/tm-|rounded/.test(x)).join('.')} r=${getComputedStyle(c).borderRadius}`);
  out.clipped = all.filter(e => { const cs = getComputedStyle(e); return (e.scrollWidth > e.clientWidth + 1 && (cs.overflow.includes('hidden') || cs.textOverflow === 'ellipsis')) ; }).map(e => `${txt(e)} sw${e.scrollWidth}>cw${e.clientWidth}`);
  out.offscreen = all.filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).map(e => `${txt(e)} [${Math.round(e.getBoundingClientRect().left)},${Math.round(e.getBoundingClientRect().right)}]`).slice(0,15);
  out.fonts = [...new Set(all.map(e => getComputedStyle(e).fontFamily.split(',')[0]))];
  out.weights = [...new Set(all.map(e => getComputedStyle(e).fontWeight))];
  return out;
})()
