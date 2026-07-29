import { describe, expect, it } from "vitest";
import { isAdminUser } from "./adminAccess";

describe("isAdminUser", () => {
  it("treats an email-based admin as an administrator", () => {
    expect(
      isAdminUser(
        { role: "user", email: "gospeltv@gmail.com" },
        ["gospeltv@gmail.com"]
      )
    ).toBe(true);
  });

  it("keeps non-admin users blocked", () => {
    expect(isAdminUser({ role: "user", email: "visitor@example.com" }, ["gospeltv@gmail.com"])).toBe(false);
  });
});
