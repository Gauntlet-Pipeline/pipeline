/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getPdfjsLib } from "./pdfWorker";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

export interface ExtractedImage {
  blob: Blob;
  pageNumber: number;
  imageIndex: number;
}

/**
 * Extract images from a PDF file using pdf.js
 * Returns array of image blobs with metadata
 */
export async function extractImagesFromPdf(
  file: File,
): Promise<ExtractedImage[]> {
  try {
    const pdfjsLib = await getPdfjsLib();
    const arrayBuffer = await file.arrayBuffer();
    const pdf: PDFDocumentProxy = await pdfjsLib.getDocument({
      data: arrayBuffer,
    }).promise;

    const extractedImages: ExtractedImage[] = [];
    let globalImageIndex = 0;
    const errors: string[] = [];

    // Process each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      try {
        const page: PDFPageProxy = await pdf.getPage(pageNum);
        const ops = await page.getOperatorList();

        // Look for image operations
        for (let i = 0; i < ops.fnArray.length; i++) {
          if (ops.fnArray[i] === pdfjsLib.OPS.paintImageXObject) {
            const imageName = ops.argsArray[i]?.[0];
            if (!imageName) continue;

            try {
              // Get the image object with timeout
              const imageObj = await Promise.race([
                new Promise<any>((resolve, reject) => {
                  const timeout = setTimeout(() => {
                    reject(new Error(`timeout`));
                  }, 5000);

                  page.objs.get(imageName, (obj: any) => {
                    clearTimeout(timeout);
                    resolve(obj);
                  });
                }),
              ]);

              if (!imageObj) continue;

              // Process the image object
              const imageBlob = await processImageObject(imageObj, imageName);

              if (imageBlob) {
                extractedImages.push({
                  blob: imageBlob,
                  pageNumber: pageNum,
                  imageIndex: globalImageIndex++,
                });
              }
            } catch (error) {
              // Silently skip timeout errors (expected for referenced/form images)
              if (
                error instanceof Error &&
                !error.message.includes("timeout")
              ) {
                errors.push(`Page ${pageNum}: ${error.message}`);
              }
            }
          }
        }
      } catch (pageError) {
        if (pageError instanceof Error) {
          errors.push(`Page ${pageNum}: ${pageError.message}`);
        }
      }
    }

    // Log summary in development
    if (process.env.NODE_ENV === "development") {
      console.groupCollapsed(
        `📄 PDF Image Extraction: ${extractedImages.length} images from ${pdf.numPages} pages`,
      );
      if (extractedImages.length > 0) {
        console.log(
          "Images:",
          extractedImages.map((img) => `page ${img.pageNumber}`),
        );
      }
      if (errors.length > 0) {
        console.warn("Errors:", errors);
      }
      console.groupEnd();
    }

    return extractedImages;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("❌ Error extracting images from PDF:", error);
    }
    return [];
  }
}

async function processImageObject(
  imageObj: any,
  _imageName: string,
): Promise<Blob | null> {
  try {
    // Extract image data from various possible structures
    let data: Uint8Array | null = null;
    let width = 0;
    let height = 0;
    let format = "png";

    // Try different data properties
    if (imageObj.data && imageObj.data.length > 0) {
      data = imageObj.data;
      width = imageObj.width ?? 0;
      height = imageObj.height ?? 0;
      format = imageObj.format ?? "png";
    } else if (imageObj.bitmap) {
      // Handle ImageBitmap
      if (imageObj.bitmap instanceof ImageBitmap) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (ctx) {
          canvas.width = imageObj.bitmap.width;
          canvas.height = imageObj.bitmap.height;
          ctx.drawImage(imageObj.bitmap, 0, 0);
          return await new Promise<Blob>((resolve) => {
            canvas.toBlob((b) => resolve(b ?? new Blob()), "image/png");
          });
        }
      } else if (imageObj.bitmap.data && imageObj.bitmap.data.length > 0) {
        data = imageObj.bitmap.data;
        width = imageObj.width ?? 0;
        height = imageObj.height ?? 0;
      }
    } else if (imageObj.imageData && imageObj.imageData.length > 0) {
      data = imageObj.imageData;
      width = imageObj.width ?? 0;
      height = imageObj.height ?? 0;
    }

    if (!data || width === 0 || height === 0) {
      return null;
    }

    // Skip very small images (likely icons)
    if (width < 10 || height < 10) {
      return null;
    }

    // Convert to blob
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    canvas.width = width;
    canvas.height = height;

    try {
      // Try to create ImageData
      const imageData = new ImageData(
        new Uint8ClampedArray(data),
        width,
        height,
      );
      ctx.putImageData(imageData, 0, 0);
    } catch {
      // If that fails, try creating from blob
      const blob = new Blob([new Uint8Array(data)], {
        type: `image/${format}`,
      });
      const url = URL.createObjectURL(blob);

      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error(`Failed to load image from blob`));
        };
        img.src = url;
      });
    }

    // Convert canvas to blob
    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b ?? new Blob()), "image/png");
    });
  } catch {
    // Silent fail - processImageObject errors are expected for some PDF structures
    return null;
  }
}

/**
 * Get count of images in a PDF without extracting them
 */
export async function getImageCount(file: File): Promise<number> {
  try {
    const images = await extractImagesFromPdf(file);
    return images.length;
  } catch {
    return 0;
  }
}
