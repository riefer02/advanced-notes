# Semantic Organization Feature Specification

## Overview

Transform transcriptions into an organized, hierarchical knowledge base using AI-powered semantic categorization. Users can speak their thoughts on-the-go, and the system automatically files them into appropriate topic folders or creates new ones as needed.

## Use Cases

### Primary Use Cases

1. **Blog Ideas:** All blog-related thoughts → `blog-ideas/` folder
2. **Grocery Lists:** Shopping items → `grocery/` or `home-duties/` folder
3. **Work Notes:** Project thoughts → `work/project-name/` folder
4. **Personal Journal:** Daily reflections → `journal/YYYY-MM/` folder
5. **Learning Notes:** Course materials → `learning/topic-name/` folder

### Example Workflow

```
User says: "Blog idea: How to optimize React performance with useMemo"
↓
System analyzes: "This is about blog content ideas and React development"
↓
System decides: Use existing "blog-ideas/react/" folder
↓
Result: Transcription saved to "blog-ideas/react/optimize-performance-2025-11-08.md"
```

## Architecture

### High-Level Flow

```
[User Records Audio]
    ↓
[Transcription via Parakeet]
    ↓
[AI Categorization Layer] ← New Component
    ↓
[Folder/File Decision]
    ↓
[Save to Organized Structure]
    ↓
[Display in Hierarchy View]
```

### Components

#### 1. AI Categorization Service (Backend)

**File:** `backend/app/categorizer.py`

**Responsibilities:**

- Analyze transcription content
- Determine appropriate folder/category
- Return structured output (folder path, filename, tags)

**Input:**

```python
{
    "text": "Blog idea: How to optimize React performance",
    "timestamp": "2025-11-08T10:30:00Z",
    "existing_folders": ["blog-ideas", "work", "personal"]
}
```

**Output:**

```python
{
    "action": "append",  # or "create_folder", "create_subfolder"
    "folder_path": "blog-ideas/react",
    "filename": "optimize-performance-2025-11-08.md",
    "suggested_tags": ["react", "performance", "blog"],
    "confidence": 0.92,
    "reasoning": "Content discusses blog post idea about React optimization"
}
```

#### 2. Storage Layer (Backend)

**File:** `backend/app/storage.py`

**Responsibilities:**

- Manage file system hierarchy
- Create/read/update folders and files
- Query existing structure
- Return folder tree for UI

**Storage Location:**

```
backend/notes/
├── blog-ideas/
│   ├── react/
│   │   ├── optimize-performance-2025-11-08.md
│   │   └── hooks-patterns-2025-11-05.md
│   └── python/
│       └── asyncio-deep-dive-2025-11-01.md
├── grocery/
│   └── weekly-list-2025-11-08.md
├── work/
│   ├── project-alpha/
│   └── meetings/
└── personal/
    └── journal/
        └── 2025-11/
```

**File Format (Markdown):**

```markdown
---
title: "Optimize React Performance"
created: 2025-11-08T10:30:00Z
tags: [react, performance, blog]
duration: 3.5s
---

# Optimize React Performance

Blog idea: How to optimize React performance with useMemo and useCallback.
Consider adding examples of common pitfalls...

---

_Transcribed via Parakeet-TDT-0.6B-v3_
```

#### 3. API Endpoints (Backend)

**POST `/api/transcribe-and-organize`**

- Transcribes audio
- Categorizes content
- Saves to organized structure
- Returns result with folder location

**GET `/api/notes/tree`**

- Returns folder hierarchy
- Includes note counts per folder

**GET `/api/notes/:folder/:filename`**

- Retrieves specific note content

**PUT `/api/notes/:folder/:filename`**

- Updates note content (manual edits)

**POST `/api/notes/search`**

- Full-text search across all notes
- Filter by folder/tags

#### 4. Frontend UI Components

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  ASR POC - Advanced Notes                               │
├──────────────────────┬──────────────────────────────────┤
│                      │                                  │
│  INPUT CONTROLS      │  FOLDER HIERARCHY & PREVIEW      │
│                      │                                  │
│  ┌────────────────┐  │  📁 blog-ideas/                  │
│  │ 🎤 Record      │  │    📁 react/ (3 notes)           │
│  │                │  │    📁 python/ (1 note)           │
│  │ ⏺ Recording... │  │  📁 grocery/ (1 note)            │
│  └────────────────┘  │  📁 work/                        │
│                      │    📁 project-alpha/ (5 notes)   │
│  ┌────────────────┐  │                                  │
│  │ 📤 Upload File │  │  ┌──────────────────────────┐    │
│  └────────────────┘  │  │ PREVIEW:                 │    │
│                      │  │ optimize-performance...  │    │
│  ┌────────────────┐  │  │                          │    │
│  │ TRANSCRIPT     │  │  │ Blog idea: How to...     │    │
│  │ "Blog idea..." │  │  │                          │    │
│  └────────────────┘  │  └──────────────────────────┘    │
│                      │                                  │
│  ┌────────────────┐  │  Suggested: blog-ideas/react/    │
│  │ 💾 Save to:    │  │  Confidence: 92%                 │
│  │ blog-ideas/    │  │  [✓ Confirm] [Edit Location]     │
│  └────────────────┘  │                                  │
└──────────────────────┴──────────────────────────────────┘
```

**New Components:**

1. **`FolderTree.tsx`**

   - Displays hierarchical folder structure
   - Collapsible folders
   - Shows note count per folder
   - Click to preview notes

2. **`NotePreview.tsx`**

   - Shows note metadata and content
   - Edit/delete options
   - Tag display

3. **`CategorySuggestion.tsx`**

   - Shows AI-suggested folder location
   - Confidence score
   - Edit/override option
   - Manual folder selection

4. **Modified `AudioUploader.tsx`**
   - Split layout (controls on left)
   - Integration with organization flow
   - Success feedback with folder location

## AI Categorization Strategy

### Option 1: Local LLM (Recommended for POC)

**Model:** Use a small local model for categorization

- **Ollama + Llama 3.2 (1B):** Fast, runs on Apple Silicon
- **Structured output:** JSON schema enforcement
- **Privacy:** All data stays local

**Pros:**

- No API costs
- Fast inference (~100-200ms)
- Privacy-preserving
- Offline capable

**Cons:**

- Requires Ollama installation
- ~1GB disk space for model

### Option 2: OpenAI API

**Model:** GPT-4 or GPT-3.5-turbo with structured outputs

**Pros:**

- High accuracy
- No local model setup
- Better reasoning

**Cons:**

- API costs ($0.01-0.03 per request)
- Requires internet
- Privacy concerns

### Option 3: Rule-Based (Simplest)

**Strategy:** Keyword matching + heuristics

**Pros:**

- No AI inference needed
- Extremely fast
- Predictable

**Cons:**

- Less flexible
- Requires manual rule updates
- May mis-categorize edge cases

**Recommended:** Start with **Option 1 (Ollama)** for best balance of speed, cost, and accuracy.

## Categorization Prompt Template

```
You are a note organization assistant. Analyze the transcription and determine the best folder structure.

