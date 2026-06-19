import { describe, expect, it } from "vitest";
import { buildExportOptions } from "../utils/exportOptions";

const labels = {
  export_assets: "Assets",
  export_transactions: "Investments",
  export_cashflow: "Cash Flow",
};

const T = (key) => labels[key] || key;

function optionsFor(enabled) {
  return buildExportOptions({
    T,
    isFeatureEnabled: (feature) => enabled.includes(feature),
  });
}

describe("buildExportOptions", () => {
  it("maps Investments to asset transactions, not asset rows", () => {
    const options = optionsFor(["investments"]);

    expect(options).toEqual([
      { type: "transactions", label: "Investments" },
      { type: "assets", label: "Assets" },
    ]);
  });

  it("adds cashflow export only when the feature is enabled", () => {
    const options = optionsFor(["investments", "cashflow"]);

    expect(options.map((option) => option.type)).toEqual([
      "transactions",
      "assets",
      "cashflow",
    ]);
  });
});
