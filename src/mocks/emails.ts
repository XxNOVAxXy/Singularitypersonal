import type { EmailMessage } from '@/types'

export const emails: EmailMessage[] = [
  {
    id: 'mail-1',
    fromName: 'Laura Domínguez',
    fromEmail: 'laura.dominguez@transportesdelnorte.com',
    subject: 'Póliza de automóvil flota 2026 + recibo',
    preview:
      'Buen día, adjunto la póliza renovada de la flota y el recibo de la prima del primer trimestre.',
    body: 'Buen día,\n\nAdjunto la póliza renovada de la flota correspondiente a 2026, así como el recibo de la prima del primer trimestre.\n\nQuedo pendiente de cualquier comentario.\n\nSaludos,\nLaura Domínguez\nTransportes del Norte',
    receivedAt: '2026-10-13T08:20:00',
    read: false,
    attachments: [
      {
        id: 'att-1',
        name: 'Poliza_Automovil_Atlas_2026.pdf',
        fileType: 'pdf',
        sizeKb: 512,
        documentId: 'doc-auto-atlas',
      },
      {
        id: 'att-2',
        name: 'Recibo_Prima_GNP_1T.pdf',
        fileType: 'pdf',
        sizeKb: 96,
        documentId: 'doc-recibo-gnp',
      },
    ],
  },
  {
    id: 'mail-2',
    fromName: 'Correo de Pólizas',
    fromEmail: 'polizas@grupoindustrialvera.mx',
    subject: 'Renovación colectiva GMM — Allianz y AXA',
    preview:
      'Se envían las renovaciones del seguro de gastos médicos mayores para el personal directivo.',
    body: 'Hola equipo,\n\nSe envían las renovaciones del seguro de gastos médicos mayores para el personal directivo. Favor de validar las sumas aseguradas y deducibles.\n\nGracias.',
    receivedAt: '2026-10-13T06:10:00',
    read: true,
    attachments: [
      {
        id: 'att-3',
        name: 'Allianz_GMM_Colectivo.pdf',
        fileType: 'pdf',
        sizeKb: 890,
        documentId: 'doc-gmm-allianz',
      },
      {
        id: 'att-4',
        name: 'GMM_AXA_Individual.pdf',
        fileType: 'pdf',
        sizeKb: 470,
        documentId: 'doc-gmm-axa',
      },
    ],
  },
  {
    id: 'mail-3',
    fromName: 'Jorge Villalobos',
    fromEmail: 'jvillalobos@logisticapeninsular.com',
    subject: 'Pólizas de unidades — Chubb e Inbursa',
    preview:
      'Adjunto las pólizas de las unidades nuevas. Una viene escaneada desde el celular.',
    body: 'Buenas tardes,\n\nAdjunto las pólizas de las unidades nuevas. La de Inbursa viene escaneada desde el celular, espero que sea legible.\n\nCualquier cosa me avisan.\n\nJorge.',
    receivedAt: '2026-10-13T04:45:00',
    read: false,
    attachments: [
      {
        id: 'att-5',
        name: 'Poliza_Auto_Chubb_Flotilla.pdf',
        fileType: 'pdf',
        sizeKb: 640,
        documentId: 'doc-auto-chubb',
      },
      {
        id: 'att-6',
        name: 'Poliza_Escaneada_Inbursa.jpg',
        fileType: 'image',
        sizeKb: 780,
        documentId: 'doc-auto-inbursa',
      },
    ],
  },
  {
    id: 'mail-4',
    fromName: 'Ana Euan',
    fromEmail: 'ana.euan@gmail.com',
    subject: 'Mi póliza de vida',
    preview: 'Hola, les comparto mi póliza de vida para su registro.',
    body: 'Hola,\n\nLes comparto mi póliza de vida para su registro. Quedo atenta.\n\nGracias,\nAna.',
    receivedAt: '2026-10-12T11:05:00',
    read: true,
    attachments: [
      {
        id: 'att-7',
        name: 'Vida_MetLife_Ana_Euan.pdf',
        fileType: 'pdf',
        sizeKb: 320,
        documentId: 'doc-vida-metlife',
      },
    ],
  },
  {
    id: 'mail-5',
    fromName: 'Aserta Fianzas',
    fromEmail: 'sistemas@aserta.com.mx',
    subject: 'Fianza de cumplimiento y tarifario',
    preview:
      'Envío la fianza de cumplimiento de Constructora Delta y el tarifario actualizado de Quálitas.',
    body: 'Estimados,\n\nEnvío la fianza de cumplimiento de Constructora Delta y el tarifario actualizado de Quálitas para flotillas.\n\nSaludos cordiales.',
    receivedAt: '2026-10-11T16:40:00',
    read: true,
    attachments: [
      {
        id: 'att-8',
        name: 'Fianza_Cumplimiento_Aserta.pdf',
        fileType: 'pdf',
        sizeKb: 210,
        documentId: 'doc-fianza-aserta',
      },
      {
        id: 'att-9',
        name: 'Tarifario_Qualitas.xlsx',
        fileType: 'xlsx',
        sizeKb: 45,
        documentId: 'doc-auto-qualitas',
      },
    ],
  },
  {
    id: 'mail-6',
    fromName: 'HDI Seguros',
    fromEmail: 'notificaciones@hdi.com.mx',
    subject: 'Póliza de daños — Inmobiliaria Sol',
    preview:
      'Se adjunta la póliza de daños del inmueble comercial. Requiere revisión de coberturas.',
    body: 'Confirmación de emisión de póliza de daños del inmueble comercial de Inmobiliaria Sol. Requiere revisión de coberturas especiales.\n\nHDI Seguros.',
    receivedAt: '2026-10-10T09:15:00',
    read: true,
    attachments: [
      {
        id: 'att-10',
        name: 'Danos_Inmueble_HDI.pdf',
        fileType: 'pdf',
        sizeKb: 1240,
        documentId: 'doc-danos-hdi',
      },
    ],
  },
]

export function getEmailById(id: string | undefined): EmailMessage | undefined {
  return emails.find((email) => email.id === id)
}

export function documentsForEmail(emailId: string): string[] {
  const email = getEmailById(emailId)
  return email?.attachments
    .map((attachment) => attachment.documentId)
    .filter((value): value is string => Boolean(value)) ?? []
}
