// src/components/AdvancedSearch.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useUserAccess } from '../helpers/userAccess';

const AdvancedSearch = ({ onSearch, onReset }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchCriteria, setSearchCriteria] = useState({
    name: '',
    code: '',
    sector: '',
    region: '',
    balanceMin: '',
    balanceMax: '',
    pastDueOnly: false,
    hasNotes: false,
    notesKeyword: '',
    sortBy: 'name',
    sortDirection: 'asc'
  });
  
  const [sectors, setSectors] = useState([]);
  const [regions, setRegions] = useState([]);
  
  // User access control
  const { isAdmin, isMuhasebe } = useUserAccess();
  
  // Her açılışta sektör ve bölge listelerini getir
  useEffect(() => {
    if (isExpanded) {
      fetchSectorsAndRegions();
    }
  }, [isExpanded]);
  
  // Sektör ve bölge listelerini getir
  const fetchSectorsAndRegions = async () => {
    try {
      // Sektörleri getir
      const { data: sectorData, error: sectorError } = await supabase
        .from('customers')
        .select('sector_code')
        .not('sector_code', 'is', null);
        
      if (sectorError) throw sectorError;
      
      // Benzersiz sektörleri bul
      const uniqueSectors = [...new Set(sectorData.map(item => item.sector_code))]
        .filter(Boolean)
        .sort();
        
      setSectors(uniqueSectors);
      
      // Bölgeleri getir
      const { data: regionData, error: regionError } = await supabase
        .from('customers')
        .select('region_code')
        .not('region_code', 'is', null);
        
      if (regionError) throw regionError;
      
      // Benzersiz bölgeleri bul
      const uniqueRegions = [...new Set(regionData.map(item => item.region_code))]
        .filter(Boolean)
        .sort();
        
      setRegions(uniqueRegions);
    } catch (error) {
      console.error('Sektör/Bölge yükleme hatası:', error);
    }
  };
  
  // Arama kriterleri değişikliği
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSearchCriteria({
      ...searchCriteria,
      [name]: type === 'checkbox' ? checked : value
    });
  };
  
  // Arama kriterlerini temizle
  const resetCriteria = () => {
    setSearchCriteria({
      name: '',
      code: '',
      sector: '',
      region: '',
      balanceMin: '',
      balanceMax: '',
      pastDueOnly: false,
      hasNotes: false,
      notesKeyword: '',
      sortBy: 'name',
      sortDirection: 'asc'
    });
    
    // Üst bileşene bildir
    if (typeof onReset === 'function') {
      onReset();
    }
  };
  
  // Arama formunu gönder
  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Boş değerleri filtrele
    const filteredCriteria = Object.entries(searchCriteria).reduce((acc, [key, value]) => {
      // Boş string, null veya undefined değilse ekle
      if (value !== '' && value !== null && value !== undefined) {
        // Boolean değerler için doğrudan kontrol
        if (typeof value === 'boolean') {
          if (value) {
            acc[key] = value;
          }
        } else {
          acc[key] = value;
        }
      }
      return acc;
    }, {});
    
    // Üst bileşene bildir
    if (typeof onSearch === 'function') {
      onSearch(filteredCriteria);
    }
  };

  return (
    <div className="advanced-search-component">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="btn"
        style={{ 
          marginBottom: '15px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '5px' 
        }}
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
        </svg>
        {isExpanded ? 'Gelişmiş Aramayı Kapat' : 'Gelişmiş Arama'}
      </button>
      
      {isExpanded && (
        <div className="card" style={{ marginBottom: '20px', padding: '15px' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', 
              gap: '15px',
              marginBottom: '20px'
            }}>
              {/* Müşteri adı */}
              <div>
                <label htmlFor="name" style={{ display: 'block', marginBottom: '5px' }}>
                  Müşteri Adı
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={searchCriteria.name}
                  onChange={handleInputChange}
                  placeholder="Müşteri adı içinde ara..."
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>
              
              {/* Müşteri kodu */}
              <div>
                <label htmlFor="code" style={{ display: 'block', marginBottom: '5px' }}>
                  Müşteri Kodu
                </label>
                <input
                  type="text"
                  id="code"
                  name="code"
                  value={searchCriteria.code}
                  onChange={handleInputChange}
                  placeholder="Müşteri kodu..."
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>
              
              {/* Sektör */}
              <div>
                <label htmlFor="sector" style={{ display: 'block', marginBottom: '5px' }}>
                  Sektör
                </label>
                <select
                  id="sector"
                  name="sector"
                  value={searchCriteria.sector}
                  onChange={handleInputChange}
                  style={{ width: '100%', padding: '8px' }}
                >
                  <option value="">Tüm Sektörler</option>
                  {sectors.map(sector => (
                    <option key={sector} value={sector}>{sector}</option>
                  ))}
                </select>
              </div>
              
              {/* Bölge */}
              <div>
                <label htmlFor="region" style={{ display: 'block', marginBottom: '5px' }}>
                  Bölge
                </label>
                <select
                  id="region"
                  name="region"
                  value={searchCriteria.region}
                  onChange={handleInputChange}
                  style={{ width: '100%', padding: '8px' }}
                >
                  <option value="">Tüm Bölgeler</option>
                  {regions.map(region => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </div>
              
              {/* Minimum Bakiye - Sadece admin/muhasebe için */}
              {(isAdmin || isMuhasebe) && (
                <div>
                  <label htmlFor="balanceMin" style={{ display: 'block', marginBottom: '5px' }}>
                    Min. Bakiye (TL)
                  </label>
                  <input
                    type="number"
                    id="balanceMin"
                    name="balanceMin"
                    value={searchCriteria.balanceMin}
                    onChange={handleInputChange}
                    placeholder="Minimum bakiye..."
                    style={{ width: '100%', padding: '8px' }}
                  />
                </div>
              )}
              
              {/* Maksimum Bakiye - Sadece admin/muhasebe için */}
              {(isAdmin || isMuhasebe) && (
                <div>
                  <label htmlFor="balanceMax" style={{ display: 'block', marginBottom: '5px' }}>
                    Max. Bakiye (TL)
                  </label>
                  <input
                    type="number"
                    id="balanceMax"
                    name="balanceMax"
                    value={searchCriteria.balanceMax}
                    onChange={handleInputChange}
                    placeholder="Maksimum bakiye..."
                    style={{ width: '100%', padding: '8px' }}
                  />
                </div>
              )}
              
              {/* Sıralama */}
              <div>
                <label htmlFor="sortBy" style={{ display: 'block', marginBottom: '5px' }}>
                  Sıralama
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <select
                    id="sortBy"
                    name="sortBy"
                    value={searchCriteria.sortBy}
                    onChange={handleInputChange}
                    style={{ flex: 1, padding: '8px' }}
                  >
                    <option value="name">Müşteri Adı</option>
                    <option value="code">Müşteri Kodu</option>
                    <option value="sector_code">Sektör</option>
                    <option value="region_code">Bölge</option>
                    {(isAdmin || isMuhasebe) && (
                      <option value="total_balance">Toplam Bakiye</option>
                    )}
                    {(isAdmin || isMuhasebe) && (
                      <option value="past_due_balance">Vadesi Geçmiş</option>
                    )}
                  </select>
                  
                  <select
                    id="sortDirection"
                    name="sortDirection"
                    value={searchCriteria.sortDirection}
                    onChange={handleInputChange}
                    style={{ width: '80px', padding: '8px' }}
                  >
                    <option value="asc">Artan</option>
                    <option value="desc">Azalan</option>
                  </select>
                </div>
              </div>
            </div>
            
            {/* Onay kutuları - Gelişmiş filtreler */}
            <div style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              gap: '15px',
              marginBottom: '20px'
            }}>
              {/* Sadece vadesi geçenler */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <input
                  type="checkbox"
                  id="pastDueOnly"
                  name="pastDueOnly"
                  checked={searchCriteria.pastDueOnly}
                  onChange={handleInputChange}
                />
                <label htmlFor="pastDueOnly">Sadece vadesi geçenler</label>
              </div>
              
              {/* Notu olanlar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <input
                  type="checkbox"
                  id="hasNotes"
                  name="hasNotes"
                  checked={searchCriteria.hasNotes}
                  onChange={handleInputChange}
                />
                <label htmlFor="hasNotes">Notu olanlar</label>
              </div>
              
              {/* Not içeriği */}
              {searchCriteria.hasNotes && (
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <input
                    type="text"
                    id="notesKeyword"
                    name="notesKeyword"
                    value={searchCriteria.notesKeyword}
                    onChange={handleInputChange}
                    placeholder="Not içinde ara..."
                    style={{ width: '100%', padding: '8px' }}
                  />
                </div>
              )}
            </div>
            
            {/* Form butonları */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" className="btn btn-primary">
                Ara
              </button>
              <button type="button" className="btn" onClick={resetCriteria}>
                Temizle
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdvancedSearch;