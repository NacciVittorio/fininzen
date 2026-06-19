import { describe, it, expect } from "vitest";

/**
 * Replica della logica spentMap in DashboardView budget_progress.
 * Rollup: le spese di una sottocategoria vengono sommate anche al padre,
 * identico al widget in ExpensesView (Cash Flow).
 */
function buildSpentMap(byCategory, categories) {
  const catMap = {};
  for (const c of categories || []) {
    catMap[c.id] = c;
  }
  const spentMap = {};
  for (const c of byCategory || []) {
    const amount = parseFloat(c.total || 0);
    spentMap[c.category__id] = (spentMap[c.category__id] || 0) + amount;
    const cat = catMap[c.category__id];
    if (cat?.parent)
      spentMap[cat.parent] = (spentMap[cat.parent] || 0) + amount;
  }
  return spentMap;
}

describe("Budget Progress — buildSpentMap rollup (DashboardView)", () => {
  it("conteggia la spesa diretta sulla categoria del budget", () => {
    const byCategory = [{ category__id: 1, total: "50.00" }];
    const categories = [{ id: 1, parent: null }];
    expect(buildSpentMap(byCategory, categories)[1]).toBe(50);
  });

  it("somma la spesa della sottocategoria al padre", () => {
    // Budget su "Cibo" (id 1), spesa su "Ristoranti" (id 2, parent 1)
    const byCategory = [{ category__id: 2, total: "30.00" }];
    const categories = [
      { id: 1, parent: null },
      { id: 2, parent: 1 },
    ];
    const spentMap = buildSpentMap(byCategory, categories);
    expect(spentMap[2]).toBe(30); // sottocategoria stessa
    expect(spentMap[1]).toBe(30); // rollup al padre
  });

  it("accumula più sottocategorie nello stesso padre", () => {
    const byCategory = [
      { category__id: 2, total: "20.00" },
      { category__id: 3, total: "15.00" },
    ];
    const categories = [
      { id: 1, parent: null },
      { id: 2, parent: 1 },
      { id: 3, parent: 1 },
    ];
    expect(buildSpentMap(byCategory, categories)[1]).toBe(35);
  });

  it("somma spesa diretta sul padre + rollup delle sottocategorie", () => {
    // Budget su "Cibo": 10€ spesi direttamente + 25€ in "Ristoranti"
    const byCategory = [
      { category__id: 1, total: "10.00" },
      { category__id: 2, total: "25.00" },
    ];
    const categories = [
      { id: 1, parent: null },
      { id: 2, parent: 1 },
    ];
    expect(buildSpentMap(byCategory, categories)[1]).toBe(35);
  });

  it("restituisce undefined per una categoria senza spese", () => {
    const spentMap = buildSpentMap([], [{ id: 1, parent: null }]);
    expect(spentMap[1]).toBeUndefined();
  });

  it("gestisce by_category vuoto senza errori", () => {
    expect(() => buildSpentMap([], [])).not.toThrow();
  });

  it("gestisce total nullo o mancante come zero", () => {
    const byCategory = [{ category__id: 1, total: null }];
    const categories = [{ id: 1, parent: null }];
    expect(buildSpentMap(byCategory, categories)[1]).toBe(0);
  });
});
