import React from 'react'

export const ImageIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
      d="M14.5 2.5h-13v6.69l1.47-1.47.22-.22h3.75l.03-.03 3.5-3.5h1.06l2.97 2.97V2.5zM8 8.56l1.53 1.53.53.53L9 11.68l-.53-.53L6.32 9H3.81l-2.28 2.28-.03.03v1.19a1 1 0 001 1h11a1 1 0 001-1V9.06L11 5.56 8.03 8.53 8 8.56zm-8 2.25v1.69A2.5 2.5 0 002.5 15h11a2.5 2.5 0 002.5-2.5V9.56l.56-.56-.53-.53-.03-.03V1H0v9.69l-.06.06.06.06z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
)
