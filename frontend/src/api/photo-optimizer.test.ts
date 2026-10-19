import { afterEach, describe, expect, it, vi } from 'vitest'
import { compressProductPhoto } from './photo-optimizer'

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
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ drawImage }) as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(output))

    const compressed = await compressProductPhoto(input)

    expect(compressed).toBeInstanceOf(File)
    expect(compressed.type).toBe('image/webp')
    expect(compressed.name).toBe('harvest.webp')
    expect(compressed.size).toBeLessThan(input.size)
    expect(bitmap.close).toHaveBeenCalledOnce()
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 800)
  })

  it('keeps the selected original when browser image processing is unavailable', async () => {
    const input = new File([new Uint8Array(1024 * 1024)], 'harvest.jpg', { type: 'image/jpeg' })
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Unsupported image')))

    await expect(compressProductPhoto(input)).resolves.toBe(input)
  })
})
