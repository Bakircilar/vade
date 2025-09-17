import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { supabase } from './services/supabase';

// Pages
import Dashboard from './pages/Dashboard';
import Calendar from './pages/Calendar';
import CustomerList from './pages/CustomerList';
import CustomerDetail from './pages/CustomerDetail';
import PaymentList from './pages/PaymentList';
import EnhancedCustomerDetail from './pages/EnhancedCustomerDetail';
import PaymentDetail from './pages/PaymentDetail';
import Profile from './pages/Profile';
import Login from './pages/Login';
import UserAssignments from './pages/UserAssignments';
import AuthManager from './pages/AuthManager';
import NotesReport from './pages/NotesReport'; // Not raporu sayfası
import AccessDebug from './pages/AccessDebug';
import UserActivityReports from './pages/UserActivityReports';
import ManagementReports from './pages/ManagementReports';

// Components
import Header from './components/Header';
import Navigation from './components/Navigation';
import ImportExcel from './components/ImportExcel';

import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('user');
  const [isMuhasebe, setIsMuhasebe] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
        .select('role, full_name')
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
      
      // Kullanıcı adı eksikse ve oturum bilgisi varsa metadata'yı kontrol et
      if (session?.user && (!data?.full_name || data.full_name.trim() === '')) {
        // Metadata'dan full_name'i al
        const fullName = session.user.user_metadata?.full_name;
        
        // Eğer metadata'da full_name varsa, profiles tablosunu güncelle
        if (fullName && fullName.trim() !== '') {
          await supabase
            .from('profiles')
            .upsert({
              id: userId,
              full_name: fullName,
              role: role, // Mevcut rolü koru
              updated_at: new Date().toISOString()
            });
        }
      }
    } catch (error) {
      console.error('Rol getirme hatası:', error);
    } finally {
      setLoading(false);
    }
  };

  // Mobil menu toggle fonksiyonu - düzeltildi
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  // Mobil menu kapatma fonksiyonu
  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
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
        <Header 
          session={session} 
          userRole={userRole} 
          toggleMobileMenu={toggleMobileMenu}
          isMobileMenuOpen={isMobileMenuOpen}
        />
        <div className="container">
          {session && (
            <Navigation 
              userRole={userRole} 
              isMuhasebe={isMuhasebe} 
              isMenuOpen={isMobileMenuOpen}
              closeMenu={closeMobileMenu}
            />
          )}
          <main className="content">
            <Routes>
              <Route path="/" element={session ? <Dashboard /> : <Navigate to="/login" />} />
              <Route path="/customers" element={session ? <CustomerList /> : <Navigate to="/login" />} />
              <Route path="/calendar" element={session ? <Calendar /> : <Navigate to="/login" />} />
              <Route path="/customers/:id" element={session ? <EnhancedCustomerDetail /> : <Navigate to="/login" />} />
              <Route path="/payments" element={session ? <PaymentList /> : <Navigate to="/login" />} />
              <Route path="/payments/:id" element={session ? <PaymentDetail /> : <Navigate to="/login" />} />
              <Route path="/import" element={session && (isAdmin || isMuhasebeUser) ? <ImportExcel /> : <Navigate to="/login" />} />
              <Route path="/profile" element={session ? <Profile /> : <Navigate to="/login" />} />
              <Route path="/user-assignments" element={session && (isAdmin || isMuhasebeUser) ? <UserAssignments /> : <Navigate to="/" />} />
              <Route path="/auth-manager" element={session && isAdmin ? <AuthManager /> : <Navigate to="/" />} />
              {/* Not Raporu sayfası - sadece admin ve muhasebe erişebilir */}
              <Route path="/notes-report" element={session && (isAdmin || isMuhasebeUser) ? <NotesReport /> : <Navigate to="/" />} />
              {/* Yeni rapor sayfaları */}
              <Route path="/access-debug" element={session && (isAdmin || isMuhasebeUser) ? <AccessDebug /> : <Navigate to="/" />} />
              <Route path="/user-reports" element={session ? <UserActivityReports /> : <Navigate to="/login" />} />
              <Route path="/management-reports" element={session && (isAdmin || isMuhasebeUser) ? <ManagementReports /> : <Navigate to="/" />} />
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