import React, { useState, useEffect } from 'react';

// Responsive tablo bileşeni - mobil görünümde kart stiline dönüşür
const ResponsiveTable = ({ columns, data, actions, emptyMessage = "Veri bulunamadı." }) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 480);
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 480);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Veri yoksa boş mesaj göster
  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
        {emptyMessage}
      </div>
    );
  }
  
  // Normal tablo görünümü (Masaüstü)
  const renderTableView = () => (
    <div className="table-container">
      <table className="regular-table">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={index} style={column.style || {}}>
                {column.header}
              </th>
            ))}
            {actions && <th>İşlemler</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column, colIndex) => (
                <td key={colIndex} style={column.cellStyle || {}}>
                  {column.render ? column.render(row) : row[column.accessor]}
                </td>
              ))}
              {actions && (
                <td>
                  {typeof actions === 'function' ? actions(row) : actions}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  
  // Kart görünümü (Mobil)
  const renderCardView = () => (
    <div className="card-table">
      {data.map((row, rowIndex) => (
        <div key={rowIndex} className="table-card">
          {columns.map((column, colIndex) => (
            <div key={colIndex} className="row">
              <div className="label">{column.header}</div>
              <div className="value">
                {column.render ? column.render(row) : row[column.accessor]}
              </div>
            </div>
          ))}
          {actions && (
            <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
              {typeof actions === 'function' ? actions(row) : actions}
            </div>
          )}
        </div>
      ))}
    </div>
  );
  
  return (
    <>
      {isMobile ? renderCardView() : renderTableView()}
    </>
  );
};

export default ResponsiveTable;