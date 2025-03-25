import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';

// Kullanıcı erişim kontrolü için yardımcı fonksiyonlar
export const useUserAccess = () => {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMuhasebe, setIsMuhasebe] = useState(false); // Muhasebe rolü için eklendi
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
          setIsMuhasebe(false);
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
        setIsAdmin(data?.role === 'admin');
        setIsMuhasebe(data?.role === 'muhasebe'); // Muhasebe rolünü kontrol et
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
    
    // Yönetici ve muhasebe her müşteriye erişebilir
    if (isAdmin || isMuhasebe) return true;
    
    try {
      // Önce müşteri sektörünü kontrol et
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('sector_code')
        .eq('id', customerId)
        .single();
        
      if (customerError) {
        console.error('Müşteri sektör kontrolü hatası:', customerError);
        return false;
      }
      
      // Eğer satıcı sektöründe ise, normal kullanıcı erişemez
      if (customerData?.sector_code === 'satıcı') {
        return false;
      }
      
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
    
    // Yönetici ve muhasebe için tüm müşteri ID'lerini getir
    if (isAdmin || isMuhasebe) {
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
    
    // Yönetici ve muhasebe tüm müşterilere erişebilir
    if (isAdmin || isMuhasebe) return queryBuilder;
    
    // Normal kullanıcılar "satıcı" sektöründeki müşterileri göremez
    queryBuilder = queryBuilder.not('sector_code', 'eq', 'satıcı');
    
    // Kullanıcıya atanmış müşteri ID'lerini al
    const assignedIds = await getAssignedCustomerIds();
    
    if (assignedIds.length === 0) {
      // Hiç atanmış müşteri yoksa boş sonuç döndür
      // Supabase'de hiçbir sonuç vermeyecek bir koşul ekle
      return queryBuilder.filter('id', 'eq', '00000000-0000-0000-0000-000000000000');
    }
    
    // Sadece atanmış müşterileri getir
    return queryBuilder.in('id', assignedIds);
  }, [user, isAdmin, isMuhasebe]);

  return {
    user,
    isAdmin,
    isMuhasebe, // Muhasebe rolünü de döndür
    loading,
    checkCustomerAccess,
    getAssignedCustomerIds,
    filterCustomersByAccess
  };
};