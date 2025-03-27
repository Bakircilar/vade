import React, { useState, useEffect } from 'react';

const SearchBox = ({ placeholder, onSearch, value, onChange, buttonText = "Ara" }) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [searchValue, setSearchValue] = useState(value || '');
  
  useEffect(() => {
    // Handle window resize
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  useEffect(() => {
    // Update local state when value prop changes
    if (value !== undefined) {
      setSearchValue(value);
    }
  }, [value]);
  
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setSearchValue(newValue);
    
    // If onChange prop is provided, call it
    if (onChange) {
      onChange(e);
    } else if (onSearch) {
      // If no onChange but onSearch exists, debounce search
      if (newValue.trim() === '') {
        onSearch('');
      }
    }
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchValue);
    }
  };
  
  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        marginBottom: '15px',
        width: '100%',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? '10px' : '0'
      }}
    >
      <input
        type="text"
        value={searchValue}
        onChange={handleInputChange}
        placeholder={placeholder || "Ara..."}
        style={{
          flex: '1',
          padding: '10px',
          borderRadius: isMobile ? '4px' : '4px 0 0 4px',
          border: '1px solid #ddd',
          fontSize: isMobile ? '16px' : '14px', // Larger font on mobile to prevent zoom
          width: '100%'
        }}
      />
      <button
        type="submit"
        className="btn btn-primary"
        style={{
          marginLeft: isMobile ? '0' : '-1px',
          borderRadius: isMobile ? '4px' : '0 4px 4px 0',
          padding: '10px 15px',
          border: 'none',
          width: isMobile ? '100%' : 'auto'
        }}
      >
        {buttonText}
      </button>
    </form>
  );
};

export default SearchBox;