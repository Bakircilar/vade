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
import PaymentDetail from './pages/PaymentDetail'; // Yeni eklenen
import Profile from './pages/Profile'; // Yeni eklenen
import Login from './pages/Login';
import UserAssignments from './pages/UserAssignments'; // Müşteri atama sayfası
import AuthManager from './pages/AuthManager'; // Kullanıcı yönetim sayfası

// Components
import Header from './components/Header';
import Navigation from './components/Navigation';
import ImportExcel from './components/ImportExcel';

import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('user'); // Varsayılan rol
  const [isMuhasebe, setIsMuhasebe] = useState(false); // Muhasebe rolü kontrolü

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchUserRole(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserRole(session.user.id);
      } else {
        setUserRole('user');
        setIsMuhasebe(false);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Kullanıcı rolünü al
  const fetchUserRole = async (userId) => {
    try {
      // Profil tablosunun var olup olmadığını kontrol et
      try {
        const { count, error } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });
          
        if (error) {
          console.log("profiles tablosu bulunamadı veya erişilemedi:", error);
          setUserRole('user');
          setIsMuhasebe(false);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.log("profiles tablosu kontrolünde hata:", err);
        setUserRole('user');
        setIsMuhasebe(false);
        setLoading(false);
        return;
      }
      
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Rol sorgulama hatası:', error);
      }

      // Varsayılan olarak "user" rolu ver, ya da veritabanından gelen rolü al
      const role = data?.role || 'user';
      setUserRole(role);
      
      // Muhasebe rolünü kontrol et
      setIsMuhasebe(role === 'muhasebe');
    } catch (error) {
      console.error('Rol getirme hatası:', error);
    } finally {
      setLoading(false);
    }
  };

  // Yönetici kontrolü
  const isAdmin = userRole === 'admin';
  const isMuhasebeUser = userRole === 'muhasebe';

  if (loading) {
    return <div className="loading">Yükleniyor...</div>;
  }

  return (
    <BrowserRouter>
      <div className="app">
        <Header session={session} userRole={userRole} />
        <div className="container">
          {session && <Navigation userRole={userRole} isMuhasebe={isMuhasebe} />}
          <main className="content">
            <Routes>
              <Route path="/" element={session ? <Dashboard /> : <Navigate to="/login" />} />
              <Route path="/customers" element={session ? <CustomerList /> : <Navigate to="/login" />} />
              <Route path="/customers/:id" element={session ? <CustomerDetail /> : <Navigate to="/login" />} />
              <Route path="/payments" element={session ? <PaymentList /> : <Navigate to="/login" />} />
              <Route path="/payments/:id" element={session ? <PaymentDetail /> : <Navigate to="/login" />} />
              <Route path="/import" element={session ? <ImportExcel /> : <Navigate to="/login" />} />
              <Route path="/profile" element={session ? <Profile /> : <Navigate to="/login" />} />
              <Route path="/user-assignments" element={session && (isAdmin || isMuhasebeUser) ? <UserAssignments /> : <Navigate to="/" />} />
              <Route path="/auth-manager" element={session && isAdmin ? <AuthManager /> : <Navigate to="/" />} />
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