TRANSCRIPTION:
"""
{transcription_text}
"""

EXISTING FOLDERS:
{folder_list}

TASK:
1. Determine if this should go in an existing folder or need a new one
2. Suggest appropriate folder path (e.g., "blog-ideas/react")
3. Suggest a descriptive filename
4. Extract relevant tags
5. Provide confidence score (0-1)

Return JSON:
{
  "action": "append|create_folder|create_subfolder",
  "folder_path": "category/subcategory",
  "filename": "descriptive-name-YYYY-MM-DD.md",
  "tags": ["tag1", "tag2"],
  "confidence": 0.95,
  "reasoning": "Brief explanation"
}

RULES:
- Use lowercase, kebab-case for paths
- Group related content together
- Create subcategories when >10 notes in a folder
- Use date suffix for filename uniqueness
```

## Implementation Phases

### Phase 1: Basic Storage (MVP)

- [x] Transcription working
- [ ] Create `backend/app/storage.py`
- [ ] Implement file-based storage
- [ ] Add basic folder creation
- [ ] API endpoint for saving organized notes

### Phase 2: AI Categorization

- [ ] Integrate Ollama
- [ ] Create categorization prompt
- [ ] Implement structured output parsing
- [ ] Add confidence thresholds

### Phase 3: Frontend Hierarchy View

- [ ] Split layout (controls + hierarchy)
- [ ] Folder tree component
- [ ] Note preview component
- [ ] Category suggestion UI

### Phase 4: Enhanced Features

- [ ] Search functionality
- [ ] Tag-based filtering
- [ ] Note editing
- [ ] Bulk re-categorization
- [ ] Export to other formats

## Data Models

### Note Metadata

```python
@dataclass
class NoteMetadata:
    id: str  # UUID
    title: str
    created_at: datetime
    updated_at: datetime
    folder_path: str
    filename: str
    tags: List[str]
    duration_seconds: float
    word_count: int
    model_version: str  # "parakeet-tdt-0.6b-v3"
```

### Folder Structure

```python
@dataclass
class FolderNode:
    name: str
    path: str
    note_count: int
    subfolders: List['FolderNode']
    notes: List[NoteMetadata]
```

## Configuration

### Settings (`backend/app/config.py`)

```python
NOTES_BASE_PATH = "backend/notes"
DEFAULT_FOLDERS = ["inbox", "archive"]
MAX_NOTES_PER_FOLDER = 50  # Create subfolder if exceeded
CATEGORIZATION_MODEL = "ollama:llama3.2"
CONFIDENCE_THRESHOLD = 0.7  # Manual review if below
```

## Testing Strategy

### Unit Tests

- Storage layer: folder creation, file operations
- Categorization: prompt formatting, output parsing
- API endpoints: request/response validation

### Integration Tests

- Full workflow: audio → transcription → categorization → storage
- Folder hierarchy updates
- Edge cases: duplicate filenames, invalid characters

### Manual Test Cases

1. "Write a blog post about React hooks" → blog-ideas/react/
2. "Buy milk and eggs" → grocery/
3. "Meeting notes: Project Alpha kickoff" → work/project-alpha/
4. "Today was a good day" → personal/journal/

## Security Considerations

- **Input Validation:** Sanitize filenames (no path traversal)
- **Rate Limiting:** Prevent storage abuse
- **File Size Limits:** Cap note content size
- **Path Restrictions:** Keep all notes within NOTES_BASE_PATH

## Future Enhancements

1. **Multi-user Support:** User-specific note folders
2. **Cloud Sync:** Optional Dropbox/Google Drive sync
3. **Mobile App:** Native iOS/Android clients
4. **Voice Commands:** "Move this to work folder"
5. **Smart Reminders:** Surface relevant notes based on context
6. **Collaborative Notes:** Share folders with others
7. **Version History:** Track note edits over time
8. **Advanced Search:** Semantic search using embeddings

## Success Metrics

- **Categorization Accuracy:** >85% correct folder assignments
- **Time to Save:** <3 seconds (transcription + categorization)
- **User Corrections:** <15% manual folder changes
- **System Usability:** Users find notes 2x faster than chronological
