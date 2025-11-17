"""
AI Categorization Service using OpenAI GPT-4o-mini

This module provides an abstraction layer for AI-powered note categorization.
Uses structured outputs with Pydantic models for reliable JSON responses.
"""

import os
from typing import List, Optional
from enum import Enum
from pydantic import BaseModel, Field
from openai import OpenAI, OpenAIError


class CategoryAction(str, Enum):
    """Action to take with the transcription"""
    APPEND = "append"  # Add to existing folder
    CREATE_FOLDER = "create_folder"  # Create new top-level folder
    CREATE_SUBFOLDER = "create_subfolder"  # Create subfolder in existing folder


class CategorySuggestion(BaseModel):
    """Structured output for note categorization with tag-first approach"""
    action: CategoryAction = Field(
        description="Whether to append to existing folder or create a new one"
    )
    folder_path: str = Field(
        description="Simple, flat folder path (1-2 levels max, e.g., 'ideas', 'work/meetings')"
    )
    filename: str = Field(
        description="Descriptive filename with date suffix (e.g., 'optimize-performance-2025-11-17.md')"
    )
    tags: List[str] = Field(
        description="3-7 rich, meaningful tags capturing all aspects of content (lowercase, kebab-case). PRIMARY organization method."
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence score between 0 and 1"
    )
    reasoning: str = Field(
        description="Brief explanation focusing on tag selection and folder choice"
    )


class AICategorizationService:
    """
    AI-powered note categorization using OpenAI GPT-4o-mini.
    
    Features:
    - Structured JSON outputs using Pydantic models
    - Confidence scoring for suggestions
    - Context-aware folder creation vs appending
    - Error handling with fallback strategies
    """
    
    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4o-mini"):
        """
        Initialize the AI categorization service.
        
        Args:
            api_key: OpenAI API key. If None, reads from OPENAI_API_KEY env var
            model: Model to use (default: gpt-4o-mini for cost/speed balance)
        """
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError(
                "OpenAI API key required. Set OPENAI_API_KEY environment variable "
                "or pass api_key parameter."
            )
        
        self.client = OpenAI(api_key=self.api_key)
        self.model = model
        
    def categorize(
        self,
        transcription: str,
        existing_folders: List[str],
        timestamp: Optional[str] = None
    ) -> CategorySuggestion:
        """
        Categorize a transcription and suggest folder organization.
        
        Args:
            transcription: The transcribed text to categorize
            existing_folders: List of existing folder paths
            timestamp: Optional ISO timestamp (defaults to current time)
        
        Returns:
            CategorySuggestion with folder path, filename, tags, and confidence
            
        Raises:
            OpenAIError: If API call fails
            ValueError: If response doesn't match expected schema
        """
        if not transcription or not transcription.strip():
            raise ValueError("Transcription cannot be empty")
        
        # Build the categorization prompt
        prompt = self._build_prompt(transcription, existing_folders)
        
        try:
            # Call OpenAI with structured outputs
            completion = self.client.beta.chat.completions.parse(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert note organization assistant. Analyze transcriptions and suggest optimal folder structures."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                response_format=CategorySuggestion,
                temperature=0.3,  # Lower temperature for more consistent categorization
            )
            
            # Extract the parsed response
            suggestion = completion.choices[0].message.parsed
            
            if not suggestion:
                raise ValueError("OpenAI returned empty response")
            
            return suggestion
            
        except OpenAIError as e:
            # Log the error and potentially use fallback strategy
            print(f"OpenAI API error: {e}")
            # For now, re-raise; could implement rule-based fallback here
            raise
        except Exception as e:
            print(f"Unexpected error during categorization: {e}")
            raise
    
    def _build_prompt(self, transcription: str, existing_folders: List[str]) -> str:
        """
        Build the categorization prompt with context.
        
        Args:
            transcription: The text to categorize
            existing_folders: List of existing folder paths
        
        Returns:
            Formatted prompt string
        """
        folders_str = "\n".join(f"- {folder}" for folder in existing_folders) if existing_folders else "- (none)"
        
        prompt = f"""Analyze this transcription and organize it using a TAG-FIRST approach.

TRANSCRIPTION:
\"\"\"
{transcription}
\"\"\"

EXISTING FOLDERS (use as reference, but feel free to create new ones):
{folders_str}

PHILOSOPHY - TAG-FIRST ORGANIZATION:
Tags are the PRIMARY organization method. Folders are just broad, simple containers.
Think: Gmail labels vs folders. Notes can be found through tags, not deep hierarchies.

TASK:
1. Generate 3-7 RICH, MEANINGFUL TAGS that capture all aspects of the content
2. Choose a simple, flat folder (1-2 levels max, broad categories)
3. Create a descriptive filename (lowercase, kebab-case, with date suffix)
4. Provide confidence score (0.0-1.0)
5. Brief reasoning

TAG GUIDELINES (MOST IMPORTANT):
- Extract specific topics, concepts, technologies, people, projects
- Include both broad categories AND specific details
- Examples: ["react", "performance", "hooks", "optimization", "frontend", "web-dev"]
- Think: "What would I search for to find this note?"
- Tags should be: lowercase, kebab-case, specific, searchable
- Prefer MORE tags over fewer (3-7 tags per note)

FOLDER GUIDELINES (KEEP SIMPLE):
- Use broad, flat categories: "work", "personal", "ideas", "learning", etc.
- Avoid deep nesting - maximum 2 levels (e.g., "work/meetings")
- Don't over-organize - when in doubt, create a NEW simple folder
- Don't force content into existing folders if it doesn't fit well
- Examples of good folders: "work", "personal", "ideas", "learning", "projects", "notes"

FILENAME RULES:
- Descriptive, lowercase, kebab-case
- Use date suffix: YYYY-MM-DD format
- Example: "react-performance-tips-2025-11-17.md"

CONFIDENCE:
- Higher (0.8-1.0): Clear topic, obvious tags
- Medium (0.5-0.7): Some ambiguity in categorization
- Lower (0.0-0.4): Very general or unclear content

Return your analysis as structured JSON matching the CategorySuggestion schema."""
        
        return prompt
    
    def categorize_batch(
        self,
        transcriptions: List[str],
        existing_folders: List[str]
    ) -> List[CategorySuggestion]:
        """
        Categorize multiple transcriptions in batch.
        
        Note: Currently processes sequentially. Future optimization:
        use async/await for parallel processing.
        
        Args:
            transcriptions: List of transcriptions to categorize
            existing_folders: List of existing folder paths
        
        Returns:
            List of CategorySuggestion objects
        """
        results = []
        for transcription in transcriptions:
            try:
                suggestion = self.categorize(transcription, existing_folders)
                results.append(suggestion)
            except Exception as e:
                print(f"Failed to categorize transcription: {e}")
                # Append None or error object
                results.append(None)
        
        return results

