"""
Batch Image Generator Agent

Purpose: Generate multiple images for video scripts in parallel.
Each script part (hook, concept, process, conclusion) gets 2-3 images
with visual guidance from the script.

Based on PRD Section 4.3 - Updated for script-based generation.
"""

import time
import asyncio
import logging
from typing import Optional, Dict, List, Any
import replicate

from app.agents.base import AgentInput, AgentOutput

logger = logging.getLogger(__name__)


class BatchImageGeneratorAgent:
    """
    Generates multiple images in parallel for video script parts.

    Uses Flux or SDXL via Replicate to generate 2-3 images per script part
    (hook, concept, process, conclusion) based on visual guidance.
    """

    def __init__(self, replicate_api_key: str):
        """
        Initialize the Batch Image Generator Agent.

        Args:
            replicate_api_key: Replicate API key for image generation
        """
        self.api_key = replicate_api_key
        self.client = replicate.Client(api_token=replicate_api_key)

        # Model configurations
        self.models = {
            "flux-pro": "black-forest-labs/flux-pro",
            "flux-dev": "black-forest-labs/flux-dev",
            "flux-schnell": "black-forest-labs/flux-schnell",
            "sdxl": "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b"
        }

        # Cost estimates (USD per image)
        self.costs = {
            "flux-pro": 0.05,
            "flux-dev": 0.025,
            "flux-schnell": 0.003,
            "sdxl": 0.01
        }

    async def process(self, input: AgentInput) -> AgentOutput:
        """
        Generate images for each part of a video script.

        Args:
            input: AgentInput containing:
                - data["script"]: Script object with {hook, concept, process, conclusion}
                - data["model"]: Model to use ("flux-pro", "flux-dev", "flux-schnell", "sdxl")
                - data["images_per_part"]: Number of images per script part (default: 2)

        Returns:
            AgentOutput containing:
                - data["micro_scenes"]: {
                    hook: {images: [{image: url, metadata: {...}}]},
                    concept: {images: [{image: url, metadata: {...}}]},
                    process: {images: [{image: url, metadata: {...}}]},
                    conclusion: {images: [{image: url, metadata: {...}}]},
                  }
                - data["cost"]: Total cost for all images
                - cost: Total cost (same as data["cost"])
                - duration: Total time taken
        """
        try:
            start_time = time.time()

            # Extract input parameters
            script = input.data["script"]
            model_name = input.data.get("model", "flux-schnell")  # Default to schnell
            images_per_part = input.data.get("images_per_part", 2)

            if model_name not in self.models:
                raise ValueError(
                    f"Invalid model '{model_name}'. "
                    f"Choose from: {list(self.models.keys())}"
                )

            logger.info(
                f"[{input.session_id}] Generating {images_per_part} images per script part "
                f"with {model_name}"
            )

            # Generate images for each script part in parallel
            script_parts = ["hook", "concept", "process", "conclusion"]
            all_tasks = []
            task_metadata = []  # Track which task belongs to which part

            for part_name in script_parts:
                script_part = script[part_name]

                for i in range(images_per_part):
                    task = self._generate_image_for_script_part(
                        session_id=input.session_id,
                        model=model_name,
                        script_part=script_part,
                        part_name=part_name,
                        image_index=i
                    )
                    all_tasks.append(task)
                    task_metadata.append({"part_name": part_name, "index": i})

            # Execute all tasks concurrently
            results = await asyncio.gather(*all_tasks, return_exceptions=True)

            # Organize results by script part
            micro_scenes = {
                "hook": {"images": []},
                "concept": {"images": []},
                "process": {"images": []},
                "conclusion": {"images": []}
            }

            total_cost = 0.0
            errors = []

            for i, result in enumerate(results):
                part_name = task_metadata[i]["part_name"]

                if isinstance(result, Exception):
                    error_msg = f"{part_name} image {task_metadata[i]['index']} failed: {result}"
                    logger.error(f"[{input.session_id}] {error_msg}")
                    errors.append(error_msg)
                    continue

                # Add image to corresponding script part
                micro_scenes[part_name]["images"].append({
                    "image": result["url"],
                    "metadata": result["metadata"]
                })
                total_cost += result["cost"]

            duration = time.time() - start_time

            # Check if we have at least some images generated
            total_images = sum(len(part["images"]) for part in micro_scenes.values())
            success = total_images > 0

            if success:
                logger.info(
                    f"[{input.session_id}] Generated {total_images} total images "
                    f"in {duration:.2f}s (${total_cost:.2f})"
                )
            else:
                logger.error(
                    f"[{input.session_id}] All image generations failed"
                )

            return AgentOutput(
                success=success,
                data={
                    "micro_scenes": micro_scenes,
                    "cost": total_cost,
                    "failed_count": len(errors),
                    "errors": errors if errors else None
                },
                cost=total_cost,
                duration=duration,
                error=None if success else "All image generations failed"
            )

        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"[{input.session_id}] Batch image generation failed: {e}")

            return AgentOutput(
                success=False,
                data={},
                cost=0.0,
                duration=duration,
                error=str(e)
            )

    async def _generate_image_for_script_part(
        self,
        session_id: str,
        model: str,
        script_part: Dict[str, Any],
        part_name: str,
        image_index: int
    ) -> dict:
        """
        Generate a single image for a script part via Replicate API.

        Args:
            session_id: Session ID for logging
            model: Model name to use
            script_part: Script part object with {text, duration, key_concepts, visual_guidance}
            part_name: Name of script part (hook, concept, process, conclusion)
            image_index: Image index for this part (0-2)

        Returns:
            Dict with URL and metadata

        Raises:
            Exception: If image generation fails
        """
        start = time.time()

        try:
            model_id = self.models[model]

            # Create prompt from visual guidance and key concepts
            visual_guidance = script_part.get("visual_guidance", "")
            key_concepts = script_part.get("key_concepts", [])

            # Build comprehensive prompt
            prompt = self._build_prompt_from_script(visual_guidance, key_concepts, image_index)

            # Build model input based on model type
            if model.startswith("flux"):
                model_input = self._build_flux_input_from_prompt(prompt)
            else:  # SDXL
                model_input = self._build_sdxl_input_from_prompt(prompt)

            logger.debug(
                f"[{session_id}] Generating {part_name} image {image_index + 1}"
            )

            # Call Replicate API
            output = await self.client.async_run(model_id, input=model_input)

            # Extract image URL (output format varies by model)
            if isinstance(output, list):
                image_url = output[0] if output else None
            else:
                image_url = output

            if not image_url:
                raise ValueError("No image URL returned from Replicate")

            duration = time.time() - start
            cost = self.costs[model]

            logger.debug(
                f"[{session_id}] {part_name} image {image_index + 1} generated in {duration:.2f}s"
            )

            return {
                "url": str(image_url),
                "cost": cost,
                "metadata": {
                    "part_name": part_name,
                    "image_index": image_index,
                    "duration": duration,
                    "model": model,
                    "resolution": "1024x1024",
                    "key_concepts": key_concepts,
                    "visual_guidance": visual_guidance[:200],  # Truncate for storage
                    "prompt_used": prompt[:200]  # Truncate for storage
                }
            }

        except Exception as e:
            duration = time.time() - start
            logger.error(
                f"[{session_id}] {part_name} image {image_index + 1} generation failed "
                f"after {duration:.2f}s: {e}"
            )
            raise

    def _build_prompt_from_script(
        self,
        visual_guidance: str,
        key_concepts: List[str],
        image_index: int
    ) -> str:
        """
        Build an image generation prompt from script visual guidance and key concepts.

        Args:
            visual_guidance: Visual guidance from script part
            key_concepts: List of key concepts to visualize
            image_index: Index of this image (to add variation)

        Returns:
            Complete prompt string for image generation
        """
        # Base prompt from visual guidance
        prompt = visual_guidance

        # Add key concepts if provided
        if key_concepts:
            concepts_str = ", ".join(key_concepts)
            prompt += f", featuring: {concepts_str}"

        # Add variation based on image index
        variations = [
            ", cinematic lighting, high quality",
            ", professional photography, detailed",
            ", studio lighting, sharp focus"
        ]
        if image_index < len(variations):
            prompt += variations[image_index]

        return prompt

    def _build_flux_input_from_prompt(self, prompt: str) -> dict:
        """
        Build input parameters for Flux models from a prompt string.

        Args:
            prompt: Complete prompt string

        Returns:
            Flux model input dict
        """
        return {
            "prompt": prompt,
            "guidance": 7.5,
            "num_outputs": 1,
            "aspect_ratio": "16:9",  # Video format
            "output_format": "png",
            "output_quality": 100,
            "safety_tolerance": 2,
            "seed": 42  # Fixed seed for consistency
        }

    def _build_sdxl_input_from_prompt(self, prompt: str) -> dict:
        """
        Build input parameters for SDXL model from a prompt string.

        Args:
            prompt: Complete prompt string

        Returns:
            SDXL model input dict
        """
        return {
            "prompt": prompt,
            "negative_prompt": "blurry, distorted, low quality, watermark, text, labels",
            "width": 1920,  # 16:9 aspect ratio
            "height": 1080,
            "guidance_scale": 7.5,
            "num_inference_steps": 50,
            "seed": 42  # Fixed seed for consistency
        }
