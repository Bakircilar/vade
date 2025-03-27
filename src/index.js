<<<<<<< HEAD
// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './theme.css'; // Tema CSS dosyasını import edin
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
=======
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
>>>>>>> 909a0b70d5a303564c50b7778de3f2c0e01d5749
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
<<<<<<< HEAD
    <ThemeProvider>
      <App />
    </ThemeProvider>
=======
    <App />
>>>>>>> 909a0b70d5a303564c50b7778de3f2c0e01d5749
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
<<<<<<< HEAD
reportWebVitals();
=======
reportWebVitals();
>>>>>>> 909a0b70d5a303564c50b7778de3f2c0e01d5749
