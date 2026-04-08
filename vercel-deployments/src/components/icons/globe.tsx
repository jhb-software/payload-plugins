import React from 'react'

export const GlobeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    data-testid="geist-icon"
    fill="none"
    height="16"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.5"
    style={{ color: 'currentcolor' }}
    viewBox="0 0 16 16"
    width="16"
    {...props}
  >
    <circle cx="8" cy="8" r="6.75" />
    <ellipse cx="8" cy="8" rx="2.75" ry="6.75" />
    <line x1="1.25" x2="14.75" y1="8" y2="8" />
  </svg>
)
