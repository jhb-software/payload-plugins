import React from 'react'

export const InfoIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
      d="M8 14.5a6.5 6.5 0 100-13 6.5 6.5 0 000 13zM8 16A8 8 0 108 0a8 8 0 000 16zM6.25 7h1.5a1 1 0 011 1v4.25h-1.5V8.5h-1V7zM8 6a1 1 0 100-2 1 1 0 000 2z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
)
