import React from 'react'

export const SpinnerIcon: React.FC<React.SVGProps<SVGSVGElement>> = () => {
  return (
    <>
      <style>
        {`
          .loader {
            width: 14px;
            height: 14px;
            border: 2px solid var(--theme-text);
            border-bottom-color: transparent;
            border-radius: 50%;
            display: inline-block;
            box-sizing: border-box;
            animation: rotation 1s linear infinite;
            margin: 2px;
          }

          @keyframes rotation {
            0% {
              transform: rotate(0deg);
            }
            100% {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
      <span className="loader"></span>
    </>
  )
}
