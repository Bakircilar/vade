// src/services/notificationService.js
import { supabase } from './supabase';

// Bildirim türleri
export const NOTIFICATION_TYPES = {
  UPCOMING_PAYMENT: 'upcoming_payment',
  OVERDUE_PAYMENT: 'overdue_payment',
  NOTE_REMINDER: 'note_reminder',
  SYSTEM_NOTIFICATION: 'system_notification'
};

// Kullanıcı için bildirim tercihleri getir
export const getUserNotificationPreferences = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();
      
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    
    // Eğer tercihler yoksa varsayılan değerleri kullan
    if (!data) {
      return {
        user_id: userId,
        upcoming_payment_days: 7, // 7 gün önceden bildir
        show_on_login: true,
        created_at: new Date().toISOString()
      };
    }
    
    return data;
  } catch (error) {
    console.error('Bildirim tercihleri getirme hatası:', error);
    throw error;
  }
};

// Kullanıcı bildirim tercihlerini kaydet
export const saveUserNotificationPreferences = async (preferences) => {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert(preferences)
      .single();
      
    if (error) throw error;
    
    return data;
  } catch (error) {
    console.error('Bildirim tercihleri kaydetme hatası:', error);
    throw error;
  }
};

// Kullanıcının okunmamış bildirimlerini getir
export const getUserNotifications = async (userId, options = { limit: 50, includeRead: false }) => {
  try {
    let query = supabase
      .from('notifications')
      .select(`
        *,
        customers (name, code)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(options.limit);
      
    // Okunmamış bildirimleri filtrele
    if (!options.includeRead) {
      query = query.eq('is_read', false);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('Bildirim getirme hatası:', error);
    return [];
  }
};

// Bir bildirimi okundu olarak işaretle
export const markNotificationAsRead = async (notificationId) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId);
      
    if (error) throw error;
    
    return true;
  } catch (error) {
    console.error('Bildirim güncelleme hatası:', error);
    return false;
  }
};

// Tüm bildirimleri okundu olarak işaretle
export const markAllNotificationsAsRead = async (userId) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_read', false);
      
    if (error) throw error;
    
    return true;
  } catch (error) {
    console.error('Tüm bildirimleri güncelleme hatası:', error);
    return false;
  }
};

// Yeni bildirimler oluştur
export const createNotification = async (notification) => {
  try {
    // Bildirim nesnesini doğrula
    if (!notification.user_id || !notification.type || !notification.title) {
      throw new Error('Geçersiz bildirim bilgileri');
    }
    
    // Bildirim oluştur
    const notificationObject = {
      ...notification,
      is_read: false,
      created_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('notifications')
      .insert([notificationObject]);
      
    if (error) throw error;
    
    return data;
  } catch (error) {
    console.error('Bildirim oluşturma hatası:', error);
    throw error;
  }
};