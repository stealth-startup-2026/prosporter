/**
 * HTML clean-up for migrated WordPress content (CLNT-171).
 *
 * Shopify stores `Page.body` and `Article.contentHtml` exactly as the migration
 * wrote them, which means WordPress block markup and Elementor page-builder
 * output: block comments (`<!-- wp:paragraph -->`), tracking scripts, embedded
 * iframes, icon `<svg>` sprites, Contact Form 7 markup and hundreds of
 * `elementor-*` classes that reference a stylesheet this site does not ship.
 *
 * `sanitizeContentHtml` reduces that to plain semantic prose we can style with
 * the `.page-content` rules in `globals.css`:
 *
 *   1. every HTML comment is dropped (this covers the `<!-- wp:... -->` pairs);
 *   2. tags in DROP_WITH_CONTENT are removed together with their contents —
 *      `<script>` above all, plus styles, iframes, media embeds, inline SVG
 *      icons and any `<form>`;
 *   3. remaining tags are filtered against an allowlist. A tag that is not
 *      allowed is unwrapped (its text survives, the element does not);
 *   4. attributes are filtered per tag. `class`, `id`, `style`, `data-*` and
 *      every `on*` handler are dropped, so nothing can carry script or depend
 *      on WordPress CSS. `href`/`src` values are restricted to http(s), mailto,
 *      tel, fragments and site-relative paths.
 *
 * The result is inserted with `dangerouslySetInnerHTML`; step 2 and step 4 are
 * what make that safe for this content. It is a display-oriented cleaner for
 * first-party migrated copy, not a general-purpose sanitiser for user input.
 */

/** Removed along with everything between the open and close tag. */
const DROP_WITH_CONTENT = [
  "script",
  "style",
  "noscript",
  "iframe",
  "object",
  "embed",
  "svg",
  "form",
  "select",
  "textarea",
  "button",
  "canvas",
  "video",
  "audio",
  "map",
  "template",
] as const;

/** Void elements that are simply deleted. */
const DROP_VOID = ["input", "source", "track", "link", "meta", "param", "col"] as const;

/** Tags kept in the output. Anything else is unwrapped. */
const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "div", "span", "section", "article", "aside", "header", "footer", "main",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "small", "sup", "sub", "mark", "abbr", "cite", "q",
  "ul", "ol", "li", "dl", "dt", "dd",
  "a", "img", "figure", "figcaption", "picture",
  "blockquote", "pre", "code", "kbd", "samp", "var",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup",
]);

/** Attributes kept, per tag. Every other attribute is dropped. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "width", "height"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  td: new Set(["colspan", "rowspan"]),
  blockquote: new Set(["cite"]),
  q: new Set(["cite"]),
};

const SAFE_URL = /^(https?:|mailto:|tel:|#|\/(?!\/))/i;

const VOID_TAGS = new Set(["br", "hr", "img", "wbr"]);

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function filterAttributes(tag: string, raw: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return "";
  const out: string[] = [];
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(raw))) {
    const name = m[1].toLowerCase();
    if (!allowed.has(name)) continue;
    const value = (m[2] ?? m[3] ?? m[4] ?? "").trim();
    if ((name === "href" || name === "src" || name === "cite") && !SAFE_URL.test(value)) continue;
    out.push(`${name}="${escapeAttr(value)}"`);
  }
  return out.length ? ` ${out.join(" ")}` : "";
}

function dropElements(html: string): string {
  let out = html;
  for (const tag of DROP_WITH_CONTENT) {
    // Paired form first, then any orphan open tag left behind by bad markup.
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    out = out.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "");
  }
  for (const tag of DROP_VOID) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>`, "gi"), "");
  }
  return out;
}

const LEGACY_FOOTER_LOGO = /<img\b[^>]*Prosporter-Logo_Colour[^>]*>/gi;
const LEGACY_FOOTER_COPYRIGHT = /(?:©|&copy;|&#0*169;)\s*Copyright\s*\d{4}/gi;

/**
 * Most migrated pages (policies, About, FAQ, Contact) end with a copy of the
 * old WordPress site footer, built in Elementor: logo, site URL, policy and
 * page links, phone, email and "© Copyright 2024". The storefront has its own
 * footer, so everything from that logo onwards is dropped. Both markers must
 * be present, logo before copyright, so a page that merely shows the logo keeps
 * it. Cutting mid-tree leaves wrapper `<div>`s open; the HTML parser closes them.
 */
function stripLegacyFooter(html: string): string {
  const copyrights = [...html.matchAll(LEGACY_FOOTER_COPYRIGHT)];
  if (!copyrights.length) return html;
  const lastCopyright = copyrights[copyrights.length - 1].index;
  const logos = [...html.matchAll(LEGACY_FOOTER_LOGO)].filter((m) => m.index < lastCopyright);
  if (!logos.length) return html;
  return html.slice(0, logos[logos.length - 1].index);
}

