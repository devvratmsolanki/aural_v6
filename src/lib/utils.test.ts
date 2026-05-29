import { describe, it, expect } from "vitest";
import { cn, escapeLikePattern, uuidList, UUID_RE } from "./utils";

describe("cn", () => {
  it("merges class names and dedupes conflicting tailwind classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", "font-bold")).toBe("text-sm font-bold");
  });

  it("drops falsy conditional classes", () => {
    const hidden: string | false = false;
    expect(cn("text-sm", hidden, "font-bold")).toBe("text-sm font-bold");
  });
});

describe("escapeLikePattern", () => {
  it("passes through a plain term unchanged", () => {
    expect(escapeLikePattern("hello")).toBe("hello");
  });

  it("escapes SQL LIKE wildcards % and _", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
  });

  it("escapes the PostgREST .or() comma separator", () => {
    // Unescaped, this comma would split the .or() filter and corrupt the query.
    expect(escapeLikePattern("foo,bar")).toBe("foo\\,bar");
  });

  it("escapes all special characters together", () => {
    expect(escapeLikePattern("a,b%c_d")).toBe("a\\,b\\%c\\_d");
  });
});

describe("uuidList", () => {
  const A = "11111111-1111-1111-1111-111111111111";
  const B = "abcdefab-cdef-abcd-efab-cdefabcdefab";

  it("keeps only UUID-shaped strings", () => {
    expect(uuidList([A, B])).toEqual([A, B]);
  });

  it("drops anything that isn't a UUID (injection guard)", () => {
    expect(uuidList([A, "not-a-uuid", "1); drop table songs;--", ""])).toEqual([A]);
  });

  it("returns empty for an empty input", () => {
    expect(uuidList([])).toEqual([]);
  });

  it("UUID_RE rejects a value containing filter-breaking characters", () => {
    expect(UUID_RE.test(`${A})`)).toBe(false);
    expect(UUID_RE.test(`${A},${B}`)).toBe(false);
  });
});
