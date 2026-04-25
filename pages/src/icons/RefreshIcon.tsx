import React from 'react'

export const RefreshIcon: React.FC<{
  readonly ariaLabel?: string
  readonly className?: string
  readonly size?: number
}> = ({ ariaLabel, className, size = 20 }) => {
  return (
    <svg
      aria-label={ariaLabel}
      className={className}
      data-testid="geist-icon"
      height={size}
      strokeLinejoin="round"
      style={{ color: 'var(--theme-elevation-800)' }}
      viewBox="-4 -4 24 24"
      width={size}
    >
      <path
        clipRule="evenodd"
        d="M8 1.25a6.999 6.999 0 00-6.16 3.672l-.357.66 1.32.713.357-.66a5.503 5.503 0 0110.112 1.039h-2.198v1.5h4.175a.75.75 0 00.75-.75V3.25h-1.5v2.395A7.002 7.002 0 008 1.25zm-6.499 9.605v2.395h-1.5V9.075a.75.75 0 01.75-.75h4.175v1.5H2.729a5.503 5.503 0 0010.098 1.065l.36-.658 1.316.72-.361.659a7.002 7.002 0 01-12.64-.755z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  )
}
