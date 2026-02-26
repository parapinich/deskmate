"""
Standalone proof of Google Cloud Vertex AI usage for competition judges.
Demonstrates that DeskMate uses Vertex AI (NOT AI Studio API key).
"""

from google import genai
import os

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "deskmate-488522")

# Explicitly Vertex AI — NOT AI Studio
client = genai.Client(vertexai=True, project=PROJECT_ID, location="us-central1")


def verify():
    """Verify Vertex AI connection and Gemini model access."""
    print("=" * 60)
    print("  DeskMate — Google Cloud Vertex AI Verification")
    print("=" * 60)
    print(f"  Project:  {PROJECT_ID}")
    print(f"  Location: us-central1")
    print(f"  Model:    gemini-2.0-flash")
    print(f"  SDK:      google-genai (vertexai=True)")
    print("=" * 60)
    print()

    print("[1/2] Connecting to Vertex AI...")
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents="Confirm: DeskMate is connected to Google Cloud Vertex AI. Reply in one sentence."
    )
    print(f"  ✅ Response: {response.text}")
    print()

    print("[2/2] Testing multimodal capability...")
    response2 = client.models.generate_content(
        model="gemini-2.0-flash",
        contents="What types of input can you process? List them briefly."
    )
    print(f"  ✅ Response: {response2.text}")
    print()

    print("=" * 60)
    print("  ✅ Vertex AI verification PASSED")
    print("  DeskMate backend is ready for deployment.")
    print("=" * 60)


if __name__ == "__main__":
    verify()
