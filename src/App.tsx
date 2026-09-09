/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './components/AuthProvider.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';
import { Layout } from './components/Layout.tsx';
import Dashboard from './pages/Dashboard.tsx';
import Etablissements from './pages/Etablissements.tsx';
import Infrastructures from './pages/Infrastructures.tsx';
import Effectifs from './pages/Effectifs.tsx';
import Mobilier from './pages/Mobilier.tsx';
import Constructions from './pages/Constructions.tsx';
import Communications from './pages/Communications.tsx';
import Rapports from './pages/Rapports.tsx';
import Admin from './pages/Admin.tsx';
import Carte from './pages/Carte.tsx';
import Predictions from './pages/Predictions.tsx';
import Maintenance from './pages/Maintenance.tsx';
import Wash from './pages/Wash.tsx';
import Tice from './pages/Tice.tsx';
import Audit from './pages/Audit.tsx';
import RapportsAnnuels from './pages/RapportsAnnuels.tsx';


export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="etablissements" element={<Etablissements />} />
            <Route path="infrastructures" element={<Infrastructures />} />
            <Route path="effectifs" element={<Effectifs />} />
            <Route path="mobilier" element={<Mobilier />} />
            <Route path="constructions" element={<Constructions />} />
            <Route path="communications" element={<Communications />} />
            <Route path="rapports" element={<Rapports />} />
            <Route path="rapports-annuels" element={<RapportsAnnuels />} />
            <Route path="carte" element={<Carte />} />
            <Route path="predictions" element={<Predictions />} />
            <Route path="maintenance" element={<Maintenance />} />
            <Route path="wash" element={<Wash />} />
            <Route path="tice" element={<Tice />} />
            <Route path="audit" element={<Audit />} />
            <Route path="admin" element={<Admin />} />
            <Route path="*" element={<div className="p-8 text-center text-gray-500">Module en cours de développement...</div>} />
          </Route>
        </Routes>
      </BrowserRouter>
      </AuthProvider>
    </AppErrorBoundary>
  );
}
