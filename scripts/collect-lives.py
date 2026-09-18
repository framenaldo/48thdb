#!/usr/bin/env python3
"""Collect every current member's iAM48 live history into data/lives.json.

The iAM48 member page (app.bnk48.com/members/<group>/<nickname>) names the
member's numeric id, and /member/<id>/videocontent lists her catch-up lives:
when each started and its caption. Views and length are not published, so
the stats are built from start times alone.

Run by .github/workflows/lives.yml once a day; safe to run by hand.
"""
import datetime as dt
import json
import pathlib
import re
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'lives.json'
TZ = dt.timezone(dt.timedelta(hours=7))          # the members live in Thailand
HEADERS = {'User-Agent': 'Mozilla/5.0 (48thDB live stats; github.com/framenaldo/48thdb)',
           'Accept': 'application/json'}


def get(url):
    err = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=40) as r:
                return r.read().decode('utf-8')
        except Exception as e:   # a flaky request should not lose the whole day
            err = e
            time.sleep(3 * (attempt + 1))
    raise err


def members():
    """Current members, read from the site's own seed so the two never disagree."""
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    start = html.index('const SEED_MEMBERS')
    block = html[start:html.index('];', start)]
    for m in re.finditer(r"\{ id:'([a-z0-9-]+)', name:'([^']+)'.*?groupId:'([a-z0-9]+)'(.*?)photo:", block, re.S):
        if 'graduated' in m.group(4):
            continue
        slug = re.sub(r'[^a-z0-9]', '', m.group(2).lower())
        yield m.group(1), f'{m.group(3)}/{slug}'


def when(s):
    return dt.datetime.fromisoformat(re.sub(r'\.\d+', '', s)).astimezone(TZ)


def main():
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'members': {}}
    out, failed = {}, []
    now = dt.datetime.now(TZ)
    for mid, path in members():
        try:
            page = get(f'https://app.bnk48.com/members/{path}')
            iam = int(re.search(r'/member/(\d+)/videocontent', page).group(1))
            lives = json.loads(get(f'https://app.bnk48.com/member/{iam}/videocontent?skip=0&take=5000'))
        except Exception as e:
            # keep yesterday's numbers rather than blanking a member for one bad request
            failed.append(f'{mid}: {e}')
            if mid in old.get('members', {}):
                out[mid] = old['members'][mid]
            continue
        times = sorted(when(v['videoContent']['publishedAt']) for v in lives)
        months, hours, days = {}, [0] * 24, [0] * 7
        for t in times:
            key = t.strftime('%Y-%m')
            months[key] = months.get(key, 0) + 1
            hours[t.hour] += 1
            days[(t.weekday() + 1) % 7] += 1           # Sunday first, as the site counts days
        recent = sorted(lives, key=lambda v: v['videoContent']['publishedAt'], reverse=True)[:5]
        out[mid] = {
            'iam': iam,
            'total': len(times),
            'first': times[0].isoformat() if times else None,
            'last': times[-1].isoformat() if times else None,
            'liveNow': any(v['videoContent'].get('isLive') for v in lives),
            'last30': sum(1 for t in times if (now - t).days < 30),
            'months': months, 'hours': hours, 'days': days,
            'recent': [{'id': v['videoContent']['id'],
                        'at': when(v['videoContent']['publishedAt']).isoformat(),
                        'text': (v['videoContent'].get('content') or '').strip()[:120]} for v in recent],
        }
        print(f'{mid:16} {len(times):5}', flush=True)
        time.sleep(0.6)                                # be a polite visitor

    if not out:
        sys.exit('nothing collected; leaving the old file alone')
    if out == old.get('members'):
        print('no new lives; file left as it was')
        return
    doc = {'updated': dt.datetime.now(TZ).isoformat(timespec='minutes'), 'members': out}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{len(out)} members, {sum(m["total"] for m in out.values())} lives')
    if failed:
        print('kept old data for:', *failed, sep='\n  ')


if __name__ == '__main__':
    main()
