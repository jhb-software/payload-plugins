import React from 'react'

export const BreadcrumbsIcon: React.FC<{
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
      viewBox="0 0 16 16"
      width={size}
    >
      <path
        clipRule="evenodd"
        d="M12.854 8.707a1 1 0 000-1.414L9.03 3.47l-.53-.53L7.44 4l.53.53L11.44 8l-3.47 3.47-.53.53 1.06 1.06.53-.53 3.824-3.823zm-5 0a1 1 0 000-1.414L4.03 3.47l-.53-.53L2.44 4l.53.53L6.44 8l-3.47 3.47-.53.53 1.06 1.06.53-.53 3.824-3.823z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  )
}
