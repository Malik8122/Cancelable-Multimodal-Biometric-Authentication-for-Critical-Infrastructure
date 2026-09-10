import { Route, Routes } from 'react-router-dom'
import { DemoModeBanner } from './components/DemoModeBanner'
import { SecurityHeader } from './components/SecurityHeader'
import { AuthenticationFlowPage } from './pages/AuthenticationFlowPage'
import { BuildingSecurityPage } from './pages/BuildingSecurityPage'
import { LandingPage } from './pages/LandingPage'
import { ResultPage } from './pages/ResultPage'
import { TestingModePage } from './pages/TestingModePage'

function App() {
  return (
    <div className="flex min-h-screen flex-col bg-void text-text">
      <DemoModeBanner />
      <SecurityHeader />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/building/:buildingId" element={<BuildingSecurityPage />} />
          <Route path="/building/:buildingId/authenticate" element={<AuthenticationFlowPage />} />
          <Route path="/building/:buildingId/result" element={<ResultPage />} />
          <Route path="/testing" element={<TestingModePage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
