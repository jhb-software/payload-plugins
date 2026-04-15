import React from 'react'

// Geist `pencil-edit` icon.
// Source: https://github.com/jarvis394/geist-icons/blob/main/source/pencil-edit.svg
export const PencilIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
      d="M11.75.19l.53.53 3 3 .53.53-.53.53L5.16 14.902A3.75 3.75 0 012.507 16H0V13.493a3.75 3.75 0 011.098-2.652L11.22.72l.53-.53zm0 2.12L9.81 4.25l1.94 1.94 1.94-1.94-1.94-1.94zm-9.591 9.592L8.75 5.31l1.94 1.939-6.592 6.591a2.25 2.25 0 01-1.59.659H1.5v-1.007c0-.597.237-1.17.659-1.591zM9 16h7v-1.5H9V16z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
)
