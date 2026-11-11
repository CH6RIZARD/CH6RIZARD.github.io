"""Daily job engine. Reads the public Greenhouse / Lever / Ashby feeds of ~600 company boards (live = open now), reads each posting's full text,
keeps entry/junior/associate/new-grad roles that need <= 2 years, in the target cities or remote, scores fit to Chaze's skills, tags what is NEW today.
python engine.py -> jobs_all.csv (best fit first), jobs_new_today.csv, seen.json (tomorrow shows only new ones)"""
import csv, json, re, os, html, urllib.request, concurrent.futures as cf
from datetime import date

SLUGS = {
 'gh': '''stripe databricks anthropic figma datadog roblox scaleai appliedintuition anduril skydio nuro samsara brex mongodb airbnb coinbase cloudflare twilio discord duolingo instacart lyft pinterest reddit asana gitlab dropbox okta elastic hashicorp vercel retool gusto robinhood affirm chime sofi toast rippling carta flexport epicgames unity3d waymo zoox aurora wayve agilityrobotics bostondynamics 1x apptronik dexterity covariant huggingface cohere mistral spacex relativity saronic striveworks pariveda cesiumastro goodleap lightspeedsystems arvaintelligence clarityinnovates mthreerecruitingportal sagent furtherearlycareer virtu twosigma jumptrading drweng hudsonrivertrading citadel optiver imc peloton squarespace etsy bloomberg stubhub seatgeek whatnot garnerhealth cantor ember blueyonder cdkglobal empowerpharmacy nov transcore leonardodrs oracle visa mastercard paypal intuit adobe salesforce workday servicenow splunk newrelic pagerduty zendesk hubspot block shopify wayfair doordash uber grammarly notion airtable webflow zapier miro canva linear mercury ramp navan gopuff bumble match zillow opendoor redfin compass carvana indeed glassdoor handshake coursera udemy chegg instructure 2u quizlet khanacademy anaconda dbtlabs fivetran confluent snowflake cockroachlabs planetscale supabase neon temporal sentry launchdarkly postman circleci jfrog snyk crowdstrike sentinelone zscaler rapid7 tenable varonis cyberark abnormalsecurity lacework wiz vanta drata secureframe plaid marqeta lithic moderntreasury column unit treasuryprime galileo bill expensify justworks paylocity deel remote velocity rivian lucid tesla aptiv motional mobileye kodiak gatik forterra applied bear flock axon verkada rigetti ionq psiquantum anyscale replicate stability inflection adept sierra decagon glean harvey hebbia writer jasper synthesia heygen elevenlabs luma genmo krea leonardo ideogram gusto hims hubspot calendly lattice gitlab mattermost sumologic zuora medallia jamf ping sailpoint rubrik cohesity druva commvault veeam nutanix pure netapp vast weka cribl chronosphere honeycomb lightstep grafana timescale redis couchbase singlestore yugabyte materialize clickhouse starburst dremio alteryx datarobot h2o dataiku c3 samsara motive geotab verizonconnect fleetio platformscience transfix convoy loadsmart uberfreight echo project44 fourkites descartes manhattan kinaxis o9 coupa jaggaer zip tipalti airbase divvy spendesk paystand stax payoneer remitly wise nium thunes flywire bill.com melio paymentus repay nuvei shift4 lightspeed olo punchh thanx paytronix revel clover tillster presto ziosk sevenrooms resy opentable yelp thumbtack angi porch hippo lemonade root metromile clearcover branch kin openly vouch embroker pie coalition at-bay cowbell corvus boost newfront bestow ethos policygenius ladder haven selfdecode betterment public oscar zocdoc omadahealth talkspace modernhealth cloverhealth octave axios voxmedia forbes insider nextdoor medium kickstarter hellofresh glossier calm classpass mindbody oura future flexe narvar route aftership klaviyo postscript yotpo commercetools godaddy fastly netlify buildkite veracode blackduck tanium expel huntress blumira securityscorecard onetrust bigid osano axonius chainguard socket endorlabs torq tines mabl saucelabs storyblok contentstack greenhouse hackerrank karat a16z esri planetlabs spire blacksky hawkeye360 astranis axiom rocketlab momentus apex archer wing shield epirus divergent outrider pivotbio indigo inceptive tenstorrent lightmatter togetherai coreweave comet descript cameo mightynetworks hootsuite later sproutsocial brandwatch cision muckrack yext weave 2k 6sense acquia adyen albedo altruist amwell appian augury aviatrix billcom bishopfox bitwarden blend bombas boulevard braze bugcrowd bungie cbinsights celigo chargepoint checkr clever collibra cresta crunchyroll crystaldynamics cultureamp dashlane datacamp dialpad doximity everlane faire fictiv fieldwire five9 formlabs fubotv ghost ginkgobioworks grafanalabs guidepoint guild healthjoy hearst hiddenlayer highnote homelight imply insomniac intercom kairospower komodohealth labelbox logicgate lucidmotors lucidsoftware mixpanel neo4j netskope newsela observeai odeko oklo onemedical openspace pacaso pandadoc pantheon paperlessparts qualtrics redwoodmaterials riotgames roku roofstock salesloft science37 scopely sigmacomputing similarweb smartsheet snorkelai springboard startree stitchfix suki sweetgreen synack tailscale thoughtworks tripactions tulip twitch typeform ujet upkeep upstart vannevarlabs vts watershed workato wrike xometry yubico zenoti zoominfo accela anaplan andurilindustries billtrust bird cargomatic chaosindustries cloudbeds codeforamerica current datarails diligent earnin ebanx fastspring figure figureai found highradius hyperproof kikoff locusrobotics mark43 mesh missionlane navapbc oddball onestream oportun pathrobotics rapidsos saltbox seurat sezzle shipmonk spin step strike thoropass tripadvisor upgrade ursamajor via alloy applovin aura blockchain builtin celonis chronograph databento devrev drivewealth earnest fanduel fetch fireblocks flatironhealth janestreet kalshi mozilla pendo stackline stockx taskrabbit tebra thetradedesk udacity upwork warp xai zola zwift''',
 'lv': '''plaid palantir spotify netflix wealthfront ro attentive highspot shieldai bhhc goodleap waabi modernintelligence sonarsource cesiumastro gopuff kraken bitgo anchorage chainalysis blockdaemon alchemy opensea consensys gemini circle ripple stellar metlife arcadia aledade veeva theathletic fly sonatype sysdig healthcare jobvite angellist loftorbital hermeus skyways enveda zilliz 15five atomcomputing brightedge brilliant chownow coalfire emburse entrata finix glide immuta jamcity jumpcloud kabam lyrahealth matillion mendix netomi outreach patch pointclickcare prosper protolabs redoxengine snaplogic symplicity twingate velo3d veo voltus xcimer ambirobotics anybotics brightmachines floqast greenlight lendbuzz osaro payactiv pigment plooto relay truv versapay aleph bounteous cloudinary zushealth''',
 'ab': '''openai ramp notion linear cursor anysphere cognition replit modal wandb perplexity runway elevenlabs deel pariveda careerswift supabase posthog clerk resend retool vercel railway render neon convex trigger inngest sanity contentful dagster prefect airbyte hex mode metabase lightdash acorns titan headway alma cedar commure abridge nabla capsule quora substack patreon strava whoop tonal gorgias recharge hostinger sentra orca semgrep oligo checkly chromatic ditto nomad trustedhealth paradox ashby beamery ycombinator sequoia mapbox astra boom asimov scribe arbor insitro generate absci latent cerebras etched d-matrix fireworks baseten runpod lambda crusoe vultr neptune pinecone weaviate lancedb unstructured llamaindex langchain dust gamma opusclip wistia thinkific buffer 1password akasa amplitude apollo appfolio arrive astronomer atlan aurorasolar benchling betterup bubble classdojo clickup deepnote demandbase formenergy fullstory g2 gitbook gravie hackerone helion helpscout illumio infinitus influxdata iterable jobber kestra kong maintainx mintlify montecarlodata motherduck multiverse mural nerdwallet outschool owner philo plotly poshmark primer sandboxaq shift sitecore snapdocs surveymonkey sylvera take2 twelve virtahealth wealthsimple abacum adaptive airwallex anrok atomic capchase caribou causal clair clearco cobot cube dailypay dave evolve foxglove hopper imprint kayak meow method mosaic novo numeral numeric opengov paddle parafin picogrid rain rho sanctuary serverobotics siteminder sonder standardbots stigg wayflyer yotta andela attio away brightwheel cartesia dandy doppler eightsleep ledger nuna nylas paxos pocket polymarket rec sardine speakeasy suno uniswap vapi''',
}
CITY = re.compile(r"\b(remote|new york|nyc|brooklyn|long island|hauppauge|melville|bohemia|ronkonkoma|islandia|farmingdale|bethpage|plainview|hicksville|garden city|uniondale|westbury|huntington|smithtown|stony brook|port jefferson|riverhead|syosset|jericho|great neck|lake success|brookville|greenvale|mineola|bay shore|commack|deer park|yaphank|upton|greenlawn|northport|oyster bay|"
                  r"austin|dallas|plano|frisco|irving|addison|richardson|arlington|denton|mckinney|southlake|las colinas|carrollton|lewisville|allen|coppell|fort worth|houston|the woodlands|sugar land|katy|pearland|webster|clear lake|san antonio|round rock|cedar park|georgetown|waco|college station|lubbock|el paso|corpus christi|texas|, tx|"
                  r"oklahoma|tulsa|norman|edmond|, ok\b|miami|fort lauderdale|boca raton|doral|orlando|tampa|jacksonville|florida|, fl\b|atlanta|alpharetta|marietta|norcross|duluth|kennesaw|georgia|, ga)\b", re.I)
