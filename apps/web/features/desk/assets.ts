import { Mesh, MeshBasicMaterial, SRGBColorSpace, TextureLoader, type Group, type Material } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MODEL_SCALE, type DeskAsset } from './config'

export interface LoadedDesk {
  objects: Group[]
  dispose(): void
}

const isMesh = (o: unknown): o is Mesh => (o as Mesh).isMesh === true

/**
 * Loads every (model, texture) pair in parallel and gives each model one unlit baked material,
 * the reference's trick for a lit-looking scene with no lights. Rejects if anything fails.
 */
export async function loadDesk(assets: readonly DeskAsset[]): Promise<LoadedDesk> {
  const gltf = new GLTFLoader()
  const textures = new TextureLoader()
  const parts = await Promise.all(
    assets.map(async (asset) => {
      const [model, texture] = await Promise.all([gltf.loadAsync(asset.model), textures.loadAsync(asset.texture)])
      return { asset, model, texture }
    }),
  )

  const materials: MeshBasicMaterial[] = []
  const objects = parts.map(({ asset, model, texture }) => {
    texture.flipY = false // glTF UVs
    texture.colorSpace = SRGBColorSpace
    const material = new MeshBasicMaterial({ map: texture })
    materials.push(material)
    const root = model.scene
    for (const name of asset.drop ?? []) root.getObjectByName(name)?.removeFromParent()
    root.traverse((o) => {
      if (!isMesh(o)) return
      const old = o.material as Material | Material[]
      for (const m of Array.isArray(old) ? old : [old]) m.dispose()
      o.material = material
      o.scale.setScalar(MODEL_SCALE)
    })
    return root
  })

  return {
    objects,
    dispose() {
      for (const root of objects) root.traverse((o) => { if (isMesh(o)) o.geometry.dispose() })
      for (const m of materials) {
        m.map?.dispose()
        m.dispose()
      }
    },
  }
}
