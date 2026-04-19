import { describe, expect, it } from "vitest";
import {
  applyCloseWeekHistory,
  formatEuropeanDate,
  getRepeatedItemSuggestions,
  getSearchSuggestions,
  hasDuplicateItem,
  normalizeItemName,
  parseEuropeanDate,
  toggleInCartStatus,
  toggleOutOfStockStatus,
  type ShoppingItem,
} from "./shopping";

describe("shopping helpers", () => {
  it("normalizes names for duplicate detection", () => {
    expect(normalizeItemName("  Milk ")).toBe("milk");
  });

  it("detects duplicates ignoring case and spaces", () => {
    const items: ShoppingItem[] = [
      {
        id: "1",
        name: "Milk",
        quantity: 1,
        notes: "",
        category: "חלבי ובשרי",
        status: "pending",
      },
    ];
    expect(hasDuplicateItem(items, " milk  ")).toBe(true);
  });

  it("returns search suggestions by prefix", () => {
    const suggestions = getSearchSuggestions("mi", [], ["milk", "mint", "eggs"]);
    expect(suggestions).toEqual(["milk", "mint"]);
  });

  it("returns 4-weeks repeated items sorted by streak", () => {
    const repeated = getRepeatedItemSuggestions({
      milk: { weeksInRow: 4, totalTimes: 6 },
      eggs: { weeksInRow: 2, totalTimes: 7 },
      yogurt: { weeksInRow: 5, totalTimes: 5 },
    });
    expect(repeated).toEqual(["yogurt", "milk"]);
  });

  it("formats date in European format", () => {
    expect(formatEuropeanDate("2026-04-09")).toBe("09/04/2026");
    expect(formatEuropeanDate("")).toBe("");
  });

  it("parses european date into iso", () => {
    expect(parseEuropeanDate("09/04/2026")).toBe("2026-04-09");
    expect(parseEuropeanDate("9/4/2026")).toBeNull();
    expect(parseEuropeanDate("32/01/2026")).toBeNull();
  });

  it("toggles In Cart status", () => {
    expect(toggleInCartStatus("pending")).toBe("bought");
    expect(toggleInCartStatus("bought")).toBe("pending");
    expect(toggleInCartStatus("out_of_stock")).toBe("bought");
  });

  it("toggles Out of Stock status", () => {
    expect(toggleOutOfStockStatus("pending")).toBe("out_of_stock");
    expect(toggleOutOfStockStatus("out_of_stock")).toBe("pending");
    expect(toggleOutOfStockStatus("bought")).toBe("out_of_stock");
  });

  it("applyCloseWeekHistory increments only items on list; leaves others unchanged", () => {
    const prev = {
      milk: { weeksInRow: 2, totalTimes: 2 },
      eggs: { weeksInRow: 1, totalTimes: 5 },
    };
    const next = applyCloseWeekHistory(prev, ["milk"]);
    expect(next.milk).toEqual({ weeksInRow: 3, totalTimes: 3 });
    expect(next.eggs).toEqual({ weeksInRow: 1, totalTimes: 5 });
  });

  it("applyCloseWeekHistory adds new keys for first-time items", () => {
    const next = applyCloseWeekHistory({}, ["bread"]);
    expect(next.bread).toEqual({ weeksInRow: 1, totalTimes: 1 });
  });
});
