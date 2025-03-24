import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { format, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'react-toastify';

const CustomerDetail = () => {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchCustomerData = useCallback(async () => {
    setLoading(true);
    try {
      // Müşteri bilgisini al
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();
      if (customerError) throw customerError;

      // Müşterinin ödemelerini al
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .eq('customer_id', id)
        .order('due_date', { ascending: false });
      if (paymentsError) throw paymentsError;

      setCustomer(customerData);
      setPayments(paymentsData || []);
    } catch (error) {
      toast.error('Müşteri bilgileri yüklenirken bir hata oluştu');
      console.error('Error loading customer data:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchCustomerData();
    }
  }, [id, fetchCustomerData]);

  const markAsPaid = async (paymentId) => {
    try {
      const { error } = await supabase
        .from('payments')
        .update({ is_paid: true })
        .eq('id', paymentId);
      if (error) throw error;

      setPayments(
        payments.map((payment) =>
          payment.id === paymentId ? { ...payment, is_paid: true } : payment
        )
      );
      toast.success('Ödeme başarıyla ödendi olarak işaretlendi');
    } catch (error) {
      toast.error('Ödeme durumu güncellenirken bir hata oluştu');
      console.error('Error updating payment status:', error);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px' }}>Yükleniyor...</div>;
  }

  if (!customer) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <p>Müşteri bulunamadı</p>
        <Link to="/customers" className="btn btn-primary">
          Müşteri Listesine Dön
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <Link
          to="/customers"
          style={{ display: 'inline-flex', alignItems: 'center', color: '#3498db', textDecoration: 'none' }}
        >
          ← Müşteri Listesine Dön
        </Link>
      </div>
      <div className="card">
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
          {customer.name}
        </h1>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px',
            marginBottom: '20px'
          }}
        >
          <div>
            <p style={{ fontSize: '14px', color: '#888' }}>Müşteri Kodu</p>
            <p style={{ fontWeight: 'bold' }}>{customer.code}</p>
          </div>
          <div>
            <p style={{ fontSize: '14px', color: '#888' }}>Sektör</p>
            <p style={{ fontWeight: 'bold' }}>{customer.sector_code || '-'}</p>
          </div>
          <div>
            <p style={{ fontSize: '14px', color: '#888' }}>Grup</p>
            <p style={{ fontWeight: 'bold' }}>{customer.group_code || '-'}</p>
          </div>
          <div>
            <p style={{ fontSize: '14px', color: '#888' }}>Bölge</p>
            <p style={{ fontWeight: 'bold' }}>{customer.region_code || '-'}</p>
          </div>
          <div>
            <p style={{ fontSize: '14px', color: '#888' }}>Ödeme Vadesi</p>
            <p style={{ fontWeight: 'bold' }}>{customer.payment_term || '-'}</p>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>Ödeme Bilgileri</h2>
        {payments.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Vade Tarihi</th>
                <th>Tutar</th>
                <th>Durum</th>
                <th>Referans Tarihi</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => {
                const daysLeft = payment.due_date
                  ? differenceInDays(new Date(payment.due_date), new Date())
                  : null;

                let statusClass = 'badge-info';
                let statusText = 'Normal';

                if (payment.is_paid) {
                  statusClass = 'badge-success';
                  statusText = 'Ödendi';
                } else if (daysLeft !== null) {
                  if (daysLeft < 0) {
                    statusClass = 'badge-danger';
                    statusText = `${Math.abs(daysLeft)} gün gecikmiş`;
                  } else if (daysLeft <= 5) {
                    statusClass = 'badge-warning';
                    statusText = daysLeft === 0 ? 'Bugün' : `${daysLeft} gün kaldı`;
                  }
                }

                return (
                  <tr key={payment.id}>
                    <td>
                      {payment.due_date
                        ? format(new Date(payment.due_date), 'dd.MM.yyyy', { locale: tr })
                        : '-'}
                    </td>
                    <td>
                      {payment.past_due_balance
                        ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(payment.past_due_balance)
                        : '-'}
                    </td>
                    <td>
                      <span className={`badge ${statusClass}`}>{statusText}</span>
                    </td>
                    <td>
                      {payment.reference_date
                        ? format(new Date(payment.reference_date), 'dd.MM.yyyy', { locale: tr })
                        : '-'}
                    </td>
                    <td>
                      {!payment.is_paid && (
                        <button
                          onClick={() => markAsPaid(payment.id)}
                          className="btn btn-success"
                          style={{ padding: '4px 8px', fontSize: '12px', marginRight: '5px' }}
                        >
                          Ödendi İşaretle
                        </button>
                      )}
                      <Link
                        to={`/customers/${payment.customer_id}`}
                        style={{ color: '#3498db', textDecoration: 'none' }}
                      >
                        Detay
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
            Bu müşteriye ait ödeme kaydı bulunmuyor.
          </p>
        )}
      </div>
    </div>
  );
};

export default CustomerDetail;
