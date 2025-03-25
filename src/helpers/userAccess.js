import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';

// Kullanıcı erişim kontrolü için yardımcı fonksiyonlar
export const useUserAccess = () => {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

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
        
        // Yönetici rolünü kontrol et
        setIsAdmin(data?.role === 'admin');
      } catch (error) {
        console.error('Kullanıcı kontrolü hatası:', error);
      } finally {
        setLoading(false);
      }
    };

    checkUser();
  }, []);

  // Belirli bir müşteriye erişim izni var mı kontrol et
  const checkCustomerAccess = async (customerId) => {
    if (!user) return false;
    
    // Yönetici her müşteriye erişebilir
    if (isAdmin) return true;
    
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

  // Kullanıcıya atanmış müşteri ID'lerini getir
  const getAssignedCustomerIds = async () => {
    if (!user) return [];
    
    // Yönetici için tüm müşteri ID'lerini getir
    if (isAdmin) {
      const { data, error } = await supabase
        .from('customers')
        .select('id');
        
      if (error) {
        console.error('Müşteri ID listesi hatası:', error);
        return [];
      }
      
      return data.map(customer => customer.id);
    }
    
    try {
      // Kullanıcıya atanmış müşteri ID'lerini getir
      const { data, error } = await supabase
        .from('user_customer_assignments')
        .select('customer_id')
        .eq('user_id', user.id);
        
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

  // Kullanıcının erişebileceği müşteri verilerini filtrele
  const filterCustomersByAccess = useCallback(async (queryBuilder) => {
    if (!user) return queryBuilder;
    
    // Yönetici tüm müşterilere erişebilir
    if (isAdmin) return queryBuilder;
    
    // Kullanıcıya atanmış müşteri ID'lerini al
    const assignedIds = await getAssignedCustomerIds();
    
    if (assignedIds.length === 0) {
      // Hiç atanmış müşteri yoksa boş sonuç döndür
      // Supabase'de hiçbir sonuç vermeyecek bir koşul ekle
      return queryBuilder.filter('id', 'eq', '00000000-0000-0000-0000-000000000000');
    }
    
    // Sadece atanmış müşterileri getir
    return queryBuilder.in('id', assignedIds);
  }, [user, isAdmin]);

  return {
    user,
    isAdmin,
    loading,
    checkCustomerAccess,
    getAssignedCustomerIds,
    filterCustomersByAccess
  };
};

// Kullanımı:
// 1. Bileşende import et:
// import { useUserAccess } from '../helpers/userAccess';
//
// 2. Bileşen içinde kullan:
// const { isAdmin, filterCustomersByAccess } = useUserAccess();
//
// 3. Supabase sorgusu yaparken filtrele:
// let query = supabase.from('customers').select('*');
// query = await filterCustomersByAccess(query);
// const { data, error } = await query;