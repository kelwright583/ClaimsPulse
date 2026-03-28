'use client';

import { useEffect, useRef, useState } from 'react';

export function useCountUp(target: number, duration = 900, delay = 0) {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setValue(0);
    const timeout = setTimeout(() => {
      const startTime = performance.now();
      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        setValue(target * eased);
        if (progress < 1) {
          frameRef.current = requestAnimationFrame(animate);
        }
      };
      frameRef.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration, delay]);

  return value;
}
