declare module 'pdf-parse' {
  interface PDFData {
    text: string;
  }

  function pdfParse(dataBuffer: Buffer | Uint8Array): Promise<PDFData>;

  export default pdfParse;
}
