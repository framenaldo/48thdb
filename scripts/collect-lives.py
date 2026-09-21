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
HEADERS = {'User-Agent': 'Mozilla/5.0 (48thDb live stats; github.com/framenaldo/48thdb)',
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


BIRTHDAYS = {}


def members():
    """Current members, read from the site's own seed so the two never disagree."""
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    start = html.index('const SEED_MEMBERS')
    block = html[start:html.index('];', start)]
    for m in re.finditer(r"\{ id:'([a-z0-9-]+)', name:'([^']+)'.*?groupId:'([a-z0-9]+)'(.*?)photo:", block, re.S):
        if 'graduated' in m.group(4):
            continue
        b = re.search(r"birthday:'(\d{4}-\d{2}-\d{2})'", m.group(0))
        if b:
            BIRTHDAYS[m.group(1)] = b.group(1)[5:]
        slug = re.sub(r'[^a-z0-9]', '', m.group(2).lower())
        yield m.group(1), f'{m.group(3)}/{slug}'


def group_stats(starts, now):
    """Figures across every member, for the stats page. `starts` maps a member
    to the sorted start times of her lives."""
    from collections import Counter, defaultdict
    from itertools import combinations
    everything = [(t, mid) for mid, ts in starts.items() for t in ts]
    heat = [[0] * 24 for _ in range(7)]
    months = Counter()
    for t, _ in everything:
        heat[(t.weekday() + 1) % 7][t.hour] += 1
        months[t.strftime('%Y-%m')] += 1

    days = {mid: {t.date() for t in ts} for mid, ts in starts.items()}
    same_day = Counter()
    for a, b in combinations(sorted(days), 2):
        n = len(days[a] & days[b])
        if n:
            same_day[(a, b)] = n
    # starting within a quarter of an hour of each other, near enough to be a joint night
    close = Counter()
    ordered = sorted(everything)
    for i, (t, a) in enumerate(ordered):
        for t2, b in ordered[i + 1:]:
            if (t2 - t).total_seconds() > 900:
                break
            if a != b:
                close[tuple(sorted((a, b)))] += 1

    per_day = defaultdict(set)
    for t, mid in everything:
        per_day[t.date()].add(mid)
    busiest = sorted(per_day.items(), key=lambda kv: (-len(kv[1]), kv[0]))[:10]

    def streak(ds):
        best = run = 0
        prev = None
        for d in sorted(ds):
            run = run + 1 if prev and (d - prev).days == 1 else 1
            best = max(best, run)
            prev = d
        return best
    most_in_day = {mid: max(Counter(t.date() for t in ts).values()) for mid, ts in starts.items() if ts}
    on_birthday = {mid: sum(1 for d in days[mid] if d.strftime('%m-%d') == BIRTHDAYS.get(mid)) for mid in days}

    top = lambda c, n=10: [[*k, v] if isinstance(k, tuple) else [k, v] for k, v in c.most_common(n)]
    return {
        'total': len(everything),
        'year': sum(1 for t, _ in everything if t.year == now.year),
        'last30': sum(1 for t, _ in everything if (now - t).days < 30),
        'since': min(t for t, _ in everything).isoformat() if everything else None,
        'months': dict(sorted(months.items())),
        'heat': heat,
        'topAll': top(Counter({m: len(ts) for m, ts in starts.items()})),
        'top30': top(Counter({m: sum(1 for t in ts if (now - t).days < 30) for m, ts in starts.items()})),
        'sameDay': top(same_day),
        'together': top(close),
        'busiestDays': [[d.isoformat(), sorted(ms)] for d, ms in busiest],
        'streaks': top(Counter({m: streak(ds) for m, ds in days.items()})),
        'mostInDay': top(Counter(most_in_day), 8),
        'birthday': top(Counter({m: n for m, n in on_birthday.items() if n}), 10),
    }


def when(s):
    return dt.datetime.fromisoformat(re.sub(r'\.\d+', '', s)).astimezone(TZ)


def main():
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'members': {}}
    out, failed = {}, []
    now = dt.datetime.now(TZ)
    starts = {}
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
        starts[mid] = times
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
    stats = group_stats(starts, now) if len(starts) == len(out) else old.get('stats')
    if out == old.get('members') and stats == old.get('stats'):
        print('no new lives; file left as it was')
        return
    doc = {'updated': dt.datetime.now(TZ).isoformat(timespec='minutes'), 'members': out, 'stats': stats}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{len(out)} members, {sum(m["total"] for m in out.values())} lives')
    if failed:
        print('kept old data for:', *failed, sep='\n  ')


if __name__ == '__main__':
    main()
