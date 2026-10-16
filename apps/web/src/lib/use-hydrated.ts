"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const client = () => true;
const server = () => false;

/** Don't let a JS-only preview form submit names/emails as a native GET before hydration. */
export function useHydrated() {
  return useSyncExternalStore(subscribe, client, server);
}
