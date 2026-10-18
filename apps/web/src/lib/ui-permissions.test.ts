import { describe, expect, it } from "bun:test";
import { canCreateCareRecord, hasSpaceCapability } from "./ui-permissions";
import type { Capability } from "@hale/contracts";

const caps = (...values: Capability[]) => values;

describe("UI permission gates", () => {
  it("keeps recording and evidence deletion behind their existing capabilities", () => {
    expect(hasSpaceCapability(caps(), "recordings:create")).toBe(false);
    expect(hasSpaceCapability(caps("recordings:create"), "recordings:create")).toBe(true);
    expect(hasSpaceCapability(caps("recordings:create"), "evidence:delete")).toBe(false);
  });

  it("keeps family invitations behind sharing management", () => {
    expect(hasSpaceCapability(caps("memories:read"), "sharing:manage")).toBe(false);
    expect(hasSpaceCapability(caps("sharing:manage"), "sharing:manage")).toBe(true);
  });

  it("requires both medication read and record permission to create a medication record", () => {
    expect(canCreateCareRecord(caps("medications:record"), "medications:record", "medications:read")).toBe(false);
    expect(canCreateCareRecord(caps("medications:read"), "medications:record", "medications:read")).toBe(false);
    expect(canCreateCareRecord(caps("medications:read", "medications:record"), "medications:record", "medications:read")).toBe(true);
  });
});
