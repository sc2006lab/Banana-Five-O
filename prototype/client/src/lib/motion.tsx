// Small, dependency-free motion toolkit. Every animation honours prefers-reduced-motion (WCAG 2.3.3).
import { createElement, useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** True once the element has scrolled into view (fires once). */
export function useInView<T extends Element>(rootMargin = '0px 0px -10% 0px') {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (!('IntersectionObserver' in window)) return setInView(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);
  return [ref, inView] as const;
}

/** Fade-and-rise when scrolled into view; `delay` in ms staggers siblings. */
export function Reveal({
  children,
  delay = 0,
  as = 'div',
  className = '',
  style,
}: {
  children: ReactNode;
  delay?: number;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}) {
  const [ref, inView] = useInView<HTMLElement>();
  return createElement(
    as,
    { ref, className: `reveal ${inView ? 'is-in' : ''} ${className}`, style: { ...style, transitionDelay: `${delay}ms` } },
    children,
  );
}

/** Animated number that counts up once visible. */
export function CountUp({ to, duration = 1400, format = (n: number) => n.toLocaleString('en-SG') }: { to: number; duration?: number; format?: (n: number) => string }) {
  const [ref, inView] = useInView<HTMLSpanElement>();
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduced) return setValue(to);
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      setValue(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration, reduced]);
  return (
    <span ref={ref} aria-label={format(to)}>
      <span aria-hidden="true">{format(value)}</span>
    </span>
  );
}

/** Animate a number whenever `value` changes (used for scores). */
export function useTweened(value: number, duration = 700) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduced) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(a + (value - a) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);
  return shown;
}
