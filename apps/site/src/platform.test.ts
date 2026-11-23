import { describe, expect, it } from "vitest";

import { detectPlatform } from "./platform.ts";

const UA = {
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15",
  linux: "Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0",
  android:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
  chromebook:
    "Mozilla/5.0 (X11; CrOS x86_64 16181.61.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
};

describe("detectPlatform", () => {
  it("reads User-Agent Client Hints first", () => {
    expect(detectPlatform({ platform: "Windows", userAgent: UA.windows })).toBe("windows");
    expect(detectPlatform({ platform: "macOS", userAgent: UA.mac })).toBe("macos");
    expect(detectPlatform({ platform: "Linux", userAgent: UA.linux })).toBe("linux");
  });

  it("falls back to navigator.platform and the user agent", () => {
    expect(detectPlatform({ platform: "Win32", userAgent: UA.windows })).toBe("windows");
    expect(detectPlatform({ platform: "MacIntel", userAgent: UA.mac })).toBe("macos");
    expect(detectPlatform({ platform: "Linux x86_64", userAgent: UA.linux })).toBe("linux");
    expect(detectPlatform({ userAgent: UA.windows })).toBe("windows");
  });

  it("offers nothing on phones, tablets and Chromebooks", () => {
    expect(detectPlatform({ platform: "Linux armv8l", userAgent: UA.android })).toBe("other");
    expect(detectPlatform({ platform: "iPhone", userAgent: UA.iphone })).toBe("other");
    expect(detectPlatform({ platform: "Chrome OS", userAgent: UA.chromebook })).toBe("other");
    // iPadOS gibt sich als Mac aus, verrät sich aber durch Touch.
    expect(detectPlatform({ platform: "MacIntel", userAgent: UA.mac, touchPoints: 5 })).toBe(
      "other",
    );
  });

  it("treats unknown browsers as other", () => {
    expect(detectPlatform({})).toBe("other");
  });
});
