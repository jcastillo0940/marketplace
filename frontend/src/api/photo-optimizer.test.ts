import { afterEach, describe, expect, it, vi } from 'vitest'
import { compressDocumentFile, compressProductPhoto } from './photo-optimizer'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('product photo optimizer', () => {
  it('compresses a large image to a smaller WebP file at the configured edge size', async () => {
    const input = new File([new Uint8Array(1024 * 1024)], 'harvest.jpg', { type: 'image/jpeg', lastModified: 123 })
    const bitmap = { width: 2400, height: 1200, close: vi.fn() }
    const drawImage = vi.fn()
    const output = new Blob([new Uint8Array(200 * 1024)], { type: 'image/webp' })
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ drawImage }) as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(output))

    const compressed = await compressProductPhoto(input)

    expect(compressed).toBeInstanceOf(File)
    expect(compressed.type).toBe('image/webp')
    expect(compressed.name).toBe('harvest.webp')
    expect(compressed.size).toBeLessThan(input.size)
    expect(bitmap.close).toHaveBeenCalledOnce()
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 800)
  })

  it('optimizes small images too, because the rule does not depend on weight', async () => {
    const input = new File([new Uint8Array(100 * 1024)], 'small.png', { type: 'image/png' })
    const bitmap = { width: 800, height: 600, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ drawImage: vi.fn() }) as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob([new Uint8Array(20 * 1024)], { type: 'image/webp' })))

    await expect(compressProductPhoto(input)).resolves.toMatchObject({ name: 'small.webp', type: 'image/webp' })
  })

  it('lowers the quality until the image fits the upload limit', async () => {
    const input = new File([new Uint8Array(8 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' })
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 6000, height: 4000, close: vi.fn() }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ drawImage: vi.fn() }) as never)
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, _type, quality) => callback(new Blob([new Uint8Array((quality === 0.55 ? 1 : 3) * 1024 * 1024)], { type: 'image/webp' })))

    const compressed = await compressProductPhoto(input)

    expect(toBlob).toHaveBeenCalledTimes(3)
    expect(compressed.size).toBe(1024 * 1024)
  })

  it('turns document photos into JPEG and leaves PDF files untouched', async () => {
    const photo = new File([new Uint8Array(4 * 1024 * 1024)], 'cedula.png', { type: 'image/png' })
    const pdf = new File([new Uint8Array(1024)], 'pacto.pdf', { type: 'application/pdf' })
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 3000, height: 2000, close: vi.fn() }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ drawImage: vi.fn(), fillRect: vi.fn() }) as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob([new Uint8Array(500 * 1024)], { type: 'image/jpeg' })))

    await expect(compressDocumentFile(photo)).resolves.toMatchObject({ name: 'cedula.jpg', type: 'image/jpeg' })
    await expect(compressDocumentFile(pdf)).resolves.toBe(pdf)
  })

  it('keeps the selected original when browser image processing is unavailable', async () => {
    const input = new File([new Uint8Array(1024 * 1024)], 'harvest.jpg', { type: 'image/jpeg' })
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Unsupported image')))

    await expect(compressProductPhoto(input)).resolves.toBe(input)
  })
})
