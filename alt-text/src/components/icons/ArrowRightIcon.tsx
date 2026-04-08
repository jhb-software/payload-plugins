import React from 'react'

export const ArrowRightIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    fill="none"
    height="16"
    shapeRendering="geometricPrecision"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.5"
    style={{ color: 'currentcolor' }}
    viewBox="0 0 24 24"
    width="16"
    {...props}
  >
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)
