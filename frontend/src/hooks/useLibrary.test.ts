import { describe, expect, it } from 'vitest'

import { mergeLibraryItems, type LibraryItem } from './useLibrary'

function note(id: string, timestamp: string): LibraryItem {
  return {
    kind: 'note',
    id,
    timestamp,
    note: {
      id,
      title: id,
      content: '',
      folder_path: 'inbox',
      tags: [],
      confidence: null,
      transcription_duration: null,
      model_version: null,
      word_count: 0,
      created_at: timestamp,
      updated_at: timestamp,
      source: 'manual',
      version: 1,
    },
  }
}

describe('mergeLibraryItems', () => {
  it('sorts every kind newest first', () => {
    const merged = mergeLibraryItems([
      note('older', '2026-11-20T10:00:00Z'),
      note('newest', '2026-11-25T10:00:00Z'),
      note('middle', '2026-11-22T10:00:00Z'),
    ])
    expect(merged.map((item) => item.id)).toEqual(['newest', 'middle', 'older'])
  })

  it('does not mutate the input array', () => {
    const input = [note('a', '2026-11-20T10:00:00Z'), note('b', '2026-11-25T10:00:00Z')]
    mergeLibraryItems(input)
    expect(input.map((item) => item.id)).toEqual(['a', 'b'])
  })
})
