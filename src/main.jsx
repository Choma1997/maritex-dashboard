import React from 'react';
import ReactDOM from 'react-dom/client';
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import App from './App';
import './index.css';

const msalConfig = {
  auth: {
    clientId: '363fd41d-fb01-40f5-9cb8-8162bdabf596',
    authority: 'https://login.microsoftonline.com/70db351d-e90a-41dc-9eea-1a72589d1d95',
    redirectUri: 'https://choma1997.github.io/maritex-dashboard/',
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

const msalInstance = new PublicClientApplication(msalConfig);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MsalProvider instance={msalInstance}>
      <App />
    </MsalProvider>
  </React.StrictMode>
);
