import React from 'react'

export const ClockIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
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
        d="M14.5 8a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0zM16 8A8 8 0 110 8a8 8 0 0116 0zM8.75 4.75V4h-1.5v3.875a1 1 0 00.4.8l1.9 1.425.6.45.9-1.2-.6-.45-1.7-1.275V4.75z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  )
}
