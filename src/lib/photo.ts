/**
 * Compress an image File to a JPEG data URL (base64).
 * Resizes so the larger dimension fits maxDim, then encodes at quality.
 */
export async function fileToBase64Jpeg(file: File, maxDim = 640, quality = 0.6): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
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
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')) }
    img.src = url
  })
}

/** Returns true if the file looks like an image */
export function isImage(file: File): boolean {
  return file.type.startsWith('image/')
}

/** Human-readable size label */
export function photoSize(base64: string): string {
  const bytes = Math.round((base64.length - 'data:image/jpeg;base64,'.length) * 0.75)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 100) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}