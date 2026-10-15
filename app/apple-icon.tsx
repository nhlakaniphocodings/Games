import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

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
            background: '#000000',
            border: '2px solid #FF0000',
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
                background: '#FF0000',
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
                background: '#FF0000',
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