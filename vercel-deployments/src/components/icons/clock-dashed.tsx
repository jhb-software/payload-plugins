import React from 'react'

export const ClockDashedIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      data-testid="geist-icon"
      height="16"
      strokeLinejoin="round"
      style={{ color: 'currentcolor' }}
      viewBox="0 0 16 16"
      width="16"
      {...props}
    >
      <path
        clipRule="evenodd"
        d="M5.35 2.062a6.453 6.453 0 011.974-.527L7.169.043a7.953 7.953 0 00-2.43.65l.612 1.37zm3.327-.527a6.501 6.501 0 11-7.142 7.142l-1.492.154A8.001 8.001 0 108.83.043l-.154 1.492zM2.74 4.18a6.542 6.542 0 011.44-1.44l-.882-1.214a8.042 8.042 0 00-1.771 1.771l1.213.883zM1.535 7.323c.072-.696.254-1.36.527-1.972L.693 4.739a7.953 7.953 0 00-.65 2.43l1.492.154zM8.75 4.75V4h-1.5v3.875a1 1 0 00.4.8l1.9 1.425.6.45.9-1.2-.6-.45-1.7-1.275V4.75z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  )
}
