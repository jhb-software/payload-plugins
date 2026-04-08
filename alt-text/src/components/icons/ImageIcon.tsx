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
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
)
