import React from 'react'

type CardProps = {
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  icon?: React.ReactNode
  title: string
}

export const Card: React.FC<CardProps> = ({ actions, children, className, icon, title }) => {
  return (
    <div className={`card ${className ?? ''}`} style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ alignItems: 'center', display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {icon ? <div style={{ color: 'var(--theme-elevation-500)' }}>{icon}</div> : null}
        <h2 style={{ fontSize: 'var(--font-size-h4)', margin: 0 }}>{title}</h2>
      </div>

      <div style={{ marginBottom: '1rem' }}>{children}</div>

      {actions ? <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>{actions}</div> : null}
    </div>
  )
}
