import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './screens/HomePage';
import FEPage from './screens/FEPage';
import Activity from './screens/Activity';
import ProfilePage from './screens/ProfilePage';
import LoginPage from './screens/LoginPage';
import Header from './header/Header';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { initializeSocket } from './services/socketService';

function App() {
  useEffect(() => {
    initializeSocket();
  }, []);

  return (
    <Router>
      <ToastContainer position="top-right" autoClose={5000} />
      
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
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