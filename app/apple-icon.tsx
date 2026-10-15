import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/**
 * Branded Apple touch icon generated at build time — a black tile with a blue
 * accent square and a white X mark. Drawn with CSS only (no fonts) so it renders
 * reliably in every environment.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000000',
        }}
      >
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '148px',
            height: '148px',
            borderRadius: '30px',
            background: '#0066FF',
          }}
        >
          <div style={{ position: 'relative', display: 'flex', width: '112px', height: '112px' }}>
            <div
              style={{
                position: 'absolute',
                left: '46px',
                top: '0px',
                width: '20px',
                height: '112px',
                background: '#ffffff',
                borderRadius: '6px',
                transform: 'rotate(45deg)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: '46px',
                top: '0px',
                width: '20px',
                height: '112px',
                background: '#ffffff',
                borderRadius: '6px',
                transform: 'rotate(-45deg)',
              }}
            />
          </div>
        </div>
      </div>
    ),
    size,
  )
}
