// Upslide: deterministic daily ice-sliding puzzles.
// Pure, dependency-free so it runs in the client, the server and node:test.

export type Dir = 'U' | 'D' | 'L' | 'R';
export type Action = Dir | 'Z' | 'X';

export const ICE = 0;
export const ROCK = 1;
export const MOSS = 2;
export type Tile = typeof ICE | typeof ROCK | typeof MOSS;

export type Puzzle = {
  stage: number;
  name: string;
  width: number;
  height: number;
  tiles: Tile[];
  start: number;
  stars: number[];
  par: number;
  solution: Dir[];
};

export type DailyChallenge = {
  dayKey: string;
  number: number;
  stages: Puzzle[];
};

export type StageConfig = {
  name: string;
  width: number;
  height: number;
  stars: number;
  rocks: [number, number];
  moss: [number, number];
  par: [number, number];
};

export const STAGES: StageConfig[] = [
  {
    name: 'Warm-up',
    width: 6,
    height: 6,
    stars: 4,
    rocks: [5, 8],
    moss: [0, 0],
    par: [5, 7],
  },
  {
    name: 'Tricky',
    width: 7,
    height: 7,
    stars: 5,
    rocks: [7, 11],
    moss: [1, 2],
    par: [8, 11],
  },
  {
    name: 'Brutal',
    width: 8,
    height: 8,
    stars: 6,
    rocks: [9, 14],
    moss: [2, 3],
    par: [11, 15],
  },
];

export const DIRS: Dir[] = ['U', 'D', 'L', 'R'];
const DELTA: Record<Dir, [number, number]> = {
  U: [0, -1],
  D: [0, 1],
  L: [-1, 0],
  R: [1, 0],
};

// ---------- RNG ----------

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function shuffle<T>(rng: () => number, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = a;
  }
  return arr;
}

// ---------- Dates ----------

export const EPOCH_DAY = '2026-11-20';
const DAY_MS = 86_400_000;

export function dayKeyFromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isDayKey(s: unknown): s is string {
  return (
    typeof s === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) &&
    dayKeyFromDate(new Date(`${s}T00:00:00Z`)) === s
  );
}

