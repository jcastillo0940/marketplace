/**
 * Upload rule: every image is optimized in the browser before it is sent, whatever it weighs.
 * PHP rejects anything above MAX_UPLOAD_BYTES, so weight limits only apply to files that
 * cannot be optimized, such as PDF documents.
 */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
export const MAX_UPLOAD_MESSAGE = 'No pudimos reducir este archivo a menos de 2 MB. Prueba con otra foto o con un PDF más liviano.'

const PRODUCT_MAX_EDGE = 1600
const DOCUMENT_MAX_EDGE = 2400
const QUALITY_STEPS = [0.82, 0.7, 0.55]

type OptimizeOptions = { maxEdge: number; mime: 'image/webp' | 'image/jpeg'; extension: string; fallbackName: string }

async function optimizeImage(file: File, { maxEdge, mime, extension, fallbackName }: OptimizeOptions): Promise<File> {
  if (typeof createImageBitmap !== 'function') return file

  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    if (mime === 'image/jpeg') {
      context.fillStyle = '#fff'
      context.fillRect(0, 0, width, height)
    }
    context.drawImage(bitmap, 0, 0, width, height)

    let optimized: Blob | null = null
    for (const quality of QUALITY_STEPS) {
      optimized = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality))
      if (!optimized || optimized.size <= MAX_UPLOAD_BYTES) break
    }
    if (!optimized || optimized.type !== mime || optimized.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') || fallbackName
    return new File([optimized], `${name}.${extension}`, { type: mime, lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    bitmap?.close()
  }
}

export function compressProductPhoto(file: File): Promise<File> {
  return optimizeImage(file, { maxEdge: PRODUCT_MAX_EDGE, mime: 'image/webp', extension: 'webp', fallbackName: 'producto' })
}

/** Documents and report evidence keep more detail so their text stays readable. PDF files pass through. */
export async function compressDocumentFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  return optimizeImage(file, { maxEdge: DOCUMENT_MAX_EDGE, mime: 'image/jpeg', extension: 'jpg', fallbackName: 'documento' })
}
