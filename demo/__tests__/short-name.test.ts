import { describe, it, expect, afterEach } from "vitest";
import { setKnownNames, shortName, shortNameAmong } from "@/lib/short-name";

afterEach(() => setKnownNames([]));

describe("shortName", () => {
  it("uses the first name when nobody shares it", () => {
    setKnownNames(["Sanjana Jadhav", "Adil Khan"]);
    expect(shortName("Sanjana Jadhav")).toBe("Sanjana");
  });

  it("uses the full name for everyone who shares a first name", () => {
    setKnownNames(["Pushpalata Patil", "Pushpalata", "Adil Khan"]);
    expect(shortName("Pushpalata Patil")).toBe("Pushpalata Patil");
    expect(shortName("Pushpalata")).toBe("Pushpalata");
    expect(shortName("Adil Khan")).toBe("Adil");
  });

  it("matches first names case-insensitively and tidies whitespace", () => {
    setKnownNames(["pushpalata  Patil ", "Pushpalata More"]);
    expect(shortName("pushpalata  Patil ")).toBe("pushpalata Patil");
  });

  it("falls back to first names before the list is loaded", () => {
    expect(shortName("Pushpalata Patil")).toBe("Pushpalata");
  });

  it("pure form agrees with the registry", () => {
    const all = ["Pushpalata Patil", "Pushpalata More", "Kiran Patil"];
    setKnownNames(all);
    for (const n of all) expect(shortNameAmong(n, all)).toBe(shortName(n));
  });
});
