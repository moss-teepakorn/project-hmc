import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Calendar } from 'lucide-react';
import { avatarColor, getInitials, dmyToIso, isoToDmy } from '../../utils';

export const C = {
  white: '#FFFFFF', bg: '#F5F7FA', bg2: '#EEF1F6',
  border: '#E2E8F0', border2: '#CBD5E1',
  text: '#0F172A', text2: '#475569', text3: '#94A3B8',
  primary: '#4F46E5', primaryHov: '#4338CA', primaryBg: '#EEF2FF',
  green: '#10B981', greenBg: '#D1FAE5',
  amber: '#F59E0B', amberBg: '#FEF3C7',
  red: '#EF4444', redBg: '#FEE2E2',
  blue: '#3B82F6', blueBg: '#DBEAFE',
  shadow: '0 1px 3px rgba(0,0,0,0.08),0 1px 2px rgba(0,0,0,0.04)',
  shadow2: '0 4px 16px rgba(0,0,0,0.10)',
};

export const Card: React.FC<{
  children: React.ReactNode; style?: React.CSSProperties;
  onClick?: () => void; onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
}> = ({ children, style, onClick, onMouseEnter, onMouseLeave }) => (
  <div onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
    style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: C.shadow, ...style }}>
    {children}
  </div>
);

type BtnVariant = 'primary' | 'outline' | 'ghost' | 'danger';
export const Btn: React.FC<{
  children: React.ReactNode; onClick?: () => void; variant?: BtnVariant;
  small?: boolean; disabled?: boolean; style?: React.CSSProperties;
}> = ({ children, onClick, variant = 'primary', small = false, disabled = false, style }) => {
  const base: React.CSSProperties = {
    fontFamily: 'Poppins, sans-serif', fontWeight: 600, borderRadius: 8,
    cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
    display: 'inline-flex', alignItems: 'center', gap: 6, opacity: disabled ? 0.55 : 1,
    padding: small ? '6px 14px' : '9px 18px', fontSize: small ? 12 : 13,
  };
  const v: Record<BtnVariant, React.CSSProperties> = {
    primary: { background: C.primary, color: '#fff', border: 'none' },
    outline: { background: 'transparent', color: C.primary, border: `1.5px solid ${C.primary}` },
    ghost:   { background: 'transparent', color: C.text2,  border: `1px solid ${C.border}` },
    danger:  { background: C.redBg, color: C.red, border: `1px solid #FECACA` },
  };
  return (
    <button disabled={disabled} onClick={onClick} style={{ ...base, ...v[variant], ...style }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)'; }}>
      {children}
    </button>
  );
};

export const Input: React.FC<{
  value: string | number; onChange: (v: string) => void;
  placeholder?: string; type?: string; style?: React.CSSProperties; autoFocus?: boolean;
}> = ({ value, onChange, placeholder = '', type = 'text', style, autoFocus }) => {
  const [draft, setDraft] = useState(type === 'date' ? (value ? isoToDmy(String(value)) : '') : String(value ?? ''));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (type === 'date') {
      setDraft(value ? isoToDmy(String(value)) : '');
    } else {
      setDraft(String(value ?? ''));
    }
  }, [value, type]);

  const handleDateChange = (next: string) => {
    setDraft(next);
    if (next === '') {
      onChange('');
      return;
    }
    const iso = dmyToIso(next);
    if (iso) onChange(iso);
  };

  const handleDateBlur = () => {
    setFocused(false);
    if (!draft) return;
    const iso = dmyToIso(draft);
    if (!iso) {
      setDraft(value ? isoToDmy(String(value)) : '');
    }
  };

  if (type === 'date') {
    return (
      <div style={{ position: 'relative', width: '100%', ...style }}>
        <input autoFocus={autoFocus} type="text" value={draft} placeholder={placeholder}
          onChange={e => handleDateChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={handleDateBlur}
          onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
          style={{ fontFamily: 'Poppins, sans-serif', fontSize: 13, padding: '8px 12px', border: `1.5px solid ${focused ? C.primary : C.border}`, borderRadius: 8, outline: 'none', width: '100%', boxSizing: 'border-box', color: C.text, background: C.white, paddingRight: 40 }}
        />
        <Calendar size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: C.text3, pointerEvents: 'none' }} />
      </div>
    );
  }

  return (
    <input autoFocus={autoFocus} type={type} value={value ?? ''} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{ fontFamily: 'Poppins, sans-serif', fontSize: 13, padding: '8px 12px', border: `1.5px solid ${C.border}`, borderRadius: 8, outline: 'none', width: '100%', boxSizing: 'border-box', color: C.text, background: C.white, colorScheme: type === 'date' ? 'light' : undefined, ...style }}
      onFocus={e => (e.target.style.borderColor = C.primary)}
      onBlur={e  => (e.target.style.borderColor = C.border)}
    />
  );
};

