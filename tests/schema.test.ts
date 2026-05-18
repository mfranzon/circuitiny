import { describe, it, expect } from 'vitest'
import { emptyProject } from '../src/project/schema'

describe('emptyProject', () => {
  it('derives esp32 target for devkitc-v4', () => {
    expect(emptyProject('test', 'esp32-devkitc-v4').target).toBe('esp32')
  })

  it('derives esp32s3 target for s3 devkitc', () => {
    expect(emptyProject('test', 'esp32s3-devkitc-1').target).toBe('esp32s3')
  })

  it('derives esp32c3 target for c3 devkitm', () => {
    expect(emptyProject('test', 'esp32c3-devkitm-1').target).toBe('esp32c3')
  })

  it('derives esp32c6 target for c6 devkitc', () => {
    expect(emptyProject('test', 'esp32c6-devkitc-1').target).toBe('esp32c6')
  })

  it('derives esp32s3 target for xiao-esp32s3', () => {
    expect(emptyProject('test', 'xiao-esp32s3').target).toBe('esp32s3')
  })

  it('falls back to esp32 for unknown board id', () => {
    expect(emptyProject('test', 'totally-unknown-board').target).toBe('esp32')
  })

  it('defaults board to esp32-devkitc-v4 when omitted', () => {
    const p = emptyProject('test')
    expect(p.board).toBe('esp32-devkitc-v4')
    expect(p.target).toBe('esp32')
  })

  it('initialises with empty components and nets', () => {
    const p = emptyProject('my-project')
    expect(p.components).toHaveLength(0)
    expect(p.nets).toHaveLength(0)
  })

  it('sets schemaVersion to 1', () => {
    expect(emptyProject('test').schemaVersion).toBe(1)
  })
})
