import { createRoot } from 'react-dom/client';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import '../styles.css';
import Dashboard from './Dashboard.jsx';

createRoot(document.getElementById('root')).render(<Dashboard />);
