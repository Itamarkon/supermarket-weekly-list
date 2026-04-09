"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createDefaultList,
  formatEuropeanDate,
  getRepeatedItemSuggestions,
  getSearchSuggestions,
  hasDuplicateItem,
  normalizeItemName,
  parseEuropeanDate,
  type ItemHistoryEntry,
  type ShoppingItem,
  type ShoppingItemStatus,
  type ShoppingList,
} from "@/app/lib/shopping";

const CATEGORIES = [
  "פירות וירקות",
  "חטיפים ומתוקים",
  "אפייה",
  "שימורים/קשים",
  "הגיינה וטואלטיקה",
  "ניקיון",
  "חלבי ובשרי",
  "קפואים",
] as const;

const QUICK_ITEMS = ["חלב", "ביצים", "יוגורט", "לחם", "בננות", "עגבניות", "אורז", "מים"];

type PersistedState = {
  lists: (ShoppingList & { ownerId?: string; isOwner?: boolean })[];
  activeListId: string;
  history: Record<string, ItemHistoryEntry>;
};

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [loggedUsername, setLoggedUsername] = useState("");
  const [loginError, setLoginError] = useState("");
  const [lists, setLists] = useState<(ShoppingList & { ownerId?: string; isOwner?: boolean })[]>([]);
  const [activeListId, setActiveListId] = useState<string>("");
  const [history, setHistory] = useState<Record<string, ItemHistoryEntry>>({});
  const [hasLoadedState, setHasLoadedState] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemQty, setItemQty] = useState(1);
  const [itemNotes, setItemNotes] = useState("");
  const [itemCategory, setItemCategory] = useState<string>(CATEGORIES[0]);
  const [duplicateMessage, setDuplicateMessage] = useState("");
  const [shareUsername, setShareUsername] = useState("");
  const [shareMessage, setShareMessage] = useState("");

  async function loadRemoteState() {
    const response = await fetch("/api/state");
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as {
      lists: (ShoppingList & { ownerId?: string; isOwner?: boolean })[];
      history: Record<string, ItemHistoryEntry>;
    };

    if (!payload.lists.length) {
      const fallback = createDefaultList();
      setLists([fallback]);
      setActiveListId(fallback.id);
      setHistory({});
      setHasLoadedState(true);
      return;
    }

    setLists(payload.lists);
    setActiveListId(payload.lists[0].id);
    setHistory(payload.history || {});
    setHasLoadedState(true);
  }

  useEffect(() => {
    async function loadCurrentUser() {
      const response = await fetch("/api/auth/me");
      const payload = (await response.json()) as { user: { username: string } | null };
      if (!payload.user) {
        return;
      }
      setLoggedUsername(payload.user.username);
      setIsLoggedIn(true);
      const stateResponse = await fetch("/api/state");
      if (!stateResponse.ok) {
        return;
      }
      const statePayload = (await stateResponse.json()) as {
        lists: (ShoppingList & { ownerId?: string; isOwner?: boolean })[];
        history: Record<string, ItemHistoryEntry>;
      };
      if (!statePayload.lists.length) {
        const fallback = createDefaultList();
        setLists([fallback]);
        setActiveListId(fallback.id);
        setHistory({});
        setHasLoadedState(true);
        return;
      }
      setLists(statePayload.lists);
      setActiveListId(statePayload.lists[0].id);
      setHistory(statePayload.history || {});
      setHasLoadedState(true);
    }
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !hasLoadedState) {
      return;
    }

    const timeout = setTimeout(async () => {
      const value: PersistedState = { lists, activeListId, history };
      await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
    }, 400);

    return () => clearTimeout(timeout);
  }, [lists, activeListId, history, isLoggedIn, hasLoadedState]);

  const activeList = useMemo(
    () => lists.find((list) => list.id === activeListId) || lists[0],
    [lists, activeListId]
  );

  const searchSuggestions = useMemo(
    () => getSearchSuggestions(itemName, activeList?.items || [], QUICK_ITEMS),
    [itemName, activeList]
  );

  const repeatedSuggestions = useMemo(() => getRepeatedItemSuggestions(history), [history]);

  async function handleAuth() {
    const route = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const response = await fetch(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const payload = (await response.json()) as { error?: string; username?: string };
    if (!response.ok) {
      setLoginError(payload.error || "Authentication failed.");
      return;
    }

    setLoggedUsername(payload.username || username);
    setUsername("");
    setPassword("");
    setLoginError("");
    setHasLoadedState(false);
    await loadRemoteState();
    setIsLoggedIn(true);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setIsLoggedIn(false);
    setLoggedUsername("");
    setLists([]);
    setActiveListId("");
    setHistory({});
    setHasLoadedState(false);
  }

  async function shareCurrentList() {
    if (!activeList || !shareUsername.trim()) {
      return;
    }

    const response = await fetch(`/api/lists/${activeList.id}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: shareUsername.trim() }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setShareMessage(payload.error || "Failed to share list.");
      return;
    }

    setShareMessage(`List shared with ${shareUsername.trim()}.`);
    setShareUsername("");
  }

  function addItem(nameFromButton?: string) {
    if (!activeList) {
      return;
    }
    if (activeList.isOwner === false) {
      setDuplicateMessage("This shared list is read-only.");
      return;
    }

    const name = (nameFromButton || itemName).trim();
    if (!name) {
      return;
    }

    if (hasDuplicateItem(activeList.items, name)) {
      setDuplicateMessage(`${name} is already in your list.`);
      return;
    }

    const newItem: ShoppingItem = {
      id: `${Date.now()}-${Math.random()}`,
      name,
      quantity: Math.max(1, itemQty),
      notes: itemNotes.trim(),
      category: itemCategory,
      status: "pending",
    };

    setLists((prev) =>
      prev.map((list) => (list.id === activeList.id ? { ...list, items: [...list.items, newItem] } : list))
    );
    setItemName("");
    setItemQty(1);
    setItemNotes("");
    setDuplicateMessage("");
  }

  function updateItemStatus(itemId: string, status: ShoppingItemStatus) {
    if (!activeList) {
      return;
    }
    if (activeList.isOwner === false) {
      return;
    }

    setLists((prev) =>
      prev.map((list) => {
        if (list.id !== activeList.id) {
          return list;
        }
        return {
          ...list,
          items: list.items.map((item) => (item.id === itemId ? { ...item, status } : item)),
        };
      })
    );
  }

  function deleteItem(itemId: string) {
    if (!activeList) {
      return;
    }
    if (activeList.isOwner === false) {
      return;
    }
    setLists((prev) =>
      prev.map((list) =>
        list.id === activeList.id ? { ...list, items: list.items.filter((item) => item.id !== itemId) } : list
      )
    );
  }

  function changeItemQuantity(itemId: string, nextQuantity: number) {
    if (!activeList) {
      return;
    }
    if (activeList.isOwner === false) {
      return;
    }

    const safeQty = Math.max(1, nextQuantity);
    setLists((prev) =>
      prev.map((list) => {
        if (list.id !== activeList.id) {
          return list;
        }
        return {
          ...list,
          items: list.items.map((item) => (item.id === itemId ? { ...item, quantity: safeQty } : item)),
        };
      })
    );
  }

  function addNewList() {
    const newList = createDefaultList();
    newList.title = `Shopping ${formatEuropeanDate(newList.plannedDate)}`;
    setLists((prev) => [newList, ...prev]);
    setActiveListId(newList.id);
  }

  function deleteCurrentList() {
    if (!activeList) {
      return;
    }
    if (activeList.isOwner === false) {
      setShareMessage("Only list owner can delete this shared list.");
      return;
    }

    if (lists.length === 1) {
      const replacement = createDefaultList();
      setLists([replacement]);
      setActiveListId(replacement.id);
      return;
    }

    const remaining = lists.filter((list) => list.id !== activeList.id);
    setLists(remaining);
    setActiveListId(remaining[0].id);
  }

  function updateListDate(date: string) {
    if (!activeList) {
      return;
    }
    if (activeList.isOwner === false) {
      return;
    }
    setLists((prev) =>
      prev.map((list) =>
        list.id === activeList.id
          ? {
              ...list,
              plannedDate: date,
              title: `Shopping ${formatEuropeanDate(date)}`,
            }
          : list
      )
    );
  }

  function closeListAndTrackRepeats() {
    if (!activeList) {
      return;
    }
    if (activeList.isOwner === false) {
      return;
    }

    const currentNames = new Set(activeList.items.map((item) => normalizeItemName(item.name)));
    setHistory((prev) => {
      const next: Record<string, ItemHistoryEntry> = { ...prev };
      const keys = new Set([...Object.keys(next), ...currentNames]);
      for (const key of keys) {
        const old = next[key] || { weeksInRow: 0, totalTimes: 0 };
        if (currentNames.has(key)) {
          next[key] = { weeksInRow: old.weeksInRow + 1, totalTimes: old.totalTimes + 1 };
        } else {
          next[key] = { weeksInRow: 0, totalTimes: old.totalTimes };
        }
      }
      return next;
    });
  }

  const itemsByCategory = useMemo(() => {
    if (!activeList) {
      return {};
    }

    const map = new Map<string, ShoppingItem[]>();
    for (const category of CATEGORIES) {
      map.set(category, []);
    }
    for (const item of activeList.items) {
      const categoryItems = map.get(item.category) || [];
      categoryItems.push(item);
      map.set(item.category, categoryItems);
    }
    return Object.fromEntries(map);
  }, [activeList]);

  if (!isLoggedIn) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-md px-4 py-8">
        <h1 className="bg-gradient-to-r from-emerald-300 to-sky-300 bg-clip-text text-center text-3xl font-bold text-transparent">
          Supermarket Weekly List
        </h1>
        <section className="mt-6 rounded-3xl border border-white/20 bg-zinc-900/60 p-5 shadow-xl shadow-black/20 backdrop-blur">
          <div className="mb-4 flex gap-2">
            <button
              className={`rounded-xl px-3 py-2 text-sm ${authMode === "login" ? "bg-emerald-500 text-black" : "bg-zinc-800"}`}
              onClick={() => setAuthMode("login")}
            >
              Login
            </button>
            <button
              className={`rounded-xl px-3 py-2 text-sm ${authMode === "register" ? "bg-emerald-500 text-black" : "bg-zinc-800"}`}
              onClick={() => setAuthMode("register")}
            >
              Register
            </button>
          </div>
          <label className="mb-2 block text-sm">Username</label>
          <input
            className="mb-4 w-full rounded-xl border border-white/30 bg-black/20 px-4 py-3"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <label className="mb-2 block text-sm">Password</label>
          <input
            className="w-full rounded-xl border border-white/30 bg-black/20 px-4 py-3"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {loginError ? <p className="mt-3 text-sm text-red-300">{loginError}</p> : null}
          <button
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 px-4 py-3 text-lg font-semibold text-black"
            onClick={handleAuth}
          >
            {authMode === "login" ? "Login" : "Create account"}
          </button>
        </section>
      </main>
    );
  }

  if (!hasLoadedState) {
    return <main className="mx-auto min-h-screen w-full max-w-md px-4 py-8">Loading your data...</main>;
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-3 py-4 sm:px-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="bg-gradient-to-r from-emerald-300 to-sky-300 bg-clip-text text-2xl font-bold text-transparent">
          Weekly Supermarket Planner
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-300">{loggedUsername}</span>
          <button
            className="rounded-xl bg-gradient-to-r from-sky-400 to-sky-500 px-4 py-3 font-semibold text-black shadow-lg shadow-sky-900/30"
            onClick={addNewList}
          >
            + New List
          </button>
          <button className="rounded-xl bg-zinc-700 px-4 py-3 text-sm" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <section className="mb-4 rounded-3xl border border-white/20 bg-zinc-900/60 p-4 shadow-xl shadow-black/20 backdrop-blur">
        <div className="mb-3 flex flex-wrap gap-2">
          {lists.map((list) => (
            <button
              key={list.id}
              onClick={() => setActiveListId(list.id)}
              className={`rounded-xl px-3 py-2 text-sm font-medium shadow-sm ${
                list.id === activeList?.id ? "bg-emerald-500 text-black" : "bg-zinc-800"
              }`}
            >
              {list.title}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm">Planned Date:</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="DD/MM/YYYY"
            className="rounded-xl border border-white/30 bg-black/20 px-3 py-2"
            defaultValue={activeList?.plannedDate ? formatEuropeanDate(activeList.plannedDate) : ""}
            key={`${activeList?.id}-${activeList?.plannedDate}`}
            onBlur={(event) => {
              const parsed = parseEuropeanDate(event.target.value);
              if (parsed) {
                updateListDate(parsed);
                event.currentTarget.value = formatEuropeanDate(parsed);
              } else if (activeList?.plannedDate) {
                event.currentTarget.value = formatEuropeanDate(activeList.plannedDate);
              }
            }}
          />
          <button
            className="rounded-xl bg-orange-500 px-3 py-2 text-black shadow-md shadow-orange-900/30"
            onClick={closeListAndTrackRepeats}
          >
            Close Week + Track Repeats
          </button>
          <button
            className="rounded-xl bg-red-500 px-3 py-2 text-black shadow-md shadow-red-900/30"
            onClick={deleteCurrentList}
          >
            Delete Current List
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="rounded-xl border border-white/30 bg-black/20 px-3 py-2"
            placeholder="Share with username"
            value={shareUsername}
            onChange={(event) => setShareUsername(event.target.value)}
          />
          <button className="rounded-xl bg-violet-500 px-3 py-2 text-black" onClick={shareCurrentList}>
            Share List
          </button>
          {shareMessage ? <span className="text-sm text-zinc-300">{shareMessage}</span> : null}
        </div>
      </section>

      <section className="mb-4 rounded-3xl border border-white/20 bg-zinc-900/60 p-4 shadow-xl shadow-black/20 backdrop-blur">
        <h2 className="mb-3 text-lg font-semibold">Quick Add / Search</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            placeholder="Product name"
            className="rounded-xl border border-white/30 bg-black/20 px-3 py-3"
            value={itemName}
            onChange={(event) => setItemName(event.target.value)}
          />
          <select
            className="rounded-xl border border-white/30 bg-black px-3 py-3"
            value={itemCategory}
            onChange={(event) => setItemCategory(event.target.value)}
          >
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            className="rounded-xl border border-white/30 bg-black/20 px-3 py-3"
            value={itemQty}
            onChange={(event) => setItemQty(Number(event.target.value || 1))}
          />
          <input
            placeholder="Notes (optional)"
            className="rounded-xl border border-white/30 bg-black/20 px-3 py-3"
            value={itemNotes}
            onChange={(event) => setItemNotes(event.target.value)}
          />
        </div>
        <button
          className="mt-3 w-full rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 px-4 py-3 text-lg font-semibold text-black shadow-lg shadow-emerald-900/30"
          onClick={() => addItem()}
        >
          Add Item
        </button>
        {duplicateMessage ? <p className="mt-2 text-sm text-amber-300">{duplicateMessage}</p> : null}

        <p className="mt-4 mb-2 text-sm opacity-80">Suggestions:</p>
        <div className="flex flex-wrap gap-2">
          {searchSuggestions.map((name) => (
            <button key={name} onClick={() => addItem(name)} className="rounded-full bg-white/15 px-3 py-2 text-sm">
              {name}
            </button>
          ))}
        </div>

        {repeatedSuggestions.length > 0 ? (
          <>
            <p className="mt-4 mb-2 text-sm text-emerald-200">Bought 4 weeks in a row:</p>
            <div className="flex flex-wrap gap-2">
              {repeatedSuggestions.map((name) => (
                <button key={name} onClick={() => addItem(name)} className="rounded-full bg-emerald-600 px-3 py-2 text-sm text-black">
                  {name}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {CATEGORIES.map((category) => (
          <article key={category} className="rounded-3xl border border-white/20 bg-zinc-900/60 p-3 shadow-lg shadow-black/20">
            <h3 className="mb-2 text-base font-bold">{category}</h3>
            <div className="space-y-2">
              {(itemsByCategory[category] || []).map((item: ShoppingItem) => (
                <div
                  key={item.id}
                  className={`rounded-xl border p-2 ${
                    item.status === "bought"
                      ? "border-emerald-400 bg-emerald-500/30"
                      : item.status === "out_of_stock"
                        ? "border-red-400 bg-red-500/30"
                        : "border-white/20 bg-black/25"
                  }`}
                >
                  <p className="font-semibold">{item.name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs">Qty:</span>
                    <button
                      className="rounded-md bg-zinc-700 px-2 py-1 text-xs"
                      onClick={() => changeItemQuantity(item.id, item.quantity - 1)}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      className="w-16 rounded-md border border-white/30 bg-black/20 px-2 py-1 text-xs"
                      value={item.quantity}
                      onChange={(event) => changeItemQuantity(item.id, Number(event.target.value || 1))}
                    />
                    <button
                      className="rounded-md bg-zinc-700 px-2 py-1 text-xs"
                      onClick={() => changeItemQuantity(item.id, item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                  {item.notes ? <p className="text-xs opacity-85">Notes: {item.notes}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="rounded-lg bg-emerald-500 px-2 py-1 text-xs text-black"
                      onClick={() => updateItemStatus(item.id, "bought")}
                    >
                      In Cart
                    </button>
                    <button
                      className="rounded-lg bg-red-500 px-2 py-1 text-xs text-black"
                      onClick={() => updateItemStatus(item.id, "out_of_stock")}
                    >
                      Out of Stock
                    </button>
                    <button className="rounded-lg bg-zinc-500 px-2 py-1 text-xs" onClick={() => deleteItem(item.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
