import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';

const ImportExcel = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(0);
  const [recordsProcessed, setRecordsProcessed] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const fileType = selectedFile.name.split('.').pop().toLowerCase();
      if (fileType !== 'xlsx' && fileType !== 'xls') {
        toast.error('Lütfen geçerli bir Excel dosyası yükleyin (.xlsx, .xls)');
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Lütfen bir Excel dosyası seçin');
      return;
    }
    setUploading(true);
    setProgress(10);
    try {
      const data = await readExcelFile(file);
      setProgress(30);
      const customers = processExcelData(data);
      setProgress(50);
      const keys = Object.keys(customers);
      setTotalRecords(keys.length);
      await uploadToSupabaseBulk(customers);
      setProgress(100);
      toast.success('Veriler başarıyla içe aktarıldı');
      setFile(null);
    } catch (error) {
      console.error('Import error:', error);
      toast.error(`Veri içe aktarma hatası: ${error.message}`);
    } finally {
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
        setEstimatedTime(0);
        setRecordsProcessed(0);
        setTotalRecords(0);
      }, 1000);
    }
  };

  const readExcelFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          resolve(jsonData);
        } catch (error) {
          reject(new Error('Excel dosyası okunamadı: ' + error.message));
        }
      };
      reader.onerror = () => reject(new Error('Dosya okunamadı'));
      reader.readAsArrayBuffer(file);
    });
  };

  const processExcelData = (data) => {
    const headers = data[0];
    const customers = {};
    const findColumnIndex = (name) => {
      return headers.findIndex(header =>
        header && header.toString().toLowerCase().includes(name.toLowerCase())
      );
    };
    const codeIndex = findColumnIndex('cari hesap kodu');
    const nameIndex = findColumnIndex('cari hesap adı');
    const sectorIndex = findColumnIndex('sektör kodu');
    const groupIndex = findColumnIndex('grup kodu');
    const regionIndex = findColumnIndex('bölge kodu');
    const paymentTermIndex = findColumnIndex('cari ödeme vadesi');
    const pastDueBalanceIndex = findColumnIndex('vadesi geçen bakiye');
    const dueDateIndex = findColumnIndex('vadesi geçen bakiye vadesi');
    const valorIndex = findColumnIndex('valör');
    const notDueBalanceIndex = findColumnIndex('vadesi geçmemiş bakiye');
    const totalBalanceIndex = findColumnIndex('toplam bakiye');
    const refDateIndex = findColumnIndex('bakiyeye konu ilk evrak');
    if (codeIndex === -1 || nameIndex === -1) {
      throw new Error('Gerekli sütunlar bulunamadı. Excel formatınızı kontrol edin.');
    }
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[codeIndex]) continue;
      const customerCode = row[codeIndex].toString();
      if (customers[customerCode]) {
        console.warn(`Müşteri kodu '${customerCode}' birden fazla satırda bulundu. Sadece ilk satır işlenecek.`);
        continue;
      }
      let dueDate = null;
      if (row[dueDateIndex]) {
        if (typeof row[dueDateIndex] === 'number') {
          dueDate = new Date(Math.round((row[dueDateIndex] - 25569) * 86400 * 1000));
        } else if (typeof row[dueDateIndex] === 'string') {
          const parts = row[dueDateIndex].split('.');
          if (parts.length === 3) {
            dueDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
          }
        }
      }
      let refDate = null;
      if (row[refDateIndex]) {
        if (typeof row[refDateIndex] === 'number') {
          refDate = new Date(Math.round((row[refDateIndex] - 25569) * 86400 * 1000));
        } else if (typeof row[refDateIndex] === 'string') {
          const parts = row[refDateIndex].split('.');
          if (parts.length === 3) {
            refDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
          }
        }
      }
      customers[customerCode] = {
        customer: {
          code: customerCode,
          name: row[nameIndex],
          sector_code: row[sectorIndex],
          group_code: row[groupIndex],
          region_code: row[regionIndex],
          payment_term: row[paymentTermIndex]
        },
        balance: {
          past_due_balance: parseFloat(row[pastDueBalanceIndex] || 0),
          due_date: dueDate ? dueDate.toISOString().split('T')[0] : null,
          valor: parseInt(row[valorIndex] || 0),
          not_due_balance: parseFloat(row[notDueBalanceIndex] || 0),
          total_balance: parseFloat(row[totalBalanceIndex] || 0),
          reference_date: refDate ? refDate.toISOString().split('T')[0] : null
        }
      };
    }
    return customers;
  };

  const uploadToSupabaseBulk = async (customers) => {
    const keys = Object.keys(customers);
    // Müşteri verilerini diziye dönüştür
    const customersArray = keys.map(code => ({
      code: customers[code].customer.code,
      name: customers[code].customer.name,
      sector_code: customers[code].customer.sector_code,
      group_code: customers[code].customer.group_code,
      region_code: customers[code].customer.region_code,
      payment_term: customers[code].customer.payment_term,
      updated_at: new Date().toISOString()
    }));
    // Bulk upsert ile müşterileri ekle/güncelle
    const { data: upsertedCustomers, error: upsertError } = await supabase
      .from('customers')
      .upsert(customersArray, { onConflict: 'code', returning: 'representation' });
    if (upsertError) throw upsertError;
    // Müşteri kodundan id'leri eşle
    let customerMap = {};
    if (upsertedCustomers && upsertedCustomers.length > 0) {
      upsertedCustomers.forEach(customer => {
        customerMap[customer.code] = customer.id;
      });
    } else {
      // Eğer upsert sonucu boş geldiyse, yeniden sorgula
      const { data: fetchedCustomers, error: fetchError } = await supabase
        .from('customers')
        .select('id, code')
        .in('code', keys);
      if (fetchError) throw fetchError;
      fetchedCustomers.forEach(customer => {
        customerMap[customer.code] = customer.id;
      });
    }
    // Bakiye verilerini diziye dönüştür; geçerli customer_id olanları dahil et
    const balancesArray = keys.map(code => {
      const cid = customerMap[code];
      if (!cid) {
        console.warn(`No customer id found for code ${code}`);
      }
      return {
        customer_id: cid,
        past_due_balance: customers[code].balance.past_due_balance,
        due_date: customers[code].balance.due_date,
        valor: customers[code].balance.valor,
        not_due_balance: customers[code].balance.not_due_balance,
        total_balance: customers[code].balance.total_balance,
        reference_date: customers[code].balance.reference_date,
        updated_at: new Date().toISOString()
      };
    }).filter(row => row.customer_id);
    
    // Eğer balancesArray boşsa, upsert yapmaya çalışmayın
    if (balancesArray.length === 0) {
      console.warn("Hiç geçerli bakiye kaydı bulunamadı. Upsert atlanıyor.");
      return;
    }
    
    const { error: balanceError } = await supabase
      .from('customer_balances')
      .upsert(balancesArray, { onConflict: 'customer_id', returning: 'minimal' });
    if (balanceError) throw balanceError;
  };

  return (
    <div className="card">
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        Excel Veri İçe Aktarma
      </h1>
      <p style={{ marginBottom: '20px' }}>
        Bu araç ile Excel dosyanızdaki müşteri ve vade bilgilerini sisteme aktarabilirsiniz.
        Her müşteri kodu sadece bir kez bulunmalıdır. Excel dosyanızın aşağıdaki sütunları içerdiğinden emin olun:
      </p>
      <ul style={{ marginBottom: '20px', marginLeft: '20px', listStyleType: 'disc' }}>
        <li>Cari hesap kodu</li>
        <li>Cari hesap adı</li>
        <li>Sektör kodu</li>
        <li>Grup kodu</li>
        <li>Bölge kodu</li>
        <li>Cari Ödeme Vadesi</li>
        <li>Vadesi geçen bakiye</li>
        <li>Vadesi geçen bakiye vadesi</li>
        <li>Valör</li>
        <li>Vadesi geçmemiş bakiye</li>
        <li>Toplam bakiye</li>
        <li>Bakiyeye konu ilk evrak tarihi</li>
      </ul>
      <div className="form-group">
        <label htmlFor="excelFile">Excel Dosyası Seçin</label>
        <input
          type="file"
          id="excelFile"
          accept=".xlsx, .xls"
          onChange={handleFileChange}
          style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
        />
      </div>
      {uploading && (
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              height: '10px',
              backgroundColor: '#e0e0e0',
              borderRadius: '5px',
              overflow: 'hidden',
              marginBottom: '5px'
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                backgroundColor: '#3498db',
                borderRadius: '5px'
              }}
            />
          </div>
          <p style={{ fontSize: '14px', color: '#666' }}>
            İçe aktarılıyor... {progress}% (İşlenen kayıt: {recordsProcessed} / {totalRecords}) {estimatedTime > 0 && `(Kalan süre: ${estimatedTime} dk)`}
          </p>
        </div>
      )}
      <button
        onClick={handleImport}
        disabled={!file || uploading}
        className="btn btn-primary"
        style={{ marginTop: '10px' }}
      >
        {uploading ? 'İşleniyor...' : 'İçe Aktar'}
      </button>
    </div>
  );
};

export default ImportExcel;
