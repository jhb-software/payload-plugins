import React from 'react'

// Geist `chevron-down` icon.
// Source: https://github.com/jarvis394/geist-icons/blob/main/source/chevron-down.svg
export const ChevronDownIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
      d="M14.06 5.5l-.53.53-4.823 4.824a1 1 0 01-1.414 0L2.47 6.03l-.53-.53L3 4.44l.53.53L8 9.44l4.47-4.47.53-.53 1.06 1.06z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
)
