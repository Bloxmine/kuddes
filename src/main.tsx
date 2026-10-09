import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ApiRequestError } from './lib/api'
import './styles/global.css'
import './styles/themes.css'
import './styles/nameFonts.css'
import './styles/bodyFonts.css'
// Last, so the phone layout overrides the desktop styles
import './styles/mobile.css'
import { registerServiceWorker } from './lib/pwa'
import { startScrollFades } from './lib/scrollFades'

registerServiceWorker()
startScrollFades()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      // Don't retry "not found" or "not allowed"; do retry flaky network errors
      retry: (count, error) => !(error instanceof ApiRequestError && error.status < 500) && count < 2,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
