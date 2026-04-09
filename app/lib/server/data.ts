/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabaseAdmin } from "./supabase";

export type StoredUser = {
  id: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
};

export type StoredListItem = {
  id: string;
  name: string;
  quantity: number;
  notes: string;
  category: string;
  status: "pending" | "bought" | "out_of_stock";
};

export type StoredList = {
  id: string;
  title: string;
  plannedDate: string;
  items: StoredListItem[];
  ownerId: string;
  sharedWithUserIds: string[];
  updatedAt: string;
};

export type StoredDb = {
  users: StoredUser[];
  lists: StoredList[];
  historyByUserId: Record<string, Record<string, { weeksInRow: number; totalTimes: number }>>;
};

type HistoryShape = Record<string, { weeksInRow: number; totalTimes: number }>;

export const DB_LIMITS = {
  maxListsPerUser: 100,
  maxItemsPerList: 500,
  maxItemNameLength: 80,
  maxNotesLength: 200,
  maxHistoryItems: 500,
  retentionMonths: 12,
} as const;

export async function getUserById(userId: string): Promise<StoredUser | null> {
  const supabaseAdmin = getSupabaseAdmin() as any;
  const { data, error } = await supabaseAdmin
    .from("shopping_users")
    .select("id, username, password_hash, password_salt, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  const row = data as {
    id: string;
    username: string;
    password_hash: string;
    password_salt: string;
    created_at: string;
  };
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    createdAt: row.created_at,
  };
}

export async function getUserByUsername(username: string): Promise<StoredUser | null> {
  const supabaseAdmin = getSupabaseAdmin() as any;
  const { data, error } = await supabaseAdmin
    .from("shopping_users")
    .select("id, username, password_hash, password_salt, created_at")
    .eq("username", username)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  const row = data as {
    id: string;
    username: string;
    password_hash: string;
    password_salt: string;
    created_at: string;
  };
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    createdAt: row.created_at,
  };
}

export async function createUser(user: StoredUser): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin() as any;
  const { error } = await supabaseAdmin.from("shopping_users").insert({
    id: user.id,
    username: user.username,
    password_hash: user.passwordHash,
    password_salt: user.passwordSalt,
    created_at: user.createdAt,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function cleanupExpiredData(): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin() as any;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - DB_LIMITS.retentionMonths);
  const cutoffIso = cutoff.toISOString();

  const { data: expiredLists, error: listFetchError } = await supabaseAdmin
    .from("shopping_lists")
    .select("id")
    .lt("updated_at", cutoffIso);

  if (listFetchError || !expiredLists?.length) {
    return;
  }

  const ids = expiredLists.map((entry: { id: string }) => entry.id);
  await supabaseAdmin.from("shopping_list_items").delete().in("list_id", ids);
  await supabaseAdmin.from("shopping_list_shares").delete().in("list_id", ids);
  await supabaseAdmin.from("shopping_lists").delete().in("id", ids);
}

export async function getVisibleStateForUser(userId: string): Promise<{
  lists: Array<StoredList & { isOwner: boolean }>;
  history: HistoryShape;
}> {
  const supabaseAdmin = getSupabaseAdmin() as any;
  await cleanupExpiredData();

  const { data: ownedLists, error: ownedError } = await supabaseAdmin
    .from("shopping_lists")
    .select("id, title, planned_date, owner_id, updated_at")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });
  if (ownedError) {
    throw new Error(ownedError.message);
  }

  const { data: sharedLinks, error: sharedError } = await supabaseAdmin
    .from("shopping_list_shares")
    .select("list_id")
    .eq("user_id", userId);
  if (sharedError) {
    throw new Error(sharedError.message);
  }
  const sharedIds = sharedLinks.map((entry: { list_id: string }) => entry.list_id);

  let sharedLists: Array<{
    id: string;
    title: string;
    planned_date: string;
    owner_id: string;
    updated_at: string;
  }> = [];
  if (sharedIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("shopping_lists")
      .select("id, title, planned_date, owner_id, updated_at")
      .in("id", sharedIds);
    if (error) {
      throw new Error(error.message);
    }
    sharedLists = data;
  }

  const allLists = [...ownedLists, ...sharedLists];
  const allListIds = allLists.map((entry) => entry.id);

  const itemsByListId = new Map<string, StoredListItem[]>();
  if (allListIds.length > 0) {
    const { data: items, error: itemsError } = await supabaseAdmin
      .from("shopping_list_items")
      .select("id, list_id, name, quantity, notes, category, status")
      .in("list_id", allListIds)
      .order("created_at", { ascending: true });
    if (itemsError) {
      throw new Error(itemsError.message);
    }
    for (const item of items) {
      const current = itemsByListId.get(item.list_id) || [];
      current.push({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        notes: item.notes || "",
        category: item.category,
        status: item.status,
      });
      itemsByListId.set(item.list_id, current);
    }
  }

  const resultLists = allLists.map((list) => ({
    id: list.id,
    title: list.title,
    plannedDate: list.planned_date,
    items: itemsByListId.get(list.id) || [],
    ownerId: list.owner_id,
    sharedWithUserIds: [],
    updatedAt: list.updated_at,
    isOwner: list.owner_id === userId,
  }));

  const { data: historyRows, error: historyError } = await supabaseAdmin
    .from("shopping_user_item_history")
    .select("item_name_norm, weeks_in_row, total_times")
    .eq("user_id", userId);
  if (historyError) {
    throw new Error(historyError.message);
  }

  const history: HistoryShape = {};
  for (const row of historyRows) {
    history[row.item_name_norm] = {
      weeksInRow: row.weeks_in_row,
      totalTimes: row.total_times,
    };
  }

  return { lists: resultLists, history };
}

