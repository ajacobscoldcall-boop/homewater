import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ProgramKeeper } from '../../src/render/programKeeper';

/** A stand-in for WebGLRenderer: only `properties.get(material).currentProgram` is read. */
function fakeRenderer(programOf: Map<THREE.Material, string>) {
  return { properties: { get: (m: THREE.Material) => (programOf.has(m) ? { currentProgram: { cacheKey: programOf.get(m) } } : {}) } } as unknown as THREE.WebGLRenderer;
}

function tracked(): { mat: THREE.MeshBasicMaterial; disposed: () => number } {
  const mat = new THREE.MeshBasicMaterial();
  let n = 0;
  mat.addEventListener('dispose', () => n++);
  return { mat, disposed: () => n };
}

describe('ProgramKeeper', () => {
  it('keeps the last material of a compiled program, and disposes the rest', () => {
    const a = tracked();
    const b = tracked();
    const keeper = new ProgramKeeper(fakeRenderer(new Map([[a.mat, 'bear'], [b.mat, 'bear']])));
    keeper.release(a.mat);
    keeper.release(b.mat);
    expect(a.disposed()).toBe(0);
    expect(b.disposed()).toBe(1);
    expect(keeper.size).toBe(1);
  });

  it('keeps a shared material released by several meshes', () => {
    const a = tracked();
    const keeper = new ProgramKeeper(fakeRenderer(new Map([[a.mat, 'bear']])));
    keeper.release(a.mat);
    keeper.release(a.mat);
    keeper.release(a.mat);
    expect(a.disposed()).toBe(0);
  });

  it('disposes materials that were never drawn', () => {
    const a = tracked();
    const keeper = new ProgramKeeper(fakeRenderer(new Map()));
    keeper.release(a.mat);
    expect(a.disposed()).toBe(1);
    expect(keeper.size).toBe(0);
  });

  it('keeps one material per program', () => {
    const mats = ['fish', 'bear', 'fish', 'shadow', 'bear'].map((k) => ({ ...tracked(), k }));
    const keeper = new ProgramKeeper(fakeRenderer(new Map(mats.map((m) => [m.mat, m.k]))));
    for (const m of mats) keeper.release(m.mat);
    expect(keeper.size).toBe(3);
    expect(mats.map((m) => m.disposed())).toEqual([0, 0, 1, 0, 1]);
  });
});
