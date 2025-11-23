"""
Video Consistency Helper

Simple helper functions for Agent 5 to use visual consistency.
Makes it easy to load and apply consistency without complex changes.
"""

import json
import logging
from typing import Optional, Dict, Any
from app.services.storage import StorageService
from app.agents.visual_consistency_manager import VisualConsistencyManager

logger = logging.getLogger(__name__)


class VideoConsistencyHelper:
    """Helper class for applying visual consistency in Agent 5."""

    def __init__(self, user_id: str, session_id: str, storage_service: StorageService):
        """
        Initialize the helper.

        Args:
            user_id: User ID
            session_id: Session ID
            storage_service: Storage service for S3 access
        """
        self.user_id = user_id
        self.session_id = session_id
        self.storage_service = storage_service
        self.consistency_manager = None
        self.previous_scene = None

    async def initialize(self) -> bool:
        """
        Load and initialize visual consistency from S3.

        Returns:
            True if successfully loaded, False otherwise
        """
        try:
            # Load consistency state from S3
            consistency_s3_key = f"users/{self.user_id}/{self.session_id}/visual_consistency_state.json"
            response = self.storage_service.s3_client.get_object(
                Bucket=self.storage_service.bucket_name,
                Key=consistency_s3_key
            )
            consistency_state = json.loads(response['Body'].read().decode('utf-8'))

            # Initialize consistency manager
            self.consistency_manager = VisualConsistencyManager()
            self.consistency_manager.load_state(consistency_state)

            logger.info(f"Successfully loaded visual consistency state for session {self.session_id}")
            return True

        except Exception as e:
            logger.warning(f"Could not load visual consistency state: {e}")
            # Initialize with defaults
            self.consistency_manager = VisualConsistencyManager()
            return False

    def enhance_video_prompt(self, base_prompt: str, segment: str) -> str:
        """
        Enhance a video prompt with consistency instructions.

        Args:
            base_prompt: Original prompt for the video
            segment: Segment name ("hook", "concept", "process", "conclusion")

        Returns:
            Enhanced prompt with consistency instructions
        """
        if not self.consistency_manager:
            return base_prompt

        try:
            enhanced = self.consistency_manager.generate_consistent_prompt(
                base_description=base_prompt,
                segment=segment,
                is_video=True,
                previous_frame=self.previous_scene
            )

            # Update scene context for next clip
            self.previous_scene = f"Previous {segment} segment"

            return enhanced

        except Exception as e:
            logger.warning(f"Failed to enhance prompt with consistency: {e}")
            return base_prompt

    def get_seed(self) -> Optional[int]:
        """
        Get the consistency seed if available.

        Returns:
            Seed value or None
        """
        if not self.consistency_manager:
            return None

        return self.consistency_manager.visual_state.seed

    def get_reference_image_url(self) -> Optional[str]:
        """
        Get the reference image URL from Agent3 if available.

        Returns:
            Image URL or None
        """
        if not self.consistency_manager:
            return None

        return self.consistency_manager.visual_state.reference_image_url


def apply_video_consistency(
    user_id: str,
    session_id: str,
    storage_service: StorageService,
    prompts: Dict[str, str]
) -> Dict[str, str]:
    """
    Convenience function to apply consistency to all video prompts.

    Args:
        user_id: User ID
        session_id: Session ID
        storage_service: Storage service
        prompts: Dict mapping segment names to prompts

    Returns:
        Dict with enhanced prompts
    """
    import asyncio

    helper = VideoConsistencyHelper(user_id, session_id, storage_service)

    # Initialize helper
    loop = asyncio.get_event_loop()
    loop.run_until_complete(helper.initialize())

    # Enhance all prompts
    enhanced_prompts = {}
    for segment, prompt in prompts.items():
        enhanced_prompts[segment] = helper.enhance_video_prompt(prompt, segment)

    return enhanced_prompts
