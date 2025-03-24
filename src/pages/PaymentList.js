import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { format, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'react-toastify';

const PaymentList = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const filterType = searchParams.get('filter') || 'all';

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('payments')
        .select(`
          *,
          customers (
            id,
            code,
            name
          )
        `)
        .eq('is_paid', false)
        .order('due_date', { ascending: true });

      if (filterType === 'upcoming') {
        const currentDate = new Date();
        const fiveDaysLater = new Date();
        fiveDaysLater.setDate(currentDate.getDate() + 5);
        query = query
          .gte('due_date', currentDate.toISOString().split('T')[0])
          .lte('due_date', fiveDaysLater.toISOString().split('T')[0]);
      } else if (filterType === 'overdue') {
        const currentDate = new Date();
        query = query.lt('due_date', currentDate.toISOString().split('T')[0]);
      }

      const { data, error } = await query;
      if (error) throw error;
      setPayments(data || []);
    } catch (error) {
      toast.error('Ödemeler yüklenirken bir hata oluştu');
      console.error('Error loading payments:', error);
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const markAsPaid = async (paymentId) => {
    try {
      const { error } = await supabase
        .from('payments')
        .update({ is_paid: true })
        .eq('id', paymentId);
      if (error) throw error;
      setPayments(payments.filter(payment => payment.id !== paymentId));
      toast.success('Ödeme başarıyla ödendi olarak işaretlendi');
    } catch (error) {
      toast.error('Ödeme durumu güncellenirken bir hata oluştu');
      console.error('Error updating payment status:', error);
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}
      >
        <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Vade Takip Listesi</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link
            to="/payments"
            className={`btn ${filterType === 'all' || !filterType ? 'btn-primary' : ''}`}
            style={{ padding: '6px 12px' }}
          >
            Tümü
          </Link>
          <Link
            to="/payments?filter=upcoming"
            className={`btn ${filterType === 'upcoming' ? 'btn-primary' : ''}`}
            style={{ padding: '6px 12px' }}
          >
            Yaklaşanlar
          </Link>
          <Link
            to="/payments?filter=overdue"
            className={`btn ${filterType === 'overdue' ? 'btn-primary' : ''}`}
            style={{ padding: '6px 12px' }}
          >
            Vadesi Geçmiş
          </Link>
        </div>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Yükleniyor...</div>
      ) : (
        <div className="card">
          {payments.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Müşteri</th>
                  <th>Vade Tarihi</th>
                  <th>Tutar</th>
                  <th>Durum</th>
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

                  if (daysLeft !== null) {
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
                        <div style={{ fontWeight: 'bold' }}>
                          {payment.customers?.name || '-'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#888' }}>
                          {payment.customers?.code || payment.customer_code || '-'}
                        </div>
                      </td>
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
                        <button
                          onClick={() => markAsPaid(payment.id)}
                          className="btn btn-success"
                          style={{ padding: '4px 8px', fontSize: '12px', marginRight: '5px' }}
                        >
                          Ödendi İşaretle
                        </button>
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
              Bu filtreye uygun ödeme bulunmuyor.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default PaymentList;
