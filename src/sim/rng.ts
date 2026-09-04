// The simulator's randomness. SIMULATOR.md §14, verbatim:
//
//     u = splitmix64( hash(seed, stream_name, entity_id, tick_index) ) / 2^53
//
// KEYED, not sequential. Every draw is ADDRESSED by (stream, entity, tick) rather than pulled off
// a running sequence, and §14's reason is the one that matters here: a sequential stream means
// pausing one ad shifts every subsequent draw for every other ad, so a lever reshuffles the whole
// world instead of changing one part of it.
//
// Two properties fall out, and B11 leans on both. Ids are DERIVED — `event_id = hash(seed, 'eid',
// ad_id, tick, i)` — so the emitter needs no memory of what it has sent (DESIGN §3.3), and a
// re-emission after a restart is byte-identical, which is what makes it `duplicate_identical`
// rather than a second event. The pending-conversion queue becomes derivable too (§15.3b, B34).

const MASK = (1n << 64n) - 1n;

/**
 * FNV-1a over the key's UTF-8 bytes. This is the `hash(...)` of §14's formula and nothing more:
 * its job is to fold the key parts into 64 bits deterministically and portably. It supplies no
 * avalanche at all — adjacent tick indices differ in one low byte — which is exactly why the
 * result goes through splitmix64 before anyone reads a number out of it.
 */
function fnv1a64(key: string): bigint {
  let h = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(key)) {
    h = ((h ^ BigInt(byte)) * 0x100000001b3n) & MASK;
  }
  return h;
}

/** splitmix64's finalising mix, reference constants. §14 names it; this is it. */
function splitmix64(x: bigint): bigint {
  let z = (x + 0x9e3779b97f4a7c15n) & MASK;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return z ^ (z >> 31n);
}

/**
 * The 64-bit keyed value behind both draws and ids.
 *
 * Parts are joined with NUL, which cannot occur in an id or a stream name, so `('a_1', 2)` and
 * `('a_12', '')` cannot key to the same draw. Joining with an ordinary separator would make that
 * collision possible and silent — two entities sharing one random stream reads as correlated
 * demand, not as a bug.
 */
function keyed(seed: string, stream: string, parts: readonly (string | number)[]): bigint {
  return splitmix64(fnv1a64([seed, stream, ...parts].join('\u0000')));
}

/**
 * A uniform draw in [0, 1). §14's `/ 2^53` is the whole of it: the top 53 bits are what an IEEE
 * double holds exactly, so this uses the entire mantissa and invents no precision below it.
 */
export function draw(
  seed: string,
  stream: string,
  ...parts: readonly (string | number)[]
): number {
  return Number(keyed(seed, stream, parts) >> 11n) / 2 ** 53;
}

/**
 * A derived id, as 16 hex characters. Opaque on purpose: an id that encoded its tick would invite
 * reading state back out of it, and B55's trace resolves an `event_id` against the log rather than
 * by parsing it.
 */
export function derivedId(
  seed: string,
  stream: string,
  ...parts: readonly (string | number)[]
): string {
  return keyed(seed, stream, parts).toString(16).padStart(16, '0');
}
