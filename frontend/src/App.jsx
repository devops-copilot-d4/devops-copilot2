import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Deployments from './pages/Deployments';
import Incidents from './pages/Incidents';
import Services from './pages/Services';
import Recovery from './pages/Recovery';
import Monitoring from './pages/Monitoring';
import Login from './pages/Login';
import { useAuthStore } from './store/authStore';

const ProtectedRoute = ({ children }) => {
  const token = useAuthStore(s => s.token);
  return token ? children : <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index        element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"   element={<Dashboard />} />
        <Route path="deployments" element={<Deployments />} />
        <Route path="incidents"   element={<Incidents />} />
        <Route path="services"    element={<Services />} />
        <Route path="recovery"    element={<Recovery />} />
        <Route path="monitoring"  element={<Monitoring />} />
      </Route>
    </Routes>
  );
}
