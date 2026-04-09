import React from 'react'

export const CloudIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
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
      d="M12 6.509l-.75-.001v.7l.697.049.053-.748zm0-.009h.75H12zm-8 0h-.75H4zm0 .009l.053.748.698-.05-.001-.699H4zm.25 6.241A2.75 2.75 0 011.5 10H0a4.25 4.25 0 004.25 4.25v-1.5zm7.5 0h-7.5v1.5h7.5v-1.5zM14.5 10a2.75 2.75 0 01-2.75 2.75v1.5A4.25 4.25 0 0016 10h-1.5zm-2.553-2.743A2.75 2.75 0 0114.5 10H16a4.25 4.25 0 00-3.947-4.24l-.106 1.497zm-.697-.758v.009l1.5.002V6.5h-1.5zM8 3.25a3.25 3.25 0 013.25 3.25h1.5A4.75 4.75 0 008 1.75v1.5zM4.75 6.5A3.25 3.25 0 018 3.25v-1.5A4.75 4.75 0 003.25 6.5h1.5zm0 .008v-.009l-1.5.002v.009l1.5-.002zM1.5 10a2.75 2.75 0 012.553-2.743L3.947 5.76A4.25 4.25 0 000 10h1.5z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
)
