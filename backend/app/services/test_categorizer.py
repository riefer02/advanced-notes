"""
Test script for AI categorization service.

Run this to verify OpenAI integration works before integrating with the main app.

Usage:
    python -m app.services.test_categorizer
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.services.ai_categorizer import AICategorizationService, CategoryAction
from app.config import config


def test_categorization():
    """Test the AI categorization with sample transcriptions"""
    
    print("🧪 Testing AI Categorization Service\n")
    print("=" * 60)
    
    # Check if API key is set
    if not config.OPENAI_API_KEY or config.OPENAI_API_KEY == "your-api-key-here":
        print("❌ ERROR: OPENAI_API_KEY not set!")
        print("Please create a .env file in backend/ with your OpenAI API key.")
        print("See ENV_SETUP.md for instructions.\n")
        return False
    
    print(f"✅ OpenAI API Key found")
    print(f"📊 Model: {config.OPENAI_MODEL}")
    print(f"🎯 Confidence threshold: {config.CONFIDENCE_THRESHOLD}\n")
    
    # Initialize service
    try:
        service = AICategorizationService(model=config.OPENAI_MODEL)
        print("✅ AI Categorization Service initialized\n")
    except Exception as e:
        print(f"❌ Failed to initialize service: {e}\n")
        return False
    
    # Test cases
    test_cases = [
        {
            "name": "Blog Post Idea",
            "transcription": "Blog idea: How to optimize React performance using useMemo and useCallback. Talk about common pitfalls and best practices.",
            "existing_folders": ["blog-ideas", "work", "personal"]
        },
        {
            "name": "Grocery List",
            "transcription": "Need to buy milk, eggs, bread, and coffee. Also get some apples and bananas.",
            "existing_folders": ["blog-ideas", "grocery", "work"]
        },
        {
            "name": "Work Meeting Notes",
            "transcription": "Meeting notes for Project Alpha kickoff. Discussed timeline, deliverables, and team roles. Action items: setup repository, create Jira board, schedule standup meetings.",
            "existing_folders": ["blog-ideas", "work", "work/project-alpha"]
        },
        {
            "name": "Personal Journal",
            "transcription": "Today was a really good day. Made progress on my side project and had a great workout at the gym.",
            "existing_folders": ["blog-ideas", "work", "personal", "personal/journal"]
        }
    ]
    
    # Run tests
    for i, test_case in enumerate(test_cases, 1):
        print(f"Test {i}: {test_case['name']}")
        print("-" * 60)
        print(f"Transcription: \"{test_case['transcription'][:80]}...\"")
        print(f"Existing folders: {', '.join(test_case['existing_folders'])}\n")
        
        try:
            result = service.categorize(
                transcription=test_case['transcription'],
                existing_folders=test_case['existing_folders']
            )
            
            print(f"✅ Categorization successful!")
            print(f"   Action: {result.action.value}")
            print(f"   Folder path: {result.folder_path}")
            print(f"   Filename: {result.filename}")
            print(f"   Tags: {', '.join(result.tags)}")
            print(f"   Confidence: {result.confidence:.2f}")
            print(f"   Reasoning: {result.reasoning}")
            
            # Check confidence
            if result.confidence >= config.CONFIDENCE_THRESHOLD:
                print(f"   ✅ High confidence (>= {config.CONFIDENCE_THRESHOLD})")
            else:
                print(f"   ⚠️  Low confidence (< {config.CONFIDENCE_THRESHOLD}) - may need manual review")
            
        except Exception as e:
            print(f"❌ Categorization failed: {e}")
            import traceback
            traceback.print_exc()
        
        print()
    
    print("=" * 60)
    print("✅ All tests completed!\n")
    return True


if __name__ == "__main__":
    success = test_categorization()
    sys.exit(0 if success else 1)

