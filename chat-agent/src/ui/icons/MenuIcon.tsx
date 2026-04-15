import React from 'react'

// Geist `menu` icon.
// Source: https://github.com/jarvis394/geist-icons/blob/main/source/menu.svg
export const MenuIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
      d="M1 2h14v1.5H1V2zm0 5.25h14v1.5H1v-1.5zM15 12.5H1V14h14v-1.5z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
)
