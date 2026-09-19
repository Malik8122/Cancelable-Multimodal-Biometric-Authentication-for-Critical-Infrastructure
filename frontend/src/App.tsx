import { AnimatePresence } from 'motion/react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { BackendStatusBanner } from './components/layout/BackendStatusBanner'
import { NavDock } from './components/layout/NavDock'
import { PageTransition } from './components/layout/PageTransition'
import { TopBar } from './components/layout/TopBar'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { AuthenticatePage } from './pages/AuthenticatePage'
import { CheckpointPage } from './pages/CheckpointPage'
import { LandingPage } from './pages/LandingPage'
import { RegisterPage } from './pages/RegisterPage'
import { ResultPage } from './pages/ResultPage'
import { TemplateManagementPage } from './pages/TemplateManagementPage'
import { TemplateProtectionPage } from './pages/TemplateProtectionPage'
import { TestingPage } from './pages/TestingPage'

function App() {
  const location = useLocation()

  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      <BackendStatusBanner />
      <TopBar />
      <main className="relative flex-1 pb-24">
        <AnimatePresence mode="wait" initial={false}>
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<PageTransition><LandingPage /></PageTransition>} />
            <Route path="/building/:buildingId" element={<PageTransition><CheckpointPage /></PageTransition>} />
            <Route path="/building/:buildingId/register" element={<PageTransition><RegisterPage /></PageTransition>} />
            <Route
              path="/building/:buildingId/authenticate"
              element={<PageTransition><AuthenticatePage /></PageTransition>}
            />
            <Route path="/building/:buildingId/result" element={<PageTransition><ResultPage /></PageTransition>} />
            <Route path="/testing" element={<PageTransition><TestingPage /></PageTransition>} />
            <Route path="/analytics" element={<PageTransition><AnalyticsPage /></PageTransition>} />
            <Route path="/templates" element={<PageTransition><TemplateManagementPage /></PageTransition>} />
            <Route path="/template-protection" element={<PageTransition><TemplateProtectionPage /></PageTransition>} />
          </Routes>
        </AnimatePresence>
      </main>
      <NavDock />
    </div>
  )
}

export default App
