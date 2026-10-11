import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { NodeIO, VERSION, type Document } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { hashedName } from '../hash.ts'
import type { Recipe } from '../recipes.ts'
import { assetPath, type StageResult } from './stage.ts'

/** meshoptimizer exports no `package.json`: read it next to the resolved entry. */
const MESHOPT_VERSION = (JSON.parse(readFileSync(join(dirname(createRequire(import.meta.url).resolve('meshoptimizer')), 'package.json'), 'utf8')) as { version: string }).version

type ModelRecipe = Extract<Recipe, { kind: 'model' }>
export type Quantize = ModelRecipe['quantize']

async function io(): Promise<NodeIO> {
  await MeshoptEncoder.ready
  await MeshoptDecoder.ready
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
}

/** Named nodes, in document order: `assets.ts` removes nodes by name (the environment's `Background`). */
const nodeNames = (doc: Document): string[] =>
  doc
    .getRoot()
    .listNodes()
    .map((n) => n.getName())
    .filter(Boolean)

/**
 * Lossless-in-practice geometry compression: dedup, prune, weld (exact), then meshopt's own
 * quantize at the recipe's bits (16-bit positions and UVs: 12-bit UVs would be ¼ texel on 2048²
 * maps). The bits go to `meshopt` itself, never to a separate `quantize` first: `meshopt` re-runs
 * `quantize` with its defaults (14-bit positions, 12-bit UVs), which would quantize again on top.
 * Colours stay 16-bit, so nothing the source stores is narrowed below its own precision.
 */
export async function compressModel(input: Uint8Array, q: Quantize): Promise<{ bytes: Uint8Array; nodes: string[] }> {
  const gltf = await io()
  const doc = await gltf.readBinary(input)
  const before = nodeNames(doc)
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: q.position, quantizeTexcoord: q.texcoord, quantizeColor: 16 }),
  )
  const bytes = await gltf.writeBinary(doc)
  // read back through the decoder: the file must round-trip, and no named node may be lost or renamed
  const after = new Set(nodeNames(await gltf.readBinary(bytes)))
  const lost = before.filter((n) => !after.has(n))
  if (lost.length) throw new Error(`model lost named nodes: ${lost.join(', ')}`)
  return { bytes, nodes: before }
}

/** One hashed meshopt GLB; the manifest value is its URL. */
export async function modelStage(recipe: ModelRecipe, input: Uint8Array): Promise<StageResult> {
  const { bytes, nodes } = await compressModel(input, recipe.quantize)
  const path = assetPath(hashedName(recipe.source, bytes))
  return {
    outputs: [{ path, bytes, label: `glb meshopt p${recipe.quantize.position} t${recipe.quantize.texcoord}` }],
    value: path,
    parity: { quantize: recipe.quantize, nodes },
    tools: { 'gltf-transform': VERSION.replace(/^v/, ''), meshoptimizer: MESHOPT_VERSION },
  }
}
