// node --test test/markup.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, plain, quoteOf } from '../src/markup.js';

test('escapes everything a member types', () => {
  assert.equal(render('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(render('a "b" & \'c\''), 'a &quot;b&quot; &amp; &#39;c&#39;');
});

test('bold, italic, underline, strike, nested', () => {
  assert.equal(render('[b]หนา[/b] [i]เอียง[/i] [u]u[/u] [s]s[/s]'), '<strong>หนา</strong> <em>เอียง</em> <u>u</u> <s>s</s>');
  assert.equal(render('[b][i]x[/i][/b]'), '<strong><em>x</em></strong>');
  assert.equal(render('[b]unclosed'), '[b]unclosed');
});

test('links only for http and https, never a script', () => {
  const a = render('[url=https://a.com/x?y=1&z=2]คำ[/url]');
  assert.match(a, /^<a href="https:\/\/a\.com\/x\?y=1&amp;z=2" rel="nofollow ugc noopener" target="_blank">คำ<\/a>$/);
  assert.equal(render('[url=javascript:alert(1)]x[/url]'), '[url=javascript:alert(1)]x[/url]');
  assert.doesNotMatch(render('[url=https://a.com/"onmouseover="x]y[/url]'), /href="[^"]*"[^ >]/);
  assert.equal(render('ดู https://example.com/a.'), 'ดู <a href="https://example.com/a" rel="nofollow ugc noopener" target="_blank">https://example.com/a</a>.');
  assert.match(render('"https://x.com"'), /^&quot;<a href="https:\/\/x\.com" [^>]+>https:\/\/x\.com<\/a>&quot;$/);
  assert.equal((render('[url]https://a.com[/url]').match(/<a /g) || []).length, 1);
  assert.equal((render('[url=https://a.com]https://b.com[/url]').match(/<a /g) || []).length, 1);
});

test('quotes nest and keep the name', () => {
  const h = render('[quote="ชาเย็น"][quote=มะม่วง]ใน[/quote]นอก[/quote]\nตอบ');
  assert.equal(h, '<blockquote class="quote"><cite>ชาเย็น เขียน:</cite><blockquote class="quote"><cite>มะม่วง เขียน:</cite>ใน</blockquote>นอก</blockquote>ตอบ');
  assert.equal(render('[quote]x[/quote]'), '<blockquote class="quote">x</blockquote>');
});

test('styles never cross a quote edge', () => {
  const h = render('[b]a[quote]b[/b][/quote]');
  assert.doesNotMatch(h, /<strong>[^<]*<blockquote/);
});

test('new lines become breaks', () => {
  assert.equal(render('a\nb\n\nc'), 'a<br>b<br><br>c');
});

test('plain text and quoting', () => {
  assert.equal(plain('[quote="x"]old[/quote][b]new[/b] [url=https://a.com]link[/url]'), 'new link');
  assert.equal(quoteOf('ชาเย็น', '[quote="x"]old[/quote]\nใหม่'), '[quote="ชาเย็น"]ใหม่[/quote]\n');
});

test('pictures: our own addresses only, at most ten, sized', () => {
  const h = render('ดูนี่\n[img=1200x900]abcdefghijklmnop[/img]');
  assert.match(h, /<a class="pic" href="\/i\/abcdefghijklmnop"[^>]*><img src="\/i\/abcdefghijklmnop" width="1200" height="900" loading="lazy"/);
  assert.doesNotMatch(render('[img]https://evil.example/x.png[/img]'), /<img/);   // another site's picture is only a link
  assert.equal(render('[img]short[/img]'), '[img]short[/img]');
  assert.doesNotMatch(render('[img="onerror=alert(1)]abcdefghijklmnop[/img]'), /onerror=alert\(1\)[^<]*<img/);
  const many = Array.from({ length: 12 }, (_, i) => `[img]abcdefghijklmn${String(i).padStart(2, '0')}[/img]`).join('');
  assert.equal((render(many).match(/<img /g) || []).length, 10);
  assert.equal(plain('ก่อน [img=10x10]abcdefghijklmnop[/img] หลัง'), 'ก่อน 📷 หลัง');
  assert.equal(quoteOf('x', 'รูป [img]abcdefghijklmnop[/img]'), '[quote="x"]รูป [รูป][/quote]\n');
});
