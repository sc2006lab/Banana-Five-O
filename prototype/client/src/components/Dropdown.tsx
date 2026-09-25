import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './ui';

export function Dropdown({
  label,
  active = false,
  children,
  align = 'left',
  width = 'w-72',
}: {
  label: ReactNode;
  active?: boolean;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'left' | 'right';
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div ref={ref} className="relative">
      <button type="button" className="chip-outline whitespace-nowrap" aria-pressed={active} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {label}
        <Icon name="expand_more" className="!text-[18px]" />
      </button>
      {open && (
        <div id={id} className={`absolute z-[1150] mt-2 ${align === 'right' ? 'right-0' : 'left-0'} ${width} rounded-lg border border-burgundy/10 bg-white p-3 shadow-float`}>
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}
