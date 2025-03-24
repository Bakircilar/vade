import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { supabase } from './services/supabase';

// Pages
import Dashboard from './pages/Dashboard';
import CustomerList from './pages/CustomerList';
import CustomerDetail from './pages/CustomerDetail';
import PaymentList from './pages/PaymentList';
import Login from './pages/Login';

// Components
import Header from './components/Header';
import Navigation from './components/Navigation';
import ImportExcel from './components/ImportExcel';

import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="loading">Yükleniyor...</div>;
  }

  return (
    <BrowserRouter>
      <div className="app">
        <Header session={session} />
        <div className="container">
          {session && <Navigation />}
          <main className="content">
            <Routes>
              <Route path="/" element={session ? <Dashboard /> : <Navigate to="/login" />} />
              <Route path="/customers" element={session ? <CustomerList /> : <Navigate to="/login" />} />
              <Route path="/customers/:id" element={session ? <CustomerDetail /> : <Navigate to="/login" />} />
              <Route path="/payments" element={session ? <PaymentList /> : <Navigate to="/login" />} />
              <Route path="/import" element={session ? <ImportExcel /> : <Navigate to="/login" />} />
              <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
            </Routes>
          </main>
        </div>
        <ToastContainer position="bottom-right" />
      </div>
    </BrowserRouter>
  );
}

export default App;