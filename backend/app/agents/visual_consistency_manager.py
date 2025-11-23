"""
Visual Consistency Manager Agent

Purpose: Maintain visual consistency across all generated content in the video pipeline.

Key Functions:
1. Extract style reference from Agent3's diagram
2. Maintain visual state (characters, settings, colors) across generations
3. Generate consistent prompts for images and videos
4. Validate visual consistency before final assembly
"""

import logging
import json
import base64
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict
import httpx

logger = logging.getLogger(__name__)


@dataclass
class VisualState:
    """Maintains the visual state across all generations."""

    # Reference from Agent3 diagram
    reference_image_url: Optional[str] = None
    primary_colors: List[str] = None  # ["#FF5733", "#3498DB", ...]
    art_style: str = "hand-drawn cartoon illustration"

    # Character descriptions
    main_characters: List[Dict[str, str]] = None  # [{"name": "protagonist", "description": "..."}]

    # Setting details
    setting: str = ""
    lighting: str = "bright, warm lighting"
    atmosphere: str = "cheerful, educational"

    # Camera/composition
    camera_style: str = "medium shot, eye level"
    composition: str = "centered, balanced"

    # Narrative progression
    current_segment: str = "hook"  # hook, concept, process, conclusion
    previous_scene_summary: str = ""

    # Technical consistency
    seed: Optional[int] = None  # Fixed seed for style consistency

    def __post_init__(self):
        if self.primary_colors is None:
            self.primary_colors = []
        if self.main_characters is None:
            self.main_characters = []

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'VisualState':
        """Create from dictionary."""
        return cls(**data)


