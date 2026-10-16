import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PatientSwitcher } from "../components/patient-switcher";
import type { PatientInfo } from "./api";

const margaret: PatientInfo = { id: "margaret", name: "Margaret Okafor", timezone: "UTC", capabilities: ["memories:read"] };
const other: PatientInfo = { ...margaret, id: "another", name: "Another Fictional Person" };

describe("patient-space header", () => {
  test("a single authorized patient is a static, clearly labeled identity", () => {
    const html = renderToStaticMarkup(<PatientSwitcher patient={margaret} patients={[margaret]} onSelect={() => {}} />);
    expect(html).toContain("Patient space");
    expect(html).toContain("Margaret Okafor");
    expect(html).not.toContain("<select");
  });
  test("multiple authorized patients get a labeled, styled native switcher", () => {
    const html = renderToStaticMarkup(<PatientSwitcher patient={margaret} patients={[margaret, other]} onSelect={() => {}} />);
    expect(html).toContain('aria-label="Switch patient space"');
    expect(html).toContain("patient-select-control");
    expect(html).toContain('<option value="margaret" selected="">');
    expect(html).toContain('<option value="another">');
    expect(html).not.toContain("Not Authorized");
  });
});
