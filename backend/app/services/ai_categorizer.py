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
    """Structured output for note categorization"""
    action: CategoryAction = Field(
        description="Whether to append to existing folder or create a new one"
    )
    folder_path: str = Field(
        description="Folder path in lowercase kebab-case (e.g., 'blog-ideas/react')"
    )
    filename: str = Field(
        description="Descriptive filename with date suffix (e.g., 'optimize-performance-2025-11-08.md')"
    )
    tags: List[str] = Field(
        description="Relevant tags for the note (lowercase, kebab-case)"
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence score between 0 and 1"
    )
    reasoning: str = Field(
        description="Brief explanation of the categorization decision"
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
        
        prompt = f"""Analyze this transcription and determine the best folder organization.

TRANSCRIPTION:
\"\"\"
{transcription}
\"\"\"

EXISTING FOLDERS:
{folders_str}

TASK:
1. Determine if this belongs in an existing folder or needs a new one
2. Suggest appropriate folder path (lowercase, kebab-case, e.g., "blog-ideas/react")
3. Create a descriptive filename (lowercase, kebab-case, with date suffix)
4. Extract 2-5 relevant tags
5. Provide confidence score (0.0-1.0) based on how clear the categorization is
6. Brief reasoning for your decision

RULES:
- Use lowercase, kebab-case for all paths and filenames
- Group related content together (e.g., all React posts in "blog-ideas/react")
- Create subcategories when content is specialized (e.g., "work/project-alpha/meetings")
- Use date suffix format: YYYY-MM-DD
- Higher confidence for clear, explicit categorization signals
- Lower confidence for ambiguous or general content
- If transcription mentions "blog" → likely blog-ideas folder
- If transcription mentions "shopping", "grocery", "buy" → likely grocery/home folder
- If transcription mentions "work", "meeting", "project" → likely work folder

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

