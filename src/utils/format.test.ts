import { describe, expect, test } from 'vitest'
import { externalUrl, safeRedirect, validPassword } from './format'
import { localDrafts, newDraftId, readRecovery } from './drafts'

describe('community input boundaries', () => {
  test('keeps legitimate return paths and rejects external or malformed redirects', () => {
    expect(safeRedirect('/post/7/edit?draft=abc')).toBe('/post/7/edit?draft=abc')
    for (const value of ['https://example.test', '//example.test', '/\\example.test', '/login?redirect=/login', '/\nexample.test', null]) expect(safeRedirect(value)).toBe('/')
  })
  test('accepts only HTTP resource links', () => {
    expect(externalUrl('https://example.test/resource')).toBe('https://example.test/resource')
    expect(externalUrl('javascript:alert(1)')).toBeUndefined()
    expect(externalUrl('data:text/html,test')).toBeUndefined()
  })
  test('checks password bytes rather than only character count', () => {
    expect(validPassword('abcdefgh')).toBe(true)
    expect(validPassword('short')).toBe(false)
    expect(validPassword('中'.repeat(24))).toBe(true)
    expect(validPassword('中'.repeat(25))).toBe(false)
  })
  test('ignores corrupted recovery data without breaking the draft list', () => {
    const id = newDraftId()
    localStorage.setItem(`liushao:react:post-draft:1:42:${id}`, '{corrupted')
    expect(readRecovery(42, id)).toBeUndefined()
    expect(localDrafts(42)).toEqual([])
    localStorage.clear()
  })
})
