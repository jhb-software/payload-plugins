import React from 'react'

export const HomeIcon: React.FC<{
  readonly ariaLabel?: string
  readonly className?: string
  readonly size?: number
}> = ({ ariaLabel, className, size = 16 }) => {
  return (
    <svg
      aria-label={ariaLabel}
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}
