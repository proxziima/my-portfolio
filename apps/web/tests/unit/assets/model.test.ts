import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { describe, expect, it } from 'vitest'
import { compressModel } from '@/scripts/assets/stages/model'

/** A strip of quads with irregular UVs in [0,1] and positions spanning a few units, as named root nodes. */
function sample(): { doc: Document; uvs: Float32Array; positions: Float32Array } {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const n = 64
  const positions = new Float32Array(n * 3)
  const uvs = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    positions.set([(i % 8) * 0.37 - 1.3, Math.floor(i / 8) * 0.29, Math.sin(i) * 0.5], i * 3)
    uvs.set([((i * 7919) % 1000) / 999, ((i * 104729) % 1000) / 999], i * 2)
  }
  const indices = new Uint16Array(Array.from({ length: n - 2 }, (_, i) => [i, i + 1, i + 2]).flat())
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uvs).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
  const scene = doc.createScene()
  for (const name of ['desk', 'Background']) scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim.clone())))
  return { doc, uvs, positions }
}

async function readBack(bytes: Uint8Array): Promise<Document> {
  await MeshoptDecoder.ready
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).readBinary(bytes)
}

/** Largest distance from each source value to its nearest decoded value: welding and reordering change the order, not the set. */
function maxNearest(source: Float32Array, decoded: number[][], size: number): number {
  let worst = 0
  for (let i = 0; i < source.length; i += size) {
    let best = Infinity
    for (const d of decoded) best = Math.min(best, Math.max(...d.map((v, k) => Math.abs(v - source[i + k]!))))
    worst = Math.max(worst, best)
  }
  return worst
}

describe('compressModel', () => {
  it('writes meshopt-compressed, quantized geometry that keeps every named node', async () => {
    const { doc } = sample()
    const input = await new NodeIO().writeBinary(doc)
    const { bytes, nodes } = await compressModel(input, { position: 16, texcoord: 16 })
    const out = await readBack(bytes)
    expect(out.getRoot().listExtensionsUsed().map((e) => e.extensionName).sort()).toEqual(['EXT_meshopt_compression', 'KHR_mesh_quantization'])
    expect(out.getRoot().listNodes().map((n) => n.getName())).toEqual(expect.arrayContaining(['desk', 'Background']))
    expect(nodes).toEqual(['desk', 'Background'])
  })

  it('keeps the recipe bits: UVs within a 16-bit step, not meshopt’s default 12', async () => {
    const { doc, uvs, positions } = sample()
    const { bytes } = await compressModel(await new NodeIO().writeBinary(doc), { position: 16, texcoord: 16 })
    const out = await readBack(bytes)
    const node = out.getRoot().listNodes().find((n) => n.getName() === 'desk')!
    const prim = node.getMesh()!.listPrimitives()[0]!
    const uv = prim.getAttribute('TEXCOORD_0')!
    const pos = prim.getAttribute('POSITION')!
    expect(uv.getComponentType()).toBe(5123) // UNSIGNED_SHORT
    const decodedUv = Array.from({ length: uv.getCount() }, (_, i) => uv.getElement(i, []))
    expect(maxNearest(uvs, decodedUv, 2)).toBeLessThanOrEqual(0.5 / 65535 + 1e-7)
    // positions come back through the node's dequantization transform
    const m = node.getWorldMatrix()
    const decodedPos = Array.from({ length: pos.getCount() }, (_, i) => {
      const [x, y, z] = pos.getElement(i, [0, 0, 0])
      return [0, 1, 2].map((r) => m[r]! * x + m[4 + r]! * y + m[8 + r]! * z + m[12 + r]!)
    })
    const extent = 2 * Math.max(...[0, 1, 2].map((a) => Math.max(...[...positions].filter((_, i) => i % 3 === a)) - Math.min(...[...positions].filter((_, i) => i % 3 === a))))
    expect(maxNearest(positions, decodedPos, 3)).toBeLessThanOrEqual(extent / 32767)
  })
})
