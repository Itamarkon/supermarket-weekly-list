export type ShoppingItemStatus = "pending" | "bought" | "out_of_stock";

export type ShoppingItem = {
  id: string;
  name: string;
  quantity: number;
  notes: string;
  category: string;
  status: ShoppingItemStatus;
};

export type ShoppingList = {
  id: string;
  title: string;
  plannedDate: string;
  items: ShoppingItem[];
};

export type ItemHistoryEntry = {
  weeksInRow: number;
  totalTimes: number;
};

const MAX_SUGGESTIONS = 8;

export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase();
}

export function hasDuplicateItem(items: ShoppingItem[], newName: string): boolean {
  const target = normalizeItemName(newName);
  return items.some((item) => normalizeItemName(item.name) === target);
}

export function getSearchSuggestions(
  query: string,
  currentItems: ShoppingItem[],
  quickItems: string[]
): string[] {
  const normalizedQuery = normalizeItemName(query);
  if (!normalizedQuery) {
    return quickItems.slice(0, MAX_SUGGESTIONS);
  }

  const currentNames = currentItems.map((item) => item.name);
  const all = [...quickItems, ...currentNames];
  const unique = Array.from(new Set(all));

  return unique
    .filter((name) => normalizeItemName(name).startsWith(normalizedQuery))
    .slice(0, MAX_SUGGESTIONS);
}

export function getRepeatedItemSuggestions(history: Record<string, ItemHistoryEntry>): string[] {
  return Object.entries(history)
    .filter(([, entry]) => entry.weeksInRow >= 4)
    .sort((a, b) => b[1].weeksInRow - a[1].weeksInRow)
    .map(([itemName]) => itemName)
    .slice(0, 5);
}

export function toggleInCartStatus(current: ShoppingItemStatus): ShoppingItemStatus {
  return current === "bought" ? "pending" : "bought";
}

export function toggleOutOfStockStatus(current: ShoppingItemStatus): ShoppingItemStatus {
  return current === "out_of_stock" ? "pending" : "out_of_stock";
}

export function applyCloseWeekHistory(
  prev: Record<string, ItemHistoryEntry>,
  normalizedNamesOnList: Iterable<string>
): Record<string, ItemHistoryEntry> {
  const next: Record<string, ItemHistoryEntry> = { ...prev };
  for (const key of new Set(normalizedNamesOnList)) {
    const old = next[key] || { weeksInRow: 0, totalTimes: 0 };
    next[key] = { weeksInRow: old.weeksInRow + 1, totalTimes: old.totalTimes + 1 };
  }
  return next;
}

export function createDefaultList(): ShoppingList {
  const now = new Date();
  const isoDate = now.toISOString().split("T")[0];

  return {
    id: `${now.getTime()}`,
    title: `Shopping ${formatEuropeanDate(isoDate)}`,
    plannedDate: isoDate,
    items: [],
  };
}

export function formatEuropeanDate(isoDate: string): string {
  if (!isoDate) {
    return "";
  }

  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) {
    return isoDate;
  }

  return `${day}/${month}/${year}`;
}

export function parseEuropeanDate(euDate: string): string | null {
  const trimmed = euDate.trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const dayNum = Number(day);
  const monthNum = Number(month);
  const yearNum = Number(year);

  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31 || yearNum < 1900) {
    return null;
  }

  return `${year}-${month}-${day}`;
}
