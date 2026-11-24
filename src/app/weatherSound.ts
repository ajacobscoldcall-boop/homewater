/**
 * The sound of the weather: one hook, called every frame from App with the
 * renderer's weather (src/render/weather.ts: overcast, rain, wind, ice, season).
 *
 * A stub for the sound work (src/audio): rain hissing on the surface above,
 * wind, the muffled quiet under ice. It does nothing yet; fill it in by passing
 * the weather on to the audio engine, e.g. `audio.weather(wx)`.
 */
import type { AudioEngine } from '../audio/engine';
import type { Weather } from '../render/weather';

export function weatherSound(_audio: AudioEngine, _wx: Weather): void {
  // Intentionally empty until the sound session adds rain and wind to the ambience.
}
