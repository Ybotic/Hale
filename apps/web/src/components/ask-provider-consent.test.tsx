import { afterEach, describe, expect, it, mock } from "bun:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
Object.defineProperty(globalThis, "HTMLElement", { value: dom.window.HTMLElement, configurable: true });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true, writable: true });

const { cleanup, fireEvent, render, screen } = await import("@testing-library/react");
const { AskProviderConsent } = await import("./ask-provider-consent");
const { FamilyInvitations } = await import("./family-invitations");

afterEach(() => cleanup());

describe("AskProviderConsent", () => {
  it("starts unchecked and reports opt-in without sending a message", () => {
    const onChange = mock(() => {});
    render(<AskProviderConsent checked={false} onChange={onChange} />);
    const checkbox = screen.getByRole("checkbox", { name: /use the openrouter free model/i });
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("invitation permission gate", () => {
  it("renders no invitation UI when sharing management is unavailable", () => {
    const { container } = render(<FamilyInvitations patientId="demo-space" enabled={false} />);
    expect(container.childElementCount).toBe(0);
    expect(screen.queryByRole("button", { name: /send invite/i })).toBeNull();
  });
});
