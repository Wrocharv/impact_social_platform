import { describe, expect, it } from "vitest";
import { getSessionCookieOptions } from "./cookies";

describe("getSessionCookieOptions", () => {
  it("uses lax cookies for localhost development", () => {
    const req = {
      protocol: "http",
      hostname: "localhost",
      headers: {},
    } as any;

    const options = getSessionCookieOptions(req);

    expect(options.sameSite).toBe("lax");
    // Localhost HTTP connections must NOT use Secure so the browser stores the
    // cookie. The Secure flag is only set for actual HTTPS connections.
    expect(options.secure).toBe(false);
  });
});
