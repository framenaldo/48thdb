#!/usr/bin/env python3
"""Read the view count of every song video the site links to into
data/youtube.json.

The videos are the ones in SEED_YOUTUBE in index.html. With a
YOUTUBE_API_KEY in the environment (the nightly GitHub job has one as a
secret) the counts come from the YouTube Data API, 50 videos a call. Without
one, each video's watch page is read instead, which works from a home
connection but not from GitHub, whose servers YouTube turns away.
Run by .github/workflows/lives.yml; safe to run by hand.

Milestones: a video passing a round number of views (every 100,000 up to a
million, then every million) is noted in the file with the moment it was
seen, and its YouTube cover is saved to covers/<id>.jpg so the page can draw
a share card on it without asking YouTube. With --milestones-only (the hourly
job, .github/workflows/milestones.yml) the file is only written when a video
has just passed one, so the hour's small changes in the counts do not each
make a commit; the nightly run still brings every count up to date.
"""
import datetime as dt
import json
import os
import pathlib
import urllib.parse
import re
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'youtube.json'
COVERS = ROOT / 'covers'
MILESTONE_DAYS = 7          # how long the page celebrates one; covers are fetched for these
TZ = dt.timezone(dt.timedelta(hours=7))
HEADERS = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36',
           'Accept-Language': 'en'}


def video_ids():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    block = html[html.index('const SEED_YOUTUBE'):]
    block = block[:block.index('};')]
    return list(dict.fromkeys(re.findall(r":\['([A-Za-z0-9_-]{11})'", block)))


def read(vid):
    url = f'https://www.youtube.com/watch?v={vid}'
    for attempt in range(3):
        try:
            page = urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=30).read().decode('utf-8')
            m = re.search(r'var ytInitialPlayerResponse = (\{.*?\});(?:var|</script>)', page)
            data = json.loads(m.group(1))
            v = data['videoDetails']
            pub = data.get('microformat', {}).get('playerMicroformatRenderer', {}).get('publishDate')
            return {'views': int(v['viewCount']), 'published': (pub or '')[:10] or None,
                    'length': int(v.get('lengthSeconds') or 0)}
        except Exception as e:
            err = e
            time.sleep(2)
    raise err


def iso_seconds(d):
    m = re.fullmatch(r'P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', d or '')
    if not m:
        return 0
    days, h, mi, se = (int(x or 0) for x in m.groups())
    return ((days * 24 + h) * 60 + mi) * 60 + se


def from_api(ids, key):
    out = {}
    for i in range(0, len(ids), 50):
        q = urllib.parse.urlencode({'part': 'statistics,contentDetails,snippet',
                                    'id': ','.join(ids[i:i + 50]), 'key': key})
        data = json.loads(urllib.request.urlopen(
            f'https://www.googleapis.com/youtube/v3/videos?{q}', timeout=30).read().decode('utf-8'))
        for it in data.get('items', []):
            out[it['id']] = {'views': int(it['statistics'].get('viewCount', 0)),
                             'published': it['snippet']['publishedAt'][:10],
                             'length': iso_seconds(it['contentDetails'].get('duration'))}
    return out


def milestone(n):
    """The last round number of views passed: every 100,000 to a million, then every million."""
    if n < 100_000:
        return 0
    return n // 100_000 * 100_000 if n < 1_000_000 else n // 1_000_000 * 1_000_000


def note_milestones(old, videos, now):
    """Keeps the file's milestones, adding any passed since the last counts."""
    kept = {vid: dict(m) for vid, m in (old.get('milestones') or {}).items()
            if dt.datetime.fromisoformat(m['at']) > now - dt.timedelta(days=30)}
    new = []
    for vid, v in videos.items():
        before = old['videos'].get(vid)
        mark = milestone(v['views'])
        if before and mark > milestone(before['views']):
            kept[vid] = {'mark': mark, 'at': now.isoformat(timespec='minutes')}
            new.append(f'{vid} passed {mark:,}')
    return kept, new


def fetch_covers(milestones, now):
    """Saves the YouTube cover of each video still being celebrated, once, and
    notes on the milestone that it is there, so the page only asks for covers
    that exist."""
    saved = []
    for vid, m in milestones.items():
        path = COVERS / f'{vid}.jpg'
        if path.exists():
            m['cover'] = True
        if path.exists() or dt.datetime.fromisoformat(m['at']) < now - dt.timedelta(days=MILESTONE_DAYS):
            continue
        for size in ('maxresdefault', 'hqdefault'):
            try:
                img = urllib.request.urlopen(urllib.request.Request(
                    f'https://i.ytimg.com/vi/{vid}/{size}.jpg', headers=HEADERS), timeout=30).read()
            except Exception:
                continue
            if len(img) > 2000:                  # YouTube answers a missing size with a tiny grey picture
                COVERS.mkdir(exist_ok=True)
                path.write_bytes(img)
                m['cover'] = True
                saved.append(path.name)
                break
    return saved


def main():
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'videos': {}}
    only_milestones = '--milestones-only' in sys.argv
    videos, failed = {}, []
    ids = video_ids()
    key = os.environ.get('YOUTUBE_API_KEY', '').strip()
    if key:
        videos = from_api(ids, key)
        gone = [v for v in ids if v not in videos]
        for vid in gone:                     # deleted or private since it was linked
            if vid in old['videos']:
                videos[vid] = old['videos'][vid]
        if only_milestones:
            now = dt.datetime.now(TZ)
            milestones, new = note_milestones(old, videos, now)
            covers = fetch_covers(milestones, now)
            if new or covers:
                print(*new, *(f'cover saved: {c}' for c in covers), sep='\n')
                write(videos, old)
            else:
                print('no milestone this hour')
            return
        write(videos, old)
        if gone:
            print('not returned by the API (kept old counts):', ', '.join(gone))
        return
    for n, vid in enumerate(ids):
        try:
            videos[vid] = read(vid)
        except Exception as e:
            failed.append(f'{vid}: {e}')
            if vid in old['videos']:
                videos[vid] = old['videos'][vid]     # keep the last good count
            # YouTube turns some servers away outright; if the first few all
            # fail, the rest will too, so keep yesterday's numbers and stop
            if len(failed) == n + 1 and len(failed) >= 5:
                print('YouTube is refusing this machine; keeping the previous counts')
                return
        time.sleep(1.2)
    write(videos, old)
    if failed:
        print('kept old count for:', *failed, sep='\n  ')


def write(videos, old):
    if not videos:
        raise SystemExit('nothing read; leaving the old file alone')
    OUT.parent.mkdir(exist_ok=True)
    now = dt.datetime.now(TZ)
    milestones, new = note_milestones(old, videos, now)
    for line in new:
        print(line)
    fetch_covers(milestones, now)
    doc = {'updated': now.isoformat(timespec='minutes'), 'videos': videos, 'milestones': milestones}
    OUT.write_text(json.dumps(doc, separators=(',', ':')), encoding='utf-8')
    print(f'{len(videos)} videos, {sum(v["views"] for v in videos.values()):,} views')


if __name__ == '__main__':
    main()
