import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './screens/HomePage';
import FEPage from './screens/FEPage';
import Activity from './screens/Activity';
import ProfilePage from './screens/ProfilePage';
import { useEffect } from 'react';
import { initializeSocket } from './services/socketService';
// Import other pages as needed

function App() {
  useEffect(() =>{
    initializeSocket();
  }, []);
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/:id" element={<ProfilePage />} />
        <Route path="/field-engineers" element={<FEPage />} />
        <Route path="/activity" element={<Activity />} />
        {/* Add other routes as needed */}
      </Routes>
    </Router>
  );
}

export default App;