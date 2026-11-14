'use client'
import { Button, TextInput } from '@payloadcms/ui'
import { useState } from 'react'

/**
 * Dashboard demo of the server-side geocoding an agent uses: the search endpoint, and creating a
 * venue from nothing but an address sent in `coordinates_address`.
 */
export const GeocodingDemo = () => {
  const [address, setAddress] = useState('Alexanderplatz 1, 10178 Berlin')
  const [output, setOutput] = useState('')

  const show = async (response: Response) =>
    setOutput(`${response.status} ${JSON.stringify(await response.json(), null, 2)}`)

  return (
    <div style={{ marginBottom: 'var(--base)' }}>
      <h3>Server-side geocoding</h3>
      <TextInput
        label="Address"
        onChange={(event: { target: { value: string } }) => setAddress(event.target.value)}
        path="geocodingDemoAddress"
        value={address}
      />
      <div style={{ display: 'flex', gap: 'calc(var(--base) / 2)' }}>
        <Button
          buttonStyle="secondary"
          onClick={async () =>
            show(await fetch(`/api/geocoding/search?q=${encodeURIComponent(address)}`))
          }
        >
          GET /api/geocoding/search
        </Button>
        <Button
          buttonStyle="secondary"
          onClick={async () =>
            show(
              await fetch('/api/venues', {
                body: JSON.stringify({
                  name: address,
                  _status: 'published',
                  coordinates_address: address,
                }),
                headers: { 'Content-Type': 'application/json' },
                method: 'POST',
              }),
            )
          }
        >
          Create venue from coordinates_address
        </Button>
      </div>
      {output && (
        <pre style={{ maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{output}</pre>
      )}
    </div>
  )
}
