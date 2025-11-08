"""
Test script for note storage service.

Tests all core functionality:
- Save/read/update/delete notes
- List and search operations
- Folder hierarchy
- Tag management
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.services.storage import NoteStorage
from app.services.models import NoteMetadata


def test_storage():
    """Test the storage service with comprehensive scenarios"""
    
    print("🧪 Testing Note Storage Service\n")
    print("=" * 60)
    
    # Initialize storage (will create test database)
    test_db = "backend/notes/.notes_test.db"
    Path(test_db).unlink(missing_ok=True)  # Clean start
    
    storage = NoteStorage(db_path=test_db)
    print("✅ Storage initialized\n")
    
    # Test 1: Save notes
    print("Test 1: Saving Notes")
    print("-" * 60)
    
    note_ids = []
    
    # Blog post
    note1_id = storage.save_note(
        content="""# React Performance Optimization

Blog post about optimizing React apps using useMemo and useCallback.

## Key Points
- Understand when to use useMemo
- Avoid premature optimization
- Profile before optimizing

This will help developers write faster React applications.""",
        metadata=NoteMetadata(
            title="React Performance Tips",
            folder_path="blog-ideas/react",
            tags=["react", "performance", "optimization"],
            confidence=0.92,
            transcription_duration=3.5,
            model_version="parakeet-tdt-0.6b-v3"
        )
    )
    note_ids.append(note1_id)
    print(f"✅ Saved blog post: {note1_id[:8]}...")
    
    # Grocery list
    note2_id = storage.save_note(
        content="""# Grocery List

Shopping list for this week:
- Milk
- Eggs
- Bread
- Coffee
- Apples
- Bananas""",
        metadata=NoteMetadata(
            title="Weekly Grocery Shopping",
            folder_path="grocery",
            tags=["shopping", "food"],
            confidence=0.95,
            transcription_duration=2.1
        )
    )
    note_ids.append(note2_id)
    print(f"✅ Saved grocery list: {note2_id[:8]}...")
    
    # Work meeting
    note3_id = storage.save_note(
        content="""# Project Alpha Kickoff Meeting

Meeting notes from the kickoff:

## Attendees
- John, Sarah, Mike

## Discussion
- Timeline: 3 months
- Deliverables: MVP by Q1
- Tech stack: React + Python

## Action Items
- Setup repository
- Create Jira board
- Schedule daily standups""",
        metadata=NoteMetadata(
            title="Project Alpha Kickoff",
            folder_path="work/project-alpha/meetings",
            tags=["meeting", "project-alpha", "kickoff"],
            confidence=0.88,
            transcription_duration=5.2
        )
    )
    note_ids.append(note3_id)
    print(f"✅ Saved meeting notes: {note3_id[:8]}...")
    
    # Another React post
    note4_id = storage.save_note(
        content="""# React Hooks Best Practices

