import React from 'react'

// Geist `loader-circle` icon.
// Source: https://github.com/jarvis394/geist-icons/blob/main/source/loader-circle.svg
// The eight radial strokes have staggered opacities; rotating the whole group
// produces the classic "chase" spinner.
export const LoaderIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    data-testid="geist-icon"
    height="16"
    strokeLinejoin="round"
    style={{ color: 'currentcolor' }}
    viewBox="0 0 16 16"
    width="16"
    {...props}
  >
    <style>{`
      @keyframes chat-agent-loader-spin {
        to { transform: rotate(360deg); }
      }
    `}</style>
    <g
      style={{
        animation: 'chat-agent-loader-spin 1s steps(8, end) infinite',
        transformOrigin: '8px 8px',
      }}
    >
      <path d="M8 0v4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 16v-4" opacity=".5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.298 1.528l2.35 3.236" opacity=".9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.702 1.528l-2.35 3.236" opacity=".1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.702 14.472l-2.35-3.236" opacity=".4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.298 14.472l2.35-3.236" opacity=".6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15.608 5.528l-3.804 1.236" opacity=".2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M.392 10.472l3.804-1.236" opacity=".7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15.608 10.472l-3.804-1.236" opacity=".3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M.392 5.528l3.804 1.236" opacity=".8" stroke="currentColor" strokeWidth="1.5" />
    </g>
  </svg>
)
