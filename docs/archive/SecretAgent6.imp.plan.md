<!-- 872debaf-05c7-4a75-b344-16a904eb46ab bb3acea9-fe33-4460-aad6-fd11d7d5bdf2 -->
# Agent 6 Standalone Test Implementation Plan

## Overview

Create Agent 6 as a standalone test agent (NOT a fallback) that can be tested independently without affecting existing functionality. Agent 6 generates DALL-E images for all segments, converts to 720p video clips, normalizes them, creates timed narration tracks from Agent4 audio, stitches with AWS MediaConvert with crossfade transitions and audio mixing, applies post-processing, and creates a detailed markdown report. All output goes to a new folder `Final_Agent6_{unix_timestamp}` in S3.

**Key Requirements:**

- NO changes that risk current functionality - completely isolated implementation
- Test6 tab in scaffoldtest_ui.html with userId and sessionId inputs
- Uses same S3 resources that Agent5 has access to (Agent2 and Agent4 folders)
- Creates isolated output folder: `Final_Agent6_{unix_timestamp}` (Unix timestamp format)
- Real-time detailed logging displayed on screen during execution
- Markdown report explains all resources used and steps taken (no sensitive information)
- Real-time updates AND final summary after completion

## Production Safeguards

**Critical: These safeguards ensure zero impact on production functionality**

### 1. Lazy Imports with Error Handling

- All Agent 6 imports done INSIDE the `/api/test6` endpoint function, not at module level
- Wrap import in try/except to prevent app startup failures:
  ```python
  @app.post("/api/test6", response_model=Test6Response)
  async def test6_endpoint(request: Test6Request):
      try:
          from app.agents.agent_6 import agent_6_process
      except ImportError as e:
          logger.error(f"Failed to import agent_6: {e}")
          raise HTTPException(status_code=500, detail="Agent 6 not available")
      # ... rest of endpoint
  ```

- If Agent 6 module has syntax errors, only `/api/test6` endpoint fails, all other endpoints work normally

### 2. Isolated JavaScript Namespace

- Use isolated namespace to prevent variable conflicts:
  ```javascript
  // Isolated namespace for Test6 functionality
  const Test6Manager = {
      websocket: null,
      logs: [],
      status: 'idle',
      // All Test6-specific functions and variables
  };
  ```

- Wrap all Test6 JavaScript in try/catch blocks
- Use unique IDs and class names (e.g., `test6-userId`, `test6-sessionId`, `test6-logging`, `test6-tab`)
- Test6 tab errors won't affect other tabs

### 3. Graceful Degradation

- If Agent 6 module has errors: `/api/test6` returns HTTP 500 with clear error, other endpoints work
- If Test6 tab JavaScript fails: Show error message, other tabs work normally
- If WebSocket fails: Show error message, don't crash page
- If MediaConvert fails: Log error, return clear message to user

### 4. Input Validation

- Validate userId and sessionId format before processing
- Check that Agent2 and Agent4 folders exist before starting
- Return clear error messages for validation failures

### 5. Error Logging

- All errors logged to CloudWatch with context
- Errors sent to WebSocket for user visibility
- No sensitive information in error messages

**Impact Assessment:**

- Worst case: Test6 feature doesn't work, but production functionality completely unaffected
- Import errors: Only `/api/test6` endpoint affected, all other endpoints work
- JavaScript errors: Only Test6 tab affected, all other tabs work
- Agent 6 execution errors: Only affects that specific test run, no impact on Agent 5 or other agents

## Implementation Steps

### 1. Create Agent 6 Module (`backend/app/agents/agent_6.py`)

**Core Function: `agent_6_process()`**

- Standalone function (NOT a fallback) - can be called independently
- Parameters: `websocket_manager`, `user_id`, `session_id`, `storage_service`, `status_callback`
- Read inputs from existing S3 resources (same as Agent5):
  - Load `agent_2_data.json` from `users/{user_id}/{session_id}/agent2/`
  - Load audio files from `users/{user_id}/{session_id}/agent4/`
  - Extract segments with `visual_guidance`, `duration`, `narration`