export async function saveUserState(
  userId: string,
  inputLists: Array<{ id: string; title: string; plannedDate: string; items: StoredListItem[] }>,
  inputHistory: HistoryShape
): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin() as any;
  if (inputLists.length > DB_LIMITS.maxListsPerUser) {
    throw new Error(`List limit exceeded (${DB_LIMITS.maxListsPerUser}).`);
  }

  const { data: ownedRows, error: ownedError } = await supabaseAdmin
    .from("shopping_lists")
    .select("id")
    .eq("owner_id", userId);
  if (ownedError) {
    throw new Error(ownedError.message);
  }
  const ownedIds = new Set<string>(ownedRows.map((entry: { id: string }) => entry.id));
  const submittedOwnedIds = new Set<string>();

  for (const list of inputLists) {
    if ((list.items || []).length > DB_LIMITS.maxItemsPerList) {
      throw new Error(`Item limit exceeded per list (${DB_LIMITS.maxItemsPerList}).`);
    }

    const cleanTitle = (list.title || "").slice(0, 120);
    const cleanPlannedDate = list.plannedDate || new Date().toISOString().slice(0, 10);

    const isOwned = ownedIds.has(list.id);
    if (isOwned) {
      const { error } = await supabaseAdmin
        .from("shopping_lists")
        .update({
          title: cleanTitle,
          planned_date: cleanPlannedDate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", list.id)
        .eq("owner_id", userId);
      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabaseAdmin.from("shopping_lists").insert({
        id: list.id,
        title: cleanTitle,
        planned_date: cleanPlannedDate,
        owner_id: userId,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        throw new Error(error.message);
      }
    }
    submittedOwnedIds.add(list.id);

    const { error: deleteItemsError } = await supabaseAdmin.from("shopping_list_items").delete().eq("list_id", list.id);
    if (deleteItemsError) {
      throw new Error(deleteItemsError.message);
    }

    const items = (list.items || []).map((item) => ({
      id: item.id,
      list_id: list.id,
      name: (item.name || "").slice(0, DB_LIMITS.maxItemNameLength),
      quantity: Math.max(1, item.quantity || 1),
      notes: (item.notes || "").slice(0, DB_LIMITS.maxNotesLength),
      category: item.category,
      status: item.status,
      created_at: new Date().toISOString(),
    }));

    if (items.length > 0) {
      const { error: insertItemsError } = await supabaseAdmin.from("shopping_list_items").insert(items);
      if (insertItemsError) {
        throw new Error(insertItemsError.message);
      }
    }
  }

  const toDeleteIds = [...ownedIds].filter((id) => !submittedOwnedIds.has(id));
  if (toDeleteIds.length > 0) {
    await supabaseAdmin.from("shopping_list_items").delete().in("list_id", toDeleteIds);
    await supabaseAdmin.from("shopping_list_shares").delete().in("list_id", toDeleteIds);
    const { error: deleteListsError } = await supabaseAdmin.from("shopping_lists").delete().in("id", toDeleteIds).eq("owner_id", userId);
    if (deleteListsError) {
      throw new Error(deleteListsError.message);
    }
  }

  const historyEntries = Object.entries(inputHistory).slice(0, DB_LIMITS.maxHistoryItems);
  await supabaseAdmin.from("shopping_user_item_history").delete().eq("user_id", userId);
  if (historyEntries.length > 0) {
    const payload = historyEntries.map(([itemNameNorm, value]) => ({
      user_id: userId,
      item_name_norm: itemNameNorm.slice(0, DB_LIMITS.maxItemNameLength),
      weeks_in_row: Math.max(0, value.weeksInRow || 0),
      total_times: Math.max(0, value.totalTimes || 0),
      updated_at: new Date().toISOString(),
    }));
    const { error: historyInsertError } = await supabaseAdmin.from("shopping_user_item_history").insert(payload);
    if (historyInsertError) {
      throw new Error(historyInsertError.message);
    }
  }
}

