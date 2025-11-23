"""
Quick test script to verify Veo 3 access on Replicate
"""
import replicate
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("REPLICATE_API_KEY")
print(f"API Key loaded: {api_key[:10]}..." if api_key else "No API key found")

client = replicate.Client(api_token=api_key)

print("\n=== Testing Veo 3 Model ===")
print("Model: google/veo-3")

try:
    print("\nAttempting to run model...")
    output = client.run(
        "google/veo-3",
        input={
            "prompt": "A cinematic shot of waves crashing on a beach",
            "duration": 6,
            "aspect_ratio": "16:9",
            "resolution": "1080p",
            "generate_audio": False,
        }
    )
    print(f"✓ Success! Output: {output}")
except Exception as e:
    print(f"✗ Error: {type(e).__name__}")
    print(f"  Message: {str(e)}")
    if hasattr(e, 'response'):
        print(f"  Response status: {e.response.status_code if hasattr(e.response, 'status_code') else 'N/A'}")
        print(f"  Response text: {e.response.text if hasattr(e.response, 'text') else 'N/A'}")
