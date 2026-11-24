import { describe, expect, it } from "vitest";
import { normalizeSocialLink, normalizeSocialLinks, parseSocialLinks } from "./social-links";

describe("normalizeSocialLink", () => {
  it.each([
    ["instagram", "joes.bakery", "https://www.instagram.com/joes.bakery"],
    ["instagram", " @joes_bakery ", "https://www.instagram.com/joes_bakery"],
    ["instagram", "https://instagram.com/joes_bakery/?igsh=abc", "https://www.instagram.com/joes_bakery"],
    ["instagram", "http://www.Instagram.com/joes_bakery", "https://www.instagram.com/joes_bakery"],
    ["facebook", "JoesBakery", "https://www.facebook.com/JoesBakery"],
    ["facebook", "https://m.facebook.com/profile.php?ref=x&id=10001", "https://www.facebook.com/profile.php?id=10001"],
    ["facebook", "facebook.com/people/Joes-Bakery/10001/", "https://www.facebook.com/people/Joes-Bakery/10001"],
    ["facebook", "https://www.facebook.com/share/1AbC/?mibextid=x", "https://www.facebook.com/share/1AbC"],
    ["tiktok", "joesbakery", "https://www.tiktok.com/@joesbakery"],
    ["tiktok", "https://www.tiktok.com/@joesbakery?lang=en", "https://www.tiktok.com/@joesbakery"],
    ["youtube", "@joes-bakery", "https://www.youtube.com/@joes-bakery"],
    ["youtube", "youtube.com/channel/UC_abc-123", "https://www.youtube.com/channel/UC_abc-123"],
    ["x", "https://twitter.com/joesbakery", "https://x.com/joesbakery"],
  ] as const)("%s: %s", (platform, input, expected) => {
    expect(normalizeSocialLink(platform, input)).toBe(expected);
    // Saving a saved link again changes nothing.
    expect(normalizeSocialLink(platform, expected)).toBe(expected);
  });

  it.each([
    ["instagram", ""],
    ["instagram", "https://evil.com/joes"],
    ["instagram", "https://instagram.com.evil.com/joes"],
    ["instagram", "https://instagram.com@evil.com/joes"],
    ["instagram", "javascript:alert(1)"],
    ["instagram", "https://www.instagram.com/"],
    ["instagram", "joes bakery"],
    ["facebook", "https://l.facebook.com/l.php?u=https://evil.com"],
    ["facebook", "https://www.instagram.com/joes"],
    ["tiktok", "https://vm.tiktok.com/ZM123"],
    ["youtube", "https://www.youtube.com/redirect?q=https://evil.com"],
    ["youtube", "https://youtu.be/abc"],
    ["x", "https://x.com/joes/status/1"],
  ] as const)("rejects %s: %s", (platform, input) => {
    expect(normalizeSocialLink(platform, input)).toBeNull();
  });
});

describe("parseSocialLinks", () => {
  it("drops unknown platforms, wrong domains and non-strings", () => {
    expect(
      parseSocialLinks({
        instagram: "https://www.instagram.com/joes",
        facebook: "https://evil.com/joes",
        tiktok: 5,
        myspace: "https://myspace.com/joes",
        x: "https://x.com/joes\nhttps://evil.com",
      })
    ).toEqual({ instagram: "https://www.instagram.com/joes" });
  });

  it.each([null, undefined, "x", [], 3])("treats %s as no links", (value) => {
    expect(parseSocialLinks(value)).toEqual({});
  });
});

describe("normalizeSocialLinks", () => {
  it("skips blanks and reports bad fields", () => {
    expect(normalizeSocialLinks({ instagram: "joes", facebook: "  ", tiktok: "https://evil.com/x" })).toEqual({
      links: { instagram: "https://www.instagram.com/joes" },
      errors: { tiktok: "Enter your TikTok username or profile link." },
    });
  });
});
