import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';

// Kullanıcı erişim kontrolü için yardımcı fonksiyonlar
export const useUserAccess = () => {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMuhasebe, setIsMuhasebe] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assignedCustomerIds, setAssignedCustomerIds] = useState([]);

  useEffect(() => {
    // Mevcut kullanıcı oturumunu kontrol et ve rolünü al
    const checkUser = async () => {
      try {
        setLoading(true);
        
        // Oturum açmış kullanıcıyı al
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setUser(null);
          setIsAdmin(false);
          setIsMuhasebe(false);
          setAssignedCustomerIds([]);
          return;
        }
        
        setUser(user);
        
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
        const adminRole = data?.role === 'admin';
        const muhasebeRole = data?.role === 'muhasebe';
        
        setIsAdmin(adminRole);
        setIsMuhasebe(muhasebeRole);
        
        // Sadece normal kullanıcılar için atanmış müşteri ID'lerini getir
        // Admin ve muhasebe kullanıcıları tüm müşterilere otomatik erişebilir
        if (!adminRole && !muhasebeRole) {
          const ids = await fetchAssignedCustomerIds(user.id);
          setAssignedCustomerIds(ids);
        }
        
      } catch (error) {
        console.error('Kullanıcı kontrolü hatası:', error);
      } finally {
        setLoading(false);
      }
    };

    checkUser();
  }, []);

  // Kullanıcıya atanmış müşteri ID'lerini getir (sadece normal kullanıcılar için)
  const fetchAssignedCustomerIds = async (userId) => {
    try {
      // Kullanıcıya atanmış müşteri ID'lerini getir
      const { data, error } = await supabase
        .from('user_customer_assignments')
        .select('customer_id')
        .eq('user_id', userId);
        
      if (error) {
        console.error('Atanmış müşteri listesi hatası:', error);
        return [];
      }
      
      return data.map(assignment => assignment.customer_id);
    } catch (error) {
      console.error('Atanmış müşteri listesi hatası:', error);
      return [];
    }
  };

  // Belirli bir müşteriye erişim izni var mı kontrol et
  const checkCustomerAccess = async (customerId) => {
    if (!user) return false;
    
    // Yönetici ve muhasebe her müşteriye erişebilir - Otomatik olarak TRUE dön
    if (isAdmin || isMuhasebe) return true;
    
    // Atanmış müşteriler listesi doluysa
    if (assignedCustomerIds.length > 0) {
      return assignedCustomerIds.includes(customerId);
    }
    
    try {
      // Bu müşteri kullanıcıya atanmış mı kontrol et
      const { data, error } = await supabase
        .from('user_customer_assignments')
        .select('id')
        .eq('user_id', user.id)
        .eq('customer_id', customerId)
        .maybeSingle();
        
      if (error) {
        console.error('Müşteri erişim kontrolü hatası:', error);
        return false;
      }
      
      return !!data; // Atama varsa erişim izni var
    } catch (error) {
      console.error('Müşteri erişim kontrolü hatası:', error);
      return false;
    }
  };

  // Kullanıcının erişebileceği müşteri verilerini filtrele
  const filterCustomersByAccess = useCallback(async (queryBuilder) => {
    if (!user) return queryBuilder;
    
    // Yönetici ve muhasebe tüm müşterilere erişebilir - Filtreleme uygulanmaz
    if (isAdmin || isMuhasebe) return queryBuilder;
    
    // Kullanıcıya atanmış müşteri ID'leri
    const assignedIds = assignedCustomerIds.length > 0 
      ? assignedCustomerIds 
      : await fetchAssignedCustomerIds(user.id);
    
    if (assignedIds.length === 0) {
      // Hiç atanmış müşteri yoksa boş sonuç döndür
      // Supabase'de hiçbir sonuç vermeyecek bir koşul ekle
      return queryBuilder.filter('id', 'eq', '00000000-0000-0000-0000-000000000000');
    }
    
    // Sadece atanmış müşterileri getir
    return queryBuilder.in('id', assignedIds);
  }, [user, isAdmin, isMuhasebe, assignedCustomerIds]);

  // Kullanıcının sadece atanan müşteri ID'lerini al (admin için boş dizi döner - tümü erişilebilir)
  const getAssignedCustomerIds = useCallback(async () => {
    if (!user) return [];
    
    // Yönetici ve muhasebe için boş dizi dön - filtre uygulanmaz
    if (isAdmin || isMuhasebe) {
      return [];
    }
    
    // Zaten yüklenmiş ID'ler varsa kullan
    if (assignedCustomerIds.length > 0) {
      return assignedCustomerIds;
    }
    
    // Yoksa yeniden yükle
    return await fetchAssignedCustomerIds(user.id);
  }, [user, isAdmin, isMuhasebe, assignedCustomerIds]);

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