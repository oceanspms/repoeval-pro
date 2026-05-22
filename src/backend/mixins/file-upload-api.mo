import Types      "../types/common";
import FileUpload  "../lib/file-upload";

mixin () {
  /// Extract plain text from an uploaded assignment file.
  /// fileBytes: raw bytes of the uploaded file.
  /// fileName:  original filename — used to detect extension (.pdf, .docx, .txt).
  /// Returns #ok({ text; is_clean }) on success or #err(message) on failure.
  /// Also accepts Edge-saved PDFs via fallback ASCII scan.
  public func extractFileText(fileBytes : Blob, fileName : Text) : async Types.ExtractTextResult {
    FileUpload.extractText(fileBytes, fileName);
  };

  /// Extract plain text from an uploaded notes/prompt-log file.
  /// Supports: .txt, .pdf, .doc, .docx, .xls, .xlsx, .zip, .rar, and generic text files.
  /// fileBytes: raw bytes of the uploaded file.
  /// fileName:  original filename — used to detect extension.
  /// Returns #ok({ text; is_clean }) on success or #err(message) on failure.
  public func extractNotesFileText(fileBytes : Blob, fileName : Text) : async Types.ExtractTextResult {
    FileUpload.extractNotesText(fileBytes, fileName);
  };
};
