import { useState } from 'react'
import FolderTree from './FolderTree'
import NotesList from './NotesList'
import SearchBar from './SearchBar'
import CategoryResult from './CategoryResult'
import type { CategoryResult as CategoryResultType } from '../lib/api'

export default function NotesPanel() {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [latestCategory, setLatestCategory] = useState<CategoryResultType | null>(null)

  // Expose a way for parent to set category result
  // We'll use a global event for this (simple POC approach)
  // In production, you might use context or zustand
  if (typeof window !== 'undefined') {
    (window as any).__setLatestCategory = setLatestCategory
  }

  return (
    <div className="h-full bg-white">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="border-b pb-4">
          <h2 className="text-2xl font-bold text-gray-900">Your Notes</h2>
          <p className="text-sm text-gray-600 mt-1">
            Organized by AI-powered semantic categorization
          </p>
        </div>

        {/* Latest Categorization Result */}
        {latestCategory && (
          <CategoryResult
            noteId={latestCategory.note_id}
            folderPath={latestCategory.folder_path}
            filename={latestCategory.filename}
            tags={latestCategory.tags}
            confidence={latestCategory.confidence}
            reasoning={latestCategory.reasoning}
            onDismiss={() => setLatestCategory(null)}
          />
        )}

        {/* Search Bar */}
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery('')}
        />

        {/* Content Area */}
        <div className="space-y-4">
          {searchQuery ? (
            /* Show search results when searching */
            <NotesList searchQuery={searchQuery} />
          ) : (
            /* Show folder tree and selected folder notes */
            <>
              <FolderTree
                selectedFolder={selectedFolder}
                onSelectFolder={setSelectedFolder}
              />
              {selectedFolder && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Notes in {selectedFolder}
                  </h3>
                  <NotesList folder={selectedFolder} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

