const COMPRESS_FROM_BYTES = 500 * 1024
const MAX_EDGE = 1600
const WEBP_QUALITY = 0.82

export async function compressProductPhoto(file: File): Promise<File> {
  if (file.size <= COMPRESS_FROM_BYTES || typeof createImageBitmap !== 'function') return file

  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)

    const compressed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY))
    if (!compressed || compressed.type !== 'image/webp' || compressed.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') || 'producto'
    return new File([compressed], `${name}.webp`, { type: 'image/webp', lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    bitmap?.close()
  }
}
