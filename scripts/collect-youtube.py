#!/usr/bin/env python3
"""Read the view count of every song video the site links to into
data/youtube.json.

The videos are the ones in SEED_YOUTUBE in index.html. With a
YOUTUBE_API_KEY in the environment (the nightly GitHub job has one as a
secret) the counts come from the YouTube Data API, 50 videos a call. Without
one, each video's watch page is read instead, which works from a home
connection but not from GitHub, whose servers YouTube turns away.
Run by .github/workflows/lives.yml; safe to run by hand.
"""
import datetime as dt
import json
import os
import pathlib
import urllib.parse
import re
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'youtube.json'
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


def main():
    old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'videos': {}}
    videos, failed = {}, []
    ids = video_ids()
    key = os.environ.get('YOUTUBE_API_KEY', '').strip()
    if key:
        videos = from_api(ids, key)
        gone = [v for v in ids if v not in videos]
        for vid in gone:                     # deleted or private since it was linked
            if vid in old['videos']:
                videos[vid] = old['videos'][vid]
        write(videos)
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
    write(videos)
    if failed:
        print('kept old count for:', *failed, sep='\n  ')


def write(videos):
    if not videos:
        raise SystemExit('nothing read; leaving the old file alone')
    OUT.parent.mkdir(exist_ok=True)
    doc = {'updated': dt.datetime.now(TZ).isoformat(timespec='minutes'), 'videos': videos}
    OUT.write_text(json.dumps(doc, separators=(',', ':')), encoding='utf-8')
    print(f'{len(videos)} videos, {sum(v["views"] for v in videos.values()):,} views')


if __name__ == '__main__':
    main()
