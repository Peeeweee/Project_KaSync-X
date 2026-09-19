import { SelectHTMLAttributes, ReactNode } from 'react';

interface WakandanSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  color?: string; // e.g. 'var(--color-primary-glow)' or '#00f0ff'
  children: ReactNode;
}

export function WakandanSelect({ color = 'var(--color-primary-glow)', children, className = '', ...props }: WakandanSelectProps) {
  return (
    <div 
      className="relative flex items-center border-l border-r hover:bg-white/5 transition-all duration-300 group"
      style={{
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {/* Corner accents */}
      <div className="absolute -top-[1px] left-0 w-2 h-[1px] opacity-50 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: color }} />
      <div className="absolute -bottom-[1px] right-0 w-2 h-[1px] opacity-50 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: color }} />

      <select
        {...props}
        className={`appearance-none bg-transparent font-mono uppercase outline-none cursor-pointer text-ellipsis overflow-hidden whitespace-nowrap pl-2 pr-6 py-1 ${className}`}
        style={{ color }}
      >
        {children}
      </select>

      {/* Wakandan geometric dropdown icon */}
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none z-10 flex flex-col gap-[2px] opacity-70 group-hover:opacity-100 transition-opacity">
        <div className="w-2.5 h-[1px]" style={{ backgroundColor: color, boxShadow: `0 0 2px ${color}` }} />
        <div className="w-1.5 h-[1px] mx-auto" style={{ backgroundColor: color, boxShadow: `0 0 2px ${color}` }} />
        <div className="w-0.5 h-[1px] mx-auto" style={{ backgroundColor: color, boxShadow: `0 0 2px ${color}` }} />
      </div>
    </div>
  );
}
