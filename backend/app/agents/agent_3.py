"""
Agent 3 - Educational Diagram Generator

This agent generates educational diagrams using Google's Gemini (Nano Banana).
It receives input from the orchestrator and creates visual diagrams based on
the topic, facts, and learning objectives.

Called via orchestrator in Full Test mode.
"""
import asyncio
import json
import time
import logging
import base64
import httpx
from typing import Optional, Dict, Any, Callable, Awaitable
from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text
from app.services.websocket_manager import WebSocketManager
from app.services.storage import StorageService

logger = logging.getLogger(__name__)

# OpenRouter API endpoint
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/images/generations"


async def agent_3_process(
    websocket_manager: Optional[WebSocketManager],
    user_id: str,
    session_id: str,
    storage_service: Optional[StorageService] = None,
    video_session_data: Optional[dict] = None,
    db: Optional[Session] = None,
    status_callback: Optional[Callable[[str, str, str, str, int], Awaitable[None]]] = None
) -> Dict[str, Any]:
    """
    Agent3: Educational Diagram Generator - generates diagrams using Google Gemini (Nano Banana).

    This agent runs in parallel with Agent2 and Agent4.

    Args:
        websocket_manager: WebSocket manager for status updates (deprecated, use status_callback)
        user_id: User identifier
        session_id: Session identifier
        storage_service: Storage service for S3 operations
        video_session_data: Optional dict with video_session row data (for Full Test mode)
        db: Database session for querying video_session table
        status_callback: Callback function for sending status updates to orchestrator

    Returns:
        Dict with diagram generation results
    """
    # Initialize storage service if not provided
    if storage_service is None:
        storage_service = StorageService()

    # Query video_session table if db is provided and video_session_data not passed in
    if db is not None and video_session_data is None:
        try:
            result = db.execute(
                sql_text(
                    "SELECT * FROM video_session WHERE id = :session_id AND user_id = :user_id"
                ),
                {"session_id": session_id, "user_id": user_id},
            ).fetchone()

            if not result:
                raise ValueError(f"Video session not found for session_id={session_id} and user_id={user_id}")

            # Convert result to dict (same as Agent2 and Agent4 do)
            if hasattr(result, "_mapping"):
                video_session_data = dict(result._mapping)
            else:
                video_session_data = {
                    "id": getattr(result, "id", None),
                    "user_id": getattr(result, "user_id", None),
                    "topic": getattr(result, "topic", None),
                    "confirmed_facts": getattr(result, "confirmed_facts", None),
                    "generated_script": getattr(result, "generated_script", None),
                    "learning_objective": getattr(result, "learning_objective", None),
                    "child_age": getattr(result, "child_age", None),
                    "child_interest": getattr(result, "child_interest", None),
                }
            logger.info(f"Agent3 loaded video_session data from database for session {session_id}")
        except Exception as e:
            logger.error(f"Agent3 failed to query video_session: {e}")
            raise

    # Extract data from video_session
    topic = None
    confirmed_facts = None
    learning_objective = None
    child_age = None
    child_interest = None

    if video_session_data:
        topic = video_session_data.get("topic")
        confirmed_facts = video_session_data.get("confirmed_facts")
        learning_objective = video_session_data.get("learning_objective")
        child_age = video_session_data.get("child_age")
        child_interest = video_session_data.get("child_interest")

        logger.info(f"Agent3 extracted data from video_session: topic={bool(topic)}, confirmed_facts={bool(confirmed_facts)}, learning_objective={bool(learning_objective)}")

    # Helper function to send status (via callback or websocket_manager)
    async def send_status(agentnumber: str, status: str, **kwargs):
        """Send status update via callback or websocket_manager."""
        timestamp = int(time.time() * 1000)

        if status_callback:
            # Use callback (preferred - goes through orchestrator)
            await status_callback(
                agentnumber=agentnumber,
                status=status,
                userID=user_id,
                sessionID=session_id,
                timestamp=timestamp,
                **kwargs
            )
        elif websocket_manager:
            # Fallback to direct websocket (for backwards compatibility)
            status_data = {
                "agentnumber": agentnumber,
                "userID": user_id,
                "sessionID": session_id,
                "status": status,
                "timestamp": timestamp,
                **kwargs
            }
            await websocket_manager.send_progress(session_id, status_data)

    # Helper function to create JSON status file in S3
    async def create_status_json(agent_number: str, status: str, status_data: dict):
        """Create a JSON file in S3 with status data."""
        if not storage_service.s3_client:
            return  # Skip if storage not configured

        timestamp = int(time.time() * 1000)  # Milliseconds timestamp
        filename = f"agent_{agent_number}_{status}_{timestamp}.json"
        # Use users/{userId}/{sessionId}/agent3/ path
        s3_key = f"users/{user_id}/{session_id}/agent3/{filename}"

        try:
            json_content = json.dumps(status_data, indent=2).encode('utf-8')
            storage_service.s3_client.put_object(
                Bucket=storage_service.bucket_name,
                Key=s3_key,
                Body=json_content,
                ContentType='application/json'
            )
        except Exception as e:
            # Log but don't fail the pipeline if JSON creation fails
            logger.warning(f"Failed to create status JSON file: {e}")

    result_data = {}

    try:
        # Report starting status
        await send_status("Agent3", "starting")
        status_data = {
            "agentnumber": "Agent3",
            "userID": user_id,
            "sessionID": session_id,
            "status": "starting",
            "timestamp": int(time.time() * 1000)
        }
        await create_status_json("3", "starting", status_data)

        logger.info(f"Agent3 starting diagram generation for session {session_id}")

        # Report processing status
        await send_status("Agent3", "processing")
        status_data = {
            "agentnumber": "Agent3",
            "userID": user_id,
            "sessionID": session_id,
            "status": "processing",
            "timestamp": int(time.time() * 1000)
        }
        await create_status_json("3", "processing", status_data)

        # Generate educational diagram using Google Gemini (Nano Banana)
        diagram_url = await generate_educational_diagram(
            topic=topic,
            confirmed_facts=confirmed_facts,
            learning_objective=learning_objective,
            child_age=child_age,
            child_interest=child_interest,
            storage_service=storage_service,
            user_id=user_id,
            session_id=session_id
        )

        result_data = {
            "diagram_url": diagram_url,
            "topic": topic
        }

        # Upload agent_3_data.json to S3
        if storage_service.s3_client:
            try:
                agent_3_data = {
                    "diagram_url": diagram_url,
                    "topic": topic,
                    "learning_objective": learning_objective,
                    "child_age": child_age,
                    "child_interest": child_interest
                }

                # Upload agent_3_data.json to S3
                s3_key = f"users/{user_id}/{session_id}/agent3/agent_3_data.json"
                agent_3_data_json = json.dumps(agent_3_data, indent=2).encode('utf-8')
                storage_service.s3_client.put_object(
                    Bucket=storage_service.bucket_name,
                    Key=s3_key,
                    Body=agent_3_data_json,
                    ContentType='application/json'
                )
                logger.info(f"Agent3 uploaded agent_3_data.json to S3: {s3_key}")
            except Exception as e:
                logger.error(f"Agent3 failed to upload agent_3_data.json: {e}", exc_info=True)

        # Report finished status
        finished_kwargs = {
            "diagram_url": diagram_url
        }
        await send_status("Agent3", "finished", **finished_kwargs)
        status_data = {
            "agentnumber": "Agent3",
            "userID": user_id,
            "sessionID": session_id,
            "status": "finished",
            "timestamp": int(time.time() * 1000),
            **finished_kwargs
        }
        await create_status_json("3", "finished", status_data)

        logger.info(f"Agent3 completed diagram generation for session {session_id}")

        # Return result data for orchestrator
        return {
            "status": "success",
            "diagram_url": diagram_url,
            "topic": topic
        }

    except Exception as e:
        # Report error status and stop pipeline
        error_kwargs = {
            "error": str(e),
            "reason": f"Agent3 failed: {type(e).__name__}"
        }
        await send_status("Agent3", "error", **error_kwargs)
        error_data = {
            "agentnumber": "Agent3",
            "userID": user_id,
            "sessionID": session_id,
            "status": "error",
            "timestamp": int(time.time() * 1000),
            **error_kwargs
        }
        await create_status_json("3", "error", error_data)
        logger.error(f"Agent3 failed for session {session_id}: {e}")
        raise  # Stop pipeline on error


