import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/misc'
import { AppDataProvider } from '@/hooks/useAppData'
import { PrintProvider } from '@/features/reports/PrintSheet'
import { AppRouter } from './AppRouter'
import './styles.css'

/**
 * Clean URLs when served by a web server; hash URLs when the page is opened
 * straight from a folder.
 *
 * Over file:// there is no server to answer a request for /production, so a
 * normal path router shows a blank page the moment you navigate. The hash
 * router keeps the whole route after a '#', which the browser never asks a
 * server about.
 */
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <AppDataProvider>
        <TooltipProvider delayDuration={200}>
          <PrintProvider>
            <AppRouter />
            <Toaster
              position="bottom-right"
              richColors
              closeButton
              toastOptions={{
                classNames: {
                  toast: 'font-sans text-[0.8125rem]',
                  description: 'text-xs',
                },
              }}
            />
          </PrintProvider>
        </TooltipProvider>
      </AppDataProvider>
    </Router>
  </StrictMode>,
)
