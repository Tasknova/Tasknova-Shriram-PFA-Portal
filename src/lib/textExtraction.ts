// Utility functions for extracting text from documents

export interface TextExtractionResult {
  success: boolean;
  text: string | null;
  message?: string;
}

/**
 * Extract text from a file using server-side API
 * @param file - File to extract text from
 * @returns Extraction result with text content and status message
 */
export async function extractTextFromFile(file: File): Promise<TextExtractionResult> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/extract-text', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to extract text from ${file.name}: ${response.status} - ${errorText}`);
      return {
        success: false,
        text: null,
        message: `HTTP ${response.status}: ${errorText}`
      };
    }

    const result = await response.json();
    
    if (result.success && result.text) {
      console.log(`✓ Extracted ${result.length} characters from ${file.name}`);
      return {
        success: true,
        text: result.text,
        message: `${result.length} characters extracted`
      };
    } else {
      const message = result.message || 'No text extracted from file';
      console.log(`⚠ ${message}: ${file.name}`);
      return {
        success: false,
        text: null,
        message
      };
    }
  } catch (error) {
    console.error(`Error extracting text from ${file.name}:`, error);
    return {
      success: false,
      text: null,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