USA = re.compile(r"\b(united states|usa|u\.s\.|us-remote|remote us|, [a-z]{2}\b|[a-z]+, (ca|wa|ma|il|co|pa|nj|nc|va|md|dc|or|az|ut|mn|mi|oh|tn|mo|wi|in|ct|nv|id|ne|ia|ks|ar|ky|sc|al|la|nm|ri|nh|vt|me|de|hi|ak|ms|wv|mt|nd|sd|wy))\b|san francisco|seattle|boston|chicago|denver|los angeles|san jose|palo alto|mountain view|sunnyvale|menlo park|washington|philadelphia|pittsburgh|atlanta|raleigh|salt lake|phoenix|portland|minneapolis|detroit|columbus|nashville|charlotte|san diego|irvine|bellevue|redmond", re.I)
NONUS = re.compile(r"\b(uk|united kingdom|london|england|poland|germany|berlin|munich|india|bangalore|mexico|apac|emea|europe|canada|toronto|vancouver|ireland|dublin|france|paris|spain|netherlands|amsterdam|sweden|singapore|australia|sydney|japan|tokyo|brazil|israel|tel aviv|china|korea|philippines|colombia|argentina|lithuania|portugal|switzerland|zurich)\b", re.I)
BADT = re.compile(r"(senior|sr\.|staff|principal|lead\b|director|manager|head of|vp\b|architect|intern\b|internship|phd|distinguished|fellow|\biii\b|\biv\b|\bv\b|level [3-9]|l[4-9]\b)", re.I)
ENTRY = re.compile(r"(new grad|new college grad|university|early career|entry|junior|jr\.?\b|associate|graduate|apprentice|resident|software engineer i\b|engineer i\b|developer i\b|software engineer 1|engineer 1\b|level 1|swe i\b|\b2027\b|\b2026\b)", re.I)
ROLE = re.compile(r"(qa\b|quality|test|support engineer|technical support|solutions|implementation|integration|analyst|it engineer|it support|systems|technical|product engineer|automation|web|cloud|software|developer|engineer|programmer|machine learning|ml |ai |data|backend|front.?end|full.?stack|simulation|robotic|graphics|game|mobile|ios|android|platform|infrastructure|devops|sre|security|forward deployed)", re.I)
NONSW = re.compile(r"(mechanical|civil|electrical|structural|manufactur|field|chemical|hardware|sales|marketing|recruit|account|legal|finance|hr |people|designer|writer|nurse|clinical)", re.I)
FIT = [(r"mujoco|physics engine|physically.?based|dynamics simulation|rigid.?body", 8), (r"simulation|simulator|robotics|reinforcement learning|sim2real|control systems", 5),
       (r"three\.?js|webgl|webgpu|3d graphics|unity|unreal|game engine", 5), (r"agent|agentic|llm|langchain|rag\b|prompt", 4), (r"typescript", 3), (r"node\.?js|fastify|express", 3),
       (r"react native|expo|mobile", 3), (r"react\b|next\.?js|front.?end", 2), (r"python", 2), (r"plaid|fintech|payments|banking|ledger|card issuing|savings", 4),
       (r"prisma|postgres|supabase|websocket|real.?time|webrtc", 2), (r"full.?stack|end.?to.?end|startup|0 to 1|ownership|self.?taught|portfolio|github", 2),
       (r"no degree|degree or equivalent|or equivalent experience|equivalent practical", 3)]
