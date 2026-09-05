// UI5's asset/feature registration must run before anything else imports a
// UI5 component (see `ui5/bootstrap.ts`) — this has to stay the first line.
import './ui5/bootstrap'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@ui5/webcomponents-react/ThemeProvider'
import { TooltipProvider } from '@/components/ui/misc'
import { AppDataProvider } from '@/hooks/useAppData'
import { PrintProvider } from '@/features/reports/PrintSheet'
import { AppRouter } from './router/AppRouter'
import './styles/index.css'

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

/**
 * The sub-path this app is mounted under, if any.
 *
 * On GitHub Pages this is a project site — https://<user>.github.io/bhuiyan/
 * — not a domain root, so every route the app knows about ("/", "/production",
 * …) has to be matched against the URL *after* that "/bhuiyan/" prefix, not
 * against the whole path. `import.meta.env.BASE_URL` is set at build time from
 * `vite.config.ts`'s `base` (see the `GH_PAGES` flag there) and mirrors
 * whatever prefix the app was actually deployed under, so this needs no
 * hard-coded repo name here. Locally that value is the relative './' used for
 * the office file:// build, which is not a valid `basename` — passing it
 * through unguarded would break routing in every environment except GitHub
 * Pages, so anything that is not an absolute path falls back to the router's
 * own default ('/').
 */
const basename = import.meta.env.BASE_URL.startsWith('/') ? import.meta.env.BASE_URL : undefined

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <Router basename={basename}>
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
    </ThemeProvider>
  </StrictMode>,
)
