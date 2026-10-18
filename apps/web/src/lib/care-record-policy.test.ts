import { describe, expect, it } from "bun:test";
import { readableCareRecordTypes } from "./care-record-policy";

describe("care-record read access", () => {
  it("limits recall to record categories granted to the current member", () => {
    expect(readableCareRecordTypes(["memories:read", "medications:read"])).toEqual(["medication", "care_cost"]);
    expect(readableCareRecordTypes(["memories:read"])).toEqual(["care_cost"]);
    expect(readableCareRecordTypes([])).toEqual([]);
  });
});
