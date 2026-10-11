import { ImageBitmapLoader, Mesh, MeshBasicMaterial, SRGBColorSpace, Texture, type Group, type Material } from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MODEL_SCALE } from './config'
import type { DeskAssetUrls } from './desk-assets'

export interface LoadedDesk {
  objects: Group[]
  dispose(): void
}

const isMesh = (o: unknown): o is Mesh => (o as Mesh).isMesh === true

/** Decodes off the main thread (createImageBitmap) in a window or a worker; glTF UVs need no flip. */
const bitmaps = () => new ImageBitmapLoader().setOptions({ imageOrientation: 'none', premultiplyAlpha: 'none' })

/**
 * Loads every (model, texture) pair in parallel and gives each model one unlit baked material,
 * the reference's trick for a lit-looking scene with no lights. Rejects if anything fails.
 */
export async function loadDesk(assets: DeskAssetUrls): Promise<LoadedDesk> {
  const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const images = bitmaps()
  const parts = await Promise.all(
    assets.map(async (asset) => {
      const [model, bitmap] = await Promise.all([gltf.loadAsync(asset.model), images.loadAsync(asset.texture) as Promise<ImageBitmap>])
      return { asset, model, bitmap }
    }),
  )

  const materials: MeshBasicMaterial[] = []
  const objects = parts.map(({ asset, model, bitmap }) => {
    const texture = new Texture(bitmap)
    texture.flipY = false // glTF UVs; an ImageBitmap is never flipped at upload anyway
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
    const material = new MeshBasicMaterial({ map: texture })
    materials.push(material)
    const root = model.scene
    for (const name of asset.drop ?? []) root.getObjectByName(name)?.removeFromParent()
    root.traverse((o) => {
      if (!isMesh(o)) return
      const old = o.material as Material | Material[]
      for (const m of Array.isArray(old) ? old : [old]) m.dispose()
      o.material = material
    })
    // on the root, not the meshes: quantized meshes carry their own dequantization scale and offset
    root.scale.setScalar(MODEL_SCALE)
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
      // three never closes a texture's ImageBitmap; its decoded pixels stay allocated until this
      for (const { bitmap } of parts) bitmap.close()
    },
  }
}
