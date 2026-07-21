// API route for extracting text from documents
import { NextResponse } from 'next/server';

// Force Node.js runtime (required for Buffer and pdf-parse)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ 
        success: false, 
        text: null,
        message: 'No file provided' 
      }, { status: 400 });
    }

    const mimeType = file.type;
    const fileName = file.name.toLowerCase();
    let extractedText = '';

    console.log(`[extract-text] Processing: ${fileName}, type: ${mimeType}, size: ${file.size}`);

    // Extract text based on file type
    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
      // PDF extraction using pdf-parse
      try {
        // Use dynamic import to load pdf-parse
        const pdfParseModule = await import('pdf-parse');
        const pdfParse = pdfParseModule.default;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log(`[extract-text] PDF buffer size: ${buffer.length} bytes`);
        
        interface PdfParseResult {
          text: string;
        }
        const pdfData = (await pdfParse(buffer)) as PdfParseResult;
        extractedText = pdfData.text.trim();
        
        console.log(`[extract-text] Extracted ${extractedText.length} characters from PDF`);
        
        if (extractedText.length === 0) {
          return NextResponse.json({ 
            success: true, 
            text: null,
            message: 'PDF appears to be image-based (scanned). No text layer found.'
          });
        }
      } catch (pdfError: unknown) {
        const errorMessage = pdfError instanceof Error ? pdfError.message : 'Unknown error';
        console.error('[extract-text] PDF parsing error:', pdfError);
        return NextResponse.json({ 
          success: true, 
          text: null,
          message: `PDF extraction failed: ${errorMessage}`
        });
      }
      
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileName.endsWith('.docx')
    ) {
      // Word document extraction
      try {
        const mammothModule = await import('mammoth');
        const mammoth = mammothModule.default;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log(`[extract-text] Word buffer size: ${buffer.length} bytes`);
        
        interface ExtractRawTextResult {
          value: string;
        }
        const result = (await mammoth.extractRawText({ buffer })) as ExtractRawTextResult;
        extractedText = result.value.trim();
        console.log(`[extract-text] Extracted ${extractedText.length} characters from Word document`);
      } catch (docError: unknown) {
        const errorMessage = docError instanceof Error ? docError.message : 'Unknown error';
        console.error('[extract-text] Word parsing error:', docError);
        return NextResponse.json({ 
          success: true, 
          text: null,
          message: `Word extraction failed: ${errorMessage}`
        });
      }
      
    } else if (mimeType === 'text/plain' || fileName.endsWith('.txt')) {
      // Plain text
      extractedText = await file.text();
      console.log(`[extract-text] Read ${extractedText.length} characters from text file`);
      
    } else {
      console.log(`[extract-text] Unsupported file type: ${mimeType}`);
      return NextResponse.json({ 
        success: true, 
        text: null,
        message: 'Unsupported file type for text extraction'
      });
    }

    return NextResponse.json({ 
      success: true, 
      text: extractedText,
      length: extractedText.length
    });

  } catch (error) {
    console.error('[extract-text] Error extracting text:', error);
    return NextResponse.json({ 
      success: false,
      text: null,
      message: error instanceof Error ? error.message : 'Failed to extract text'
    }, { status: 500 });
  }
}
