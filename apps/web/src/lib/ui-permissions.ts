import type { Capability } from "@hale/contracts";

export function hasSpaceCapability(capabilities: readonly Capability[], required: Capability) {
  return capabilities.includes(required);
}

export function canCreateCareRecord(capabilities: readonly Capability[], create: Capability, read?: Capability) {
  return hasSpaceCapability(capabilities, create) && (read === undefined || hasSpaceCapability(capabilities, read));
}
