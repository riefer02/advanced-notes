# Coding Standards

## General Principles

- **DRY (Don't Repeat Yourself):** Avoid code duplication; extract common logic into reusable functions
- **Self-Documenting Code:** Write clean, readable code with meaningful variable and function names
- **Succinct & Precise:** Avoid bloated code; keep implementations focused and minimal
- **Root Cause Analysis:** When fixing bugs, always investigate the fundamental cause rather than applying surface-level patches

## Python (Backend)

### Style Guide
- Follow PEP 8 conventions
- Use type hints where appropriate
- Keep functions focused on single responsibilities

### Flask Patterns
- Use Flask app factory pattern (see `backend/app/__init__.py`)
- Use blueprints for route organization
- Handle errors gracefully with proper HTTP status codes
- Return JSON responses using `jsonify()`

### Error Handling
```python
try:
    result = some_operation()
    return jsonify({"data": result}), 200
except SpecificError as e:
    return jsonify({"error": str(e)}), 400
except Exception as e:
    return jsonify({"error": str(e)}), 500
```

### Model Loading
- Cache models in module-level variables to avoid reloading
- Use singleton pattern for expensive resources
- Clean up temporary files after use

## TypeScript/React (Frontend)

### Component Structure
- Use functional components with hooks
- Keep components focused on single responsibilities
- Extract complex logic into custom hooks or utility functions

### State Management
- Use `useState` for component-local state
- Use `useRef` for DOM references and mutable values that don't trigger re-renders
- Clean up side effects in `useEffect` cleanup functions

### API Calls
```typescript
const response = await fetch('/api/endpoint', {
  method: 'POST',
  body: formData, // or JSON.stringify(data)
})

if (!response.ok) {
  throw new Error('Request failed')
}

const data = await response.json()
```

### Error Handling
- Display user-friendly error messages
- Use loading states during async operations
- Handle edge cases (empty responses, network failures)

## Styling

### Tailwind CSS
- Use Tailwind utility classes for consistent styling
- Follow mobile-first responsive design
- Use semantic color names (e.g., `bg-red-600` for recording button)
- Maintain visual hierarchy with proper spacing and typography

### UI/UX Principles
- Provide clear feedback for user actions (loading states, success/error messages)
- Use appropriate button states (disabled, hover, active)
- Maintain accessibility (proper labels, keyboard navigation)

## Git Commit Guidelines

### Commit Message Format
```
<type>: <subject>

<optional body>

<optional footer>
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring without functionality change
- `docs`: Documentation updates
- `chore`: Maintenance tasks (dependency updates, config changes)
- `test`: Adding or updating tests

### Example Commits
```
feat: Add browser-based audio recording

- Implement MediaRecorder API integration
- Add recording timer UI
- Handle WebM audio format

fix: Resolve JSON serialization error for model predictions

Convert tensor output to string before returning in API response
```

## Testing Considerations

- Test both upload and recording workflows
- Verify error handling for unsupported formats
- Test MPS acceleration vs CPU fallback
- Validate API responses match expected schema

## Performance Optimization

- Model caching (implemented in `backend/app/asr.py`)
- Lazy loading of expensive resources
- Proper cleanup of temporary files and streams
- Use streaming for large audio files when possible

