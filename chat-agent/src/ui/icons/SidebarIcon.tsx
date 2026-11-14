import React from 'react'

// Geist `sidebar-left` icon.
// Source: https://github.com/jarvis394/geist-icons/blob/main/source/sidebar-left.svg
export const SidebarIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
      d="M6.245 2.5H14.5v10a1 1 0 01-1 1H6.245v-11zm-1.25 0H1.5v10a1 1 0 001 1h2.495v-11zM0 1h16v11.5a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 010 12.5V1z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
)
