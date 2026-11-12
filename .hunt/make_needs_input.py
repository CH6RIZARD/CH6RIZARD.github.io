"""Writes needs_input.json (the radar's "Needs input" card) from the owner's PC. Runs locally only: the sources are not in this repo.
python make_needs_input.py [--push]   (--push commits and pushes needs_input.json alone if it changed)
Public page: keeps program/fund name, link and what is needed. Strips emails, @handles, (parentheticals: contact names, figures) and local paths."""
import csv, json, os, re, subprocess, sys, datetime

OUT = 'C:/apps/ezer-engine/outreach/'
MD, CSV = OUT + 'email-reply/needs_human.md', OUT + 'fund_apps.csv'
BOARD = 'https://claude.ai/artifact/4UhmFdAaY3RXvcTFF2WVHe'   # private needs-human board, opens only for the owner
HERE = os.path.dirname(os.path.abspath(__file__))
URL = re.compile(r'https?://[^\s)]+')

def clean(s, n=150):
    s = URL.sub('', s)
    s = re.sub(r'\([^)]*\)', '', s)                          # contact names, money figures, inbox names
    s = re.sub(r'\S+@\S+|@\w+', '', s)                       # emails and handles
    s = re.sub(r'[A-Za-z]:\\\S+|\.\.\\\S+|\S+\.(csv|md|pdf|py)\b', 'file', s)
    s = re.sub(r'\s+([,.:])', r'\1', re.sub(r'\s+', ' ', s.split(';')[0])).replace(':.', '.').strip(' ,.:-')
    return s if len(s) <= n else s[:n - 1].rsplit(' ', 1)[0] + '...'

items = []
if os.path.exists(MD):
    day = ''
    for line in open(MD, encoding='utf-8'):
        m = re.match(r'##.*?(\d{4}-\d{2}-\d{2})', line)
        if m: day = m.group(1)
        m = re.match(r'- \[ \] ([^:]+):(.*)', line.strip())
        if m:
            link = URL.search(m.group(2))
            items.append(dict(when=day, program=clean(m.group(1), 60), what=clean(m.group(2)), link=link.group(0).rstrip('.,') if link else '', kind='reply'))
if os.path.exists(CSV):
    seen = {}
    for r in csv.DictReader(open(CSV, encoding='utf-8-sig')):
        st = (r.get('status') or '').strip().lower()
        if st not in ('needs founder', 'needs account'): continue
        prog = clean(r.get('program', ''), 60)
        it = dict(when=(r.get('submitted_at') or '').replace(' ET', '').strip(), program=prog, what=clean(r.get('note', '')) or st,
                  link=(r.get('url') or '').split(' ')[0], kind='account' if st == 'needs account' else 'founder')
        if prog.lower() not in seen or it['when'] >= seen[prog.lower()]['when']: seen[prog.lower()] = it   # retries: newest row wins
    items += seen.values()
items = [i for i in items if i['program'] and not re.search(r'ledger|gmail|inbox', i['program'], re.I)]   # internal housekeeping, not a program
items.sort(key=lambda i: i['when'], reverse=True)
assert not any('@' in i['what'] + i['program'] for i in items), 'email leaked'

path = os.path.join(HERE, 'needs_input.json')
old = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
if old.get('items') == items and old.get('board') == BOARD:
    print('needs_input.json unchanged:', len(items)); sys.exit(0)
json.dump(dict(updated=datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), board=BOARD, items=items), open(path, 'w', encoding='utf-8'), indent=0)
print('needs_input.json written:', len(items))
if '--push' in sys.argv:
    g = lambda *a: subprocess.run(['git', '-C', HERE, *a], check=True)
    g('add', 'needs_input.json'); g('commit', '-q', '-m', 'Role radar: needs input', '--', 'needs_input.json')
    g('pull', '-q', '--rebase', '--autostash'); g('push', '-q')
