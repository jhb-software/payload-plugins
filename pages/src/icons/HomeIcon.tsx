import React from 'react'

export const HomeIcon: React.FC<{
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
      viewBox="-2 -2 20 20"
      width={size}
    >
      <path
        clipRule="evenodd"
        d="M12.5 6.56L8 2.06l-4.5 4.5v6.94H6V11a2 2 0 114 0v2.5h2.5V6.56zm1.28-.84L8.707.645a1 1 0 00-1.414 0L2.22 5.72.47 7.47-.06 8 1 9.06l.53-.53.47-.47V15h12V8.06l.47.47.53.53L16.06 8l-.53-.53-1.75-1.75zM8.5 11v2.5h-1V11a.5.5 0 111 0z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  )
}
