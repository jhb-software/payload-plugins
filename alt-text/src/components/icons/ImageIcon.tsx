import React from 'react'

export const ImageIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    data-testid="geist-icon"
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
    <rect height="18" rx="2" ry="2" width="18" x="3" y="3" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
)