function normaliseTitle(text: string): string {
  return text.replace(/<[^>]*>/g, "").replace(/&[a-z#0-9]+;/gi, " ").replace(/[^a-z0-9]+/gi, "").toLowerCase();
}

/**
 * A theme slider exported as a list of images (`<ul class="slides">`). On About
 * it is the Nine logo repeated eight times, which renders as a bulleted column
 * of identical images. A list made only of copies of one image is collapsed to
 * a single centred image (`.logo-strip` in `globals.css`); a list of different
 * images stays a list.
 */
function collapseRepeatedImageLists(html: string): string {
  return html.replace(/<ul>((?:\s*<li>\s*<img\b[^>]*\/>\s*<\/li>)+)\s*<\/ul>/g, (list, items: string) => {
    const srcs = new Set([...items.matchAll(/src="([^"]*)"/g)].map((m) => m[1]));
    if (srcs.size !== 1) return list;
    const img = /<img\b[^>]*\/>/.exec(items)![0];
    return `<figure class="logo-strip">${img}</figure>`;
  });
}

/**
 * The old theme set intro copy in heading tags for the large type ("Welcome to
 * our website, your one-stop destination..." as an `<h2>`). Headings that long
 * are sentences, not section titles, so they become lead paragraphs; the
 * `.lead` rule in `globals.css` keeps them large without the section divider.
 */
const SENTENCE_HEADING_WORDS = 12;

function demoteSentenceHeadings(html: string): string {
  return html.replace(/<(h[1-6])>([\s\S]*?)<\/\1>/g, (heading, _tag: string, inner: string) => {
    const text = inner.replace(/<[^>]*>/g, " ").trim();
    // FAQ questions are long but are genuine headings.
    if (text.endsWith("?")) return heading;
    const words = text.split(/\s+/).filter(Boolean);
    return words.length >= SENTENCE_HEADING_WORDS ? `<p class="lead">${inner.trim()}</p>` : heading;
  });
}

/**
 * Migrated pages open with their own title (`<h1>Refund Policy</h1>` on the
 * Elementor pages, `<h2>ABOUT</h2>` on About), which the route already renders
 * from the page title. Drop it when it is the first element and says the same
 * thing, so the page does not show its title twice.
 */
export function dropLeadingTitle(html: string, title: string): string {
  // Opening builder wrappers may precede it; they stay, the heading goes.
  const m = /^((?:\s*<(?:div|section|article|header|main)>)*)\s*<(h[12])>([\s\S]*?)<\/\2>/.exec(html);
  if (!m || normaliseTitle(m[3]) !== normaliseTitle(title)) return html;
  return m[1] + html.slice(m[0].length);
}

export function sanitizeContentHtml(html: string | null | undefined): string {
  if (!html) return "";

  // 0. The legacy site footer copied into most page bodies (see above).
  // 1. HTML comments, including the `<!-- wp:... -->` / `<!-- /wp:... -->` pairs
  //    and any conditional comment. Also drops doctype/CDATA style declarations.
  let out = stripLegacyFooter(html).replace(/<!--[\s\S]*?-->/g, "").replace(/<![\s\S]*?>/g, "");

  // 2. Scripts, styles, embeds, icon SVGs and forms, contents included.
  //
  //    The migrated Contact page carries a Contact Form 7 block (`<form>` plus
  //    inputs and a loader script) whose action posts to a WordPress endpoint
  //    that no longer exists. It stays stripped: the replacement is a real
  //    React form, `src/components/content/ContactSection.tsx`, which the
  //    `/contact` route renders after this sanitised copy. Any other `<form>`
  //    in migrated content is dead markup and is removed for the same reason.
  //    `docs/forms.md` records the disposition of all three legacy forms.
  out = dropElements(out);

  // 3 + 4. Allowlist tags, allowlist attributes.
  out = out.replace(TAG_RE, (match, rawName: string, rawAttrs: string) => {
    const tag = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    const closing = match.startsWith("</");
    if (closing) return VOID_TAGS.has(tag) ? "" : `</${tag}>`;
    const attrs = filterAttributes(tag, rawAttrs);
    return VOID_TAGS.has(tag) ? `<${tag}${attrs} />` : `<${tag}${attrs}>`;
  });

  // Trailing `<br /><br />` was the editor's paragraph spacing; CSS does that now.
  out = out.replace(/(?:\s*<br \/>)+\s*<\/(p|h[1-6])>/g, "</$1>");
  // Paragraphs holding only a non-breaking space were spacers too.
  out = out.replace(/<p>(?:\s|&nbsp;| )*<\/p>/g, "");
  out = collapseRepeatedImageLists(out);
  out = demoteSentenceHeadings(out);

  // Collapse the whitespace the page builder left between nested wrappers.
  return out.replace(/[ \t]*\n[ \t\n]*/g, "\n").trim();
}

/** Plain text from HTML, for metadata descriptions and excerpts. */
export function htmlToText(html: string | null | undefined, limit = 300): string {
  if (!html) return "";
  const text = dropElements(html.replace(/<!--[\s\S]*?-->/g, ""))
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#8217;|&rsquo;/gi, "’")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}
