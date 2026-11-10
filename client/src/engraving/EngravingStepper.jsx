import { Check } from 'lucide-react';
import './engraving-stepper.css';
export default function EngravingStepper({ steps, step, disabled, onNavigate }) {
  return <nav className="tw-builder-progress" aria-label="Engraving steps"><ol>{steps.map((label, index) => <li key={label} className={index === step ? 'is-current' : index < step ? 'is-complete' : ''}><button type="button" aria-label={`Step ${index + 1}: ${label}`} aria-current={index === step ? 'step' : undefined} disabled={disabled || index > step} onClick={() => onNavigate(index)}><span className="engraving-step-marker">{index < step ? <Check size={17} aria-hidden="true"/> : index + 1}</span>{index === step && <span className="engraving-step-name">{label}</span>}{index < step && <span className="sr-only">Completed</span>}</button></li>)}</ol></nav>;
}
