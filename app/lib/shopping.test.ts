import { describe, expect, it } from "vitest";
import {
  formatEuropeanDate,
  getRepeatedItemSuggestions,
  getSearchSuggestions,
  hasDuplicateItem,
  normalizeItemName,
  parseEuropeanDate,
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

  it("returns 4-weeks repeated items", () => {
    const repeated = getRepeatedItemSuggestions({
      milk: { weeksInRow: 4, totalTimes: 6 },
      eggs: { weeksInRow: 2, totalTimes: 7 },
      yogurt: { weeksInRow: 5, totalTimes: 5 },
    });
    expect(repeated).toEqual(["yogurt", "milk"]);
  });

  it("formats date in European format", () => {
    expect(formatEuropeanDate("2026-04-09")).toBe("09/04/2026");
  });

  it("parses european date into iso", () => {
    expect(parseEuropeanDate("09/04/2026")).toBe("2026-04-09");
    expect(parseEuropeanDate("9/4/2026")).toBeNull();
  });
});
