import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import ExperimentPage from './pages/ExperimentPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/experiments/:slug" element={<ExperimentPage />} />
    </Routes>
  );
}
