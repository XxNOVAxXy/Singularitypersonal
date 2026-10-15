import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AppLayout } from '@/app/AppLayout'
import { EmailsPage } from '@/features/emails/EmailsPage'
import { ExtractionPage } from '@/features/extraction/ExtractionPage'
import { ComparisonPage } from '@/features/comparison/ComparisonPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/correos" replace /> },
      { path: 'correos', element: <EmailsPage /> },
      { path: 'extraccion', element: <ExtractionPage /> },
      { path: 'comparacion', element: <ComparisonPage /> },
      { path: 'configuracion', element: <SettingsPage /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
