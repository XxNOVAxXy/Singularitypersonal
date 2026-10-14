import { FileSpreadsheet, FileText, Image } from 'lucide-react'
import type { DocumentFileType } from '@/types'
import { cn } from '@/lib/cn'

interface FileTypeIconProps {
  fileType: DocumentFileType
  size?: number
  className?: string
}

const fileTypeStyles: Record<DocumentFileType, string> = {
  pdf: 'bg-rose-50 text-rose-600',
  image: 'bg-sky-50 text-sky-600',
  xlsx: 'bg-emerald-50 text-emerald-600',
}

export function FileTypeIcon({
  fileType,
  size = 16,
  className,
}: FileTypeIconProps) {
  const Icon =
    fileType === 'image' ? Image : fileType === 'xlsx' ? FileSpreadsheet : FileText
  return (
    <span
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
        fileTypeStyles[fileType],
        className,
      )}
    >
      <Icon size={size} />
    </span>
  )
}