FITR = [(re.compile(p, re.I), w) for p, w in FIT]


def get(u, t=20):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=t) as r:
            return json.load(r)
    except Exception:
        return None


def strip(s):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html.unescape(s or ''))).strip()


def gh(s):
    d = get(f'https://boards-api.greenhouse.io/v1/boards/{s}/jobs?content=true')
    return [dict(co=s, title=j['title'], loc=(j.get('location') or {}).get('name', ''), url=j['absolute_url'], text=strip(j.get('content')), src='greenhouse', posted=(j.get('first_published') or j.get('updated_at') or '')[:10]) for j in (d or {}).get('jobs', [])]


def lv(s):
    d = get(f'https://api.lever.co/v0/postings/{s}?mode=json')
    return [dict(co=s, title=j['text'], loc=(j.get('categories') or {}).get('location', '') + ' ' + (j.get('workplaceType') or ''), url=j['hostedUrl'],
                 text=(j.get('descriptionPlain') or '') + ' ' + ' '.join(l.get('text', '') + ' ' + strip(l.get('content', '')) for l in j.get('lists', [])), src='lever', posted=(__import__('datetime').datetime.utcfromtimestamp(j['createdAt']/1000).date().isoformat() if j.get('createdAt') else '')) for j in (d or []) if isinstance(j, dict)]


