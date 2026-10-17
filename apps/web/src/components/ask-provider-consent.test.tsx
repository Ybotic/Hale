import { afterEach, describe, expect, it, mock } from "bun:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost", pretendToBeVisual: true });
Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
Object.defineProperty(globalThis, "HTMLElement", { value: dom.window.HTMLElement, configurable: true });
Object.defineProperty(globalThis, "HTMLFormElement", { value: dom.window.HTMLFormElement, configurable: true });
Object.defineProperty(globalThis, "Node", { value: dom.window.Node, configurable: true });
Object.defineProperty(globalThis, "MouseEvent", { value: dom.window.MouseEvent, configurable: true });
Object.defineProperty(globalThis, "getComputedStyle", { value: dom.window.getComputedStyle.bind(dom.window), configurable: true });
Object.defineProperty(globalThis, "MutationObserver", { value: dom.window.MutationObserver, configurable: true });
Object.defineProperty(globalThis, "Element", { value: dom.window.Element, configurable: true });
Object.defineProperty(globalThis, "Document", { value: dom.window.Document, configurable: true });
Object.defineProperty(globalThis, "requestAnimationFrame", { value: dom.window.requestAnimationFrame.bind(dom.window), configurable: true });
Object.defineProperty(globalThis, "cancelAnimationFrame", { value: dom.window.cancelAnimationFrame.bind(dom.window), configurable: true });
Object.defineProperty(globalThis, "ResizeObserver", { value: class { observe() {} unobserve() {} disconnect() {} }, configurable: true });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true, writable: true });

const { cleanup, fireEvent, render, screen } = await import("@testing-library/react");
const { AskProviderConsent } = await import("./ask-provider-consent");
const { FamilyInvitations } = await import("./family-invitations");
const { Checkbox } = await import("./ui/checkbox");
const { Switch } = await import("./ui/switch");

afterEach(() => cleanup());

describe("AskProviderConsent", () => {
  it("starts unchecked and reports opt-in without sending a message", () => {
    const onChange = mock(() => {});
    render(<AskProviderConsent checked={false} onChange={onChange} />);
    const checkbox = screen.getByRole("checkbox", { name: /use the openrouter free model/i });
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
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

describe("Radix form control serialization", () => {
  it("keeps checked consent and reminder controls in FormData", () => {
    const { container } = render(<form aria-label="care preferences"><Checkbox name="consent" defaultChecked /><Switch name="remindersEnabled" defaultChecked /></form>);
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    const data = new dom.window.FormData(form as HTMLFormElement);
    expect(data.get("consent")).toBe("on");
    expect(data.get("remindersEnabled")).toBe("on");
  });

  it("omits unchecked controls from FormData", () => {
    const { container } = render(<form aria-label="care preferences"><Checkbox name="consent" /><Switch name="remindersEnabled" /></form>);
    const data = new dom.window.FormData(container.querySelector("form") as HTMLFormElement);
    expect(data.get("consent")).toBeNull();
    expect(data.get("remindersEnabled")).toBeNull();
  });
});
