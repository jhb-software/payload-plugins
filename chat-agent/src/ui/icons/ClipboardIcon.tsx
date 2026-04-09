import React from 'react'

export const ClipboardIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
      d="M6.75 1.5h2.5a.5.5 0 010 1h-2.5a.5.5 0 010-1zm-1.937 0A2 2 0 016.75 0h2.5a2 2 0 011.937 1.5H14v11.25A3.25 3.25 0 0110.75 16h-5.5A3.25 3.25 0 012 12.75V1.5h2.813zM5.018 3H3.5v9.75c0 .966.784 1.75 1.75 1.75h5.5a1.75 1.75 0 001.75-1.75V3h-1.518A2 2 0 019.25 4h-2.5a2 2 0 01-1.732-1z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
)
