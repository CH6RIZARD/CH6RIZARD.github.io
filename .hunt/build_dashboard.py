"""Builds dashboard.html (self-contained, offline) from the job-hunt files. Re-run any time: python build_dashboard.py
Reads: jobs_all.csv, jobs_new_today.csv, log_apply*.csv, log_apply2_*.csv, log_contact*.csv, log_contact2_*.csv"""
import csv, glob, json, os, html, datetime

def rows(pattern):
    out = []
    for f in sorted(glob.glob(pattern)):
        try:
            for r in csv.DictReader(open(f, encoding='utf-8')):
                r['_file'] = os.path.basename(f)
                out.append(r)
        except Exception:
            pass
    return out

jobs = rows('jobs_master.csv') or rows('jobs_all.csv')
new_today = {r['url'] for r in rows('jobs_new_today.csv')}
apply_rows = rows('log_apply*.csv')
contact_rows = rows('log_contact*.csv')

status_by_url = {}
for r in sorted(apply_rows, key=lambda r: '2' in r['_file']):   # the newer log_apply2 files win
    s = (r.get('status') or '').split(':')[0].strip().lower()
    if s != 'applied' and '2' not in r['_file']:
        continue   # skips from the first run were for fields you have since given (phone, LinkedIn, zip, school): those roles are retryable, so they stay queued
    if 'not reviewed' in (r.get('reason_or_missing') or r.get('missing') or '').lower():
        continue   # placeholder rows from an agent that ran out of time: still queued
    prev = status_by_url.get(r.get('url'))
    if s == 'applied' or prev is None:
        status_by_url[r.get('url')] = dict(status=s, why=r.get('reason_or_missing') or r.get('missing') or '', time=r.get('time', ''))

import json as _json
ai = _json.load(open('llm_scores.json', encoding='utf-8')) if os.path.exists('llm_scores.json') else {}
for j in jobs:
    a = ai.get(j['url'], {})
    j['ai'] = a.get('fit', '')
    j['ai_why'] = ('' if a.get('level_ok', True) else 'level risk: ') + a.get('why', '')
    st = status_by_url.get(j['url'], dict(status='queued', why='', time=''))
    j['status'], j['why'], j['time'] = st['status'], st['why'], st['time']
    j['new'] = j.get('first_seen') == datetime.date.today().isoformat()

def contact_status(r):
    s = (r.get('status') or '').lower()
    return 'sent' if ('pending' in s or s.startswith('sent')) else ('none' if 'no public' in s else s or 'unknown')

contacts = [dict(company=r.get('company', ''), role=r.get('role') or r.get('title', ''), person=r.get('person_name', ''), title=r.get('person_title', ''),
                 school=r.get('school_connection', ''), channel=r.get('channel') or 'linkedin', status=contact_status(r), time=r.get('time', '')) for r in contact_rows]

kpi = dict(
    roles=len(jobs),
    open_now=sum(1 for j in jobs if j.get('open', 'yes') == 'yes'),
    applied=sum(1 for j in jobs if j['status'] == 'applied'),
    skipped=sum(1 for j in jobs if j['status'] in ('skipped', 'blocked')),
    queued=sum(1 for j in jobs if j['status'] == 'queued'),
    contacted=sum(1 for c in contacts if c['status'] == 'sent'),
    noroute=sum(1 for c in contacts if c['status'] == 'none'),
    new=sum(1 for j in jobs if j['new']),
    scored=sum(1 for j in jobs if j['ai'] != ''),
)
reasons = {}
for j in jobs:
    if j['status'] in ('skipped', 'blocked') and j['why']:
        key = j['why'].split(';')[0].strip()[:60]
        reasons[key] = reasons.get(key, 0) + 1
reasons = sorted(reasons.items(), key=lambda kv: -kv[1])[:8]

