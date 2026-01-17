import { useState, useRef, useEffect } from 'react'
import { useFolderTree } from '../hooks/useNotes'
import type { FolderNode } from '../lib/api'

interface FolderTreeProps {
  selectedFolder: string | null
  onSelectFolder: (path: string | null) => void
}

export default function FolderTree({ selectedFolder, onSelectFolder }: FolderTreeProps) {
  const { data: root, isLoading, error } = useFolderTree()
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  // Auto-expand folder if it was just updated
  useEffect(() => {
    if (selectedFolder && root) {
      setExpandedFolders((currentExpanded) => {
        const parts = selectedFolder.split('/')
        const newExpanded = new Set(currentExpanded)
        let path = ''
        for (const part of parts.slice(0, -1)) {
          path = path ? `${path}/${part}` : part
          newExpanded.add(path)
        }
        return newExpanded
      })
    }
  }, [selectedFolder, root])

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedFolders(newExpanded)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2 text-gray-500">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-sm">Loading folders...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 border border-red-200">
        <p className="text-sm text-red-800">Failed to load folders</p>
      </div>
    )
  }

  if (!root || (root.subfolders.length === 0 && root.note_count === 0)) {
    return (
      <div className="rounded-lg bg-gray-50 p-8 text-center border-2 border-dashed border-gray-300">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-semibold text-gray-900">No notes yet</h3>
        <p className="mt-1 text-sm text-gray-500">
          Record or upload audio to create your first note
        </p>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
        Folders
      </h3>
      <nav role="tree" aria-label="Folder navigation">
        <ul className="space-y-1">
          {root.subfolders.map((folder) => (
            <FolderTreeNode
              key={folder.path}
              node={folder}
              level={0}
              selectedPath={selectedFolder}
              expandedFolders={expandedFolders}
              onToggle={toggleFolder}
              onSelect={onSelectFolder}
            />
          ))}
        </ul>
      </nav>
    </div>
  )
}

interface FolderTreeNodeProps {
  node: FolderNode
  level: number
  selectedPath: string | null
  expandedFolders: Set<string>
  onToggle: (path: string) => void
  onSelect: (path: string) => void
}

function FolderTreeNode({
  node,
  level,
  selectedPath,
  expandedFolders,
  onToggle,
  onSelect,
}: FolderTreeNodeProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const isExpanded = expandedFolders.has(node.path)
  const isSelected = selectedPath === node.path
  const hasChildren = node.subfolders.length > 0

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' && hasChildren && !isExpanded) {
      e.preventDefault()
      onToggle(node.path)
    } else if (e.key === 'ArrowLeft' && isExpanded) {
      e.preventDefault()
      onToggle(node.path)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(node.path)
    }
  }

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined} aria-level={level + 1}>
      <div className="flex items-center gap-1">
        {hasChildren && (
          <button
            onClick={() => onToggle(node.path)}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
            tabIndex={-1}
          >
            <svg
              className={`h-4 w-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
        <button
          ref={buttonRef}
          onClick={() => onSelect(node.path)}
          onKeyDown={handleKeyDown}
          className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-left ${
            isSelected ? 'bg-blue-50 text-blue-900 font-medium' : 'hover:bg-gray-50 text-gray-700'
          }`}
          style={{ paddingLeft: `${(level + (hasChildren ? 0 : 1)) * 0.75 + 0.5}rem` }}
          aria-current={isSelected ? 'true' : undefined}
        >
          <svg
            className={`h-4 w-4 flex-shrink-0 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`}
            fill={isExpanded ? 'none' : 'currentColor'}
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          <span className="truncate">{node.name}</span>
          {node.note_count > 0 && (
            <span
              className={`ml-auto flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                isSelected ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {node.note_count}
            </span>
          )}
        </button>
      </div>
      {hasChildren && isExpanded && (
        <ul role="group" className="mt-1 space-y-1">
          {node.subfolders.map((child) => (
            <FolderTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              selectedPath={selectedPath}
              expandedFolders={expandedFolders}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
