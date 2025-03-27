import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';

// Kullanıcı erişim kontrolü için yardımcı fonksiyonlar
export const useUserAccess = () => {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMuhasebe, setIsMuhasebe] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assignedCustomerIds, setAssignedCustomerIds] = useState([]);

  // Kullanıcı oturumunu ve rolünü kontrol et
  useEffect(() => {
    let isMounted = true;
    
    const checkUser = async () => {
      try {
        setLoading(true);
        console.log('useUserAccess - Kullanıcı kontrolü başlatıldı');
        
        // Oturum açmış kullanıcıyı al
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          console.error('Kullanıcı getirme hatası:', userError);
          return;
        }
        
        if (!user) {
          console.log('useUserAccess - Kullanıcı oturumu bulunamadı');
          if (isMounted) {
            setUser(null);
            setIsAdmin(false);
            setIsMuhasebe(false);
            setAssignedCustomerIds([]);
          }
          return;
        }
        
        console.log('useUserAccess - Kullanıcı oturumu bulundu:', user.id);
        if (isMounted) setUser(user);
        
        // Kullanıcı rolünü al
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
          
        if (error && error.code !== 'PGRST116') {
          console.error('Rol sorgulama hatası:', error);
        }
        
        // Rolleri kontrol et
        let adminRole = false;
        let muhasebeRole = false;
        
        if (data && data.role) {
          adminRole = data.role === 'admin';
          muhasebeRole = data.role === 'muhasebe';
        }
        
        console.log('useUserAccess - Kullanıcı rolleri:', { adminRole, muhasebeRole, role: data?.role });
        
        if (isMounted) {
          setIsAdmin(adminRole);
          setIsMuhasebe(muhasebeRole);
        }
        
        // Sadece normal kullanıcılar için atanmış müşteri ID'lerini getir
        // Admin ve muhasebe kullanıcıları tüm müşterilere otomatik erişebilir
        if (!adminRole && !muhasebeRole) {
          console.log('useUserAccess - Normal kullanıcı, atanmış müşteriler getiriliyor');
          const ids = await fetchAssignedCustomerIds(user.id);
          console.log('useUserAccess - Atanmış müşteri ID\'leri:', ids);
          if (isMounted) setAssignedCustomerIds(ids);
        } else {
          console.log('useUserAccess - Admin veya muhasebe kullanıcısı, tüm müşterilere erişebilir');
        }
        
      } catch (error) {
        console.error('Kullanıcı kontrolü hatası:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    checkUser();
    
    // Temizleme fonksiyonu
    return () => {
      isMounted = false;
    };
  }, []);

  // Kullanıcıya atanmış müşteri ID'lerini getir (sadece normal kullanıcılar için)
  const fetchAssignedCustomerIds = async (userId) => {
    try {
      console.log('fetchAssignedCustomerIds - Kullanıcı ID:', userId);
      
      // Kullanıcıya atanmış müşteri ID'lerini getir
      const { data, error } = await supabase
        .from('user_customer_assignments')
        .select('customer_id')
        .eq('user_id', userId);
        
      if (error) {
        console.error('Atanmış müşteri listesi hatası:', error);
        return [];
      }
      
      const customerIds = data.map(assignment => assignment.customer_id);
      console.log(`fetchAssignedCustomerIds - ${customerIds.length} müşteri ID'si bulundu`);
      return customerIds;
    } catch (error) {
      console.error('Atanmış müşteri listesi hatası:', error);
      return [];
    }
  };

  // Belirli bir müşteriye erişim izni var mı kontrol et
  const checkCustomerAccess = useCallback(async (customerId) => {
    // Yükleme bitmeden işlem yapma
    if (loading) {
      console.log('checkCustomerAccess - Henüz yükleniyor, bekleyin');
      return false;
    }
    
    if (!user) {
      console.log('checkCustomerAccess - Kullanıcı oturumu bulunamadı');
      return false;
    }
    
    // Yönetici ve muhasebe her müşteriye erişebilir - Otomatik olarak TRUE dön
    console.log('checkCustomerAccess - Kullanıcı rolleri kontrolü:', { isAdmin, isMuhasebe });
    if (isAdmin || isMuhasebe) {
      console.log('checkCustomerAccess - Admin veya muhasebe kullanıcısı, erişim var');
      return true;
    }
    
    // Normal kullanıcı için müşteri atamasını kontrol et
    console.log('checkCustomerAccess - Normal kullanıcı, müşteri ataması kontrol ediliyor');
    
    try {
      // Direkt sorgu ile kontrol et - en güvenilir yöntem
      const { data, error } = await supabase
        .from('user_customer_assignments')
        .select('id')
        .eq('user_id', user.id)
        .eq('customer_id', customerId)
        .maybeSingle();
        
      if (error && error.code !== 'PGRST116') {
        console.error('Müşteri erişim kontrolü hatası:', error);
        return false;
      }
      
      console.log('checkCustomerAccess - Sorgu sonucu:', data ? 'Erişim var' : 'Erişim yok');
      return !!data; // Atama varsa erişim izni var
    } catch (error) {
      console.error('Müşteri erişim kontrolü hatası:', error);
      return false;
    }
  }, [user, isAdmin, isMuhasebe, loading]);

  // Kullanıcının erişebileceği müşteri verilerini filtrele
  const filterCustomersByAccess = useCallback(async (queryBuilder) => {
    if (loading) {
      console.log('filterCustomersByAccess - Henüz yükleniyor, bekleyin');
      return queryBuilder.filter('id', 'eq', '00000000-0000-0000-0000-000000000000');
    }
    
    if (!user) {
      console.log('filterCustomersByAccess - Kullanıcı oturumu yok, boş sonuç döndürülüyor');
      return queryBuilder.filter('id', 'eq', '00000000-0000-0000-0000-000000000000');
    }
    
    // Yönetici ve muhasebe tüm müşterilere erişebilir - Filtreleme uygulanmaz
    if (isAdmin || isMuhasebe) {
      console.log('filterCustomersByAccess - Admin veya muhasebe kullanıcısı, tüm müşteriler erişilebilir');
      return queryBuilder;
    }
    
    // Kullanıcıya atanmış müşteri ID'leri
    console.log('filterCustomersByAccess - Normal kullanıcı, atanmış müşteriler için filtre uygulanacak');
    let assignedIds = [];
    
    // Önce önbelleğe alınmış ID'leri kontrol et
    if (assignedCustomerIds.length > 0) {
      console.log('filterCustomersByAccess - Önbellekten atanmış müşteri ID\'leri kullanılıyor');
      assignedIds = assignedCustomerIds;
    } else {
      // Yoksa veritabanından yükle
      console.log('filterCustomersByAccess - Atanmış müşteri ID\'leri yükleniyor');
      assignedIds = await fetchAssignedCustomerIds(user.id);
    }
    
    console.log(`filterCustomersByAccess - ${assignedIds.length} atanmış müşteri ID'si bulundu`);
    
    if (assignedIds.length === 0) {
      // Hiç atanmış müşteri yoksa boş sonuç döndür
      // Supabase'de hiçbir sonuç vermeyecek bir koşul ekle
      console.log('filterCustomersByAccess - Atanmış müşteri yok, boş sonuç döndürülüyor');
      return queryBuilder.filter('id', 'eq', '00000000-0000-0000-0000-000000000000');
    }
    
    // Sadece atanmış müşterileri getir
    console.log('filterCustomersByAccess - Atanmış müşteri ID\'leri filtresi uygulanıyor');
    return queryBuilder.in('id', assignedIds);
  }, [user, isAdmin, isMuhasebe, loading, assignedCustomerIds]);

  // Kullanıcının sadece atanan müşteri ID'lerini al (admin için boş dizi döner - tümü erişilebilir)
  const getAssignedCustomerIds = useCallback(async () => {
    if (loading) {
      console.log('getAssignedCustomerIds - Henüz yükleniyor, bekleyin');
      return [];
    }
    
    if (!user) {
      console.log('getAssignedCustomerIds - Kullanıcı oturumu bulunamadı');
      return [];
    }
    
    // Yönetici ve muhasebe için boş dizi dön - filtre uygulanmaz
    if (isAdmin || isMuhasebe) {
      console.log('getAssignedCustomerIds - Admin veya muhasebe kullanıcısı, tüm müşterilere erişim var');
      return [];
    }
    
    // Zaten yüklenmiş ID'ler varsa kullan
    if (assignedCustomerIds.length > 0) {
      console.log(`getAssignedCustomerIds - Önbellekten ${assignedCustomerIds.length} müşteri ID'si döndürülüyor`);
      return assignedCustomerIds;
    }
    
    // Yoksa yeniden yükle
    console.log('getAssignedCustomerIds - Müşteri ID\'leri yükleniyor');
    const ids = await fetchAssignedCustomerIds(user.id);
    return ids;
  }, [user, isAdmin, isMuhasebe, loading, assignedCustomerIds]);

  return {
    user,
    isAdmin,
    isMuhasebe,
    loading,
    checkCustomerAccess,
    getAssignedCustomerIds,
    filterCustomersByAccess,
    assignedCustomerIds
  };
};