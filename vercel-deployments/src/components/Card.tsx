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
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}
      >
        {icon ? <div style={{ opacity: 0.7 }}>{icon}</div> : null}
        <h3 style={{ margin: 0 }}>{title}</h3>
      </div>

      <div style={{ marginBottom: '1rem' }}>{children}</div>

      {actions ? <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>{actions}</div> : null}
    </div>
  )
}
