import { createRoot } from 'react-dom/client';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import '../styles.css';
import Popup from './Popup.jsx';

createRoot(document.getElementById('root')).render(<Popup />);
