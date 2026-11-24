import { describe, expect, it } from 'vitest'
import { productionCsp } from './csp'

describe('productionCsp', () => {
  const csp = productionCsp('lyra-media')
  it('allows no inline or eval script and no plugins', () => {
    expect(csp).toMatch(/script-src 'self'(;|$)/)
    expect(csp).not.toMatch(/script-src[^;]*unsafe/)
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'none'")
  })
  it('lists only the hosts the app really talks to from the page', () => {
    expect(csp).toContain('frame-src https://www.youtube-nocookie.com')
    expect(csp).toContain("connect-src 'self' https://0.peerjs.com wss://0.peerjs.com")
    expect(csp).toContain('lyra-media:')
  })
})
