import { toast } from 'sonner'
import { LARGE_PDF_BYTES } from '@/lib/files'
import type { FileRecord } from '@/lib/types'
import { formatBytes } from '@/lib/utils'

/** Large PDFs load slowly on phones and use up the free bandwidth allowance quickly. */
export function warnIfLargePdf(file: Pick<FileRecord, 'mime_type' | 'size_bytes' | 'title'>) {
  if (file.mime_type === 'application/pdf' && file.size_bytes > LARGE_PDF_BYTES) {
    toast.warning(
      `“${file.title}” is ${formatBytes(file.size_bytes)}. Large PDFs load slowly on mobile data and use more of the free monthly bandwidth. If you can, export it again with “reduce file size” and use Replace file.`,
      { duration: 10000 },
    )
  }
}
