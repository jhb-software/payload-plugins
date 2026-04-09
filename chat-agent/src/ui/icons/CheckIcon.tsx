import React from 'react'

export const CheckIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
      d="M15.56 4l-.53.53-8.793 8.793a1.75 1.75 0 01-2.474 0l.53-.53-.53.53L.97 10.53.44 10 1.5 8.94l.53.53 2.793 2.793a.25.25 0 00.354 0L13.97 3.47l.53-.53L15.56 4z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
)