def ab(s):
    d = get(f'https://api.ashbyhq.com/posting-api/job-board/{s}?includeCompensation=true')
    return [dict(co=s, title=j['title'], loc=(j.get('location') or '') + ' ' + ('remote' if j.get('isRemote') else ''), url=j.get('jobUrl', ''), text=(j.get('descriptionPlain') or ''),
                 pay=(j.get('compensation') or {}).get('compensationTierSummary', ''), src='ashby', posted=(j.get('publishedAt') or '')[:10]) for j in (d or {}).get('jobs', [])]


def years(text):
    ys = [int(x) for x in re.findall(r'(\d{1,2})\+?\s*(?:or more\s*)?(?:years|yrs)', text[:6000], re.I) if int(x) < 15]
    return min(ys) if ys else 0


ELITE = set('palantir anthropic openai spacex relativity twosigma jumptrading hudsonrivertrading citadel optiver imc drweng databricks scaleai cursor anysphere cognition perplexity huggingface mistral cohere waymo anduril shieldai apptronik zoox aurora nuro skydio bostondynamics agilityrobotics dexterity covariant figma stripe coinbase robinhood'.split())


def main():
    jobs = []
    with cf.ThreadPoolExecutor(32) as ex:
        futs = [ex.submit(f, s) for f, L in ((gh, set(SLUGS['gh'].lower().split())), (lv, set(SLUGS['lv'].split())), (ab, set(SLUGS['ab'].split()))) for s in L]
        for f in futs:
            try:
                jobs += f.result()
            except Exception:
                pass
    keep = []
    for j in jobs:
        t, l = j['title'], j['loc'] or 'remote'
        if j.get('posted') and j['posted'] < (date.today() - __import__('datetime').timedelta(days=30)).isoformat():
            continue   # older than 30 days: skip, newer postings only
        if NONUS.search(l):
            continue   # remote roles tied to another country are not his
        if BADT.search(t) or NONSW.search(t) or not ROLE.search(t) or not (CITY.search(l) or USA.search(l)):
            continue
        y = years(j['text'])
        if y > 3 or not (ENTRY.search(t) or y in (0, 1, 2, 3) or re.search(r'0-?2 years|entry.level|new grad|recent graduate|early career', j['text'][:3000], re.I)):
            continue
        score = sum(w for r, w in FITR if r.search(t + ' ' + j['text'][:5000]))
        pay = j.get('pay') or ', '.join(re.findall(r'\$\s?\d{2,3},\d{3}\s*(?:-|to|–)\s*\$\s?\d{2,3},\d{3}', j['text'])[:1])
        keep.append(dict(tier=1 if j['co'].lower() in ELITE else 0, score=score, company=j['co'], title=t, location=j['loc'].strip(), pay=pay, posted=j.get('posted', ''), min_years=y, url=j['url'], source=j['src'], desc=j['text'][:1800]))
    keep.sort(key=lambda k: (k['tier'], k['posted'] == '', [-ord(c) for c in k['posted']], -k['score']))   # realistic first, elite-bar companies last
    keep_all = list(keep)
    cnt = {}
    capped = []
    for k in keep:
        cnt[k['company']] = cnt.get(k['company'], 0) + 1
        if cnt[k['company']] <= 40: capped.append(k)
    keep = capped
    seen = json.load(open('seen.json')) if os.path.exists('seen.json') else {}
    today = date.today().isoformat()
    for k in keep:
        k['first_seen'] = seen.setdefault(k['url'], today)
    cols = ['tier', 'score', 'company', 'title', 'location', 'pay', 'posted', 'min_years', 'url', 'source', 'first_seen']
    for name, rows in (('jobs_all.csv', keep), ('jobs_new_today.csv', [k for k in keep if k['first_seen'] == today])):
        with open(name, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore')
            w.writeheader()
            w.writerows(rows)
    # cumulative master list: nothing is dropped, so the total only grows; open=yes while the posting is still live
    mcols = cols + ['open', 'last_seen', 'desc']
    master = {}
    if os.path.exists('jobs_master.csv'):
        for r in csv.DictReader(open('jobs_master.csv', encoding='utf-8')):
            master[r['url']] = r
    live = set()
    for k in keep_all:
        live.add(k['url'])
        fs = seen.setdefault(k['url'], today)
        master[k['url']] = dict(k, first_seen=fs, open='yes', last_seen=today)
    prev_read = int(open('last_read.txt').read()) if os.path.exists('last_read.txt') else 0
    healthy = len(jobs) >= 0.8 * prev_read   # a run that could not reach many boards (network down) must not mark roles closed
    for u, r in master.items():
        if u not in live and healthy:
            r['open'] = 'no'
    if healthy:
        open('last_read.txt', 'w').write(str(len(jobs)))
    with open('jobs_master.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=mcols, extrasaction='ignore')
        w.writeheader()
        w.writerows(sorted(master.values(), key=lambda r: (r.get('open') != 'yes', int(r.get('tier') or 0), -int(float(r.get('score') or 0)))))
    json.dump(seen, open('seen.json', 'w'))
    print(f'{len(master)} roles found to date, {len(live)} open now; {len(jobs)} postings read, {len(keep)} queued ({sum(1 for k in keep if k["first_seen"] == today)} new today)')


if __name__ == "__main__": main()
