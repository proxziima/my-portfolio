import { SRGBColorSpace, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const loaders = vi.hoisted(() => ({
  decoder: { name: 'MeshoptDecoder' },
  meshopt: [] as unknown[],
  models: [] as string[],
  images: [] as string[],
  imageOptions: [] as unknown[],
  bitmaps: [] as Array<{ url: string; close: ReturnType<typeof vi.fn> }>,
}))

vi.mock('three/addons/libs/meshopt_decoder.module.js', () => ({ MeshoptDecoder: loaders.decoder }))

vi.mock('three/addons/loaders/GLTFLoader.js', async () => {
  const three = await vi.importActual<typeof import('three')>('three')
  /** Each model: a root with one named mesh per URL, plus a `Background` the environment drops; the mesh carries a dequantization transform. */
  class GLTFLoader {
    setMeshoptDecoder(decoder: unknown) {
      loaders.meshopt.push(decoder)
      return this
    }
    async loadAsync(url: string) {
      loaders.models.push(url)
      const scene = new three.Group()
      for (const name of [url, 'Background']) {
        const mesh = new three.Mesh(new three.BoxGeometry(), new three.MeshStandardMaterial())
        mesh.name = name
        mesh.position.set(1, 2, 3)
        mesh.scale.setScalar(0.5)
        scene.add(mesh)
      }
      return { scene }
    }
  }
  return { GLTFLoader }
})

vi.mock('three', async () => {
  const three = await vi.importActual<typeof import('three')>('three')
  class ImageBitmapLoader {
    setOptions(options: unknown) {
      loaders.imageOptions.push(options)
      return this
    }
    async loadAsync(url: string) {
      loaders.images.push(url)
      const bitmap = { url, width: 2048, height: 2048, close: vi.fn() }
      loaders.bitmaps.push(bitmap)
      return bitmap
    }
  }
  return { ...three, ImageBitmapLoader }
})

const { deskAssetUrls, loadDesk } = await import('@/features/desk/assets')
const { MODEL_SCALE } = await import('@/features/desk/config')

const ASSETS = [
  { model: '/m/computer.glb', texture: { avif: '/t/computer.avif', webp: '/t/computer.webp', width: 2048, height: 2048 } },
  { model: '/m/environment.glb', texture: { webp: '/t/environment.webp', width: 2048, height: 2048 }, drop: ['Background'] },
] as const

const meshes = (root: Group) => {
  const out: Mesh[] = []
  root.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh)
  })
  return out
}

beforeEach(() => {
  loaders.meshopt.length = 0
  loaders.models.length = 0
  loaders.images.length = 0
  loaders.imageOptions.length = 0
  loaders.bitmaps.length = 0
})

describe('deskAssetUrls', () => {
  it('takes the AVIF when the context decodes it, else the WebP', () => {
    // the environment has no AVIF (none passed parity at fewer bytes): its WebP either way
    expect(deskAssetUrls(ASSETS, 'avif').map((a) => a.texture)).toEqual(['/t/computer.avif', '/t/environment.webp'])
    expect(deskAssetUrls(ASSETS, 'webp').map((a) => a.texture)).toEqual(['/t/computer.webp', '/t/environment.webp'])
  })

  it('keeps the model and the drop list as they are', () => {
    expect(deskAssetUrls(ASSETS, 'webp')).toEqual([
      { model: '/m/computer.glb', texture: '/t/computer.webp' },
      { model: '/m/environment.glb', texture: '/t/environment.webp', drop: ['Background'] },
    ])
  })
})

describe('loadDesk', () => {
  it('sets the meshopt decoder on the GLTF loader', async () => {
    await loadDesk(deskAssetUrls(ASSETS, 'webp'))
    expect(loaders.meshopt).toEqual([loaders.decoder])
    expect(loaders.models).toEqual(['/m/computer.glb', '/m/environment.glb'])
  })

  it('decodes with ImageBitmapLoader, unflipped and not premultiplied', async () => {
    await loadDesk(deskAssetUrls(ASSETS, 'webp'))
    expect(loaders.imageOptions).toEqual([{ imageOrientation: 'none', premultiplyAlpha: 'none' }])
  })

  it('loads each texture from the URL it is given', async () => {
    await loadDesk(deskAssetUrls(ASSETS, 'avif'))
    expect(loaders.images).toEqual(['/t/computer.avif', '/t/environment.webp'])
  })

  it('wraps each bitmap in an sRGB, unflipped texture marked for upload on one unlit material', async () => {
    const desk = await loadDesk(deskAssetUrls(ASSETS, 'webp'))
    desk.objects.forEach((root, i) => {
      for (const mesh of meshes(root)) {
        const material = mesh.material as MeshBasicMaterial
        expect(material.type).toBe('MeshBasicMaterial')
        const map = material.map!
        expect(map.image).toBe(loaders.bitmaps[i])
        expect(map.colorSpace).toBe(SRGBColorSpace)
        expect(map.flipY).toBe(false)
        expect(map.version).toBeGreaterThan(0) // needsUpdate
      }
    })
  })

  it('removes the drop nodes by name', async () => {
    const desk = await loadDesk(deskAssetUrls(ASSETS, 'webp'))
    expect(desk.objects[0]!.getObjectByName('Background')).toBeDefined()
    expect(desk.objects[1]!.getObjectByName('Background')).toBeUndefined()
    expect(desk.objects[1]!.getObjectByName('/m/environment.glb')).toBeDefined()
  })

  it('scales the model root, keeping each node its own (dequantization) transform', async () => {
    const desk = await loadDesk(deskAssetUrls(ASSETS, 'webp'))
    const root = desk.objects[0]!
    expect(root.scale.toArray()).toEqual([MODEL_SCALE, MODEL_SCALE, MODEL_SCALE])
    const mesh = root.getObjectByName('/m/computer.glb')!
    expect(mesh.scale.toArray()).toEqual([0.5, 0.5, 0.5])
    expect(mesh.position.toArray()).toEqual([1, 2, 3])
  })

  it('closes every bitmap and frees the GPU side on dispose', async () => {
    const desk = await loadDesk(deskAssetUrls(ASSETS, 'webp'))
    const geometry = meshes(desk.objects[0]!)[0]!.geometry
    const freed = vi.fn()
    geometry.addEventListener('dispose', freed)
    expect(loaders.bitmaps.every((b) => b.close.mock.calls.length === 0)).toBe(true)
    desk.dispose()
    expect(loaders.bitmaps.map((b) => b.close.mock.calls.length)).toEqual([1, 1])
    expect(freed).toHaveBeenCalled()
  })
})
