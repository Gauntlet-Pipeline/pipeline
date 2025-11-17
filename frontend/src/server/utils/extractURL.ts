/**
 * Extract text content from a URL
 * @param url - URL to fetch content from
 * @returns Extracted text content (HTML tags stripped)
 */
export async function extractTextFromURL(url: string): Promise<string> {
  try {
    // Ensure URL has a protocol
    let fullUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      fullUrl = `https://${url}`;
    }

    // Fetch URL content with timeout
    const response = await fetch(fullUrl, {
      signal: AbortSignal.timeout(15000), // 15 second timeout
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Get content as text
    const html = await response.text();

    if (!html || html.trim().length === 0) {
      throw new Error("Empty response from URL");
    }

    // Strip HTML tags and clean up whitespace
    const extractedText = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "") // Remove script tags
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "") // Remove style tags
      .replace(/<[^>]+>/g, " ") // Remove all HTML tags
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/\n{3,}/g, "\n\n") // Limit consecutive newlines
      .trim();

    if (!extractedText || extractedText.length === 0) {
      throw new Error("No text content extracted from URL");
    }

    return extractedText;
  } catch (error) {
    console.error("URL extraction error:", error);
    throw new Error(
      `Failed to extract content from URL: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Detect URLs in text
 * @param text - Text to search for URLs
 * @returns Array of detected URLs
 */
export function detectURLs(text: string): string[] {
  const urlRegex =
    /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/gi;
  const matches = text.match(urlRegex);
  return matches ? [...new Set(matches)] : []; // Remove duplicates
}

