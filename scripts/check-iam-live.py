#!/usr/bin/env python3
"""Who is on iAM48 right now, into data/iam-live.json.

The site cannot ask the app itself — app.bnk48.com sends no CORS header, so a
visitor's browser is turned away. This job asks instead, every ten minutes
through the evening, and leaves the answer in a small file the page reads.

Only the newest catch-up entry of each member is fetched (take=1, ~400 bytes),
which is why this can run often; the full history in collect-lives.py is a
much heavier read and stays on its nightly schedule.

The member ids come from data/lives.json, written by that nightly job, so no
member page has to be scraped here.

Run by .github/workflows/iam-live.yml; safe to run by hand.
"""
import concurrent.futures as cf
import datetime as dt
import json
import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIVES = ROOT / 'data' / 'lives.json'
OUT = ROOT / 'data' / 'iam-live.json'
TZ = dt.timezone(dt.timedelta(hours=7))          # the members live in Thailand
APP = 'https://app.bnk48.com'
HEADERS = {'User-Agent': 'Mozilla/5.0 (48thDb live stats; github.com/framenaldo/48thdb)',
           'Accept': 'application/json'}


def newest(member):
    """The member's latest catch-up entry, or None if the app would not say."""
    mid, iam = member
    try:
        url = f'{APP}/member/{iam}/videocontent?skip=0&take=1'
        with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=20) as r:
            rows = json.loads(r.read().decode('utf-8'))
        return mid, iam, (rows[0] if rows else None)
    except Exception:
        return mid, iam, False                   # False: asked and failed, unlike "no lives"


def when(s):
    return dt.datetime.fromisoformat(re.sub(r'\.\d+', '', s)).astimezone(TZ).isoformat(timespec='minutes')


def main():
    lives = json.loads(LIVES.read_text(encoding='utf-8'))
    members = [(mid, m['iam']) for mid, m in lives.get('members', {}).items() if m.get('iam')]
    if not members:
        print('No member ids in data/lives.json — nothing to ask.')
        return

    with cf.ThreadPoolExecutor(8) as pool:
        answers = list(pool.map(newest, members))

    failed = [mid for mid, _, row in answers if row is False]
    live = []
    for mid, iam, row in answers:
        if not row or row is False:
            continue
        v = row.get('videoContent') or {}
        if not v.get('isLive'):
            continue
        live.append({
            'id': mid, 'iam': iam,
            'at': when(v['publishedAt']) if v.get('publishedAt') else None,
            'caption': (v.get('content') or '').strip()[:120],
            'url': APP + row['url'] if row.get('url') else f'{APP}/member/{iam}',
        })
    live.sort(key=lambda x: x['at'] or '')

    before = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else None
    # Half the members failing means the app is unwell, not that everyone stopped.
    if failed and not live and before and before.get('live') and len(failed) > len(members) / 2:
        print(f'{len(failed)} of {len(members)} could not be asked — keeping the last answer.')
        return

    nxt = {'checked': dt.datetime.now(TZ).isoformat(timespec='minutes'), 'live': live}
    if before and before.get('live') == live:
        print(f'No change — {len(live)} live.')
        return
    OUT.write_text(json.dumps(nxt, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'Wrote data/iam-live.json — {len(live)} live' + (f', {len(failed)} unanswered' if failed else ''))
    for l in live:
        print(f"  {l['id']} since {l['at']}")


if __name__ == '__main__':
    main()
