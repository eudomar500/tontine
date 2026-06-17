import React from 'react';

interface AdminInputFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  disabled?: boolean;
  error?: string | null;
}

export default function AdminInputField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  error = null,
}: AdminInputFieldProps) {
  return (
    <div className="space-y-1.5 w-full">
      <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/45 block">
        {label}
      </label>
      <input
        type="text"
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 bg-charcoal-dark border border-charcoal-light/30 focus:border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none transition-colors placeholder-foreground/20 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
      />
      {error && (
        <span className="text-[10px] text-brand-magenta font-semibold mt-0.5 block leading-snug">
          {error}
        </span>
      )}
    </div>
  );
}