**Video Generation Flow:**

1. Generate Unix timestamp: `int(time.time())` for folder naming
2. Create output folder: `users/{user_id}/{session_id}/Final_Agent6_{unix_timestamp}/`
3. Parse storyboard segments from `agent_2_data.json` (same location as Agent5)
4. **DALL-E Image Generation:**

   - Generate DALL-E images for all segments using `build_enhanced_prompt()`
   - Log: "Generating DALL-E image for {section}..."
   - Generate 1792x1024 images (DALL-E 3 landscape, standard quality)
   - Download images and save to temp directory
   - Upload generated images to S3 for reference

5. Convert images to video clips:

   - Use ffmpeg to create silent video clips matching segment duration
   - Normalize to 720p immediately: `scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=25`
   - Format: MP4, H.264, 1280x720, 25fps, yuv420p
   - Upload each clip to S3: `users/{user_id}/{session_id}/Final_Agent6_{timestamp}/clips/{section}_clip_{index}.mp4`
   - Log each clip creation with details

6. Normalize all clips before concatenation:

   - Ensure consistent resolution (1280x720), frame rate (25fps), color space
   - Re-encode with libx264, preset medium, CRF 23
   - Log normalization progress

7. Create timed narration track:

   - Download audio files from Agent4 folder
   - Create mixed audio track using FFmpeg's `adelay` and `amix` filters
   - Place narrations at correct timestamps based on segment durations (0s, ~15s, ~30s, ~45s)
   - Upload mixed audio track to S3 for MediaConvert use
   - Log audio processing steps

8. Use MediaConvert to stitch clips with crossfade transitions (0.5-1s) and audio mixing:

   - Add mixed audio track as separate input to MediaConvert job
   - Configure audio selector to use the narration track
   - Log MediaConvert job creation and progress
   - If MediaConvert fails, fallback to FFmpeg concatenation with audio mixing

9. Apply post-processing enhancements

   - Log post-processing steps

10. Upload final video to: `users/{user_id}/{session_id}/Final_Agent6_{timestamp}/final_video.mp4`
11. Generate markdown report with all steps, resources used, and costs
12. Upload markdown report to: `users/{user_id}/{session_id}/Final_Agent6_{timestamp}/generation_report.md`
13. Return presigned URL for final video

**Helper Functions:**

- `build_enhanced_prompt(visual_guidance: str, section: str) -> str`: Add cinematic keywords, section-specific guidance, sanitize text triggers
- `normalize_clip_to_720p(input_path: str, output_path: str) -> str`: Normalize clip to 1280x720@25fps
- `enhance_final_video(input_path: str, output_path: str) -> str`: Apply color correction and sharpening
- `create_timed_narration_track(audio_file_paths: List[str], output_path: str, total_duration: float, segment_durations: List[float]) -> str`: Create mixed audio track with narrations at correct timestamps
- `generate_markdown_report(user_id: str, session_id: str, timestamp: int, steps: List[Dict], resources: Dict, costs: Dict, video_s3_key: str) -> str`: Generate formatted markdown report

**Status Updates:**

- Use same `status_callback` interface as Agent 5
- Send detailed step-by-step updates via WebSocket:
  - "Starting Agent 6 test for user {user_id}, session {session_id}"
  - "Generating DALL-E images for all segments..."
  - "Generating DALL-E image for {section}..."
  - "Converting image to video clip for {section}..."
  - "Normalizing clip to 720p for {section}..."
  - "Creating timed narration track..."
  - "Creating MediaConvert job with {N} clips..."
  - "MediaConvert job {job_id} status: {status}"
  - "MediaConvert failed, using FFmpeg fallback..." (if MediaConvert fails)
  - "Applying post-processing enhancements..."
  - "Generating markdown report..."
  - "Final video available at: {presigned_url}"
- All messages include timestamps and are displayed in real-time in Test6 tab
- Agent number: "Agent6"
- Include cost estimates in status messages

### 2. AWS MediaConvert Service (`backend/app/services/mediaconvert_service.py`)

**Class: `MediaConvertService`**

