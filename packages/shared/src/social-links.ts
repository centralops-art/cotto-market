// Kitchen social media links (HANDOFF.md §48). Stored on vendors.social_links
// as { platform: canonical https URL }. These are public, tappable links typed
// in by vendors, so only a profile path on the platform's own domain is ever
// accepted. The same patterns are enforced by a check constraint (0070); keep
// the two in step. Plain regexes rather than URL(), which React Native only
// partly implements.

export const SOCIAL_PLATFORMS = ["instagram", "facebook", "tiktok", "youtube", "x"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type SocialLinks = Partial<Record<SocialPlatform, string>>;

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
};

interface PlatformRule {
  /** Canonical prefix every stored link starts with. */
  base: string;
  /** Domains accepted in pasted links (www./m./mobile. are stripped first). */
  hosts: string[];
  /** The profile path, matched in full. */
  path: RegExp;
  /** Put in front of a bare username, e.g. "@" for TikTok. */
  handlePrefix: string;
}

const RULES: Record<SocialPlatform, PlatformRule> = {
  instagram: {
    base: "https://www.instagram.com/",
    hosts: ["instagram.com"],
    path: /^[A-Za-z0-9._]{1,30}$/,
    handlePrefix: "",
  },
  facebook: {
    base: "https://www.facebook.com/",
    hosts: ["facebook.com", "fb.com"],
    path: /^(profile\.php\?id=[0-9]{1,20}|people\/[A-Za-z0-9._%-]{1,80}\/[0-9]{1,20}|(p|share|groups)\/[A-Za-z0-9._%-]{1,80}|[A-Za-z0-9.-]{1,60})$/,
    handlePrefix: "",
  },
  tiktok: {
    base: "https://www.tiktok.com/",
    hosts: ["tiktok.com"],
    path: /^@[A-Za-z0-9._]{1,24}$/,
    handlePrefix: "@",
  },
  youtube: {
    base: "https://www.youtube.com/",
    hosts: ["youtube.com"],
    path: /^(@[A-Za-z0-9._%-]{1,100}|(channel|c|user)\/[A-Za-z0-9._%-]{1,100})$/,
    handlePrefix: "@",
  },
  x: {
    base: "https://x.com/",
    hosts: ["x.com", "twitter.com"],
    path: /^[A-Za-z0-9_]{1,15}$/,
    handlePrefix: "",
  },
};

function isCanonical(platform: SocialPlatform, url: string): boolean {
  const { base, path } = RULES[platform];
  return url.startsWith(base) && path.test(url.slice(base.length));
}

/** Turns what a vendor typed (a username, @username, or profile link) into the
 * canonical link, or null if it isn't a profile on that platform. */
export function normalizeSocialLink(platform: SocialPlatform, input: string): string | null {
  const { base, hosts, path, handlePrefix } = RULES[platform];
  const raw = input.trim();
  if (!raw) return null;

  const hadScheme = /^https?:\/\//i.test(raw);
  const rest = raw.replace(/^https?:\/\//i, "").replace(/^(www|m|mobile)\./i, "");
  const slash = rest.indexOf("/");
  const host = (slash === -1 ? rest : rest.slice(0, slash)).toLowerCase();

  let candidate: string;
  if (hosts.includes(host)) {
    const full = slash === -1 ? "" : rest.slice(slash + 1);
    // Facebook's numeric profiles live in the query string; every other query
    // string or fragment is tracking and is dropped.
    const fbProfile = platform === "facebook" ? full.match(/^profile\.php\?(?:[^#]*&)?id=([0-9]+)/) : null;
    candidate = fbProfile ? `profile.php?id=${fbProfile[1]}` : full.replace(/[?#].*$/, "").replace(/\/+$/, "");
  } else {
    if (hadScheme || slash !== -1) return null; // a link to somewhere else
    candidate = handlePrefix + raw.replace(/^@/, "");
  }
  return path.test(candidate) ? base + candidate : null;
}

/** Reads the stored column, keeping only links that pass the rules. */
export function parseSocialLinks(value: unknown): SocialLinks {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const links: SocialLinks = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const url = (value as Record<string, unknown>)[platform];
    if (typeof url === "string" && isCanonical(platform, url)) links[platform] = url;
  }
  return links;
}

/** Normalizes the whole editor form: blank fields are left out (which removes
 * the link), bad ones are reported per platform. */
export function normalizeSocialLinks(inputs: Partial<Record<SocialPlatform, string>>): {
  links: SocialLinks;
  errors: Partial<Record<SocialPlatform, string>>;
} {
  const links: SocialLinks = {};
  const errors: Partial<Record<SocialPlatform, string>> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const input = inputs[platform]?.trim();
    if (!input) continue;
    const url = normalizeSocialLink(platform, input);
    if (url) links[platform] = url;
    else errors[platform] = `Enter your ${SOCIAL_PLATFORM_LABELS[platform]} username or profile link.`;
  }
  return { links, errors };
}
