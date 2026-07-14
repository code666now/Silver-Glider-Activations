// Booth names, descriptions, photo URLs and Instagram handles come from a PUBLIC
// self-registration form and are interpolated straight into server-rendered HTML
// that every festival attendee loads. Without escaping, a vendor can register a
// booth called `<script>...</script>` and own the landing page.
//
// Three contexts, three different escapes — using the wrong one is the same as
// using none.

const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// HTML text and quoted attribute values.
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
}

// A string literal inside a <script> block. Emits its own quotes, so use it as:
//   var name = ${jsStr(p.name)};
//
// JSON.stringify covers quotes, backslashes and newlines, but not `</script>`,
// which closes the block wherever it appears — hence escaping `<`. U+2028/U+2029
// are line terminators in JS string literals and would break the script too.
//
// The separator regex is built from an escaped string rather than a regex
// literal on purpose: typing U+2028 literally in source makes it a real newline.
const LINE_SEP = new RegExp('\u2028', 'g');
const PARA_SEP = new RegExp('\u2029', 'g');

function jsStr(value) {
  return JSON.stringify(String(value ?? ''))
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEP, '\u2028')
    .replace(PARA_SEP, '\u2029');
}

// A JSON value embedded as a literal inside a <script> block — stays an array or
// object, unlike jsStr which produces a quoted string. Use as:
//   var slugs = ${jsJson(list)};
// The < escaping is valid inside JS string literals, so the structure is
// preserved while `</script>` still can't close the block.
function jsJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEP, '\\u2028')
    .replace(PARA_SEP, '\\u2029');
}

// Anything landing in href/src/url(). Blocks `javascript:`, `data:` and friends
// by allowing only absolute http(s) and site-relative paths. Returns '' for the
// rest, so a hostile URL renders as an empty attribute instead of a payload.
function safeUrl(value) {
  if (!value) return '';
  const url = String(value).trim();
  if (/^\/(?!\/)/.test(url)) return esc(url);        // /path, but not //evil.com
  if (/^https?:\/\//i.test(url)) return esc(url);
  return '';
}

module.exports = { esc, jsStr, jsJson, safeUrl };
