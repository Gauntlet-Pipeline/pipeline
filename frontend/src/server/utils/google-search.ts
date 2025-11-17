import { env } from "@/env";

export interface GoogleImageResult {
  title: string;
  link: string;
  displayLink: string;
  snippet: string;
  image: {
    contextLink: string;
    height: number;
    width: number;
    byteSize: number;
    thumbnailLink: string;
    thumbnailHeight: number;
    thumbnailWidth: number;
  };
}

export interface GoogleSearchResponse {
  items?: GoogleImageResult[];
  searchInformation?: {
    totalResults: string;
    searchTime: number;
  };
}

/**
 * Fetch images from Google Programmable Search Engine
 * Returns top 6 images based on search queries
 */
export async function fetchImagesFromGoogle(
  searchQueries: string[],
): Promise<GoogleImageResult[]> {
  if (!env.GOOGLE_SEARCH_API_KEY || !env.GOOGLE_SEARCH_ENGINE_ID) {
    throw new Error(
      "GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID must be configured",
    );
  }

  const allImages: GoogleImageResult[] = [];

  // Search for each query and collect images
  for (const query of searchQueries.slice(0, 6)) {
    // Limit to 6 queries to get top 6 images
    try {
      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key", env.GOOGLE_SEARCH_API_KEY);
      url.searchParams.set("cx", env.GOOGLE_SEARCH_ENGINE_ID);
      url.searchParams.set("q", query);
      url.searchParams.set("searchType", "image");
      url.searchParams.set("num", "1"); // Get 1 image per query to get top 6 total

      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        console.error(
          `Google Search API error: ${response.status} ${response.statusText}`,
        );
        continue; // Skip this query and continue with others
      }

      const data = (await response.json()) as GoogleSearchResponse;

      if (data.items && data.items.length > 0 && data.items[0]) {
        // Add the first image from this query
        allImages.push(data.items[0]);
      }
    } catch (error) {
      console.error(`Error fetching images for query "${query}":`, error);
      // Continue with other queries even if one fails
    }
  }

  // Return top 6 images
  return allImages.slice(0, 6);
}

/**
 * Generate search queries from script content
 * Extracts key concepts and visual descriptions for image search
 */
export function generateImageSearchQueries(script: unknown): string[] {
  // Parse script to extract searchable terms
  // This is a simple implementation - can be enhanced with AI to generate better queries
  const scriptStr = JSON.stringify(script);
  const queries: string[] = [];

  // Extract key terms (simple heuristic - can be improved)
  const keyTerms = scriptStr.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) ?? [];
  const uniqueTerms = [...new Set(keyTerms)].slice(0, 6);

  for (const term of uniqueTerms) {
    queries.push(`${term} educational illustration`);
  }

  // If we don't have enough queries, add generic ones
  while (queries.length < 6) {
    queries.push("educational content visual");
  }

  return queries.slice(0, 6);
}
