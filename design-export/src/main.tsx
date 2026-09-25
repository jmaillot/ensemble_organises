import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EnsembleOrganisesApp } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EnsembleOrganisesApp assetBase="/assets" />
  </StrictMode>,
);
