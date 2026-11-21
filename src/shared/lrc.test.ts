import { describe, expect, it } from 'vitest'
import { findActiveLine, parseLrc, stripLrc } from './lrc'

describe('parseLrc', () => {
  it('parses lines, multi stamps, offset and sorts', () => {
    const src = '[offset:+500]\n[ar:x]\n[00:10.00][00:05.50]Hi\n[00:07.5]Mid'
    const l = parseLrc(src)
    expect(l.map((x) => [x.timeMs, x.text])).toEqual([
      [6000, 'Hi'],
      [8000, 'Mid'],
      [10500, 'Hi']
    ])
  })
  it('parses enhanced word timing', () => {
    const l = parseLrc('[00:01.00]<00:01.00>Hello <00:01.40>world <00:02.00>')
    expect(l[0]!.text).toBe('Hello world')
    expect(l[0]!.words?.map((w) => w.timeMs)).toEqual([1000, 1400])
  })
  it('keeps empty break lines', () => {
    expect(parseLrc('[00:01.00]\n[00:02.00]a')[0]!.text).toBe('')
  })
})

describe('findActiveLine', () => {
  const lines = parseLrc('[00:01.00]a\n[00:03.00]b\n[00:05.00]c')
  it('handles edges', () => {
    expect(findActiveLine(lines, 0)).toBe(-1)
    expect(findActiveLine(lines, 1000)).toBe(0)
    expect(findActiveLine(lines, 4999)).toBe(1)
    expect(findActiveLine(lines, 99999)).toBe(2)
    expect(findActiveLine([], 5)).toBe(-1)
  })
})

describe('stripLrc', () => {
  it('removes stamps and tags', () => {
    expect(stripLrc('[ar:x]\n[00:01.00]hello\n[00:02.00]world')).toBe('hello\nworld')
  })
})

import { parseImported, parseSrt } from './lrc'

describe('parseSrt', () => {
  it('reads timed subtitle blocks and strips markup', () => {
    const srt = '1\n00:00:01,500 --> 00:00:03,000\n<i>Hello</i> there\n\n2\n00:00:04,000 --> 00:00:06,250\nSecond {\\an8}line\n'
    const l = parseSrt(srt)
    expect(l).toEqual([
      { timeMs: 1500, text: 'Hello there', endMs: 3000 },
      { timeMs: 4000, text: 'Second line', endMs: 6250 }
    ])
  })
})

describe('parseImported', () => {
  it('detects LRC, SRT and plain text', () => {
    expect(parseImported('[00:01.00]one\n[00:03.00]two').format).toBe('lrc')
    expect(parseImported('1\n00:00:01,000 --> 00:00:02,000\nhi\n').format).toBe('srt')
    const p = parseImported('just some words\nand more')
    expect(p.kind).toBe('plain')
    expect(p.plain).toContain('and more')
  })
  it('never throws on junk and reports empty', () => {
    expect(parseImported('').kind).toBe('empty')
    expect(parseImported('   \n  ').kind).toBe('empty')
    expect(parseImported('\u0000\u0000').kind).toBe('empty')
  })
  it('one timestamp is not enough to call it synced', () => {
    expect(parseImported('[00:01.00]only one').kind).toBe('plain')
  })
})
