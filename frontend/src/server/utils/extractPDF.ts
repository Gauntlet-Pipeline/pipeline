/**
 * Extract text content from a PDF file buffer (server-side)
 * Uses pdf-parse which is designed for Node.js and doesn't require workers
 * @param buffer - PDF file as ArrayBuffer or Buffer
 * @returns Extracted text content
 */
export async function extractTextFromPDF(
  buffer: ArrayBuffer | Buffer,
): Promise<string> {
  try {
    console.log("PDF extraction: Starting", {
      bufferType: Buffer.isBuffer(buffer) ? "Buffer" : "ArrayBuffer",
      size: Buffer.isBuffer(buffer) ? buffer.length : buffer.byteLength,
    });

    // Import pdf-parse (Node.js-specific, no workers needed)
    // pdf-parse v2 exports a named export called 'PDFParse' which is a class
    const pdfParseModule = await import("pdf-parse");

    // Access the PDFParse class
    const PDFParse = (
      pdfParseModule as {
        PDFParse: new (options: { data: Buffer | Uint8Array }) => {
          getText: () => Promise<{
            text: string;
            total: number;
            pages: unknown[];
          }>;
        };
      }
    ).PDFParse;

    // Convert to Buffer (pdf-parse requires Buffer)
    let pdfBuffer: Buffer;
    if (Buffer.isBuffer(buffer)) {
      pdfBuffer = buffer;
    } else if (buffer instanceof ArrayBuffer) {
      pdfBuffer = Buffer.from(buffer);
    } else {
      pdfBuffer = Buffer.from(new Uint8Array(buffer));
    }

    console.log("PDF extraction: Parsing document", {
      bufferSize: pdfBuffer.length,
    });

    // Create an instance of PDFParse with the PDF data
    const parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText();

    // Extract text from the result
    const pdfData = {
      numpages: result.total,
      text: result.text,
      info: null,
      metadata: null,
    };

    console.log("PDF extraction: Document parsed", {
      numPages: pdfData.numpages,
      textLength: pdfData.text.length,
      preview: pdfData.text.substring(0, 100),
    });

    // Return extracted text, removing excessive whitespace
    return pdfData.text
      .replace(/\s+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch (error) {
    console.error("PDF extraction error:", error);
    console.error("PDF extraction error details:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(
      `Failed to extract text from PDF: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Extract text from a PDF file URL
 * @param url - URL to the PDF file
 * @returns Extracted text content
 */
export async function extractTextFromPDFURL(url: string): Promise<string> {
  try {
    // Fetch PDF from URL
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    }

    // Get PDF as array buffer
    const arrayBuffer = await response.arrayBuffer();

    // Extract text from buffer
    return await extractTextFromPDF(arrayBuffer);
  } catch (error) {
    console.error("PDF URL extraction error:", error);
    throw new Error(
      `Failed to extract text from PDF URL: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}
