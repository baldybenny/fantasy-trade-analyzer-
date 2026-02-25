import { Routes, Route } from 'react-router';
import Layout from './components/Layout.js';
import Dashboard from './pages/Dashboard.js';
import TradeAnalyzer from './pages/TradeAnalyzer.js';
import Rosters from './pages/Rosters.js';
import Standings from './pages/Standings.js';
import Keepers from './pages/Keepers.js';
import DataImport from './pages/DataImport.js';
import Settings from './pages/Settings.js';
import News from './pages/News.js';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="trade" element={<TradeAnalyzer />} />
        <Route path="rosters" element={<Rosters />} />
        <Route path="standings" element={<Standings />} />
        <Route path="keepers" element={<Keepers />} />
        <Route path="news" element={<News />} />
        <Route path="import" element={<DataImport />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
