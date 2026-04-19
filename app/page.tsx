"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyCloseWeekHistory,
  createDefaultList,
  formatEuropeanDate,
  getRepeatedItemSuggestions,
  getSearchSuggestions,
  hasDuplicateItem,
  normalizeItemName,
  parseEuropeanDate,
  toggleInCartStatus,
  toggleOutOfStockStatus,
  type ItemHistoryEntry,
  type ShoppingItem,
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
  const [closeWeekMessage, setCloseWeekMessage] = useState("");
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);
  const [pointerDragItemId, setPointerDragItemId] = useState<string | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [plannedDateDraft, setPlannedDateDraft] = useState("");
  const authFormRef = useRef<HTMLFormElement>(null);
  const pointerDropCategoryRef = useRef<string | null>(null);
  const lastPersistedJsonRef = useRef<string | null>(null);

  function applyLocalFallbackList() {
    const fallback = createDefaultList();
    lastPersistedJsonRef.current = JSON.stringify({
      lists: [fallback],
      activeListId: fallback.id,
      history: {},
    });
    setLists([fallback]);
    setActiveListId(fallback.id);
    setHistory({});
    setHasLoadedState(true);
  }

  async function loadRemoteState() {
    try {
      const response = await fetch("/api/state", { credentials: "same-origin" });
      if (!response.ok) {
        applyLocalFallbackList();
        return;
      }
      let payload: {
        lists: (ShoppingList & { ownerId?: string; isOwner?: boolean })[];
        history: Record<string, ItemHistoryEntry>;
      };
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        applyLocalFallbackList();
        return;
      }
      if (!Array.isArray(payload.lists) || !payload.lists.length) {
        applyLocalFallbackList();
        return;
      }
      lastPersistedJsonRef.current = JSON.stringify({
        lists: payload.lists,
        activeListId: payload.lists[0].id,
        history: payload.history || {},
      });
      setLists(payload.lists);
      setActiveListId(payload.lists[0].id);
      setHistory(payload.history || {});
      setHasLoadedState(true);
    } catch {
      applyLocalFallbackList();
    }
  }

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const response = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (!response.ok) {
          return;
        }
        let payload: { user: { username: string } | null };
        try {
          payload = (await response.json()) as { user: { username: string } | null };
        } catch {
          return;
        }
        if (!payload.user) {
          return;
        }
        setLoggedUsername(payload.user.username);
        await loadRemoteState();
        setIsLoggedIn(true);
      } catch {}
    }
    loadCurrentUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !hasLoadedState) {
      return;
    }

    const value: PersistedState = { lists, activeListId, history };
    const body = JSON.stringify(value);
    if (body === lastPersistedJsonRef.current) {
      return;
    }

    const timeout = setTimeout(async () => {
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body,
      });
      if (response.ok) {
        lastPersistedJsonRef.current = body;
      }
    }, 600);

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

  useEffect(() => {
    if (!backupMessage) {
      return;
    }

    const timeout = setTimeout(() => {
      setBackupMessage("");
    }, 10000);

    return () => clearTimeout(timeout);
  }, [backupMessage]);

  useEffect(() => {
    if (!closeWeekMessage) {
      return;
    }
    const timeout = setTimeout(() => {
      setCloseWeekMessage("");
    }, 10000);
    return () => clearTimeout(timeout);
  }, [closeWeekMessage]);

  const activeList = useMemo(
    () => lists.find((list) => list.id === activeListId) || lists[0],
    [lists, activeListId]
  );

  const searchSuggestions = useMemo(
    () => getSearchSuggestions(itemName, activeList?.items || [], QUICK_ITEMS),
    [itemName, activeList]
  );

  const repeatedSuggestions = useMemo(() => getRepeatedItemSuggestions(history), [history]);

  useEffect(() => {
    if (activeList?.plannedDate) {
      setPlannedDateDraft(formatEuropeanDate(activeList.plannedDate));
    } else {
      setPlannedDateDraft("");
    }
  }, [activeList?.id, activeList?.plannedDate]);

  function runAddItem(nameFromButton?: string) {
    if (isAddingItem) {
      return;
    }
    setIsAddingItem(true);
    addItem(nameFromButton);
    window.setTimeout(() => setIsAddingItem(false), 400);
  }

  function readAuthCredentials() {
    const form = authFormRef.current;
    if (form) {
      const fd = new FormData(form);
      const u = (fd.get("username") as string) || "";
      const p = (fd.get("password") as string) || "";
      if (u.trim() || p) {
        return { username: u.trim(), password: p };
      }
    }
    return { username: username.trim(), password };
  }

  async function handleAuth() {
    if (isAuthSubmitting) {
      return;
    }
    const { username: effectiveUser, password: effectivePass } = readAuthCredentials();
    setIsAuthSubmitting(true);
    try {
      const route = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const response = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username: effectiveUser, password: effectivePass }),
      });

      let payload: { error?: string; username?: string };
      try {
        payload = (await response.json()) as { error?: string; username?: string };
      } catch {
        setLoginError(response.ok ? "Unexpected server response." : "Authentication failed.");
        return;
      }
      if (!response.ok) {
        setLoginError(payload.error || "Authentication failed.");
        return;
      }

      setUsername("");
      setPassword("");
      setLoginError("");
      setHasLoadedState(false);
      await loadRemoteState();
      setLoggedUsername(payload.username || effectiveUser);
      setIsLoggedIn(true);
    } catch {
      setLoginError("Network error. Check your connection and try again.");
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
    lastPersistedJsonRef.current = null;
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

  function toggleInCart(itemId: string) {
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
          items: list.items.map((item) => {
            if (item.id !== itemId) {
              return item;
            }
            return { ...item, status: toggleInCartStatus(item.status) };
          }),
        };
      })
    );
  }

  function toggleOutOfStock(itemId: string) {
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
          items: list.items.map((item) => {
            if (item.id !== itemId) {
              return item;
            }
            return { ...item, status: toggleOutOfStockStatus(item.status) };
          }),
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

    const moving = activeList.items.find((i) => i.id === itemId);
    if (moving && moving.category === targetCategory) {
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

  function beginPointerCategoryDrag(itemId: string) {
    if (!activeList || activeList.isOwner === false) {
      return;
    }

    setPointerDragItemId(itemId);
    pointerDropCategoryRef.current = null;

    const categoryUnderPoint = (clientX: number, clientY: number): string | null => {
      const target = document.elementFromPoint(clientX, clientY);
      let n: HTMLElement | null = target as HTMLElement | null;
      while (n) {
        const c = n.getAttribute("data-shopping-category");
        if (c) {
          return c;
        }
        n = n.parentElement;
      }
      return null;
    };

    const onMove = (e: PointerEvent) => {
      const cat = categoryUnderPoint(e.clientX, e.clientY);
      if (cat) {
        pointerDropCategoryRef.current = cat;
      }
      setDragOverCategory(cat);
    };

    const onEnd = (e: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      let cat = categoryUnderPoint(e.clientX, e.clientY);
      if (!cat) {
        cat = pointerDropCategoryRef.current;
      }
      if (cat) {
        moveItemToCategory(itemId, cat);
      }
      pointerDropCategoryRef.current = null;
      setPointerDragItemId(null);
      setDragOverCategory(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
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

    const normalizedNames = activeList.items.map((item) => normalizeItemName(item.name));
    setHistory((prev) => applyCloseWeekHistory(prev, normalizedNames));
    setCloseWeekMessage("Track updated for this week.");
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
              type="button"
              className={`rounded-xl px-3 py-2 text-sm ${authMode === "login" ? "bg-emerald-500 text-black" : "bg-zinc-800"}`}
              onClick={() => setAuthMode("login")}
            >
              Login
            </button>
            <button
              type="button"
              className={`rounded-xl px-3 py-2 text-sm ${authMode === "register" ? "bg-emerald-500 text-black" : "bg-zinc-800"}`}
              onClick={() => setAuthMode("register")}
            >
              Register
            </button>
          </div>
          <form
            ref={authFormRef}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void handleAuth();
            }}
          >
            <label className="mb-2 block text-sm" htmlFor="auth-username">
              Username
            </label>
            <input
              id="auth-username"
              name="username"
              className="mb-4 w-full rounded-xl border border-white/30 bg-black/20 px-4 py-3"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              onKeyDown={onAuthInputKeyDown}
              enterKeyHint="go"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
            />
            <label className="mb-2 block text-sm" htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
              name="password"
              className="w-full rounded-xl border border-white/30 bg-black/20 px-4 py-3"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={onAuthInputKeyDown}
              enterKeyHint="go"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete={authMode === "login" ? "current-password" : "new-password"}
            />
            {loginError ? <p className="mt-3 text-sm text-red-300">{loginError}</p> : null}
            <button
              type="button"
              disabled={isAuthSubmitting}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 px-4 py-3 text-lg font-semibold text-black disabled:opacity-60"
              onClick={(event) => {
                event.preventDefault();
                void handleAuth();
              }}
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
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <input
              className="w-full rounded-xl border border-white/30 bg-black/20 px-3 py-2 text-sm"
              type="password"
              placeholder="New password"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="new-password"
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
          <label className="text-sm" htmlFor="planned-date-eu">
            Planned Date (DD/MM/YYYY):
          </label>
          <input
            id="planned-date-eu"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="DD/MM/YYYY"
            className="w-40 rounded-xl border border-white/30 bg-black/20 px-3 py-2"
            value={plannedDateDraft}
            onChange={(event) => setPlannedDateDraft(event.target.value)}
            onBlur={() => {
              if (!activeList?.plannedDate) {
                return;
              }
              const iso = parseEuropeanDate(plannedDateDraft.trim());
              if (iso) {
                updateListDate(iso);
              } else {
                setPlannedDateDraft(formatEuropeanDate(activeList.plannedDate));
              }
            }}
          />
          <button
            type="button"
            className="rounded-xl bg-orange-500 px-3 py-2 text-black shadow-md shadow-orange-900/30"
            onClick={closeListAndTrackRepeats}
          >
            Close Week + Track Repeats
          </button>
          <button
            type="button"
            className="rounded-xl bg-red-500 px-3 py-2 text-black shadow-md shadow-red-900/30"
            onClick={deleteCurrentList}
          >
            Delete Current List
          </button>
          {closeWeekMessage ? (
            <span className="w-full text-sm text-emerald-200 sm:w-auto">{closeWeekMessage}</span>
          ) : null}
        </div>
      </section>

      <section className="mb-4 rounded-3xl border border-white/20 bg-zinc-900/60 p-4 shadow-xl shadow-black/20 backdrop-blur">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="cursor-pointer rounded-xl bg-indigo-500 px-3 py-2 text-sm text-black"
            onClick={() => void exportBackup()}
          >
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
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            runAddItem();
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
            disabled={isAddingItem}
            className="mt-3 w-full rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 px-4 py-3 text-lg font-semibold text-black shadow-lg shadow-emerald-900/30 disabled:opacity-60"
          >
            {isAddingItem ? "Please wait..." : "Add Item"}
          </button>
        </form>
        {duplicateMessage ? <p className="mt-2 text-sm text-amber-300">{duplicateMessage}</p> : null}

        <p className="mt-4 mb-2 text-sm opacity-80">Suggestions:</p>
        <div className="flex flex-wrap gap-2">
          {searchSuggestions.map((name) => (
            <button
              key={name}
              type="button"
              disabled={isAddingItem}
              onClick={() => runAddItem(name)}
              className="rounded-full bg-white/15 px-3 py-2 text-sm disabled:opacity-60"
            >
              {name}
            </button>
          ))}
        </div>

        {repeatedSuggestions.length > 0 ? (
          <>
            <p className="mt-4 mb-2 text-sm text-emerald-200">Bought 4 weeks in a row:</p>
            <div className="flex flex-wrap gap-2">
              {repeatedSuggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  disabled={isAddingItem}
                  onClick={() => runAddItem(name)}
                  className="rounded-full bg-emerald-600 px-3 py-2 text-sm text-black disabled:opacity-60"
                >
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
            data-shopping-category={category}
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
                  className={`flex gap-1 rounded-xl border p-0 ${
                    pointerDragItemId === item.id ? "opacity-80 ring-2 ring-sky-400/60" : ""
                  } ${
                    item.status === "bought"
                      ? "border-emerald-400 bg-emerald-500/30"
                      : item.status === "out_of_stock"
                        ? "border-red-400 bg-red-500/30"
                        : "border-white/20 bg-black/25"
                  }`}
                >
                  <button
                    type="button"
                    className="touch-none shrink-0 select-none rounded-l-lg border-r border-white/15 bg-zinc-800/90 px-1.5 py-2 text-[10px] leading-tight text-zinc-400"
                    title="גרור לעמודה אחרת (טלפון / מחשב)"
                    aria-label="גרור פריט לעמודה אחרת"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      beginPointerCategoryDrag(item.id);
                    }}
                  >
                    ⋮⋮
                  </button>
                  <div
                    className="min-w-0 flex-1 p-2"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", item.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setDragOverCategory(null)}
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
                      type="button"
                      className="rounded-lg bg-emerald-500 px-2 py-1 text-xs text-black"
                      onClick={() => toggleInCart(item.id)}
                    >
                      In Cart
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-red-500 px-2 py-1 text-xs text-black"
                      onClick={() => toggleOutOfStock(item.id)}
                    >
                      Out of Stock
                    </button>
                    <button className="rounded-lg bg-zinc-500 px-2 py-1 text-xs" onClick={() => deleteItem(item.id)}>
                      Delete
                    </button>
                  </div>
                  <label className="md:hidden mt-2 block text-xs text-zinc-400">העבר לקטגוריה / Move to</label>
                  <select
                    className="md:hidden mt-1 w-full rounded-lg border border-white/30 bg-black/40 px-2 py-2 text-sm"
                    aria-label="העבר פריט לקטגוריה"
                    value={item.category}
                    onChange={(event) => moveItemToCategory(item.id, event.target.value)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
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
