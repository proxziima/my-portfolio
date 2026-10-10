/**
 * The asset pipeline (spec §4.5): turns each recipe's committed source under `assets-src/` into
 * hashed outputs under `public/assets/`, then writes the typed manifest (`lib/assets/manifest.ts`)
 * and the lock (`assets-src/manifest.lock.json`) that `--check` verifies without any encoder.
 *
 *   bun scripts/assets/build.ts [--only <id-prefix>]… [--force]
 *   bun scripts/assets/build.ts --check
 *
 * A recipe whose source, recipe and outputs are unchanged is skipped unless `--force`.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { sha256 } from './hash.ts'
import { checkLock, LOCK_FILE, outputFile, recipeHash, writeManifest, type Lock } from './manifest.ts'
import { RECIPES, SOURCE_DIR, type Recipe } from './recipes.ts'
import { copyStage } from './stages/copy.ts'
import { imageStage, textureStage } from './stages/image.ts'
import { modelStage } from './stages/model.ts'
import type { StageResult } from './stages/stage.ts'

type Stage = (recipe: Recipe, bytes: Uint8Array) => Promise<StageResult>

/** Kinds without a stage yet fail loudly when asked for, rather than writing nothing. */
const STAGES: Partial<Record<Recipe['kind'], Stage>> = {
  copy: async (recipe, bytes) => copyStage(recipe.source, bytes),
  image: (recipe, bytes) => imageStage(recipe as Extract<Recipe, { kind: 'image' }>, bytes),
  texture: (recipe, bytes) => textureStage(recipe as Extract<Recipe, { kind: 'texture' }>, bytes),
  model: (recipe, bytes) => modelStage(recipe as Extract<Recipe, { kind: 'model' }>, bytes),
}

const { values } = parseArgs({
  options: {
    only: { type: 'string', multiple: true },
    check: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  },
})

const readSource = (source: string): Uint8Array => readFileSync(join(SOURCE_DIR, source))
const lock: Lock = existsSync(LOCK_FILE) ? (JSON.parse(readFileSync(LOCK_FILE, 'utf8')) as Lock) : {}
const selected = RECIPES.filter((r) => !values.only?.length || values.only.some((p) => r.id === p || r.id.startsWith(p.endsWith('.') ? p : `${p}.`)))
if (!selected.length) throw new Error(`no recipe matches --only ${values.only?.join(', ')}`)

if (values.check) {
  const problems = checkLock(selected, lock, readSource)
  for (const p of problems) console.error(`${p.id}: ${p.problem}`)
  console.log(problems.length ? `assets:check: ${problems.length} problem(s); run bun run assets:build` : `assets:check: ${selected.length} recipe(s) up to date`)
  process.exit(problems.length ? 1 : 0)
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`
const rows: string[] = []

// recipes removed from RECIPES leave no orphaned outputs behind
if (!values.only?.length) {
  for (const id of Object.keys(lock)) {
    if (RECIPES.some((r) => r.id === id)) continue
    for (const o of lock[id]!.outputs) if (existsSync(outputFile(o))) unlinkSync(outputFile(o))
    delete lock[id]
    rows.push(`${id}: removed`)
  }
}

for (const recipe of selected) {
  const bytes = readSource(recipe.source)
  const source = sha256(bytes)
  const recipeSha = recipeHash(recipe)
  const previous = lock[recipe.id]
  if (!values.force && previous?.source === source && previous.recipe === recipeSha && previous.outputs.every((o) => existsSync(outputFile(o)))) {
    rows.push(`${recipe.id}: up to date`)
    continue
  }
  const stage = STAGES[recipe.kind]
  if (!stage) throw new Error(`${recipe.id}: no stage for kind '${recipe.kind}' yet`)
  const result = await stage(recipe, bytes)
  const outputs = result.outputs.map((o) => o.path)
  for (const o of result.outputs) {
    const file = outputFile(o.path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, o.bytes)
  }
  for (const o of previous?.outputs ?? []) if (!outputs.includes(o) && existsSync(outputFile(o))) unlinkSync(outputFile(o))
  lock[recipe.id] = { source, recipe: recipeSha, tools: result.tools ?? {}, outputs, value: result.value, ...(result.parity === undefined ? {} : { parity: result.parity }) }
  // written per recipe, so an interrupted run keeps what it finished
  writeManifest(RECIPES, lock)
  rows.push(`${recipe.id}: ${kb(bytes.byteLength)} → ${result.outputs.map((o) => `${o.label ?? o.path.split('.').at(-1)} ${kb(o.bytes.byteLength)}`).join(', ')}`)
}

writeManifest(RECIPES, lock)
console.log(rows.join('\n'))
