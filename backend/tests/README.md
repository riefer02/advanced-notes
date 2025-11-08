# Backend Tests

Test suite for the backend services.

## Running Tests

### Run All Tests
```bash
cd backend
uv run python -m pytest tests/
```

### Run Specific Test
```bash
# Storage tests
uv run python -m tests.services.test_storage

# AI categorizer tests  
uv run python -m tests.services.test_categorizer
```

## Test Structure

```
tests/
├── services/
│   ├── test_categorizer.py    # AI categorization service tests
│   └── test_storage.py         # Note storage service tests
└── __init__.py
```

## Test Coverage

### Storage Service (`test_storage.py`)
- ✅ Save/read/update/delete notes
- ✅ List notes with filtering
- ✅ Full-text search with FTS5
- ✅ Folder hierarchy
- ✅ Tag operations
- ✅ Statistics
- ✅ Edge cases

### AI Categorizer (`test_categorizer.py`)
- ✅ Note categorization (blog, grocery, work, personal)
- ✅ Structured output validation
- ✅ Confidence scoring
- ✅ Folder path suggestions
- ✅ Tag extraction

## Writing New Tests

Follow the existing patterns:
1. Create test file in appropriate subdirectory
2. Use descriptive test function names
3. Include setup and teardown
4. Test both success and error cases
5. Clean up test databases/files after tests

