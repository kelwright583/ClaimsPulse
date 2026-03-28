'use client';

import { useEffect, useRef, useState } from 'react';

interface LossRatioGaugeProps {
  ratio: number;
  size?: number;
}

const RADIUS = 70;
const STROKE_WIDTH = 12;
const CIRCUMFERENCE = Math.PI * RADIUS; // half-circle

function gaugeColor(ratio: number): string {
  if (ratio < 65) return '#1D9E75';
  if (ratio < 80) return '#F5A800';
  return '#E24B4A';
}

function gaugeLabel(ratio: number): string {
  if (ratio < 65) return 'Healthy';
  if (ratio < 80) return 'Watch';
  return 'Alert';
}

export function LossRatioGauge({ ratio, size = 200 }: LossRatioGaugeProps) {
  const [animatedRatio, setAnimatedRatio] = useState(0);
  const frameRef = useRef<number | undefined>(undefined);
  const duration = 1200;

  useEffect(() => {
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedRatio(ratio * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    };
  }, [ratio]);

  const color = gaugeColor(ratio);
  const label = gaugeLabel(ratio);
  const clamped = Math.min(animatedRatio, 120);
  const offset = CIRCUMFERENCE - (clamped / 120) * CIRCUMFERENCE;

  const cx = size / 2;
  const cy = size / 2 + RADIUS * 0.1; // slight vertical offset so semicircle is centred
  const viewBox = `0 0 ${size} ${size * 0.6}`;
  const halfH = size * 0.6;

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={halfH}
        viewBox={`0 0 ${size} ${halfH}`}
        className="overflow-visible"
      >
        {/* Track (grey) */}
        <path
          d={`M ${STROKE_WIDTH / 2 + (size - RADIUS * 2 - STROKE_WIDTH) / 2} ${halfH - STROKE_WIDTH / 2}
              A ${RADIUS} ${RADIUS} 0 0 1 ${size - STROKE_WIDTH / 2 - (size - RADIUS * 2 - STROKE_WIDTH) / 2} ${halfH - STROKE_WIDTH / 2}`}
          fill="none"
          stroke="#E8EEF8"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
        />
        {/* Active arc */}
        <path
          d={`M ${STROKE_WIDTH / 2 + (size - RADIUS * 2 - STROKE_WIDTH) / 2} ${halfH - STROKE_WIDTH / 2}
              A ${RADIUS} ${RADIUS} 0 0 1 ${size - STROKE_WIDTH / 2 - (size - RADIUS * 2 - STROKE_WIDTH) / 2} ${halfH - STROKE_WIDTH / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transition: 'stroke 0.3s ease' }}
        />
        {/* Ratio text */}
        <text
          x={size / 2}
          y={halfH - STROKE_WIDTH - 8}
          textAnchor="middle"
          fontSize="28"
          fontWeight="700"
          fill={color}
          fontFamily="Poppins, sans-serif"
        >
          {animatedRatio.toFixed(1)}%
        </text>
        {/* Label */}
        <text
          x={size / 2}
          y={halfH - STROKE_WIDTH + 16}
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fill={color}
          fontFamily="Poppins, sans-serif"
          opacity={0.8}
        >
          {label}
        </text>
        {/* Zone markers */}
        <text x={STROKE_WIDTH / 2 + (size - RADIUS * 2 - STROKE_WIDTH) / 2 - 4} y={halfH + 4} textAnchor="end" fontSize="9" fill="#6B7280" fontFamily="Poppins, sans-serif">0%</text>
        <text x={size / 2} y={halfH - RADIUS - STROKE_WIDTH / 2 - 6} textAnchor="middle" fontSize="9" fill="#6B7280" fontFamily="Poppins, sans-serif">60%</text>
        <text x={size - STROKE_WIDTH / 2 - (size - RADIUS * 2 - STROKE_WIDTH) / 2 + 4} y={halfH + 4} textAnchor="start" fontSize="9" fill="#6B7280" fontFamily="Poppins, sans-serif">120%</text>
      </svg>
    </div>
  );
}
