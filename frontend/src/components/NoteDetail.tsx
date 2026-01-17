import type { Note } from '../lib/api'
import SuggestedTodos from './SuggestedTodos'

interface NoteDetailProps {
  note: Note & { snippet?: string, rank?: number }
  onDelete: () => void
}

export default function NoteDetail({ note, onDelete }: NoteDetailProps) {
  const hasSnippet = !!note.snippet

  return (
    <div className="space-y-6 pb-6">
      {/* Suggested Todos */}
      <SuggestedTodos noteId={note.id} />

      {/* Meta Info */}
      <div className="flex flex-col gap-2 text-sm text-gray-500">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {new Date(note.created_at).toLocaleString()}
          </span>
          {note.word_count > 0 && (
            <span className="flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              {note.word_count} words
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Folder: {note.folder_path}
        </div>
      </div>

      {/* Tags */}
      {note.tags && note.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {note.tags.map(tag => (
            <span 
              key={tag}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Search Snippet (if available) */}
      {hasSnippet && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-xs font-medium text-yellow-800 mb-2 uppercase tracking-wide">
            Search Match ({Math.round((note.rank || 0) * 100)}%)
          </div>
          <div 
            className="text-sm text-gray-800"
            dangerouslySetInnerHTML={{ __html: note.snippet || '' }}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="prose prose-blue max-w-none">
        <div className="whitespace-pre-wrap text-gray-800 text-base leading-relaxed">
          {note.content}
        </div>
      </div>

      {/* Actions */}
      <div className="pt-6 border-t border-gray-200">
        <button
          onClick={onDelete}
          className="w-full flex justify-center items-center gap-2 px-4 py-2 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete Note
        </button>
      </div>
    </div>
  )
}

