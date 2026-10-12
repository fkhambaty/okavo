/**
 * One definition of every public page's metadata.
 *
 * Used twice: by the browser at runtime (so titles change as you navigate)
 * and by scripts/prerender.mjs at build time (so crawlers and link previews,
 * which do not run JavaScript, see the right thing).
 */

export const SITE_URL = "https://okavo.org";
export const SITE_NAME = "Okavo";
export const OG_IMAGE = `${SITE_URL}/og.png`;

/** Bing / Yandex / Seznam IndexNow key — file lives at /{INDEXNOW_KEY}.txt */
export const INDEXNOW_KEY = "d63dffffc4ddf51606382a427e421457";

export type PageSeo = {
  path: string;
  title: string;
  description: string;
  /** Included in sitemap.xml; omit for pages we do not want indexed. */
  indexed: boolean;
  priority?: number;
  /** Visible H1 for non-JS crawlers (prerender shell). */
  h1: string;
  /** Short paragraphs for the prerendered HTML body. */
  body: string[];
};

export const PAGES: PageSeo[] = [
  {
    path: "/",
    title: "Okavo — Agree what you'll get before anyone writes code",
    description:
      "Describe what you need in plain language. Okavo turns it into a signed agreement, then identity-verified developers bid on that exact scope and you pay milestone by milestone.",
    indexed: true,
    priority: 1,
    h1: "Where the world comes to have software built",
    body: [
      "Okavo is a software marketplace at okavo.org. Buyers describe a website, app, or system in plain language. Okavo turns that into a signed Requirement Lock. Identity-verified developers then bid on that exact scope.",
      "You settle work milestone by milestone against the locked definition of done. Okavo is not an agency. Posting costs $1 per requirement; developers browse free and pay a one-time $11 membership before their first bid.",
    ],
  },
  {
    path: "/how-it-works",
    title: "How Okavo works — from a description to delivered software",
    description:
      "Six steps: describe the outcome, check the scope, sign the lock, compare bids priced against identical scope, fund one milestone at a time, and own the result.",
    indexed: true,
    priority: 0.9,
    h1: "How Okavo works",
    body: [
      "Describe the outcome in plain language, review the implied screens and scope, freeze the Requirement Lock, compare bids on identical scope, settle milestones as you accept work, and own the delivered code.",
    ],
  },
  {
    path: "/example",
    title: "Okavo example — Rose Street Bakery presentation walkthrough",
    description:
      "Tom the baker and Arjun the developer: sample screens, Q&A, freeze, funding gate, and delivery — the same layout as the Okavo pitch deck.",
    indexed: true,
    priority: 0.85,
    h1: "An Okavo walkthrough: Rose Street Bakery",
    body: [
      "A concrete story of Tom (buyer) and Arjun (developer): sample screens from a plain-language description, clarifying Q&A, freezing the lock, the funding gate, and delivery against signed scope.",
    ],
  },
  {
    path: "/guarantee",
    title: "The Okavo guarantee — six promises, and how each is enforced",
    description:
      "Nothing is built until you sign what it means. You pay milestone by milestone as you accept the work. Changes are quoted, never assumed. Every developer is identity-verified.",
    indexed: true,
    priority: 0.9,
    h1: "The Okavo guarantee",
    body: [
      "Six promises with enforcement: signed scope before build, milestone payments, quoted change orders, identity-verified developers, comparable bids on one lock, and a warranty after accept.",
    ],
  },
  {
    path: "/security",
    title: "Security and data handling at Okavo",
    description:
      "How Okavo protects your money, your documents and your data: payments handled by Razorpay, private identity files, and signed-in access checks.",
    indexed: true,
    priority: 0.7,
    h1: "Security and data handling",
    body: [
      "Payments are handled by Razorpay (Okavo never sees card details). The API checks the signed-in account on every request. Identity documents sit in private storage. You can require data residency in the locked scope.",
    ],
  },
  {
    path: "/faq",
    title: "Okavo FAQ — costs, payment, code ownership and vetting",
    description:
      "What it costs, who owns the code, how developers are vetted, what happens if a developer disappears, and how new Okavo really is. Answered plainly.",
    indexed: true,
    priority: 0.8,
    h1: "Okavo FAQ",
    body: [
      "Plain answers on cost, why posting is paid, what happens if you dislike a milestone, developer disappearance, code ownership, vetting, and how new Okavo is (launched 2026).",
    ],
  },
  {
    path: "/about",
    title: "About Okavo — closing the gap between what was meant and built",
    description:
      "Okavo exists because software goes wrong in the gap between what the buyer pictured and what the developer heard. We make the expectation a signed document.",
    indexed: true,
    priority: 0.6,
    h1: "About Okavo",
    body: [
      "Okavo closes the gap between what a buyer meant and what a developer heard by making the expectation a signed Requirement Lock before anyone builds.",
    ],
  },
  {
    path: "/terms",
    title: "Okavo Terms of Use",
    description:
      "Marketplace intermediary terms: milestone payments, no full prepay culture, limitation of liability, and how Okavo relates to buyers and developers.",
    indexed: true,
    priority: 0.4,
    h1: "Okavo Terms of Use",
    body: [
      "Okavo is a marketplace intermediary. Build money is paid between buyer and developer unless escrow is explicitly live.",
    ],
  },
  {
    path: "/privacy",
    title: "Okavo Privacy",
    description:
      "How Okavo handles account data, identity documents, and Razorpay payment metadata.",
    indexed: true,
    priority: 0.3,
    h1: "Privacy",
    body: [
      "Okavo collects what the marketplace needs and does not sell personal data.",
    ],
  },
  {
    path: "/signin",
    title: "Sign in to Okavo",
    description:
      "Sign in to post a requirement or bid on locked scope. Buyers pay $1 per requirement; developers pay a one-time $11 membership.",
    indexed: false,
    h1: "Sign in to Okavo",
    body: [
      "Sign in to post a requirement or bid on locked scope.",
    ],
  },
];

export function seoFor(pathname: string): PageSeo {
  return (
    PAGES.find((page) => page.path === pathname) ?? {
      path: pathname,
      title: `${SITE_NAME} — Where the world comes to have software built`,
      description: PAGES[0].description,
      indexed: false,
      h1: SITE_NAME,
      body: [PAGES[0].description],
    }
  );
}

function setMeta(selector: string, attribute: string, value: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement("meta");
    const [key, val] = selector.replace(/^meta\[|\]$/g, "").split("=");
    tag.setAttribute(key, val.replace(/["']/g, ""));
    document.head.appendChild(tag);
  }
  tag.setAttribute(attribute, value);
}

/** Keeps the tab title and share tags in step with client-side navigation. */
export function applySeo(pathname: string) {
  if (typeof document === "undefined") return;
  const page = seoFor(pathname);
  // Must match the prerendered canonical and the sitemap exactly, or Google
  // reports the submitted URL as "not canonical".
  const url = pathname === "/" ? `${SITE_URL}/` : `${SITE_URL}${pathname}`;

  document.title = page.title;
  setMeta('meta[name="description"]', "content", page.description);
  setMeta('meta[property="og:title"]', "content", page.title);
  setMeta('meta[property="og:description"]', "content", page.description);
  setMeta('meta[property="og:url"]', "content", url);
  setMeta('meta[name="twitter:title"]', "content", page.title);
  setMeta('meta[name="twitter:description"]', "content", page.description);

  let canonical = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]'
  );
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = url;

  let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!robots) {
    robots = document.createElement("meta");
    robots.name = "robots";
    document.head.appendChild(robots);
  }
  robots.content = page.indexed ? "index,follow" : "noindex,follow";
}