- Initialize boto3 MediaConvert client using AWS profile `default2` (or default if not available)
- Methods:
  - `create_job_role()`: Create IAM role for MediaConvert with S3 read/write permissions
  - `setup_iam_permissions()`: Ensure IAM role exists and has required policies
  - `create_stitch_job(clip_s3_uris: List[str], audio_s3_uri: Optional[str], output_s3_uri: str, transition_duration: float = 0.5)`: Create MediaConvert job
    - Input: List of S3 URIs for normalized video clips (already 720p@25fps)
    - Audio input: S3 URI of mixed narration track (optional, added as separate input)
    - Output: Single MP4 in S3 with synchronized audio
    - Settings: H.264, 1280x720, 3000k bitrate, 25fps, AAC audio
    - Audio: Mixed narration track added as separate input, mapped to output via Audio Selector
    - Concat mode: Multiple inputs concatenated (MediaConvert handles transitions)
  - `wait_for_job_completion(job_id: str, timeout: int = 600)`: Poll job status until complete
  - `get_job_output_uri(job_id: str) -> str`: Return S3 URI of final stitched video

**IAM Setup:**

- Role name: `MediaConvertJobRole` (parameterized)
- Policies: S3 read/write for bucket, MediaConvert job creation
- Use boto3 IAM client to create/verify role

### 3. CloudWatch Logging (`backend/app/services/cloudwatch_logger.py`)

**Class: `CloudWatchLogger`**

- Initialize boto3 CloudWatch Logs client
- Log group: `/pipeline/agent6`
- Methods:
  - `log_segment_generation(segment_id: str, success: bool, image_url: str, clip_s3_key: str, cost: float, error: Optional[str] = None)`: Log per-segment success/failure (JSON format)
  - `log_mediaconvert_job(job_id: str, status: str, output_uri: Optional[str] = None, error: Optional[str] = None)`: Log MediaConvert job status
  - `log_final_video(video_s3_uri: str, presigned_url: str, total_cost: float)`: Log final stitched video URI
  - `log_cost_breakdown(cost_breakdown: Dict[str, float], total_cost: float)`: Log cost estimates per segment and total
- JSON format: `{"timestamp": "...", "event_type": "...", "data": {...}}`
- Create log group automatically if it doesn't exist

### 4. API Endpoint for Test6 (`backend/app/main.py`)

**Add new endpoint `/api/test6`:**

- Accept POST request with `userId` and `sessionId`
- Validate that Agent2 and Agent4 folders exist in S3
- Create background task to run Agent 6
- Return 200 immediately with message "Agent 6 test started"
- Agent 6 will send status updates via WebSocket

**Request/Response Models:**

```python
class Test6Request(BaseModel):
    userId: str
    sessionId: str

class Test6Response(BaseModel):
    success: bool
    message: str
    sessionId: str
```

**Safeguards Implementation:**

- Use lazy import with error handling inside the endpoint function
- Wrap Agent 6 execution in try/except
- Validate inputs before processing
- Return clear error messages if Agent 6 fails to start
- Ensure background task errors don't crash the endpoint

**Important:** This is a NEW endpoint - no modifications to existing endpoints. If Agent 6 import fails, only this endpoint is affected.

### 5. ScaffoldTest UI Updates (`backend/scaffoldtest_ui.html`)

**Add Test6 Tab:**

- Add new tab button "Test6" alongside existing tabs
- Create Test6 tab content with:
  - Input fields: `userId` and `sessionId` (text inputs with IDs: `test6-userId`, `test6-sessionId`)
  - Submit button: "Run Agent 6 Test" (ID: `test6-submit`)
  - Logging display area: Scrollable div (ID: `test6-logging`) that shows real-time step-by-step logging
  - Status indicator: Shows current status (starting/processing/finished/error) (ID: `test6-status`)
  - Final video display: Shows video URL and embed when complete (ID: `test6-video`)
  - Cost display: Shows cost breakdown and total (ID: `test6-costs`)

**Logging Display:**

