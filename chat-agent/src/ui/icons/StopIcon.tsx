import React from 'react'

// Geist `stop-circle` icon.
// Source: https://github.com/jarvis394/geist-icons/blob/main/source/stop-circle.svg
export const StopIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
      d="M14.5 8a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0zM16 8A8 8 0 110 8a8 8 0 0116 0zm-5.5-2.5h-5v5h5v-5z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
)
