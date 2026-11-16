import { useState } from 'react';

export default function PasswordInput({ requirements = false, ...props }) {
  const [visible, setVisible] = useState(false);
  return <><div className="password-control"><input {...props} type={visible ? 'text' : 'password'}/><button type="button" disabled={props.disabled} aria-controls={props.id} aria-pressed={visible} aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(value => !value)}>{visible ? 'Hide' : 'Show'}</button></div>{requirements && <small id={`${props.id}-requirements`}>Use at least 12 characters. Maximum 72 bytes; Arabic letters and emoji may use more than one byte.</small>}</>;
}