async def generate_diagram_with_replicate(
    replicate_api_key: str,
    topic: Optional[str],
    confirmed_facts: Optional[list],
    learning_objective: Optional[str],
    child_age: Optional[str],
    child_interest: Optional[str],
    storage_service: StorageService,
    user_id: str,
    session_id: str
) -> str:
    """
    Generate an educational diagram using Replicate with Flux 1.1 Pro.

    Args:
        replicate_api_key: Replicate API key
        topic: Topic of the lesson
        confirmed_facts: List of confirmed facts
        learning_objective: Learning objective
        child_age: Target age group
        child_interest: Child's interests
        storage_service: Storage service for S3 uploads
        user_id: User ID
        session_id: Session ID

    Returns:
        S3 URL of the generated diagram
    """
    # Build prompt using NARRATIVE/SCENE framing - AVOID educational terminology
    # Key: Don't use "educational", "learn", "understand", "lesson", "teaching", "facts"
    # These trigger text overlays in the model

    # Start with narrative scene description, not educational framing
    prompt_parts = ["Illustrated scene showing"]

    # Describe the topic as a visual narrative, not educational content
    if topic:
        prompt_parts.append(f"{topic} in action.")

    # Build visual scene elements from facts - describe what's happening in the scene
    scene_elements = []
    if confirmed_facts:
        for fact in confirmed_facts[:4]:  # Limit to 4 for cleaner prompts
            if isinstance(fact, dict):
                concept = fact.get("concept", "")
                details = fact.get("details", "")
                if concept:
                    # Describe as scene element, not fact
                    if details:
                        scene_elements.append(f"{concept} with {details}")
                    else:
                        scene_elements.append(concept)
            elif isinstance(fact, str):
                scene_elements.append(fact)

    if scene_elements:
        prompt_parts.append(f"Visual scene depicting {', '.join(scene_elements[:3])}.")

    # Style description - emphasize "wordless" and "visual-only" characteristics
    style_parts = [
        "Wordless picture book illustration",
        "children's storybook art style",
        "vibrant colors",
        "clean visual narrative",
        "cartoon illustration",
        "hand-drawn picture style"
    ]

    # Add age-appropriate styling without using "educational" terms
    if child_age:
        style_parts.append(f"kid-friendly for age {child_age}")

    if child_interest:
        # Incorporate interests as visual themes
        style_parts.append(f"{child_interest} themed visual elements")

    prompt_parts.append("Style: " + ", ".join(style_parts) + ".")

    # Critical phrase to prevent text overlays
    prompt_parts.append("Pure visual scene, silent narrative, illustration frame without overlay.")

    prompt = " ".join(prompt_parts)

    logger.info(f"Agent3 generating diagram via Replicate with prompt length: {len(prompt)} characters")

    try:
        # Use Replicate API with Flux 1.1 Pro
        import replicate

        # Create replicate client
        client = replicate.Client(api_token=replicate_api_key)

        # Run Flux 1.1 Pro model
        logger.info("Calling Replicate API for Flux 1.1 Pro...")
        output = await asyncio.to_thread(
            client.run,
            "black-forest-labs/flux-1.1-pro",
            input={
                "prompt": prompt,
                "width": 1024,
                "height": 1024,
                "num_outputs": 1,
                "output_format": "png",
                "output_quality": 90
            }
        )

        # Output is a URL or list of URLs
        if isinstance(output, list):
            image_url = output[0]
        else:
            image_url = output

        if not image_url:
            raise ValueError("No image URL returned from Replicate")

        logger.info(f"Image generated, downloading from: {image_url}")

        # Download the image
        async with httpx.AsyncClient(timeout=60.0) as download_client:
            image_response = await download_client.get(str(image_url))
            if image_response.status_code != 200:
                raise ValueError(f"Failed to download image: status {image_response.status_code}")

            image_data = image_response.content

        # Upload to S3
        s3_key = f"users/{user_id}/{session_id}/agent3/diagram.png"

        storage_service.s3_client.put_object(
            Bucket=storage_service.bucket_name,
            Key=s3_key,
            Body=image_data,
            ContentType='image/png'
        )

        logger.info(f"Agent3 uploaded diagram to S3: {s3_key}")

        # Generate presigned URL (valid for 24 hours)
        diagram_url = storage_service.generate_presigned_url(s3_key, expires_in=86400)

        return diagram_url

    except Exception as e:
        logger.error(f"Failed to generate diagram via Replicate: {e}", exc_info=True)
        raise


