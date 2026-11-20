/**
 * Keeps compiled shader programs alive while the materials that use them come and go.
 *
 * three.js deletes a shader program as soon as the last material using it is
 * disposed, and compiles it again for the next such material. Entities that come
 * and go (a bear, a rival, a lure) and the alevin's shrinking yolk sac (a new fish
 * mesh every few hundredths) made the same programs compile over and over: under
 * software GL each compile stalls a frame for 100 ms or more.
 *
 * release() disposes a material unless it is the last one holding its program;
 * that one is kept (never drawn) so the program stays compiled. At most one
 * material is kept per distinct program, so memory stays bounded.
 */
import type * as THREE from 'three';

interface ProgramRef {
  cacheKey: string;
}

export class ProgramKeeper {
  private readonly kept = new Map<string, THREE.Material>();

  constructor(private readonly renderer: THREE.WebGLRenderer) {}

  /** Dispose a material, or keep it if it is the only thing holding a compiled program. */
  release(material: THREE.Material): void {
    const program = (this.renderer.properties.get(material) as { currentProgram?: ProgramRef }).currentProgram;
    if (program) {
      const kept = this.kept.get(program.cacheKey);
      // Several meshes can share a material (an animal's body and head): released more than once.
      if (kept === material) return;
      if (!kept) {
        this.kept.set(program.cacheKey, material);
        return;
      }
    }
    material.dispose();
  }

  /** How many materials are being kept (tests and the perf notes). */
  get size(): number {
    return this.kept.size;
  }
}
