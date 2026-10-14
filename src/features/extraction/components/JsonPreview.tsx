import type { ExtractionMethod } from '@/types'
import { Card } from '@/components/ui/Card'
import { JsonViewer } from '@/components/ui/JsonViewer'

interface JsonPreviewProps {
  data: Record<string, unknown>
  method: ExtractionMethod
}

export function JsonPreview({ data, method }: JsonPreviewProps) {
  return (
    <Card
      title="Vista previa JSON"
      subtitle={`Resultado generado en modo ${
        method === 'gemini' ? 'Gemini AI' : 'Manual'
      }`}
      bodyClassName="p-4"
    >
      <JsonViewer data={data} maxHeight="360px" />
    </Card>
  )
}
