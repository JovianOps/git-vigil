const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const number = new Intl.NumberFormat('en-US');

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function longDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function weekdayName(iso) {
  return WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
}

function plural(count, word, words) {
  return count === 1 ? word : words || `${word}s`;
}

function quote(message) {
  const trimmed = String(message || '').trim();
  if (!trimmed) return 'an empty message';
  return `“${trimmed.length > 96 ? `${trimmed.slice(0, 96)}…` : trimmed}”`;
}

function windowNote(s) {
  const w = s.weight.window;
  if (!w || w.covered >= w.total) return '';
  return ` Those figures cover only the ${number.format(w.covered)} most recent commits — diffing all ${number.format(w.total)} costs git about a minute.`;
}

function disclosure(s) {
  const parts = [];
  if (s.truncated) parts.push(`the most recent ${number.format(s.totals.commits)} of ${number.format(s.totals.commitsAll)} commits`);
  if (s.unreadableDates) parts.push(`${number.format(s.unreadableDates)} commit(s) with an unreadable date left out`);
  if (s.unreadableRecords) parts.push(`${number.format(s.unreadableRecords)} record(s) git could not describe left out`);
  return parts.length ? `<p class="fine">${parts.join(' · ')}. Everything below is computed from what was read.</p>` : '';
}

function buildLetters(s) {
  const letters = [];

  letters.push(
    `It started on ${longDate(s.totals.firstDate)}, when ${escapeHtml(s.totals.firstAuthor)} wrote ${quote(s.totals.firstMessage)}. ` +
      `${number.format(s.totals.commits)} ${plural(s.totals.commits, 'commit', 'commits')} later, on ${longDate(s.totals.lastDate)}, it was still here.`
  );

  if (s.night.count > 0 && s.night.deepest) {
    letters.push(
      `${number.format(s.night.count)} of them (${s.night.pct}% of this history) were made between midnight and five in the morning. ` +
        `The latest was ${s.night.deepest.clock} on a ${weekdayName(s.night.deepest.date)} — ${quote(s.night.deepest.subject)}. ` +
        `Nobody was asked to be awake then.`
    );
  }

  if (s.weight.longDays > 0 && s.weight.longestDay) {
    letters.push(
      `There were ${number.format(s.weight.longDays)} ${plural(s.weight.longDays, 'day', 'days')} in this repository that lasted more than ten hours ` +
        `between the first commit and the last. The longest ran ${s.weight.longestDay.hours} hours across ${s.weight.longestDay.commits} commits on ${longDate(s.weight.longestDay.date)}.`
    );
  }

  if (s.confession.counts.length) {
    const top = s.confession.counts
      .sort((a, b) => b.n - a.n)
      .slice(0, 5)
      .map((entry) => `${quote(entry.label)} ×${entry.n}`)
      .join(', ');
    letters.push(`The words that keep coming back here are ${top}. They are the sound of someone refusing to leave a thing broken.`);
  }

  if (s.streaks.best > 1) {
    letters.push(
      `The longest unbroken stretch of showing up was ${number.format(s.streaks.best)} ${plural(s.streaks.best, 'day', 'days')}` +
        (s.streaks.bestEnd ? `, ending ${longDate(s.streaks.bestEnd)}` : '') +
        `. ${s.streaks.trailing > 0 ? `As of ${longDate(s.totals.lastDate)} the chain stood at ${s.streaks.trailing}.` : 'It broke before the history did.'}`
    );
  }

  if (s.weekend.count > 0) {
    letters.push(`${s.weekend.pct}% of this history was written on a Saturday or a Sunday — ${number.format(s.weekend.count)} ${plural(s.weekend.count, 'commit', 'commits')} that no calendar required.`);
  }

  for (const person of s.silence.slice(0, 3)) {
    letters.push(
      `${escapeHtml(person.name)} stopped coming ${number.format(person.gapDays)} ${plural(person.gapDays, 'day', 'days')} ago, after ${number.format(person.commits)} ${plural(person.commits, 'commit', 'commits')}` +
        (person.aliases > 1 ? ` across ${person.aliases} ${plural(person.aliases, 'address', 'addresses')}` : '') + `. ` +
        `The last thing they left here was ${quote(person.lastMessage)}.`
    );
  }

  letters.push(
    `Nothing in this repository records what was given up to keep it alive — the sleep, the weekends, the meals gone cold. ` +
      `Only the timestamps knew, and they have been keeping it the entire time.`
  );

  return letters;
}

