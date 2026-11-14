import React from 'react'

// Geist `arrow-up` icon.
// Source: https://github.com/jarvis394/geist-icons/blob/main/source/arrow-up.svg
export const SendIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
      d="M8.75 13.75V15.25H7.25V13.75V4.56066L3.03033 8.78033L2.5 9.31066L1.43934 8.25L1.96967 7.71967L7.46967 2.21967C7.76256 1.92678 8.23744 1.92678 8.53033 2.21967L14.0303 7.71967L14.5607 8.25L13.5 9.31066L12.9697 8.78033L8.75 4.56066V13.75Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
)