async def generate_educational_diagram(
    topic: Optional[str],
    confirmed_facts: Optional[list],
    learning_objective: Optional[str],
    child_age: Optional[str],
    child_interest: Optional[str],
    storage_service: StorageService,
    user_id: str,
    session_id: str
) -> str:
    """
    Generate an educational diagram using Replicate (Flux 1.1 Pro) or Google Gemini (Nano Banana).

    Tries Replicate first (if configured), then falls back to Google AI API.

    Args:
        topic: Topic of the lesson
        confirmed_facts: List of confirmed facts
        learning_objective: Learning objective
        child_age: Target age group
        child_interest: Child's interests
        storage_service: Storage service for S3 uploads
        user_id: User ID
        session_id: Session ID

    Returns:
        S3 URL of the generated diagram
    """
    try:
        # Get API keys
        from app.services.secrets import get_secret
        from app.config import get_settings

        settings = get_settings()

        # Try Replicate first (if configured)
        replicate_api_key = None
        if settings.USE_AWS_SECRETS:
            try:
                replicate_api_key = get_secret("pipeline/replicate-api-key")
                logger.debug("Retrieved REPLICATE_API_KEY from AWS Secrets Manager for Agent3")
            except Exception:
                pass

        if not replicate_api_key:
            replicate_api_key = settings.REPLICATE_API_KEY

        # If Replicate is configured, use it with Flux 1.1 Pro
        if replicate_api_key:
            logger.info("Using Replicate (Flux 1.1 Pro) for diagram generation")
            return await generate_diagram_with_replicate(
                replicate_api_key=replicate_api_key,
                topic=topic,
                confirmed_facts=confirmed_facts,
                learning_objective=learning_objective,
                child_age=child_age,
                child_interest=child_interest,
                storage_service=storage_service,
                user_id=user_id,
                session_id=session_id
            )

        # Fallback to Google AI API
        google_api_key = None
        if settings.USE_AWS_SECRETS:
            try:
                google_api_key = get_secret("pipeline/google-ai-api-key")
                logger.debug("Retrieved GOOGLE_AI_API_KEY from AWS Secrets Manager for Agent3")
            except Exception as e:
                logger.warning(f"Could not retrieve GOOGLE_AI_API_KEY from Secrets Manager: {e}")

        if not google_api_key:
            google_api_key = settings.GOOGLE_AI_API_KEY

        if not google_api_key:
            raise ValueError(
                "Neither REPLICATE_API_KEY nor GOOGLE_AI_API_KEY is configured. "
                "Please add one of them to AWS Secrets Manager or .env file"
            )

        # Import Google Generative AI library
        try:
            import google.generativeai as genai
        except ImportError:
            raise ImportError(
                "google-generativeai package not installed. "
                "Please install it with: pip install google-generativeai"
            )

        # Configure Gemini
        genai.configure(api_key=google_api_key)

        # Build comprehensive prompt for educational diagram
        prompt_parts = [
            "Create a clear, educational diagram that explains the following topic to children."
        ]

        if topic:
            prompt_parts.append(f"\nTopic: {topic}")

        if learning_objective:
            prompt_parts.append(f"\nLearning Objective: {learning_objective}")

        if child_age:
            prompt_parts.append(f"\nTarget Age Group: {child_age} years old")

        if child_interest:
            prompt_parts.append(f"\nChild's Interests: {child_interest}")

        if confirmed_facts:
            prompt_parts.append("\nKey Facts to Include:")
            for i, fact in enumerate(confirmed_facts, 1):
                if isinstance(fact, dict):
                    concept = fact.get("concept", "")
                    details = fact.get("details", "")
                    if concept:
                        prompt_parts.append(f"{i}. {concept}")
                        if details:
                            prompt_parts.append(f"   - {details}")
                elif isinstance(fact, str):
                    prompt_parts.append(f"{i}. {fact}")

        prompt_parts.extend([
            "\nStyle Requirements:",
            "- Use vibrant, kid-friendly colors",
            "- Include clear labels and text",
            "- Make it visually engaging and easy to understand",
            "- Use icons, arrows, and diagrams to illustrate concepts",
            "- Ensure text is large and readable",
            "- Create an infographic-style layout",
            "\nThe diagram should be educational, accurate, and appropriate for the target age group."
        ])

        prompt = "\n".join(prompt_parts)

        logger.info(f"Agent3 generating diagram with prompt length: {len(prompt)} characters")

        # Use Gemini 2.5 Flash Image (Nano Banana) for image generation
        # Note: As of my knowledge cutoff, Gemini image generation is through Imagen 3
        # via the generateImage endpoint
        model = genai.GenerativeModel('gemini-2.5-flash-image')

        # Generate the image
        response = await asyncio.to_thread(
            model.generate_content,
            prompt,
            generation_config={
                "temperature": 0.7,
                "max_output_tokens": 2048,
            }
        )

        # Extract image data from response
        # The response should contain image data
        if not response.parts or not response.parts[0].inline_data:
            raise ValueError("No image data returned from Gemini")

        image_data = response.parts[0].inline_data.data
        mime_type = response.parts[0].inline_data.mime_type

        # Determine file extension from mime type
        extension = "png"  # default
        if "jpeg" in mime_type or "jpg" in mime_type:
            extension = "jpg"
        elif "png" in mime_type:
            extension = "png"
        elif "webp" in mime_type:
            extension = "webp"

        # Upload to S3
        s3_key = f"users/{user_id}/{session_id}/agent3/diagram.{extension}"

        storage_service.s3_client.put_object(
            Bucket=storage_service.bucket_name,
            Key=s3_key,
            Body=image_data,
            ContentType=mime_type
        )

        logger.info(f"Agent3 uploaded diagram to S3: {s3_key}")

        # Generate presigned URL (valid for 24 hours)
        diagram_url = storage_service.generate_presigned_url(s3_key, expires_in=86400)

        return diagram_url

    except Exception as e:
        logger.error(f"Failed to generate educational diagram: {e}", exc_info=True)
        raise