export const Textarea: React.FC<{ value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }> = ({ value, onChange, rows = 3, placeholder }) => (
  <textarea rows={rows} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
    style={{ fontFamily: 'Poppins, sans-serif', fontSize: 13, padding: '8px 12px', border: `1.5px solid ${C.border}`, borderRadius: 8, outline: 'none', width: '100%', boxSizing: 'border-box', color: C.text, resize: 'vertical' }}
    onFocus={e => (e.target.style.borderColor = C.primary)}
    onBlur={e  => (e.target.style.borderColor = C.border)}
  />
);

export const Select: React.FC<{
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; style?: React.CSSProperties; disabled?: boolean;
}> = ({ value, onChange, options, style, disabled = false }) => (
  <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
    style={{ fontFamily: 'Poppins, sans-serif', fontSize: 13, padding: '8px 12px', border: `1.5px solid ${C.border}`, borderRadius: 8, outline: 'none', width: '100%', boxSizing: 'border-box', color: C.text, background: disabled ? '#F8FAFC' : C.white, ...style }}
    onFocus={e => (e.target.style.borderColor = C.primary)}
    onBlur={e  => (e.target.style.borderColor = C.border)}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

export const Badge: React.FC<{ children: React.ReactNode; bg: string; color: string }> = ({ children, bg, color }) => (
  <span style={{ background: bg, color, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, fontFamily: 'Poppins, sans-serif', whiteSpace: 'nowrap' }}>
    {children}
  </span>
);

export const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 30 }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', background: avatarColor(name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.36, fontWeight: 700, fontFamily: 'Poppins, sans-serif', flexShrink: 0 }}>
    {getInitials(name)}
  </div>
);

export const ProgressBar: React.FC<{ value: number; color?: string; height?: number }> = ({ value, color = C.primary, height = 6 }) => (
  <div style={{ width: '100%', height, background: C.bg2, borderRadius: height / 2, overflow: 'hidden' }}>
    <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: '100%', background: color, borderRadius: height / 2, transition: 'width 0.4s' }} />
  </div>
);

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; width?: number }> = ({ title, onClose, children, width = 540 }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
    <div style={{ position: 'relative', background: C.white, borderRadius: 16, width, maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', fontFamily: 'Poppins, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.white, zIndex: 1 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{title}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: C.text3 }}>✕</button>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  </div>
);

export const FormRow: React.FC<{ label: string; children: React.ReactNode; required?: boolean }> = ({ label, children, required }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'Poppins, sans-serif' }}>
      {label}{required && <span style={{ color: C.red, marginLeft: 2 }}>*</span>}
    </label>
    {children}
  </div>
);

