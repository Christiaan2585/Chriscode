import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { applyTheme, getTheme } from './utils/theme'

// Before the first render, so screens never flash the wrong theme.
applyTheme(getTheme())

// Error boundaries only catch errors thrown while React is rendering.
// Errors thrown inside event handlers, timers, or unhandled promise
// rejections (e.g. a mutation's onError path, or a bug in an async
// callback) happen outside React's render cycle, so they wouldn't be
// caught above and could otherwise fail silently with no visible sign of
// what went wrong. Logging them here at least puts something in the
// terminal running `npm run dev` / in DevTools, so a future freeze report
// is easier to diagnose than "the app went black" with no trace of why.
window.addEventListener('error', (event) => {
  console.error('Unhandled error:', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
