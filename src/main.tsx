import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Garante mensagens de validação de formulário em português brasileiro em todos os navegadores
if (typeof document !== 'undefined') {
  document.addEventListener(
    'invalid',
    (event) => {
      const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (!target || typeof target.setCustomValidity !== 'function' || !target.validity) return;

      if (target.validity.valueMissing) {
        target.setCustomValidity('Preencha este campo.');
      } else if (target.validity.typeMismatch) {
        target.setCustomValidity(
          target.getAttribute('type') === 'email'
            ? 'Informe um endereço de e-mail válido.'
            : 'Informe um valor em formato válido.'
        );
      } else if (target.validity.rangeUnderflow) {
        target.setCustomValidity(`O valor deve ser maior ou igual a ${target.getAttribute('min') || '0'}.`);
      } else if (target.validity.rangeOverflow) {
        target.setCustomValidity(`O valor deve ser menor ou igual a ${target.getAttribute('max') || ''}.`);
      } else if (target.validity.tooShort) {
        target.setCustomValidity(`Digite pelo menos ${target.getAttribute('minlength') || ''} caracteres.`);
      } else if (target.validity.patternMismatch) {
        target.setCustomValidity('O formato informado não é válido.');
      }
    },
    true
  );

  const clearValidity = (event: Event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (target && typeof target.setCustomValidity === 'function') {
      target.setCustomValidity('');
    }
  };

  document.addEventListener('input', clearValidity, true);
  document.addEventListener('change', clearValidity, true);
}

createRoot(document.getElementById('root')!).render(<App />);
