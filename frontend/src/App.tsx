import { AnimatePresence } from 'framer-motion'
import { Route, Routes, useLocation } from 'react-router-dom'
import { DemoModeBanner } from './components/DemoModeBanner'
import { PageTransition } from './components/PageTransition'
import { ScanWipeOverlay } from './components/ScanWipeOverlay'
import { SecurityHeader } from './components/SecurityHeader'
import { AuthenticationFlowPage } from './pages/AuthenticationFlowPage'
import { BuildingSecurityPage } from './pages/BuildingSecurityPage'
import { LandingPage } from './pages/LandingPage'
import { ResultPage } from './pages/ResultPage'
import { TestingModePage } from './pages/TestingModePage'

function App() {
  const location = useLocation()

  return (
    <div className="flex min-h-screen flex-col bg-void text-text">
      <ScanWipeOverlay />
      <DemoModeBanner />
      <SecurityHeader />
      <main className="flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<PageTransition><LandingPage /></PageTransition>} />
            <Route path="/building/:buildingId" element={<PageTransition><BuildingSecurityPage /></PageTransition>} />
            <Route
              path="/building/:buildingId/authenticate"
              element={<PageTransition><AuthenticationFlowPage /></PageTransition>}
            />
            <Route path="/building/:buildingId/result" element={<PageTransition><ResultPage /></PageTransition>} />
            <Route path="/testing" element={<PageTransition><TestingModePage /></PageTransition>} />
          </Routes>
        </AnimatePresence>
      </main>
    </div>
  )
}

export default App
