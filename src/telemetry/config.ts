/**
 * Play log tuning. Bookkeeping, not simulation, so it lives here and not in
 * params.json.
 */
export const PLAYLOG = {
  /** localStorage keys: the log itself and the on/off switch. */
  storageKey: 'homewater.playlog',
  enabledKey: 'homewater.playlog.on',
  /** Seconds of stage time between position samples. */
  sampleEvery: 1,
  /** Samples kept per stage attempt; past this the trace is thinned to every other sample and the interval doubles. */
  maxSamples: 900,
  /** Warning and near-miss times kept per attempt (counts keep going past this). */
  maxMoments: 200,
  /** Lives kept; the oldest go first. */
  maxLives: 60,
  /** Size cap for the stored log, in characters of JSON (localStorage holds about 5 million). */
  maxChars: 2_000_000,
  /** A frame gap longer than this (seconds) is a pause, not play. */
  maxFrameGap: 0.25,
  /** Wall-clock seconds between saves of an attempt in progress (an attempt's end always saves). */
  flushEvery: 15,
} as const;