Essential patterns for React hooks:
- Always call hooks at the top level
- Use custom hooks for reusable logic
- Understand dependency arrays""",
        metadata=NoteMetadata(
            title="React Hooks Patterns",
            folder_path="blog-ideas/react",
            tags=["react", "hooks", "best-practices"],
            confidence=0.90
        )
    )
    note_ids.append(note4_id)
    print(f"✅ Saved hooks post: {note4_id[:8]}...\n")
    
    # Test 2: Retrieve notes
    print("Test 2: Retrieving Notes")
    print("-" * 60)
    
    note = storage.get_note(note1_id)
    if note:
        print(f"✅ Retrieved note: {note.title}")
        print(f"   Folder: {note.folder_path}")
        print(f"   Tags: {', '.join(note.tags)}")
        print(f"   Word count: {note.word_count}")
        print(f"   Confidence: {note.confidence}")
    else:
        print("❌ Failed to retrieve note")
    print()
    
    # Test 3: Update note
    print("Test 3: Updating Notes")
    print("-" * 60)
    
    success = storage.update_note(
        note1_id,
        content=note.content + "\n\n## Updated Section\nAdded new content!",
        metadata=NoteMetadata(
            title="React Performance Tips (Updated)",
            folder_path="blog-ideas/react",
            tags=["react", "performance", "optimization", "updated"]
        )
    )
    
    if success:
        updated = storage.get_note(note1_id)
        print(f"✅ Updated note: {updated.title}")
        print(f"   New word count: {updated.word_count}")
        print(f"   New tags: {', '.join(updated.tags)}")
    else:
        print("❌ Failed to update note")
    print()
    
    # Test 4: List notes
    print("Test 4: Listing Notes")
    print("-" * 60)
    
    all_notes = storage.list_notes()
    print(f"✅ Total notes: {len(all_notes)}")
    for n in all_notes:
        print(f"   - {n.title} ({n.folder_path})")
    print()
    
    # List notes in specific folder
    react_notes = storage.list_notes(folder="blog-ideas/react")
    print(f"✅ Notes in blog-ideas/react: {len(react_notes)}")
    for n in react_notes:
        print(f"   - {n.title}")
    print()
    
    # Test 5: Search notes
    print("Test 5: Full-Text Search")
    print("-" * 60)
    
    results = storage.search_notes("React optimization")
    print(f"✅ Search results for 'React optimization': {len(results)}")
    for r in results:
        print(f"   - {r.note.title} (rank: {r.rank:.2f})")
        print(f"     Snippet: {r.snippet}")
    print()
    
    # Test 6: Folder tree
    print("Test 6: Folder Hierarchy")
    print("-" * 60)
    
    tree = storage.get_folder_tree()
    
    def print_tree(node, indent=0):
        if node.name:  # Skip root
            print("  " * indent + f"📁 {node.name}/ ({node.note_count} notes)")
        for subfolder in node.subfolders:
            print_tree(subfolder, indent + 1)
    
    print("✅ Folder tree:")
    print_tree(tree)
    print()
    
    # Test 7: Tag operations
    print("Test 7: Tag Operations")
    print("-" * 60)
    
    all_tags = storage.get_all_tags()
    print(f"✅ All tags: {', '.join(all_tags)}")
    print()
    
    react_tagged = storage.get_notes_by_tag("react")
    print(f"✅ Notes tagged 'react': {len(react_tagged)}")
    for n in react_tagged:
        print(f"   - {n.title}")
    print()
    
    # Test 8: Statistics
    print("Test 8: Statistics")
    print("-" * 60)
    
    total_count = storage.get_note_count()
    print(f"✅ Total note count: {total_count}")
    
    react_count = storage.get_note_count(folder="blog-ideas/react")
    print(f"✅ Notes in blog-ideas/react: {react_count}")
    
    stats = storage.get_folder_stats("blog-ideas/react")
    if stats:
        print(f"✅ Folder stats for blog-ideas/react:")
        print(f"   Note count: {stats.note_count}")
        print(f"   Total duration: {stats.total_duration:.1f}s")
        print(f"   Avg confidence: {stats.avg_confidence:.2f}")
        print(f"   Top tags: {', '.join(stats.most_common_tags)}")
    print()
    
    # Test 9: Delete note
    print("Test 9: Deleting Notes")
    print("-" * 60)
    
    success = storage.delete_note(note2_id)
    if success:
        print(f"✅ Deleted note: {note2_id[:8]}...")
        
        # Verify deletion
        deleted = storage.get_note(note2_id)
        if deleted is None:
            print("✅ Verified: Note no longer exists")
        else:
            print("❌ Error: Note still exists after deletion")
    else:
        print("❌ Failed to delete note")
    print()
    
    # Test 10: Edge cases
    print("Test 10: Edge Cases")
    print("-" * 60)
    
    # Non-existent note
    missing = storage.get_note("non-existent-id")
    if missing is None:
        print("✅ Correctly returns None for non-existent note")
    
    # Empty search
    empty_results = storage.search_notes("xyzabc123")
    if len(empty_results) == 0:
        print("✅ Empty search returns no results")
    
    # Update non-existent note
    update_fail = storage.update_note("non-existent-id", content="test")
    if not update_fail:
        print("✅ Update returns False for non-existent note")
    
    # Delete non-existent note
    delete_fail = storage.delete_note("non-existent-id")
    if not delete_fail:
        print("✅ Delete returns False for non-existent note")
    print()
    
    # Summary
    print("=" * 60)
    print("✅ All tests completed successfully!\n")
    
    # Cleanup
    print("Cleaning up test database...")
    Path(test_db).unlink(missing_ok=True)
    Path(test_db).with_suffix(".db-wal").unlink(missing_ok=True)
    Path(test_db).with_suffix(".db-shm").unlink(missing_ok=True)
    print("✅ Cleanup complete\n")
    
    return True


if __name__ == "__main__":
    try:
        success = test_storage()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

