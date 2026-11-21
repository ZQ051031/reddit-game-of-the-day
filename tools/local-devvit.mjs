import { AsyncLocalStorage } from 'node:async_hooks';

export const requests = new AsyncLocalStorage();
export const context = new Proxy(
  {},
  { get: (_, key) => requests.getStore()?.[key] }
);
export const reddit = {
  getCurrentUsername: async () => context.userId ?? null,
};
const hashes = new Map();
const sorted = new Map();
const strings = new Map();
const hash = (key) => {
  if (!hashes.has(key)) hashes.set(key, new Map());
  return hashes.get(key);
};
const members = (key) =>
  [...(sorted.get(key) ?? new Map())]
    .map(([member, score]) => ({ member, score }))
    .sort((a, b) => a.score - b.score || a.member.localeCompare(b.member));

export const redis = {
  hGet: async (key, field) => hash(key).get(field),
  hGetAll: async (key) => Object.fromEntries(hash(key)),
  hSetNX: async (key, field, value) => {
    if (hash(key).has(field)) return 0;
    hash(key).set(field, value);
    return 1;
  },
  hSet: async (key, values) => {
    for (const [f, v] of Object.entries(values)) hash(key).set(f, v);
    return 1;
  },
  expire: async () => {},
  get: async (key) => strings.get(key),
  set: async (key, value) => {
    strings.set(key, value);
    return 'OK';
  },
  zAdd: async (key, ...entries) => {
    if (!sorted.has(key)) sorted.set(key, new Map());
    for (const { member, score } of entries) sorted.get(key).set(member, score);
    return entries.length;
  },
  zCard: async (key) => members(key).length,
  zRange: async (key, start, stop) =>
    members(key).slice(start, stop === -1 ? undefined : stop + 1),
  zRank: async (key, name) => {
    const rank = members(key).findIndex((m) => m.member === name);
    return rank < 0 ? undefined : rank;
  },
  zScore: async (key, name) => sorted.get(key)?.get(name),
};