- Real-time logging via WebSocket messages (agentnumber: "Agent6")
- Display detailed step-by-step messages as they arrive
- Format: Timestamp + Message (e.g., "[12:30:45] Generating DALL-E image for hook...")
- Color coding: 
  - Info (blue): General progress messages
  - Success (green): Completed steps, successful operations
  - Warning (yellow): Warnings, fallbacks (e.g., "No image found, generating DALL-E")
  - Error (red): Errors, failures
- Auto-scroll to bottom as new messages arrive
- Show status indicator: Starting (blinking), Processing (yellow), Finished (green), Error (red)
- Final summary section after completion with:
  - All steps performed
  - Cost breakdown (per step and total)
  - Final video URL and embed
  - Link to markdown report in S3 (if accessible)
- Clear/reset button to start a new test

**JavaScript Updates:**

- Use isolated namespace: `const Test6Manager = { ... }` for all Test6 functionality
- Add Test6 tab switching logic (uses existing tab system, no changes needed)
- Handle WebSocket messages for Agent6 (agentnumber: "Agent6")
- Update logging display in real-time
- Show/hide final video and summary based on status
- Format and display cost breakdown
- Wrap all Test6 JavaScript in try/catch blocks
- Use unique IDs and class names to prevent conflicts

**Important:** Only ADDITIVE changes to UI - no modifications to existing tabs or functionality. Test6 tab failures won't affect other tabs.

### 6. Markdown Report Generation

**Report Sections:**

- **Overview**: Summary of video generation process, Unix timestamp, user/session IDs, total duration
- **Steps**: Detailed list of all steps performed (with timestamps and status)
  - Step 1: DALL-E image generation (all segments)
  - Step 2: Video clip creation (per section)
  - Step 3: Clip normalization (per section)
  - Step 4: Audio processing (narration track creation with timed placement)
  - Step 5: MediaConvert stitching (job ID, transition settings, audio mixing) OR FFmpeg fallback
  - Step 6: Post-processing (enhancements applied)
  - Step 7: Final video upload
- **Resources Used**: 
  - List of S3 resources accessed (DALL-E images generated, Agent4 audio files used)
  - S3 keys for all resources (no presigned URLs or sensitive info)
  - All images are newly generated (no reuse)
- **Costs**: 
  - Cost breakdown per step (DALL-E images: $0.16 for 4 images, clip creation, normalization, MediaConvert: $0.015, post-processing)
  - Total cost: ~$0.18-0.20 per video
  - Note: Costs are estimates, actual costs may vary
- **Output**: 
  - Final video S3 location: `users/{user_id}/{session_id}/Final_Agent6_{timestamp}/final_video.mp4`
  - Presigned URL (24-hour expiry)
  - Report location: `users/{user_id}/{session_id}/Final_Agent6_{timestamp}/generation_report.md`
- **Technical Details**: 
  - Resolution: 1280x720 (720p)
  - Frame rate: 25fps
  - Transitions: Crossfade (0.5-1s between clips) via MediaConvert or FFmpeg fallback
  - Audio: Synchronized narration track mixed with video (AAC, 128k bitrate)
  - Post-processing: Color correction, sharpening
  - Codec: H.264 video, AAC audio

**Format:**

- Formatted markdown with headers, lists, code blocks, tables
- No sensitive information (no API keys, credentials, AWS access keys, etc.)
- Human-readable and technical details balanced
- Suitable for sharing and documentation

### 7. Cost Tracking

**Cost Estimates (fixed):**

- DALL-E image: $0.04 per image (DALL-E 3 standard) - always generates 4 images = $0.16
- Video clip creation: $0.001 per clip (FFmpeg processing) - 4 clips = $0.004
- Clip normalization: $0.0005 per clip (FFmpeg processing) - 4 clips = $0.002
- MediaConvert stitching: $0.015 per minute (actual AWS pricing for HD) = $0.015
- Post-processing: $0.001 per video (FFmpeg enhancements)
- Total per 60s video: ~$0.18-0.20 (always generates 4 DALL-E images)

**Track in Agent 6:**