function renderError(title, body, nonceValue) {
  const nonce = nonceValue || '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';" />
<title>Git Vigil</title>
<style nonce="${nonceValue}">
  html,body{height:100%;margin:0}
  body{display:grid;place-items:center;background:#07070a;color:#ded9d0;font:400 16px/1.6 Georgia,'Iowan Old Style',serif}
  .n{max-width:34rem;text-align:center;padding:2rem}
  h1{font-weight:400;font-size:1.6rem;letter-spacing:.01em;margin:0 0 .75rem}
  p{color:#8b867c;margin:0}
  code{font-family:ui-monospace,Consolas,monospace;font-size:.85em;color:#c9a273}
</style></head>
<body><div class="n"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></div></body></html>`;
}

function renderDocument(s, nonce, opts) {
  if (s.empty) return renderError('Nothing to keep vigil for', `${s.repoName} has no commits with a date this could read.`, nonce);
  const api = opts && opts.vscodeApi ? "window.__vscode=acquireVsCodeApi();" : '';
  const payload = JSON.stringify(s).replace(/</g, '\\u003c');
  const letters = buildLetters(s).map((text) => `<p class="letter">${text}</p>`).join('\n');
  const confessions = s.confession.samples
    .map(
      (c) => `<li><span class="stamp">${escapeHtml(c.date)} · ${c.clock}</span><span class="msg">${escapeHtml(c.subject)}</span><span class="who">${escapeHtml(c.author)}</span></li>`
    )
    .join('\n');
  const people = s.people
    .slice(0, 10)
    .map(
      (p) => `<li><span class="msg">${escapeHtml(p.name)}</span><span class="stamp">${number.format(p.commits)} commits · ${p.share}%${p.aliases > 1 ? ` · ${p.aliases} addresses` : ''}</span><span class="who">${longDate(p.firstDate)} → ${longDate(p.lastDate)}</span></li>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src data:;" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Git Vigil — ${escapeHtml(s.repoName)}</title>
<script nonce="${nonce}">document.documentElement.className='js';${api}</script>
<style nonce="${nonce}">
  :root{
    --ink:#e9e5dc; --dim:#8d887e; --faint:#5f5b54; --line:rgba(233,229,220,.09);
    --bg:#07070a; --amber:#e0a86a; --night:#7f9bd8; --violet:#9a86c9; --rose:#cf8787;
    --serif:'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif;
    --mono:ui-monospace,'Cascadia Code',Menlo,Consolas,monospace;
  }
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--bg);color:var(--ink)}
  body{font-family:var(--serif);font-size:17px;line-height:1.68;-webkit-font-smoothing:antialiased;overflow-x:hidden}
  body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:2;
    background:radial-gradient(120% 70% at 50% -10%,rgba(224,168,106,.12),transparent 60%),
               radial-gradient(100% 60% at 50% 110%,rgba(127,155,216,.10),transparent 60%)}
  body::after{content:'';position:fixed;inset:-50%;pointer-events:none;z-index:3;opacity:.05;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/></filter><rect width='140' height='140' filter='url(%23n)'/></svg>")}
  main{max-width:1020px;margin:0 auto;padding:0 28px 140px;position:relative;z-index:1}
  .eyebrow{font-family:var(--mono);font-size:10.5px;letter-spacing:.28em;text-transform:uppercase;color:var(--faint)}
  .rule{height:1px;background:var(--line);margin:0}

  header{padding:96px 0 40px;text-align:center}
  header h1{font-size:clamp(38px,6.5vw,74px);line-height:1.02;font-weight:400;margin:18px 0 0;letter-spacing:-.015em}
  header .sub{color:var(--dim);font-size:18px;margin:22px auto 0;max-width:38rem}
  .fine{font-family:var(--mono);font-size:11.5px;letter-spacing:.04em;color:var(--faint);margin:16px auto 0;max-width:36rem}
  .badge{display:inline-flex;gap:10px;align-items:center;font-family:var(--mono);font-size:11px;letter-spacing:.2em;color:var(--amber);text-transform:uppercase}
  .dot{width:5px;height:5px;border-radius:50%;background:var(--amber);box-shadow:0 0 12px var(--amber);animation:pulse 3.4s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:.35}50%{opacity:1}}

  section{padding:74px 0 0;border-top:1px solid var(--line);margin-top:74px}
  section:first-of-type{border-top:0}
  .head{display:flex;align-items:baseline;gap:18px;margin-bottom:8px}
  .head h2{font-size:clamp(26px,3.4vw,38px);font-weight:400;margin:0;letter-spacing:-.01em}
  .big{font-family:var(--mono);font-size:clamp(44px,8vw,88px);line-height:1;letter-spacing:-.03em;margin:14px 0 6px;color:#cfc8bb}
  @supports (background-clip:text) or (-webkit-background-clip:text){
    .big{background:linear-gradient(180deg,var(--ink),#a49d92);-webkit-background-clip:text;background-clip:text;color:transparent}
  }
  .caption{color:var(--dim);margin:0 0 34px;max-width:44rem}

  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin-top:34px}
  .stat{background:var(--bg);padding:18px 20px}
  .stat b{display:block;font-family:var(--mono);font-size:20px;font-weight:400;letter-spacing:-.02em}
  .stat span{color:var(--faint);font-size:12.5px;font-family:var(--mono);letter-spacing:.08em;text-transform:uppercase}

  .viz{display:grid;grid-template-columns:minmax(280px,340px) 1fr;gap:40px;align-items:center}
  @media (max-width:820px){.viz{grid-template-columns:1fr}}
  svg{display:block;width:100%;height:auto;overflow:visible}
  .ring text{font-family:var(--mono);fill:var(--faint);font-size:9px}
  .ring .mid{fill:var(--ink);font-size:26px;letter-spacing:-.02em}
  .ring .lbl{fill:var(--dim);font-size:9.5px;letter-spacing:.22em}
  path.wedge{transition:opacity .25s ease}
  .legend{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:22px;font-family:var(--mono);font-size:11px;color:var(--dim)}
  .legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:7px;vertical-align:middle}
  .c-night{background:#7f9bd8}.c-violet{background:#9a86c9}.c-warm{background:#c9a273}.c-amber{background:#e0a86a}.c-late{background:#8f8ad8}
  #heat{margin-top:26px}
  #heatLabel{color:var(--faint);font-size:10.5px;letter-spacing:.22em;text-transform:uppercase}
  .head.center{justify-content:center}
  .note{color:var(--dim);font-size:15px}

  ul.wall{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
  ul.wall li{display:grid;grid-template-columns:150px 1fr auto;gap:18px;align-items:baseline;padding:13px 4px;border-bottom:1px solid var(--line)}
  ul.wall li:hover{background:rgba(233,229,220,.028)}
  .stamp{font-family:var(--mono);font-size:11.5px;color:var(--faint);letter-spacing:.04em;white-space:nowrap}
  .msg{font-size:16.5px;color:var(--ink);overflow-wrap:anywhere}
  .who{font-family:var(--mono);font-size:11px;color:var(--night);white-space:nowrap}
  @media (max-width:700px){ul.wall li{grid-template-columns:1fr;gap:4px}}

  .tags{display:flex;flex-wrap:wrap;gap:9px;margin:26px 0 6px}
  .tag{font-family:var(--mono);font-size:12px;padding:6px 12px;border:1px solid var(--line);border-radius:999px;color:var(--dim)}
  .tag b{color:var(--amber);font-weight:400;margin-left:7px}

  .letters{padding:20px 0 0;max-width:36rem;margin:0 auto}
  .letter{font-size:19.5px;line-height:1.85;color:#d8d2c6;margin:0 0 30px;text-indent:1.4em}
  .letter:first-child::first-letter{font-size:52px;float:left;line-height:.86;padding:6px 10px 0 0;color:var(--amber)}
  footer{margin-top:100px;padding-top:30px;border-top:1px solid var(--line);text-align:center;color:var(--faint);font-size:14px}
  button{font:inherit;font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);
    background:transparent;border:1px solid var(--line);padding:9px 16px;border-radius:999px;cursor:pointer;margin-top:18px}
  button:hover{color:var(--ink);border-color:rgba(233,229,220,.3)}

  .js .rv{opacity:0;transform:translateY(18px);transition:opacity .9s ease,transform .9s ease}
  .js .rv.in{opacity:1;transform:none}
  @media (prefers-reduced-motion:reduce){.js .rv{opacity:1;transform:none;transition:none}.dot{animation:none}}
</style>
</head>
<body>
<main>
  <header>
    <div class="badge"><span class="dot"></span> Git Vigil · kept for ${escapeHtml(s.you.name)}</div>
    <h1>${escapeHtml(s.repoName)}</h1>
    <p class="sub">${number.format(s.totals.commits)} commits by ${number.format(s.totals.people)} ${plural(s.totals.people, 'person', 'people')}, across ${number.format(s.totals.spanDays)} days, beginning ${longDate(s.totals.firstDate)}.</p>
    ${disclosure(s)}
  </header>

  <section class="rv">
    <div class="head"><span class="eyebrow">I</span><h2>The hours you kept</h2></div>
    <div class="big">${s.night.count > 0 ? escapeHtml(s.night.deepest.clock) : '00:00'}</div>
    <p class="caption">The single latest hour any commit in this repository was ever made. ${s.night.count} commits were written before 05:00 — ${s.night.pct}% of everything here.</p>
    <div class="viz">
      <svg class="ring" viewBox="0 0 320 320" id="ring" role="img" aria-label="Commits by hour of day"></svg>
      <div>
        <div class="note">${s.night.deepest ? `At ${s.night.deepest.clock} on ${longDate(s.night.deepest.date)}, ${escapeHtml(s.night.deepest.author)} wrote: ${quote(s.night.deepest.subject)}` : 'No commit in this history was made in the small hours.'}</div>
        <div class="legend" id="ringLegend"></div>
        <div class="stats" id="hourStats"></div>
      </div>
    </div>
  </section>

  <section class="rv">
    <div class="head"><span class="eyebrow">II</span><h2>The days</h2></div>
    <div class="big">${number.format(s.totals.activeDays)}</div>
    <p class="caption">Days on which someone opened this repository and committed. The longest unbroken stretch was ${s.streaks.best} days${s.streaks.trailing ? `, and it was ${s.streaks.trailing} days deep when the last commit landed` : ''}.</p>
    <svg id="life" viewBox="0 0 1000 190" role="img" aria-label="Commits per week over time"></svg>
    <div class="legend"><span><i class="c-amber"></i>daytime</span><span><i class="c-night"></i>days that ran past midnight</span></div>
    <div class="legend"><span id="heatLabel">the year, one square per day</span></div>
    <svg id="heat" viewBox="0 0 1000 130" role="img" aria-label="Commit heatmap"></svg>
    <div class="stats">
      <div class="stat"><b>${number.format(s.weight.busiest ? s.weight.busiest.commits : 0)}</b><span>busiest single day</span></div>
      <div class="stat"><b>${s.weight.perActiveDay}</b><span>commits per active day</span></div>
      <div class="stat"><b>${number.format(s.weekend.count)}</b><span>weekend commits</span></div>
      <div class="stat"><b>${s.streaks.best}</b><span>longest streak</span></div>
    </div>
  </section>

  <section class="rv">
    <div class="head"><span class="eyebrow">III</span><h2>The weight</h2></div>
    <div class="big">${number.format(s.totals.insertions)}</div>
    <p class="caption">Lines added. ${number.format(s.totals.deletions)} lines were removed again — proof that the first version was never the one you meant. ${number.format(s.totals.files)} files were touched.${windowNote(s)}</p>
    <div class="stats">
      <div class="stat"><b>${number.format(Math.round(s.totals.insertions / 40))}</b><span>minutes to read it all</span></div>
      <div class="stat"><b>${number.format(s.weight.longDays)}</b><span>days over ten hours long</span></div>
      <div class="stat"><b>${s.weight.longestDay ? s.weight.longestDay.hours : 0}h</b><span>longest single day</span></div>
      <div class="stat"><b>${Math.round((s.totals.deletions / Math.max(1, s.totals.insertions)) * 100)}%</b><span>of what was written was undone</span></div>
    </div>
  </section>

  <section class="rv">
    <div class="head"><span class="eyebrow">IV</span><h2>The confession</h2></div>
    <p class="caption">Every repository keeps a record of the moments someone was not proud of. These are the messages this one held on to.</p>
    <div class="tags">${s.confession.counts
      .sort((a, b) => b.n - a.n)
      .slice(0, 8)
      .map((c) => `<span class="tag">${escapeHtml(c.label)}<b>×${c.n}</b></span>`)
      .join('')}</div>
    <ul class="wall">${confessions || '<li><span class="msg">Nothing here needed confessing.</span></li>'}</ul>
  </section>

  <section class="rv">
    <div class="head"><span class="eyebrow">V</span><h2>Who kept it</h2></div>
    <p class="caption">${s.silence.length ? `${s.silence.length} ${plural(s.silence.length, 'person')} in this history has not committed in over four months. Their names are still in the blame.` : 'Everyone who wrote this code is still writing it.'}</p>
    <ul class="wall">${people}</ul>
  </section>

  <section class="rv">
    <div class="head center"><span class="eyebrow">Letters</span></div>
    <div class="letters">${letters}</div>
    <footer>
      <div>Read from ${escapeHtml(s.branch)} · nothing left this machine.</div>
      <button id="again">Keep the vigil again</button>
    </footer>
  </section>
</main>
<script nonce="${nonce}">const VIGIL=${payload};</script>
<script nonce="${nonce}">${CLIENT}</script>
</body></html>`;
}

const CLIENT = `
(function(){
  var D=VIGIL, rm=matchMedia('(prefers-reduced-motion:reduce)').matches;
  var NS='http://www.w3.org/2000/svg';
  function el(n,a){var e=document.createElementNS(NS,n);for(var k in a)e.setAttribute(k,a[k]);return e;}
  function band(h){ if(h<5)return '#7f9bd8'; if(h<8)return '#9a86c9'; if(h<18)return '#c9a273'; if(h<22)return '#e0a86a'; return '#8f8ad8';}
  var arc = function(cx,cy,r1,r2,a0,a1){
    var p=function(r,a){return (cx+r*Math.cos(a)).toFixed(2)+' '+(cy+r*Math.sin(a)).toFixed(2);};
    var large=(a1-a0)>Math.PI?1:0;
    return 'M'+p(r1,a0)+'A'+r1+','+r1+' 0 '+large+' 1 '+p(r1,a1)+
           'L'+p(r2,a1)+'A'+r2+','+r2+' 0 '+large+' 0 '+p(r2,a0)+'Z';
  }

  /* circadian ring */
  var ring=document.getElementById('ring'), H=D.hours, max=Math.max.apply(null,H)||1;
  for(var h=0;h<24;h++){
    var a0=(h/24)*Math.PI*2-Math.PI/2, a1=((h+1)/24)*Math.PI*2-Math.PI/2;
    var ratio=H[h]/max;
    var r2=64+96*(H[h]?0.22+0.78*ratio:0.05);
    var w=el('path',{d:arc(160,160,64,Math.max(66,r2),a0+0.014,a1-0.014),fill:band(h),opacity:H[h]?(0.34+0.66*ratio):0.07,'class':'wedge'});
    w.appendChild(el('title',{})).textContent=(h<10?'0':'')+h+':00 — '+H[h]+' commits';
    ring.appendChild(w);
    var mid=(a0+a1)/2;
    var t=el('text',{x:(160+Math.cos(mid)*190).toFixed(1),y:(160+Math.sin(mid)*190).toFixed(1),'text-anchor':'middle','dominant-baseline':'middle'});
    t.textContent=(h<10?'0':'')+h; ring.appendChild(t);
  }
  var c1=el('text',{x:160,y:158,'text-anchor':'middle','class':'mid'});c1.textContent=D.night.count;ring.appendChild(c1);
  var c2=el('text',{x:160,y:178,'text-anchor':'middle','class':'lbl'});c2.textContent='IN THE DARK';ring.appendChild(c2);
  document.getElementById('ringLegend').innerHTML='<span><i class="c-night"></i>00–04</span><span><i class="c-violet"></i>05–07</span><span><i class="c-warm"></i>08–17</span><span><i class="c-amber"></i>18–21</span><span><i class="c-late"></i>22–23</span>';
  var peak=H.indexOf(max);
  document.getElementById('hourStats').innerHTML=
    '<div class="stat"><b>'+(peak<10?'0':'')+peak+':00</b><span>busiest hour</span></div>'+
    '<div class="stat"><b>'+D.you.night+'</b><span>your pre-dawn commits</span></div>'+
    '<div class="stat"><b>'+(D.weekdayNames[D.weekdays.reduce(function(a,b,i){return b>a?i:a},0)]||'—')+'</b><span>busiest day of week</span></div>';

  /* lifeline: commits per week */
  var days=D.days.map(function(d){return {date:d[0],n:d[1],night:d[2]};});
  var weeks=new Map();
  days.forEach(function(d){
    var t=Date.parse(d.date+'T12:00:00Z'), off=(new Date(t).getUTCDay());
    var key=t-off*864e5;
    var w=weeks.get(key)||{n:0,night:0}; w.n+=d.n; w.night+=d.night; weeks.set(key,w);
  });
  var wk=[].concat.apply([],[Array.from(weeks.keys()).sort(function(a,b){return a-b;}).map(function(k){var v=weeks.get(k);return {t:k,n:v.n,night:v.night};})]);
  var W=1000,Hg=190,pad=8,mx=Math.max.apply(null,wk.map(function(w){return w.n;}))||1;
  var svg=document.getElementById('life');
  var grad=el('linearGradient',{id:'g1',x1:0,y1:0,x2:0,y2:1});
  grad.appendChild(el('stop',{offset:'0%','stop-color':'#e0a86a','stop-opacity':'.5'}));
  grad.appendChild(el('stop',{offset:'100%','stop-color':'#e0a86a','stop-opacity':'0'}));
  svg.appendChild(el('defs',{})).appendChild(grad);
  var X=function(i){return pad+i*(W-2*pad)/Math.max(1,wk.length-1);}, Y=function(v){return Hg-10-(v/mx)*(Hg-30);};
  if(wk.length>1){
    var d='M'+X(0)+','+Hg;
    wk.forEach(function(w,i){d+=' L'+X(i)+','+Y(w.n);});
    d+=' L'+X(wk.length-1)+','+Hg+' Z';
    svg.appendChild(el('path',{d:d,fill:'url(#g1)'}));
    var ln='M'; wk.forEach(function(w,i){ln+=(i?' L':'')+X(i)+','+Y(w.n);});
    svg.appendChild(el('path',{d:ln,fill:'none',stroke:'#e9d3b0','stroke-width':1.2,'stroke-opacity':.85}));
    wk.filter(function(w){return w.night>0;}).forEach(function(w,i){
      var idx=wk.indexOf(w);
      svg.appendChild(el('circle',{cx:X(idx),cy:Y(w.n),r:2.4,fill:'#7f9bd8',opacity:.9}));
    });
  }

  /* heatmap */
  var byDate={}; days.forEach(function(d){byDate[d.date]=d;});
  var heat=document.getElementById('heat'), cell=13, gap=2, size=cell+gap;
  var last=Date.parse(D.totals.lastDate+'T12:00:00Z');
  var start=Date.parse(D.totals.firstDate+'T12:00:00Z');
  var totalWeeks=Math.min(53,Math.max(1,Math.ceil((last-start)/(7*864e5))+1));
  var endW=Math.floor(last/(7*864e5));
  var tmax=Math.max.apply(null,days.map(function(d){return d.n;}))||1;
  for(var wi=0;wi<totalWeeks;wi++){
    var weekStart=(endW-totalWeeks+1+wi)*7*864e5;
    for(var di=0;di<7;di++){
      var iso=new Date(weekStart+di*864e5).toISOString().slice(0,10);
      var rec=byDate[iso];
      var x=wi*size, y=di*size;
      var f=el('rect',{x:x,y:y,width:cell,height:cell,rx:2.5,fill:rec?(rec.night?'#5f7fbe':'#c98b4a'):'rgba(233,229,220,0.045)',
        opacity:rec?(0.25+0.75*(rec.n/tmax)):1});
      f.appendChild(el('title',{})).textContent=iso+' — '+(rec?rec.n+' commits':'nothing');
      heat.appendChild(f);
    }
  }
  heat.setAttribute('viewBox','0 0 '+(totalWeeks*size)+' '+(7*size));
  document.getElementById('heatLabel').textContent='the last '+totalWeeks+' weeks · one square per day';

  var again=document.getElementById('again');
  if(again) again.addEventListener('click',function(){
    if(window.__vscode) window.__vscode.postMessage({type:'refresh'});
    else location.reload();
  });

  var revealInViewport=function(){
    var vh=window.innerHeight||800;
    [].forEach.call(document.querySelectorAll('.rv:not(.in)'),function(n){
      if(n.getBoundingClientRect().top < vh*0.92) n.classList.add('in');
    });
  };
  var revealAll=function(){ [].forEach.call(document.querySelectorAll('.rv'),function(n){ n.classList.add('in'); }); };

  if(rm){
    revealAll();
  } else {
    var io=new IntersectionObserver(function(es){
      es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
    },{threshold:.1});
    [].forEach.call(document.querySelectorAll('.rv'),function(n){ io.observe(n); });
    /* a webview can be restored from hidden with observers that never fired */
    window.addEventListener('scroll',revealInViewport,{passive:true});
    window.addEventListener('resize',revealInViewport);
    document.addEventListener('visibilitychange',function(){ if(!document.hidden) revealInViewport(); });
    revealInViewport();
    setTimeout(revealAll,4000);
  }
})();
`;

function nonce() {
  return Math.random().toString(36).slice(2, 12);
}

module.exports = { renderDocument, renderError, buildLetters, nonce };
