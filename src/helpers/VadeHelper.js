// src/helpers/VadeHelper.js
// ÖNEMLİ: Vadesi geçmiş ve yaklaşan vade hesaplaması düzeltildi

export default class VadeHelper {
  // Sabitler
  static MIN_BALANCE = 100;
  
  /**
   * Tarih kontrolü - geçerli bir tarih mi?
   * @param {any} dateValue - Kontrol edilecek tarih değeri
   * @returns {boolean} - Geçerli bir tarih mi
   */
  static isValidDate(dateValue) {
    if (!dateValue) return false;
    
    try {
      const date = new Date(dateValue);
      return !isNaN(date.getTime());
    } catch (err) {
      console.error("Tarih doğrulama hatası:", err);
      return false;
    }
  }
  
  /**
   * Bakiye değerini güvenli şekilde sayıya çevirir
   * @param {any} value - Çevrilecek değer
   * @returns {number} - Sayısal değer
   */
  static parseAmount(value) {
    if (value === null || value === undefined || value === '') return 0;
    
    try {
      // String ise, Türkçe veya İngilizce formatına göre çevir
      if (typeof value === 'string') {
        // Binlik ayırıcı noktaları kaldır, virgülü noktaya çevir
        const normalizedValue = value.replace(/\./g, '').replace(',', '.');
        return parseFloat(normalizedValue) || 0;
      }
      
      // Direkt sayıya çevir
      return parseFloat(value) || 0;
    } catch (err) {
      console.error("Sayı dönüştürme hatası:", err, value);
      return 0;
    }
  }
  
  /**
   * Toplam bakiye hesapla
   * @param {Object} balance - Bakiye nesnesi
   * @returns {number} - Toplam bakiye
   */
  static calculateTotal(balance) {
    try {
      const pastDueBalance = this.parseAmount(balance.past_due_balance);
      const notDueBalance = this.parseAmount(balance.not_due_balance);
      const totalBalance = this.parseAmount(balance.total_balance);
      
      // Eğer total_balance varsa onu kullan, yoksa hesapla
      return totalBalance || (pastDueBalance + notDueBalance);
    } catch (err) {
      console.error("Toplam bakiye hesaplama hatası:", err);
      return 0;
    }
  }
  
  /**
   * ÖNEMLİ: VADESİ GEÇMİŞ KONTROLÜ
   * past_due_balance > 100 TL ise vadesi geçmiş sayılır
   * @param {Object} balance - Bakiye nesnesi
   * @returns {boolean} - Vadesi geçmiş mi
   */
  static isPastDue(balance) {
    try {
      // past_due_balance alanını kontrol et
      const pastDueBalance = this.parseAmount(balance.past_due_balance);
      
      // 100 TL üzerindeyse vadesi geçmiş
      return pastDueBalance > this.MIN_BALANCE;
    } catch (err) {
      console.error("Vadesi geçmiş kontrolü hatası:", err);
      return false;
    }
  }
  
  /**
   * ÖNEMLİ: YAKLAŞAN VADE KONTROLÜ
   * not_due_balance > 100 TL ve not_due_date bugünden gelecekteki bir tarih ise yaklaşan sayılır
   * @param {Object} balance - Bakiye nesnesi
   * @param {number} daysAhead - Kaç gün ilerisine bakılacak
   * @returns {boolean} - Yaklaşan vade mi
   */
  static isUpcoming(balance, daysAhead = 15) {
    try {
      // not_due_balance alanını kontrol et
      const notDueBalance = this.parseAmount(balance.not_due_balance);
      
      // 100 TL altındaysa yaklaşan vade değil
      if (notDueBalance <= this.MIN_BALANCE) return false;
      
      // not_due_date yoksa yaklaşan vade değil
      if (!balance.not_due_date) return false;
      
      // Tarih geçerli mi?
      if (!this.isValidDate(balance.not_due_date)) return false;
      
      // Bugünün tarihi
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Vade tarihi
      const dueDate = new Date(balance.not_due_date);
      dueDate.setHours(0, 0, 0, 0);
      
      // daysAhead gün sonrası
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + daysAhead);
      
      // Vade tarihi bugün ile futureDate arasında mı?
      return dueDate >= today && dueDate <= futureDate;
    } catch (err) {
      console.error("Yaklaşan vade kontrolü hatası:", err);
      return false;
    }
  }
  
  /**
   * Bakiye analizi
   * @param {Object} balance - Bakiye nesnesi
   * @param {number} daysAhead - Kaç gün ilerisine bakılacak
   * @returns {Object} - Analiz sonucu
   */
  static analyzeBalance(balance, daysAhead = 15) {
    // Bakiye yoksa null döndür
    if (!balance) return null;
    
    try {
      // Bakiye değerlerini parse et
      const pastDueBalance = this.parseAmount(balance.past_due_balance);
      const notDueBalance = this.parseAmount(balance.not_due_balance);
      const totalBalance = this.calculateTotal(balance);
      
      // ÖNEMLİ: Sadece past_due_balance > 100 kontrolü yap
      // Tarih kontrolü yapma, Excel'den geldiyse zaten vadesi geçmiş demektir
      const isPastDue = pastDueBalance > this.MIN_BALANCE;
      
      // Yaklaşan vade kontrolü
      const isUpcoming = this.isUpcoming(balance, daysAhead);
      
      // Vade tarihi
      let dueDate = null;
      
      // Vadesi geçmiş için past_due_date
      if (isPastDue && balance.past_due_date && this.isValidDate(balance.past_due_date)) {
        dueDate = new Date(balance.past_due_date);
      } 
      // Yaklaşan vade için not_due_date
      else if (isUpcoming && balance.not_due_date && this.isValidDate(balance.not_due_date)) {
        dueDate = new Date(balance.not_due_date);
      }
      
      return {
        isPastDue,
        isUpcoming,
        dueDate,
        pastDueBalance,
        notDueBalance,
        totalBalance,
        isCustomer: totalBalance >= 0,
        isSupplier: totalBalance < 0
      };
    } catch (err) {
      console.error("Bakiye analizi hatası:", err);
      return null;
    }
  }
}