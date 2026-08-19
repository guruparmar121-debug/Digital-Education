/* Offline support for attendance: roster cache + pending sync queue. */
import { useEffect, useState } from "react";

const ROSTER_KEY = "dep_offline_rosters";
const QUEUE_KEY = "dep_offline_queue";

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

export const sheetKey = ({ academic_year_id, date, school_id, standard }) =>
  [academic_year_id, date, school_id, standard].join("|");

export const rosterKey = ({ academic_year_id, school_id, standard }) =>
  [academic_year_id, school_id, standard].join("|");

export function cacheRoster(params, students) {
  const all = read(ROSTER_KEY, {});
  all[rosterKey(params)] = { students, cached_at: new Date().toISOString() };
  write(ROSTER_KEY, all);
}

export function getCachedRoster(params) {
  return read(ROSTER_KEY, {})[rosterKey(params)] || null;
}

export function cachedRosterCount() {
  return Object.keys(read(ROSTER_KEY, {})).length;
}

export function clearRosters() {
  localStorage.removeItem(ROSTER_KEY);
}

/** Queue one attendance batch for later sync (replaces any batch for the same sheet). */
export function queueBatch(batch) {
  const queue = read(QUEUE_KEY, []).filter((b) => sheetKey(b) !== sheetKey(batch));
  queue.push({ ...batch, queued_at: new Date().toISOString() });
  write(QUEUE_KEY, queue);
  return queue.length;
}

export const getQueue = () => read(QUEUE_KEY, []);
export const queueCount = () => read(QUEUE_KEY, []).length;
export const clearQueue = () => localStorage.removeItem(QUEUE_KEY);

export function getQueuedBatch(params) {
  return getQueue().find((b) => sheetKey(b) === sheetKey(params)) || null;
}

/** Push every queued batch to the server; keeps batches that fail. */
export async function syncQueue(api) {
  const queue = getQueue();
  if (!queue.length) return { synced: 0, saved: 0, failed: 0, pending: 0 };
  try {
    const { data } = await api.post("/attendance/sync", {
      batches: queue.map(({ queued_at, ...b }) => b),
    });
    clearQueue();
    return { synced: data.batches_synced, saved: data.records_saved, failed: 0, pending: 0 };
  } catch (e) {
    return { synced: 0, saved: 0, failed: queue.length, pending: queue.length, error: e };
  }
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return online;
}
