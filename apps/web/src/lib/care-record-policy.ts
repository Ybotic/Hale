import type { CareRecordType } from "@hale/contracts";

export const CARE_RECORD_READ_CAPABILITY: Record<CareRecordType, string> = {
  ride: "rides:prepare",
  appointment: "appointments:book",
  medication: "medications:read",
  care_cost: "memories:read",
};

export function readableCareRecordTypes(capabilities: readonly string[]): CareRecordType[] {
  return (Object.keys(CARE_RECORD_READ_CAPABILITY) as CareRecordType[])
    .filter((type) => capabilities.includes(CARE_RECORD_READ_CAPABILITY[type]));
}
