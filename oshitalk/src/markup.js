// Posts are written in a small BBCode: [b] [i] [u] [s], [quote] / [quote="name"],
// [url=https://…]words[/url], [url]https://…[/url], and bare links. Everything is
// escaped first, so nothing a member types can become HTML of its own.
import { esc } from './util.js';

const LINK_ATTR = 'rel="nofollow ugc noopener" target="_blank"';
// a bare link, stopping at spaces, brackets and the escapes of < > " '
const BARE = /https?:\/\/(?:(?!&quot;|&#39;|&lt;|&gt;)[^\s\[\]<])+/gi;

function trimUrl(u) {
  // a sentence's full stop or a closing bracket is not part of the link
  const m = u.match(/^(.*?)([.,!?;:)]+)$/);
  if (!m) return [u, ''];
  // keep a ")" when the link opened one itself, like a Wikipedia address
  if (m[2].startsWith(')') && m[1].includes('(')) return [u, ''];
  return [m[1], m[2]];
}

export function render(src) {
  let s = esc(String(src ?? '').replace(/[\u0001\u0002]/g, ''));
  const keep = [];
  const hold = (html) => `\u0001${keep.push(html) - 1}\u0002`;

  // [url=…]words[/url] and [url]…[/url] first, so the words inside are not linked again
  s = s.replace(/\[url=(?:&quot;)?(https?:\/\/[^\s\]]+?)(?:&quot;)?\]([\s\S]*?)\[\/url\]/gi,
    (m, href, text) => hold(`<a href="${href}" ${LINK_ATTR}>${text.trim() || href}</a>`));
  s = s.replace(/\[url\](https?:\/\/[^\s\[]+?)\[\/url\]/gi,
    (m, href) => hold(`<a href="${href}" ${LINK_ATTR}>${href}</a>`));
  s = s.replace(BARE, (m) => {
    const [u, tail] = trimUrl(m);
    return hold(`<a href="${u}" ${LINK_ATTR}>${u}</a>`) + tail;
  });

  // quotes, innermost first
  for (let i = 0; i < 6; i++) {
    const before = s;
    s = s.replace(/\[quote(?:=(?:&quot;)?([^\]\n]{1,40}?)(?:&quot;)?)?\]((?:(?!\[quote)[\s\S])*?)\[\/quote\]/gi,
      (m, who, inner) => `<blockquote class="quote">${who ? `<cite>${who} เขียน:</cite>` : ''}${inner.replace(/^\n+|\n+$/g, '')}</blockquote>`);
    if (s === before) break;
  }

  // simple styles, never across the edge of a quote
  const inside = '((?:(?!<\\/?blockquote)[\\s\\S])*?)';
  for (const [tag, html] of [['b', 'strong'], ['i', 'em'], ['u', 'u'], ['s', 's']]) {
    const re = new RegExp(`\\[${tag}\\]${inside}\\[\\/${tag}\\]`, 'gi');
    for (let i = 0; i < 4; i++) {
      const before = s;
      s = s.replace(re, `<${html}>$1</${html}>`);
      if (s === before) break;
    }
  }

  s = s.replace(/\n?(<blockquote[^>]*>)\n?/g, '$1').replace(/\n?(<\/blockquote>)\n?/g, '$1');
  s = s.trim().replace(/\n/g, '<br>');
  return s.replace(/\u0001(\d+)\u0002/g, (m, i) => keep[+i]);
}

// Plain words for a search result or a moderator's card: no tags, no quoted text.
export function plain(src) {
  let s = String(src ?? '');
  for (let i = 0; i < 6; i++) {
    const before = s;
    s = s.replace(/\[quote(?:=[^\]]*)?\](?:(?!\[quote)[\s\S])*?\[\/quote\]/gi, ' ');
    if (s === before) break;
  }
  return s.replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, '$1')
    .replace(/\[\/?(?:b|i|u|s|url|quote)(?:=[^\]]*)?\]/gi, '')
    .replace(/\s+/g, ' ').trim();
}

// What goes in the box when someone presses "อ้างอิง": the post without the quotes it held.
export function quoteOf(name, body) {
  let s = String(body ?? '');
  for (let i = 0; i < 6; i++) {
    const before = s;
    s = s.replace(/\[quote(?:=[^\]]*)?\](?:(?!\[quote)[\s\S])*?\[\/quote\]\n?/gi, '');
    if (s === before) break;
  }
  return `[quote="${String(name).replace(/["\]]/g, '')}"]${s.trim()}[/quote]\n`;
}
