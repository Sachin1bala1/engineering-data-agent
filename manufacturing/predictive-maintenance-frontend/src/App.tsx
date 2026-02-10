import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Compare } from './pages/Compare';
import { Analyzer } from './pages/Analyzer';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <div className="App">
        <nav className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 text-sm">
            <Link to="/" className="font-semibold text-gray-900">Dashboard</Link>
            <Link to="/compare" className="text-gray-600 hover:text-gray-900">Baseline vs Experiment</Link>
            <Link to="/analyzer" className="text-gray-600 hover:text-gray-900">Engineering Analyzer</Link>
          </div>
        </nav>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/analyzer" element={<Analyzer />} />
          <Route path="/doe" element={<Analyzer />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
