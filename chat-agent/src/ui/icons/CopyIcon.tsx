import React from 'react'

// Geist `copy` icon.
// Source: https://github.com/jarvis394/geist-icons/blob/main/source/copy.svg
export const CopyIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
      d="M2.75.5A1.75 1.75 0 001 2.25v7.5c0 .966.784 1.75 1.75 1.75H4.5V10H2.75a.25.25 0 01-.25-.25v-7.5A.25.25 0 012.75 2h5.5a.25.25 0 01.25.25V3H10v-.75A1.75 1.75 0 008.25.5h-5.5zm5 4A1.75 1.75 0 006 6.25v7.5c0 .966.784 1.75 1.75 1.75h5.5A1.75 1.75 0 0015 13.75v-7.5a1.75 1.75 0 00-1.75-1.75h-5.5zM7.5 6.25A.25.25 0 017.75 6h5.5a.25.25 0 01.25.25v7.5a.25.25 0 01-.25.25h-5.5a.25.25 0 01-.25-.25v-7.5z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
)
