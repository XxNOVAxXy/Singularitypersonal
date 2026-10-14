import type { PolicyType, PolicyTypeConfig } from '@/types'

export const policyTypeConfigs: PolicyTypeConfig[] = [
  {
    id: 'auto',
    label: 'Automóvil',
    description: 'Cobertura para vehículos particulares y flotillas.',
  },
  {
    id: 'gmm',
    label: 'Gastos Médicos Mayores',
    description: 'Seguro de salud individual y colectivo.',
  },
  {
    id: 'vida',
    label: 'Vida',
    description: 'Seguros de vida y temporales.',
  },
  {
    id: 'fianza',
    label: 'Fianza',
    description: 'Fianzas de cumplimiento y fidelidad.',
  },
  {
    id: 'danos',
    label: 'Daños',
    description: 'Daños a bienes, inmuebles y contenido.',
  },
  {
    id: 'recibo',
    label: 'Recibo',
    description: 'Comprobantes de pago y primas.',
  },
]

export const policyTypeLabel = (type: PolicyType): string =>
  policyTypeConfigs.find((config) => config.id === type)?.label ?? type