class VisualConsistencyManager:
    """
    Manages visual consistency across the entire video pipeline.

    This agent acts as a central coordinator for maintaining consistent
    visual style, characters, settings, and narrative flow.
    """

    def __init__(self, openrouter_api_key: Optional[str] = None):
        """
        Initialize the Visual Consistency Manager.

        Args:
            openrouter_api_key: Optional API key for vision analysis
        """
        self.openrouter_api_key = openrouter_api_key
        self.visual_state = VisualState()

    async def extract_style_from_diagram(self, diagram_url: str) -> Dict[str, Any]:
        """
        Analyze Agent3's diagram to extract style reference information.

        This uses vision AI to understand:
        - Art style (cartoon, realistic, etc.)
        - Color palette
        - Visual themes
        - Compositional elements

        Args:
            diagram_url: URL of the diagram from Agent3

        Returns:
            Dict with extracted style information
        """
        try:
            # Download the diagram
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(diagram_url)
                if response.status_code != 200:
                    logger.warning(f"Failed to download diagram: {response.status_code}")
                    return {}

                image_data = response.content

            # Convert to base64
            image_b64 = base64.b64encode(image_data).decode('utf-8')

            # Use vision AI to analyze the style (if available)
            if self.openrouter_api_key:
                style_analysis = await self._analyze_with_vision(image_b64)
            else:
                # Basic fallback without vision AI
                style_analysis = {
                    "art_style": "illustrated, colorful, kid-friendly",
                    "primary_colors": ["vibrant", "saturated"],
                    "atmosphere": "educational, engaging"
                }

            # Update visual state
            self.visual_state.reference_image_url = diagram_url
            self.visual_state.art_style = style_analysis.get("art_style", self.visual_state.art_style)
            self.visual_state.primary_colors = style_analysis.get("primary_colors", [])
            self.visual_state.atmosphere = style_analysis.get("atmosphere", self.visual_state.atmosphere)

            logger.info(f"Extracted style from diagram: {style_analysis}")
            return style_analysis

        except Exception as e:
            logger.error(f"Failed to extract style from diagram: {e}", exc_info=True)
            return {}

    async def _analyze_with_vision(self, image_b64: str) -> Dict[str, Any]:
        """
        Use OpenRouter vision model to analyze image style.

        Args:
            image_b64: Base64 encoded image

        Returns:
            Dict with style analysis
        """
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.openrouter_api_key}",
                        "HTTP-Referer": "https://github.com/gauntlet-pipeline",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "google/gemini-2.0-flash-exp:free",  # Free vision model
                        "messages": [
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": """Analyze this illustration and return ONLY a JSON object with:
{
  "art_style": "describe the artistic style (cartoon, realistic, etc.)",
  "primary_colors": ["list", "main", "colors"],
  "atmosphere": "describe the mood and feeling",
  "subjects": "what is depicted"
}"""
                                    },
                                    {
                                        "type": "image_url",
                                        "image_url": {
                                            "url": f"data:image/png;base64,{image_b64}"
                                        }
                                    }
                                ]
                            }
                        ],
                        "response_format": {"type": "json_object"}
                    }
                )

                if response.status_code == 200:
                    data = response.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
                    return json.loads(content)
                else:
                    logger.warning(f"Vision analysis failed: {response.status_code}")
                    return {}

        except Exception as e:
            logger.error(f"Vision analysis error: {e}", exc_info=True)
            return {}

    def initialize_from_video_session(self, video_session_data: Dict[str, Any]) -> None:
        """
        Initialize visual state from video session data.

        Args:
            video_session_data: Data from the video_session table
        """
        topic = video_session_data.get("topic", "")
        child_age = video_session_data.get("child_age")
        child_interest = video_session_data.get("child_interest", "")

        # Set initial visual parameters based on topic
        self.visual_state.setting = f"Scene related to {topic}"

        # Adjust style for age group
        if child_age:
            try:
                age = int(child_age)
                if age < 6:
                    self.visual_state.art_style = "simple, bold shapes, primary colors"
                elif age < 10:
                    self.visual_state.art_style = "colorful cartoon illustration, friendly characters"
                else:
                    self.visual_state.art_style = "detailed illustration, realistic elements"
            except:
                pass

        # Incorporate interests
        if child_interest:
            self.visual_state.atmosphere = f"engaging, {child_interest} themed"

        logger.info(f"Initialized visual state for topic: {topic}")

    def generate_consistent_prompt(
        self,
        base_description: str,
        segment: str,
        is_video: bool = False,
        previous_frame: Optional[str] = None
    ) -> str:
        """
        Generate a prompt with consistency instructions.

        Args:
            base_description: Base scene description
            segment: Current segment (hook, concept, process, conclusion)
            is_video: Whether this is for video generation
            previous_frame: Description of previous frame for continuity

        Returns:
            Enhanced prompt with consistency instructions
        """
        prompt_parts = []

        # Start with continuity if not first segment
        if self.visual_state.previous_scene_summary and segment != "hook":
            prompt_parts.append(f"Continuing from previous scene: {self.visual_state.previous_scene_summary}.")

        # Add base description
        prompt_parts.append(base_description)

        # Add style consistency
        prompt_parts.append(f"Art style: {self.visual_state.art_style}.")

        # Add lighting and atmosphere
        prompt_parts.append(f"{self.visual_state.lighting}, {self.visual_state.atmosphere}.")

        # Add character consistency if defined
        if self.visual_state.main_characters:
            for char in self.visual_state.main_characters:
                prompt_parts.append(f"{char['name']}: {char['description']}.")

        # Add setting consistency
        if self.visual_state.setting:
            prompt_parts.append(f"Setting: {self.visual_state.setting}.")

        # Video-specific instructions
        if is_video:
            prompt_parts.append("Smooth motion, cinematic camera movement.")
            if previous_frame:
                prompt_parts.append(f"Matching previous frame: {previous_frame}.")

        # Color consistency
        if self.visual_state.primary_colors:
            colors_str = ", ".join(self.visual_state.primary_colors[:3])
            prompt_parts.append(f"Color palette: {colors_str}.")

        # Composition consistency
        prompt_parts.append(f"{self.visual_state.camera_style}, {self.visual_state.composition}.")

        # Update current segment
        self.visual_state.current_segment = segment

        return " ".join(prompt_parts)

    def update_scene_context(self, scene_description: str) -> None:
        """
        Update the previous scene summary for continuity.

        Args:
            scene_description: Description of what just happened
        """
        self.visual_state.previous_scene_summary = scene_description
        logger.debug(f"Updated scene context: {scene_description}")

    def define_character(self, name: str, description: str) -> None:
        """
        Define or update a character description.

        Args:
            name: Character identifier
            description: Visual description of the character
        """
        # Check if character already exists
        for char in self.visual_state.main_characters:
            if char["name"] == name:
                char["description"] = description
                return

        # Add new character
        self.visual_state.main_characters.append({
            "name": name,
            "description": description
        })
        logger.info(f"Defined character: {name} - {description}")

    def set_seed(self, seed: int) -> None:
        """
        Set a fixed seed for consistent generation.

        Args:
            seed: Random seed value
        """
        self.visual_state.seed = seed
        logger.info(f"Set consistency seed: {seed}")

    def get_state(self) -> Dict[str, Any]:
        """
        Get the current visual state as a dictionary.

        Returns:
            Visual state dictionary
        """
        return self.visual_state.to_dict()

    def load_state(self, state_dict: Dict[str, Any]) -> None:
        """
        Load visual state from a dictionary.

        Args:
            state_dict: Previously saved state
        """
        self.visual_state = VisualState.from_dict(state_dict)
        logger.info("Loaded visual state")

    def get_reference_image_params(self) -> Optional[Dict[str, Any]]:
        """
        Get parameters for using the reference image in generation.

        Returns:
            Dict with reference image parameters, or None if no reference
        """
        if not self.visual_state.reference_image_url:
            return None

        return {
            "reference_image_url": self.visual_state.reference_image_url,
            "style_weight": 0.6,  # How strongly to match the reference
            "reference_type": "style"  # Use for style matching, not content
        }
