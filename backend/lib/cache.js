// TTL cache with two properties that matter under festival load:
//
//  1. Single-flight. A plain `if (expired) refetch()` cache has a stampede bug:
//     the moment the TTL lapses, every concurrent request misses at once and
//     they *all* hit the database. At 4k attendees that turns one query into
//     hundreds, on a 30s heartbeat. Here the first miss does the work and every
//     other caller awaits that same promise.
//
//  2. Stale-on-error. If the producer throws (DB blip, failover) but we still
//     hold a recent value, serve it. A leaderboard that's a minute stale beats
//     an error page — the attendee is standing in front of the booth.
//
// Keys come from the URL, so entries are capped: an unbounded Map keyed by
// attacker-supplied slugs is a memory leak.
function createCache({ ttlMs, staleMs = 5 * 60 * 1000, maxEntries = 500 }) {
  const entries = new Map();
  const inflight = new Map();

  function set(key, value) {
    // Map iterates in insertion order, so the first key is the oldest.
    if (entries.size >= maxEntries && !entries.has(key)) {
      entries.delete(entries.keys().next().value);
    }
    entries.set(key, { value, at: Date.now() });
  }

  async function get(key, producer) {
    const hit = entries.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;

    const pending = inflight.get(key);
    if (pending) return pending;

    const promise = (async () => {
      try {
        const value = await producer();
        set(key, value);
        return value;
      } catch (err) {
        if (hit && Date.now() - hit.at < staleMs) {
          console.warn(`[cache] producer failed for "${key}", serving stale:`, err.message);
          return hit.value;
        }
        throw err;
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, promise);
    return promise;
  }

  return {
    get,
    clear: () => entries.clear(),
    delete: (key) => entries.delete(key),
    get size() { return entries.size; }
  };
}

module.exports = { createCache };
