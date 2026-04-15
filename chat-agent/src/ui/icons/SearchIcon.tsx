import React from 'react'

// Geist `magnifying-glass` icon.
// Source: https://github.com/jarvis394/geist-icons/blob/main/source/magnifying-glass.svg
export const SearchIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
      d="M1.5 6.5a5 5 0 1110 0 5 5 0 01-10 0zm5-6.5a6.5 6.5 0 104.035 11.596l3.435 3.434.53.53 1.06-1.06-.53-.53-3.434-3.435A6.5 6.5 0 006.5 0z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
)
