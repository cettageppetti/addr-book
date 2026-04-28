/**
 * Compress an image File to a JPEG Blob.
 * Resizes so the larger dimension fits maxDim, then encodes at quality.
 */
export async function fileToJpegBlob(file: File, maxDim = 640, quality = 0.6): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    let { width, height } = img
    if (width > maxDim || height > maxDim) {
      const ratio = Math.min(maxDim / width, maxDim / height)
      width  = Math.round(width  * ratio)
      height = Math.round(height * ratio)
    }
    const canvas = document.createElement('canvas')
    canvas.width  = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, width, height)
    return new Promise((resolve, reject) =>
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas encoding failed')), 'image/jpeg', quality)
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve(img)
    img.onerror = reject
    img.src     = src
  })
}

export function isImage(file: File): boolean {
  return file.type.startsWith('image/')
}

/** Human-readable size label for a Blob */
export function blobSize(b: Blob): string {
  const bytes = b.size
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 100)  return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}