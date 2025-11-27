import React from 'react'

export const BreadcrumbsIcon: React.FC<{
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
      viewBox="0 0 16 16"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(1, -2)">
        <path className="stroke" d="M2 14L6 10L2 6" strokeLinecap="square" />
        <path className="stroke" d="M8 14L12 10L8 6" strokeLinecap="square" />
      </g>
    </svg>
  )
}