export const Tabs: React.FC<{
  tabs: { id: string; label: string; icon?: string; count?: number }[];
  active: string; onChange: (id: string) => void;
}> = ({ tabs, active, onChange }) => (
  <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
    {tabs.map(t => (
      <button key={t.id} onClick={() => onChange(t.id)}
        style={{ fontFamily: 'Poppins, sans-serif', fontSize: 12, fontWeight: active === t.id ? 600 : 500, padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', color: active === t.id ? C.primary : C.text2, borderBottom: active === t.id ? `2px solid ${C.primary}` : '2px solid transparent', marginBottom: -1, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
        {t.icon && <span>{t.icon}</span>}
        {t.label}
        {t.count != null && (
          <span style={{ background: active === t.id ? C.primaryBg : C.bg2, color: active === t.id ? C.primary : C.text3, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>
            {t.count}
          </span>
        )}
      </button>
    ))}
  </div>
);

export const EditableCell: React.FC<{
  value: string; onSave: (v: string) => void;
  type?: string; placeholder?: string; style?: React.CSSProperties;
  alwaysSave?: boolean;
}> = ({ value, onSave, type = 'text', placeholder = '—', style, alwaysSave = false }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const [dateValue, setDateValue] = useState(type === 'date' ? dmyToIso(value) : value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
    if (type === 'date') setDateValue(dmyToIso(value));
  }, [value, type]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = useCallback(() => {
    let nextValue = draft;
    if (type === 'date') {
      nextValue = dateValue ? isoToDmy(dateValue) : '';
    }
    setEditing(false);
    if (nextValue !== value || type === 'date' || alwaysSave) onSave(nextValue);
  }, [draft, value, onSave, type, alwaysSave, dateValue]);

  if (editing) {
    return (
      <input ref={inputRef} type={type} value={type === 'date' ? dateValue : draft}
        onChange={e => {
          if (type === 'date') setDateValue(e.target.value);
          else setDraft(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(value); if (type === 'date') setDateValue(dmyToIso(value)); } }}
        style={{ width: '100%', border: `1.5px solid ${C.primary}`, borderRadius: 4, padding: '2px 6px', fontSize: 12, fontFamily: 'Poppins, sans-serif', outline: 'none', background: C.primaryBg, colorScheme: type === 'date' ? 'light' : undefined, ...style }}
      />
    );
  }
  return (
    <span onClick={() => setEditing(true)} title="Click to edit"
      style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text', fontSize: 12, fontFamily: 'Poppins, sans-serif', color: value ? C.text : C.text3, fontStyle: value ? 'normal' : 'italic', ...style }}>
      {value || placeholder}
    </span>
  );
};

export const TH: React.CSSProperties = {
  padding: '9px 12px', fontSize: 10, fontWeight: 700, color: C.text2,
  textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em',
  borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', fontFamily: 'Poppins, sans-serif',
};
export const TD: React.CSSProperties = {
  padding: '10px 12px', fontSize: 13, color: C.text,
  borderBottom: `1px solid ${C.border}`, fontFamily: 'Poppins, sans-serif',
};

export const PROJECT_STATUS: Record<string, { bg: string; color: string; label: string }> = {
  'Planning':     { bg: '#FEF3C7', color: '#92400E', label: 'Planning' },
  'Req & Design': { bg: '#DBEAFE', color: '#1E40AF', label: 'Req & Design' },
  'Setup':        { bg: '#FED7AA', color: '#9A3412', label: 'Setup' },
  'Testing':      { bg: '#E9D5FF', color: '#6B21A8', label: 'Testing' },
  'Go Live':      { bg: '#D1FAE5', color: '#065F46', label: 'Go Live' },
  'Hyper Care':   { bg: '#F1F5F9', color: '#475569', label: 'Hyper Care' },
};

export const MILESTONE_STATUS: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
  billed:  { bg: '#DBEAFE', color: '#1E40AF', label: 'Billed' },
  paid:    { bg: '#D1FAE5', color: '#065F46', label: 'Paid' },
};

export const ConfirmModal: React.FC<{ message: string; onConfirm: () => void; onCancel: () => void }> = ({ message, onConfirm, onCancel }) => (
  <Modal title="Confirm Delete" onClose={onCancel} width={400}>
    <p style={{ fontSize: 14, color: C.text2, marginBottom: 24 }}>{message}</p>
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      <Btn variant="danger" onClick={onConfirm}>Delete</Btn>
    </div>
  </Modal>
);