- Per-segment cost: DALL-E ($0.04) + clip creation ($0.001) + normalization ($0.0005) = $0.0415 per segment
- Total segment cost: 4 segments × $0.0415 = $0.166
- MediaConvert cost: $0.015 (actual AWS pricing)
- Post-processing cost: $0.001
- Total cost: ~$0.18-0.20 per video
- Include in status messages, CloudWatch logs, and markdown report

### 8. Error Handling

- Agent 6 failures: Raise exception and send error status via WebSocket
- MediaConvert job failures: Log to CloudWatch, raise exception
- DALL-E API failures: Retry once, then raise exception
- Audio mixing failures: Log warning, continue without audio (video will be silent)
- Normalization failures: Log error, retry once, then raise exception
- MediaConvert failures: Fall back to FFmpeg concatenation with audio mixing, log warning
- FFmpeg fallback failures: Raise exception (no further fallback)

### 9. Video Quality Improvements

**Resolution Standardization:**

- All clips normalized to 720p (1280x720) before concatenation
- Benefits: More consistent quality, fewer artifacts, faster processing
- Better for web/mobile delivery while maintaining professional appearance

**Smooth Transitions:**

- Crossfade transitions (0.5-1s) between clips using MediaConvert
- Eliminates jarring hard cuts between segments
- Creates professional, seamless video flow

**Enhanced Prompts:**

- Add cinematic keywords: "cinematic lighting, professional composition, smooth motion"
- Section-specific guidance (hook: "dynamic opening", conclusion: "satisfying resolution")
- Better visual consistency across segments

**Post-Processing:**

- Color correction: Slight contrast/brightness adjustments (contrast=1.1, brightness=0.02)
- Sharpening: Unsharp mask for clarity

## Key Files to Create/Modify

1. `backend/app/agents/agent_6.py` - New file (main Agent 6 implementation, completely isolated)
2. `backend/app/services/mediaconvert_service.py` - New file (MediaConvert integration)
3. `backend/app/services/cloudwatch_logger.py` - New file (CloudWatch logging)
4. `backend/app/main.py` - Add `/api/test6` endpoint (new endpoint, no changes to existing endpoints)
5. `backend/scaffoldtest_ui.html` - Add Test6 tab with logging display (additive changes only)
6. `backend/requirements.txt` - Verify boto3 version (no changes needed, just verification)

**Important: No modifications to existing Agent 5 code, orchestrator, or any existing functionality.**

## Implementation Order

1. Create CloudWatch logger service (foundation for logging)
2. Create MediaConvert service (foundation for video stitching)
3. Create Agent 6 module with helper functions (DALL-E image generation, normalization, audio mixing, markdown report)
4. Add `/api/test6` endpoint in main.py with lazy imports and error handling
5. Update scaffoldtest_ui.html with Test6 tab and real-time logging display (isolated namespace)
6. Test end-to-end flow with existing Agent2/Agent4 resources
7. Verify markdown report generation and S3 folder structure
8. **Verify no impact on existing functionality:**

   - Test that all existing endpoints still work
   - Test that all existing tabs still work
   - Test that Agent 5 still works normally
   - Test that orchestrator still works normally
   - Verify that import errors in Agent 6 don't break the app
   - Verify that JavaScript errors in Test6 tab don't break other tabs

### To-dos

- [x] Create cloudwatch_logger.py service with JSON logging for segments, MediaConvert jobs, and costs
- [x] Create mediaconvert_service.py with IAM setup, job creation with crossfade transitions, audio mixing, and stitching logic
- [x] Create agent_6.py with core process function, DALL-E image generation, video clip creation, normalization, audio mixing, and MediaConvert integration
- [x] Implement normalize_clip_to_720p(), build_enhanced_prompt(), create_timed_narration_track(), and enhance_final_video() helper functions in agent_6.py
- [x] Add `/api/test6` endpoint in main.py with lazy imports, error handling, and concurrency control
- [x] Update scaffoldtest_ui.html with Test6 tab, real-time logging display, video player, and cost tracking
- [ ] Test Agent 6 triggers correctly when Agent 5 fails, MediaConvert works, transitions are smooth, and UI updates properly
- [ ] Test video quality: verify 720p normalization, smooth transitions, post-processing, and consistent quality across multiple runs