PUBLIC = bool(os.environ.get('PUBLIC'))
data = dict(public=PUBLIC, kpi=kpi, jobs=[{k: j.get(k, '') for k in ('tier', 'score', 'company', 'title', 'location', 'pay', 'url', 'status', 'why', 'new', 'ai', 'ai_why', 'first_seen')} for j in jobs],
            contacts=contacts, reasons=reasons, built=datetime.datetime.now().strftime('%Y-%m-%d %H:%M'))

TEMPLATE = r'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="60">
<title>Role radar</title>
<style>
:root{--bg:#0d0f13;--card:#151820;--line:#252a35;--text:#e7e9ee;--mute:#8d93a1;--blue:#6bb6ff;--green:#5fd08c;--amber:#f0b95a;--red:#ef6f65;--violet:#a79bff}
@media (prefers-color-scheme:light){:root{--bg:#f4f5f8;--card:#fff;--line:#dde0e7;--text:#14161b;--mute:#5d6370;--blue:#0a66c2;--green:#168a4a;--amber:#a96b00;--red:#c4372c;--violet:#5b4bd6}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,Segoe UI,Roboto,sans-serif;padding:20px 16px 48px}
main{max-width:1180px;margin:0 auto}h1{font-size:20px;margin:0}.sub{color:var(--mute);margin:2px 0 16px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px}
.k{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}.k b{display:block;font-size:26px;line-height:1.1}.k span{color:var(--mute);font-size:12px}
.row{display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:12px}@media(max-width:820px){.row{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;overflow:auto}
h2{font-size:14px;margin:0 0 10px;color:var(--mute);font-weight:600;letter-spacing:.02em}
.bar{display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--line);margin:6px 0 10px}.bar i{display:block}
.leg{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--mute)}.leg u{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;text-decoration:none}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--mute);font-weight:600;font-size:12px;cursor:pointer;white-space:nowrap}
td a{color:var(--blue);text-decoration:none}td a:hover{text-decoration:underline}
.chip{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;border:1px solid currentColor;white-space:nowrap}
.applied,.sent{color:var(--green)}.queued{color:var(--blue)}.skipped,.blocked,.none{color:var(--amber)}.elite{color:var(--violet)}
.tools{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}input,select{background:transparent;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:7px 10px;font:inherit}select option{color:#000}
.why{color:var(--mute);font-size:12px;max-width:260px}.reasons li{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--line);font-size:13px}ul{list-style:none;margin:0;padding:0}
.new{color:var(--green);font-size:11px;margin-left:6px}
</style></head><body><main>
<h1 id="ttl">Job hunt dashboard</h1><div class="sub" id="built"></div>
<div class="kpis" id="kpis"></div>
<div class="row"><div class="card"><h2>PIPELINE</h2><div class="bar" id="bar"></div><div class="leg" id="leg"></div></div>
<div class="card"><h2>WHY ROLES WERE SKIPPED</h2><ul class="reasons" id="reasons"></ul></div></div>
<div class="card" style="margin-bottom:12px"><h2>ROLES</h2><div class="tools"><input id="q" placeholder="Search company, title, city" size="28"><select id="st"><option value="">All statuses</option><option>queued</option><option>applied</option><option>skipped</option><option>blocked</option></select><select id="tier"><option value="">All tiers</option><option value="0">Realistic first</option><option value="1">Elite-bar (last)</option></select><select id="sort"><option value="new">Newest first, then priority</option><option value="pri">Priority first (best fit)</option></select></div><div style="overflow:auto"><table id="jobs"></table></div></div>
<div class="card"><h2>CONTACTS</h2><div style="overflow:auto"><table id="contacts"></table></div></div>
</main><script>
const D=__DATA__;const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const PUB=D.public;if(PUB)$('ttl').textContent='Role radar: early-career software, simulation and AI roles';
$('built').textContent=PUB?'Updated '+D.built+' (refreshes automatically every 30 minutes).':'Built '+D.built+'. Re-run build_dashboard.py to refresh.';
const K=D.kpi,items0=[['roles','Roles found to date'],['open_now','Open now'],['new','New today'],['queued','Queued'],['scored','AI scored'],['applied','Applied'],['skipped','Skipped'],['contacted','Contacts sent'],['noroute','No contact route']];
const items=PUB?items0.filter(i=>['roles','open_now','new'].includes(i[0])):items0;
$('kpis').innerHTML=items.map(([k,l])=>`<div class="k"><b>${K[k]}</b><span>${l}</span></div>`).join('');
const seg=[['applied','var(--green)',K.applied],['skipped','var(--amber)',K.skipped],['queued','var(--blue)',K.queued]],tot=Math.max(1,seg.reduce((a,s)=>a+s[2],0));
$('bar').innerHTML=seg.map(s=>`<i style="width:${s[2]/tot*100}%;background:${s[1]}"></i>`).join('');
$('leg').innerHTML=seg.map(s=>`<span><u style="background:${s[1]}"></u>${s[0]} ${s[2]}</span>`).join('');
$('reasons').innerHTML=D.reasons.length?D.reasons.map(([r,n])=>`<li><span>${esc(r)}</span><b>${n}</b></li>`).join(''):'<li><span>No skips yet</span></li>';
function jobs(){const q=$('q').value.toLowerCase(),st=$('st').value,t=$('tier').value;
 const pri=(a,c)=>(+a.tier-+c.tier)||((c.ai===''?-1:c.ai)-(a.ai===''?-1:a.ai))||(+c.score-+a.score),byNew=(a,c)=>String(c.first_seen||'').localeCompare(String(a.first_seen||''))||pri(a,c);
 const rows=D.jobs.slice().sort($('sort').value==='pri'?pri:byNew).filter(j=>(!st||j.status===st)&&(!t||j.tier===t)&&(!q||(j.company+' '+j.title+' '+j.location).toLowerCase().includes(q)));
 $('jobs').innerHTML='<tr><th>AI fit</th><th>Company</th><th>Role</th><th>Location</th><th>Pay</th><th>Added</th>'+(PUB?'':'<th>Status</th>')+'</tr>'+rows.map(j=>`<tr><td title="${esc(j.ai_why)}">${j.ai===''?'<span style="color:var(--mute)">'+j.score+'</span>':'<b>'+j.ai+'/10</b>'}<div class="why">${esc(j.ai_why)}</div></td><td>${esc(j.company)}${j.tier==='1'?' <span class="chip elite">elite</span>':''}${j.new===true?'<span class="new">new</span>':''}</td><td><a href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.title)}</a></td><td>${esc(j.location)}</td><td>${esc(j.pay)}</td><td>${esc(j.first_seen)}</td>${PUB?'':`<td><span class="chip ${esc(j.status)}">${esc(j.status)}</span>${j.why?`<div class="why">${esc(j.why)}</div>`:''}</td>`}</tr>`).join('')||'<tr><td>No roles match.</td></tr>';}
['q','st','tier','sort'].forEach(i=>$(i).addEventListener('input',jobs));jobs();
if(PUB){document.querySelector('.row').style.display='none';$('contacts').closest('.card').style.display='none';$('st').style.display='none';}
$('contacts').innerHTML=D.contacts.length?'<tr><th>Company</th><th>Role</th><th>Person</th><th>School</th><th>Channel</th><th>Status</th></tr>'+D.contacts.filter(c=>c.status==='sent'||c.person).map(c=>`<tr><td>${esc(c.company)}</td><td>${esc(c.role)}</td><td>${esc(c.person)}<div class="why">${esc(c.title)}</div></td><td>${esc(c.school)}</td><td>${esc(c.channel)}</td><td><span class="chip ${esc(c.status)}">${esc(c.status)}</span></td></tr>`).join(''):'<tr><td>No contacts logged yet.</td></tr>';
</script></body></html>'''
open('dashboard.html', 'w', encoding='utf-8').write(TEMPLATE.replace('__DATA__', json.dumps(data)))
print('dashboard.html built:', kpi)
