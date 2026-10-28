import React from 'react';

/**
 * Tiny inline SVG Fluffy Sky Cloud icon (< 700 bytes, zero external image fetch).
 */
export function ChibiMascotSvg({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Soft Sky Background Circle */}
      <circle cx="32" cy="32" r="28" fill="#E0EFFE" />
      {/* Fluffy Cloud Shape */}
      <path
        d="M20 44H45C50.5228 44 55 39.5228 55 34C55 28.899 51.1797 24.6916 46.2248 24.0759C44.525 17.7037 38.7145 13 31.8 13C23.5157 13 16.8 19.7157 16.8 28C16.8 28.4317 16.8182 28.8592 16.854 29.2817C12.9686 30.5245 10.15 34.1656 10.15 38.45C10.15 41.5152 12.6348 44 15.7 44H20Z"
        fill="#FFFFFF"
        stroke="#0E91E9"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Gentle Smile on Cloud */}
      <circle cx="27" cy="31" r="2" fill="#074E85" />
      <circle cx="39" cy="31" r="2" fill="#074E85" />
      <path
        d="M30 35.5C31.2 37 34.8 37 36 35.5"
        stroke="#074E85"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Placeholder SVG for wishes without a product image (Cloud & Blue Gift Box).
 */
export function ChibiGiftPlaceholderSvg({ size = 72 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="12"
        y="26"
        width="40"
        height="28"
        rx="6"
        fill="#E0EFFE"
        stroke="#0E91E9"
        strokeWidth="2.5"
      />
      <rect
        x="9"
        y="19"
        width="46"
        height="9"
        rx="4"
        fill="#BAE0FD"
        stroke="#0E91E9"
        strokeWidth="2.5"
      />
      <rect x="29" y="19" width="6" height="35" fill="#0E91E9" />
      <path
        d="M32 19C32 19 22 10 19 14C16 18 26 19 32 19Z"
        fill="#38ACF8"
        stroke="#0273C7"
        strokeWidth="2"
      />
      <path
        d="M32 19C32 19 42 10 45 14C48 18 38 19 32 19Z"
        fill="#38ACF8"
        stroke="#0273C7"
        strokeWidth="2"
      />
    </svg>
  );
}