function dayMs(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00Z`);
}

export function addDays(dayKey: string, n: number): string {
  return dayKeyFromDate(new Date(dayMs(dayKey) + n * DAY_MS));
}

export function dayNumber(dayKey: string): number {
  return Math.round((dayMs(dayKey) - dayMs(EPOCH_DAY)) / DAY_MS) + 1;
}

export function msUntilNextDay(now: number): number {
  return DAY_MS - (now % DAY_MS);
}

export function formatDay(dayKey: string): string {
  return new Date(dayMs(dayKey)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// ---------- Mechanics ----------

export type SlideResult = { end: number; path: number[] };

export function slide(
  p: Pick<Puzzle, 'width' | 'height' | 'tiles'>,
  from: number,
  dir: Dir
): SlideResult {
  const [dx, dy] = DELTA[dir];
  let x = from % p.width;
  let y = Math.floor(from / p.width);
  const path: number[] = [];
  for (;;) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= p.width || ny >= p.height) break;
    const i = ny * p.width + nx;
    if (p.tiles[i] === ROCK) break;
    x = nx;
    y = ny;
    path.push(i);
    if (p.tiles[i] === MOSS) break;
  }
  return { end: path.length ? path[path.length - 1]! : from, path };
}

function starMask(stars: number[], path: number[]): number {
  let mask = 0;
  for (const c of path) {
    const s = stars.indexOf(c);
    if (s >= 0) mask |= 1 << s;
  }
  return mask;
}

/** Breadth-first search over (position, collected stars). Returns an optimal move list or null. */
export function solve(
  p: Pick<Puzzle, 'width' | 'height' | 'tiles' | 'start' | 'stars'>
): Dir[] | null {
  const n = p.width * p.height;
  const k = p.stars.length;
  const full = (1 << k) - 1;
  const ends = new Int16Array(n * 4);
  const masks = new Int32Array(n * 4);
  for (let c = 0; c < n; c++) {
    if (p.tiles[c] === ROCK) continue;
    for (let d = 0; d < 4; d++) {
      const r = slide(p, c, DIRS[d]!);
      ends[c * 4 + d] = r.end;
      masks[c * 4 + d] = starMask(p.stars, r.path);
    }
  }
  const total = n << k;
  const prev = new Int32Array(total).fill(-1);
  const prevDir = new Int8Array(total);
  const startState = (p.start << k) | 0;
  prev[startState] = startState;
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  queue[tail++] = startState;
  while (head < tail) {
    const s = queue[head++]!;
    const pos = s >> k;
    const mask = s & full;
    for (let d = 0; d < 4; d++) {
      const e = ends[pos * 4 + d]!;
      if (e === pos) continue;
      const nm = mask | masks[pos * 4 + d]!;
      const ns = (e << k) | nm;
      if (prev[ns] !== -1) continue;
      prev[ns] = s;
      prevDir[ns] = d;
      if (nm === full) {
        const out: Dir[] = [];
        let cur = ns;
        while (cur !== startState) {
          out.push(DIRS[prevDir[cur]!]!);
          cur = prev[cur]!;
        }
        return out.reverse();
      }
      queue[tail++] = ns;
    }
  }
  return null;
}

// ---------- Generation ----------

export function generateStage(dayKey: string, stage: number): Puzzle {
  const cfg = STAGES[stage]!;
  const rng = mulberry32(hashString(`upslide|${dayKey}|${stage}`));
  const n = cfg.width * cfg.height;
  let best: Puzzle | null = null;
  let bestDist = Infinity;

  for (let attempt = 0; attempt < 400; attempt++) {
    const tiles: Tile[] = new Array<Tile>(n).fill(ICE);
    const cells = shuffle(
      rng,
      Array.from({ length: n }, (_, i) => i)
    );
    const rocks = randInt(rng, cfg.rocks[0], cfg.rocks[1]);
    const moss = randInt(rng, cfg.moss[0], cfg.moss[1]);
    let ci = 0;
    for (let r = 0; r < rocks; r++) tiles[cells[ci++]!] = ROCK;
    for (let m = 0; m < moss; m++) tiles[cells[ci++]!] = MOSS;
    const start = cells[ci]!;
    const base = { width: cfg.width, height: cfg.height, tiles };

    // Every cell the puck can ever slide across is a candidate star spot.
    const seen = new Set<number>([start]);
    const touched = new Set<number>();
    const frontier = [start];
    while (frontier.length) {
      const c = frontier.pop()!;
      for (const d of DIRS) {
        const r = slide(base, c, d);
        for (const t of r.path) if (t !== start) touched.add(t);
        if (!seen.has(r.end)) {
          seen.add(r.end);
          frontier.push(r.end);
        }
      }
    }
    const candidates = [...touched].filter((c) => tiles[c] === ICE);
    if (candidates.length < cfg.stars + 4) continue;
    const stars = shuffle(rng, candidates)
      .slice(0, cfg.stars)
      .sort((a, b) => a - b);
    const solution = solve({ ...base, start, stars });
    if (!solution) continue;

    const puzzle: Puzzle = {
      stage,
      name: cfg.name,
      width: cfg.width,
      height: cfg.height,
      tiles,
      start,
      stars,
      par: solution.length,
      solution,
    };
    const [lo, hi] = cfg.par;
    if (solution.length >= lo && solution.length <= hi) return puzzle;
    const dist =
      solution.length < lo ? lo - solution.length : solution.length - hi;
    if (dist < bestDist) {
      best = puzzle;
      bestDist = dist;
    }
  }
  if (!best) throw new Error(`Could not generate stage ${stage} for ${dayKey}`);
  return best;
}

const challengeCache = new Map<string, DailyChallenge>();

export function getDailyChallenge(dayKey: string): DailyChallenge {
  const cached = challengeCache.get(dayKey);
  if (cached) return cached;
  const challenge: DailyChallenge = {
    dayKey,
    number: dayNumber(dayKey),
    stages: STAGES.map((_, i) => generateStage(dayKey, i)),
  };
  if (challengeCache.size > 64) challengeCache.clear();
  challengeCache.set(dayKey, challenge);
  return challenge;
}

// ---------- Play state (shared by client UI and server replay validation) ----------

export type Snapshot = { pos: number; mask: number };
export type StageState = {
  pos: number;
  mask: number;
  moves: number;
  history: Snapshot[];
  actions: string;
  lastPath: number[];
  solved: boolean;
};

export function initialState(p: Puzzle): StageState {
  return {
    pos: p.start,
    mask: 0,
    moves: 0,
    history: [],
    actions: '',
    lastPath: [],
    solved: false,
  };
}

export function fullMask(p: Puzzle): number {
  return (1 << p.stars.length) - 1;
}

/** Applies an action. Returns null when the action has no effect (blocked move, nothing to undo, already solved). */
export function applyAction(
  p: Puzzle,
  s: StageState,
  a: Action
): StageState | null {
  if (s.solved) return null;
  if (a === 'Z') {
    const last = s.history[s.history.length - 1];
    if (!last) return null;
    return {
      ...s,
      ...last,
      history: s.history.slice(0, -1),
      actions: s.actions + a,
      lastPath: [],
    };
  }
  if (a === 'X') {
    if (s.pos === p.start && s.mask === 0) return null;
    return {
      ...s,
      pos: p.start,
      mask: 0,
      history: [],
      actions: s.actions + a,
      lastPath: [],
    };
  }
  const r = slide(p, s.pos, a);
  if (r.end === s.pos) return null;
  const mask = s.mask | starMask(p.stars, r.path);
  return {
    pos: r.end,
    mask,
    moves: s.moves + 1,
    history: [...s.history, { pos: s.pos, mask: s.mask }],
    actions: s.actions + a,
    lastPath: r.path,
    solved: mask === fullMask(p),
  };
}

export type ReplayResult =
  { ok: true; moves: number } | { ok: false; error: string };

/** Replays a recorded action string; valid only if every action has an effect and the stage ends solved. */
export function replayStage(p: Puzzle, actions: string): ReplayResult {
  if (actions.length > 2000) return { ok: false, error: 'too many actions' };
  let s = initialState(p);
  for (const ch of actions) {
    if (!'UDLRZX'.includes(ch)) return { ok: false, error: `bad action ${ch}` };
    const next = applyAction(p, s, ch as Action);
    if (!next) return { ok: false, error: 'ineffective action' };
    s = next;
  }
  if (!s.solved) return { ok: false, error: 'stage not solved' };
  return { ok: true, moves: s.moves };
}

// ---------- Scoring ----------

export function starRating(moves: number, par: number): 1 | 2 | 3 {
  if (moves <= par) return 3;
  if (moves <= par + 2) return 2;
  return 1;
}

export type StageScore = { moves: number; par: number; stars: 1 | 2 | 3 };

export function shareText(opts: {
  number: number;
  stages: StageScore[];
  timeMs: number;
  streak: number;
}): string {
  const moves = opts.stages.reduce((a, s) => a + s.moves, 0);
  const par = opts.stages.reduce((a, s) => a + s.par, 0);
  const rows = opts.stages
    .map(
      (s) =>
        `${'⭐'.repeat(s.stars)}${'▫️'.repeat(3 - s.stars)} ${s.moves}/${s.par}`
    )
    .join('\n');
  const streak = opts.streak > 1 ? `\n🔥 ${opts.streak}-day streak` : '';
  return `Upslide #${opts.number} 🧊 ${moves} moves (par ${par}) in ${formatTime(opts.timeMs)}\n${rows}${streak}`;
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
