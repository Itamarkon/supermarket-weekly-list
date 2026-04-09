"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createDefaultList,
  formatEuropeanDate,
  getRepeatedItemSuggestions,
  getSearchSuggestions,
  hasDuplicateItem,
  normalizeItemName,
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
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
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
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState("");
  const [resetUsername, setResetUsername] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);

  async function loadRemoteState() {
    const response = await fetch("/api/state");
    if (!response.ok) {
      const fallback = createDefaultList();
      setLists([fallback]);
      setActiveListId(fallback.id);
      setHistory({});
      setHasLoadedState(true);
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
        const fallback = createDefaultList();
        setLists([fallback]);
        setActiveListId(fallback.id);
        setHistory({});
        setHasLoadedState(true);
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

  useEffect(() => {
    if (!duplicateMessage) {
      return;
    }

    const timeout = setTimeout(() => {
      setDuplicateMessage("");
    }, 10000);

    return () => clearTimeout(timeout);
  }, [duplicateMessage]);

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
    if (isAuthSubmitting) {
      return;
    }
    setIsAuthSubmitting(true);
    try {
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
      setIsLoggedIn(true);
      setHasLoadedState(false);
      await loadRemoteState();
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  function onAuthInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const key = (event.key || "").toLowerCase();
    const keyCode = (event.nativeEvent as KeyboardEvent).keyCode;
    const isSubmitKey = key.includes("enter") || key === "go" || key === "done" || key === "send" || keyCode === 13;

    if (!isSubmitKey) {
      return;
    }
    event.preventDefault();
    void handleAuth();
  }

  async function handlePasswordReset() {
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: resetUsername, newPassword: resetPassword }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setForgotPasswordMessage(payload.error || "Password reset failed.");
      return;
    }
    setForgotPasswordMessage("Password updated. You can login now.");
    setResetPassword("");
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

  async function exportBackup() {
    const response = await fetch("/api/backup");
    if (!response.ok) {
      setBackupMessage("Backup export failed.");
      return;
    }
    const data = await response.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shopping-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setBackupMessage("Backup exported.");
  }

  async function importBackup(file: File | null) {
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const response = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setBackupMessage(payload.error || "Backup import failed.");
        return;
      }
      setBackupMessage("Backup imported.");
      await loadRemoteState();
    } catch {
      setBackupMessage("Invalid backup file.");
    }
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

  function moveItemToCategory(itemId: string, targetCategory: string) {
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
          items: list.items.map((item) =>
            item.id === itemId ? { ...item, category: targetCategory } : item
          ),
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
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleAuth();
            }}
          >
            <label className="mb-2 block text-sm">Username</label>
            <input
              className="mb-4 w-full rounded-xl border border-white/30 bg-black/20 px-4 py-3"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              onKeyDown={onAuthInputKeyDown}
              enterKeyHint="go"
            />
            <label className="mb-2 block text-sm">Password</label>
            <input
              className="w-full rounded-xl border border-white/30 bg-black/20 px-4 py-3"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={onAuthInputKeyDown}
              enterKeyHint="go"
            />
            {loginError ? <p className="mt-3 text-sm text-red-300">{loginError}</p> : null}
            <button
              type="submit"
              disabled={isAuthSubmitting}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 px-4 py-3 text-lg font-semibold text-black disabled:opacity-60"
            >
              {isAuthSubmitting ? "Please wait..." : authMode === "login" ? "Login" : "Create account"}
            </button>
          </form>
          <div className="mt-3 rounded-xl border border-white/20 p-3">
            <p className="mb-2 text-sm font-semibold">Forgot password?</p>
            <input
              className="mb-2 w-full rounded-xl border border-white/30 bg-black/20 px-3 py-2 text-sm"
              placeholder="Username"
              value={resetUsername}
              onChange={(event) => setResetUsername(event.target.value)}
            />
            <input
              className="w-full rounded-xl border border-white/30 bg-black/20 px-3 py-2 text-sm"
              type="password"
              placeholder="New password"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
            />
            <button
              className="mt-2 w-full rounded-xl border border-white/25 px-4 py-2 text-sm"
              onClick={() => void handlePasswordReset()}
            >
              Reset password
            </button>
            {forgotPasswordMessage ? <p className="mt-2 text-sm text-amber-300">{forgotPasswordMessage}</p> : null}
          </div>
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
            type="date"
            className="rounded-xl border border-white/30 bg-black/20 px-3 py-2"
            value={activeList?.plannedDate || ""}
            onChange={(event) => updateListDate(event.target.value)}
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
      </section>

      <section className="mb-4 rounded-3xl border border-white/20 bg-zinc-900/60 p-4 shadow-xl shadow-black/20 backdrop-blur">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button className="rounded-xl bg-indigo-500 px-3 py-2 text-sm text-black" onClick={() => void exportBackup()}>
            Export Backup
          </button>
          <label className="cursor-pointer rounded-xl bg-indigo-800 px-3 py-2 text-sm">
            Import Backup
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => void importBackup(event.target.files?.[0] || null)}
            />
          </label>
          {backupMessage ? <span className="text-sm text-zinc-300">{backupMessage}</span> : null}
        </div>
        <h2 className="mb-3 text-lg font-semibold">Quick Add / Search</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            addItem();
          }}
        >
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
            type="submit"
            className="mt-3 w-full rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 px-4 py-3 text-lg font-semibold text-black shadow-lg shadow-emerald-900/30"
          >
            Add Item
          </button>
        </form>
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
          <article
            key={category}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverCategory(category);
            }}
            onDragLeave={() => setDragOverCategory((current) => (current === category ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              const itemId = event.dataTransfer.getData("text/plain");
              if (itemId) {
                moveItemToCategory(itemId, category);
              }
              setDragOverCategory(null);
            }}
            className={`rounded-3xl border p-3 shadow-lg shadow-black/20 ${
              dragOverCategory === category
                ? "border-sky-300 bg-sky-900/40"
                : "border-white/20 bg-zinc-900/60"
            }`}
          >
            <h3 className="mb-2 text-base font-bold">{category}</h3>
            <div className="space-y-2">
              {(itemsByCategory[category] || []).map((item: ShoppingItem) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", item.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDragOverCategory(null)}
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
