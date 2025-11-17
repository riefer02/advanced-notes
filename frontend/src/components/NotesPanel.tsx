import { useState } from 'react'
import FolderTree from './FolderTree'
import NotesList from './NotesList'
import SearchBar from './SearchBar'
import CategoryResult from './CategoryResult'
import TagCloud from './TagCloud'
import type { CategoryResult as CategoryResultType } from '../lib/api'

export default function NotesPanel() {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [latestCategory, setLatestCategory] = useState<CategoryResultType | null>(null)
  const [showFolders, setShowFolders] = useState(false)

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
            🏷️ Tag-first organization powered by AI
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
          onChange={(query) => {
            setSearchQuery(query)
            // Clear tag and folder selections when searching
            if (query) {
              setSelectedTag(null)
              setSelectedFolder(null)
            }
          }}
          onClear={() => setSearchQuery('')}
        />

        {/* Tag Cloud - Primary Navigation */}
        <TagCloud
          selectedTag={selectedTag}
          onSelectTag={(tag) => {
            setSelectedTag(tag)
            setSelectedFolder(null) // Clear folder selection when tag is selected
          }}
        />

        {/* Content Area */}
        <div className="space-y-4">
          {searchQuery ? (
            /* Show search results when searching */
            <NotesList 
              searchQuery={searchQuery} 
              onTagClick={(tag) => {
                setSelectedTag(tag)
                setSearchQuery('')
              }}
            />
          ) : selectedTag ? (
            /* Show notes filtered by tag */
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">
                  Notes tagged with "{selectedTag}"
                </h3>
              </div>
              <NotesList 
                tag={selectedTag} 
                onTagClick={(tag) => setSelectedTag(tag)}
              />
            </div>
          ) : (
            /* Show folder tree (de-emphasized) and selected folder notes */
            <>
              <button
                onClick={() => setShowFolders(!showFolders)}
                className="text-sm text-gray-600 hover:text-gray-800 flex items-center gap-1"
              >
                <svg
                  className={`h-4 w-4 transition-transform ${showFolders ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {showFolders ? 'Hide' : 'Show'} folder view
              </button>
              
              {showFolders && (
                <>
                  <FolderTree
                    selectedFolder={selectedFolder}
                    onSelectFolder={(folder) => {
                      setSelectedFolder(folder)
                      setSelectedTag(null) // Clear tag selection when folder is selected
                    }}
                  />
                  {selectedFolder && (
                    <div className="mt-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">
                        Notes in {selectedFolder}
                      </h3>
                      <NotesList 
                        folder={selectedFolder}
                        onTagClick={(tag) => {
                          setSelectedTag(tag)
                          setSelectedFolder(null)
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

