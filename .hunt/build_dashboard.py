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

PUBLIC = os.environ.get('PUBLIC') == '1'
_ps = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public_stats.json')
stats = json.load(open(_ps, encoding='utf-8')) if os.path.exists(_ps) else None   # aggregates only, written by make_public_stats.py
_ni = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'needs_input.json')
needs = json.load(open(_ni, encoding='utf-8')) if os.path.exists(_ni) else None   # sanitized, written on the owner's PC by make_needs_input.py
data = dict(public=PUBLIC, stats=stats, needs=needs, kpi=kpi, jobs=[{k: j.get(k, '') for k in ('tier', 'score', 'company', 'title', 'location', 'pay', 'url', 'status', 'why', 'new', 'ai', 'ai_why', 'first_seen')} for j in jobs],
            contacts=contacts, reasons=reasons, built=datetime.datetime.now().strftime('%Y-%m-%d %H:%M'))

TEMPLATE = r'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="60">
<title>Role radar</title>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
<style>
/* Paper Ledger (Claude Design direction B): cream page, ink text, serif headings, hairline rules instead of cards. */
:root{--bg:#EFE3C8;--card:#F7F0DF;--line:#C9BBA3;--text:#1B1620;--mute:#5A5060;--blue:#6F4A7B;--green:#2E7D4F;--amber:#9A5B00;--red:#A3332E;--violet:#6F4A7B;--off:#7A6F7D}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 'Source Sans 3',system-ui,sans-serif;padding:24px 20px 48px}
main{max-width:860px;margin:0 auto}h1{font-family:Newsreader,serif;font-size:34px;font-weight:500;line-height:1.1;margin:0}
.sub{color:var(--mute);font-size:15px;margin:2px 0 0;padding-bottom:12px;border-bottom:2px solid var(--text);margin-bottom:20px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px 20px;margin-bottom:20px}
.k{border-top:2px solid var(--text);padding:6px 0 0}.k b{display:block;font-family:Newsreader,serif;font-weight:400;font-size:32px;line-height:1.1}.k span{color:var(--mute);font-size:14px}
.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:0 32px}
.card{border-top:1px solid var(--line);padding:24px 0;overflow:auto}
h2{font-family:Newsreader,serif;font-size:24px;font-weight:500;margin:0 0 12px;color:var(--text);text-transform:lowercase}h2::first-letter{text-transform:uppercase}
.bar{display:flex;height:16px;gap:2px;margin:6px 0 10px}.bar i{display:block;min-width:4px}
.leg{display:flex;gap:6px 20px;flex-wrap:wrap;font-size:15px;color:var(--text)}.leg u{display:inline-block;width:10px;height:10px;margin-right:6px;text-decoration:none}
table{width:100%;border-collapse:collapse;font-size:15px}th,td{text-align:left;padding:10px 8px 10px 0;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--mute);font-weight:600;font-size:13px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;white-space:nowrap}
td a{color:var(--text);text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:3px}td a:hover{color:var(--blue)}
.chip{display:inline-block;padding:2px 10px;border-radius:999px;font-size:13px;font-weight:600;border:1px solid currentColor;white-space:nowrap}
.applied,.sent{color:var(--green)}.queued{color:var(--blue)}.skipped,.none{color:var(--off)}.blocked{color:var(--red)}.elite{color:var(--violet)}
.tools{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
input,select{min-height:44px;background:var(--card);color:var(--text);border:1px solid var(--text);border-radius:4px;padding:0 14px;font:inherit}input{flex:1 1 220px}select option{color:#000}
.why{color:var(--mute);font-size:14px;max-width:260px}.reasons li{display:flex;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid var(--line);font-size:15px}ul{list-style:none;margin:0;padding:0}
.new{color:var(--green);font-size:13px;font-weight:600;margin-left:6px}
a{color:var(--blue)}a:hover{color:var(--text)}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
td:first-child,td:last-child{white-space:nowrap}.sub+.card,.sub+div>.card:first-child{border-top:0;padding-top:4px}
#viewtog{width:fit-content;max-width:100%;flex-wrap:wrap;border:1px solid var(--text);border-radius:999px;padding:3px;background:var(--card);gap:4px!important;margin-bottom:16px!important}
</style></head><body><main>
<div id="viewtog" style="display:none;gap:6px;margin-bottom:10px"><button type="button" id="vJobs" class="tg" style="display:none">Role radar</button><button type="button" id="vApp" class="tg">Job applications</button><button type="button" id="vVc" class="tg">EZER VC raise</button><a class="tg" id="vFleet" href="../vf-5703b66ba4/" style="text-decoration:none;display:inline-flex;align-items:center">Void fleet</a></div>
<style>.tg{background:transparent;color:var(--text);border:0;border-radius:999px;min-height:40px;padding:0 18px;font:inherit;font-weight:600;font-size:15px;cursor:pointer;white-space:nowrap}.tg.on{background:var(--text);color:var(--bg)}</style>
<div id="appview" style="display:none"><h1>Job applications</h1><div class="sub" id="appsub"></div><div class="kpis" id="appkpis"></div><div class="sub">Counts only. Updated automatically from the owner's PC.</div></div>
<div id="vcview" style="display:none"><h1>EZER VC raise</h1><div class="sub" id="vcsub"></div><div class="kpis" id="vckpis"></div><div class="card"><h2>DMS TODAY BY PLATFORM AND STATUS</h2><div style="overflow:auto"><table id="vcdms"></table></div></div><div class="sub" style="margin-top:8px">Counts only. No names, firms, emails or handles are shown.</div></div>
<div id="jobsview"><h1 id="ttl">Job hunt dashboard</h1><div class="sub" id="built"></div>
<div class="card" id="needs" style="display:none;margin-bottom:14px"><h2>NEEDS INPUT <span id="needsn"></span></h2><div class="sub" id="needssub" style="margin:0 0 8px"></div><div style="overflow:auto"><table id="needst"></table></div><button type="button" class="tg" id="needsmore" style="margin-top:10px;display:none"></button></div>
<div class="kpis" id="kpis"></div>
<div class="row"><div class="card"><h2>PIPELINE</h2><div class="bar" id="bar"></div><div class="leg" id="leg"></div></div>
<div class="card"><h2>WHY ROLES WERE SKIPPED</h2><ul class="reasons" id="reasons"></ul></div></div>
<div class="card" style="margin-bottom:12px"><h2>ROLES</h2><div class="tools"><input id="q" placeholder="Search company, title, city" size="28"><select id="st"><option value="">All statuses</option><option>queued</option><option>applied</option><option>skipped</option><option>blocked</option></select><select id="tier"><option value="">All tiers</option><option value="0">Realistic first</option><option value="1">Elite-bar (last)</option></select><select id="sort"><option value="new">Newest first, then priority</option><option value="pri">Priority first (best fit)</option></select></div><div style="overflow:auto"><table id="jobs"></table></div></div>
<div class="card"><h2>CONTACTS</h2><div style="overflow:auto"><table id="contacts"></table></div></div>
</div></main><script>
const D=__DATA__;const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const PUB=D.public;if(PUB)$('ttl').textContent='Role radar: early-career software, simulation and AI roles';
$('built').textContent=PUB?'Updated '+D.built+' (refreshes automatically every 6 minutes).':'Built '+D.built+'. Re-run build_dashboard.py to refresh.';
if(D.needs&&D.needs.items.length){const N=D.needs,NI=N.items;let all=false;$('needs').style.display='';$('needsn').textContent='('+NI.length+')';
 $('needssub').innerHTML='Only the founder can do these. Newest first. Updated '+esc(N.updated)+'. <a href="'+esc(N.board)+'" target="_blank" rel="noopener" style="color:var(--blue)">Open the needs-human board</a>';
 const drawN=()=>{$('needst').innerHTML='<tr><th>When</th><th>Program</th><th>What is needed</th></tr>'+(all?NI:NI.slice(0,6)).map(n=>`<tr><td style="color:var(--mute);font-size:12px">${esc(n.when)}</td><td>${n.link?`<a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.program)}</a>`:esc(n.program)}${n.kind==='account'?' <span class="chip queued">account</span>':''}</td><td class="why" style="max-width:none">${esc(n.what)}</td></tr>`).join('');
  $('needsmore').style.display=NI.length>6?'':'none';$('needsmore').textContent=all?'Show fewer':'Show all '+NI.length;};
 $('needsmore').onclick=()=>{all=!all;drawN()};drawN();}
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
if(PUB&&D.stats){const S=D.stats,A=S.applications||{},V=S.vc;$('viewtog').style.display='flex';$('appsub').textContent='Updated '+S.built+'.';$('appkpis').innerHTML=[[A.applied,'Applications submitted'],[A.applied_current_resume,'Sent with current resume'],[A.applied_old_resume,'Sent with old resume'],[A.skipped,'Roles reviewed and skipped'],[A.blocked,'Waiting on a human step'],[A.linkedin_requests_sent,'LinkedIn requests sent'],[A.emails_sent,'Emails sent'],[A.roles_in_queue,'Roles in the review queue']].map(([n,l])=>`<div class="k"><b>${esc(n??0)}</b><span>${esc(l)}</span></div>`).join('');if(V){const g=V.goal||{};$('vcsub').textContent='Updated '+V.updated+'. Goal today: '+g.emails_today+' emails and '+g.dms_today+' DMs.';$('vckpis').innerHTML=[[V.emails_today,'Emails today (goal '+g.emails_today+')'],[V.emails_total,'Emails all time'],[V.dms_sent_today,'DMs sent today (goal '+g.dms_today+')'],[V.replies_total,'Replies']].map(([n,l])=>`<div class="k"><b>${esc(n??0)}</b><span>${esc(l)}</span></div>`).join('');$('vcdms').innerHTML='<tr><th>Platform / status</th><th>Count</th></tr>'+(Object.entries(V.dms_by_platform_status||{}).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')||'<tr><td>None yet.</td></tr>');}else{$('vVc').style.display='none'}const show=v=>{$('jobsview').style.display=v!=='vc'?'':'none';$('appview').style.display=v==='app'?'':'none';$('vcview').style.display=v==='vc'?'':'none';[['vJobs','jobs'],['vApp','app'],['vVc','vc']].forEach(([i,k])=>$(i).classList.toggle('on',v===k))};$('vJobs').onclick=()=>show('jobs');$('vApp').onclick=()=>show('app');$('vVc').onclick=()=>show('vc');show('app');}
if(PUB){document.querySelector('.row').style.display='none';$('contacts').closest('.card').style.display='none';$('st').style.display='none';}
$('contacts').innerHTML=D.contacts.length?'<tr><th>Company</th><th>Role</th><th>Person</th><th>School</th><th>Channel</th><th>Status</th></tr>'+D.contacts.filter(c=>c.status==='sent'||c.person).map(c=>`<tr><td>${esc(c.company)}</td><td>${esc(c.role)}</td><td>${esc(c.person)}<div class="why">${esc(c.title)}</div></td><td>${esc(c.school)}</td><td>${esc(c.channel)}</td><td><span class="chip ${esc(c.status)}">${esc(c.status)}</span></td></tr>`).join(''):'<tr><td>No contacts logged yet.</td></tr>';
</script></body></html>'''
open('dashboard.html', 'w', encoding='utf-8').write(TEMPLATE.replace('__DATA__', json.dumps(data)))
print('dashboard.html built:', kpi)
