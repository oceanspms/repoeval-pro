import Text  "mo:core/Text";
import Blob  "mo:core/Blob";
import Char  "mo:core/Char";
import Array "mo:core/Array";
import Nat8  "mo:core/Nat8";
import Nat   "mo:core/Nat";
import Nat32 "mo:core/Nat32";

module {

  let MAX_BYTES  : Nat  = 10_485_760; // 10 MB
  let MAX_CHARS  : Nat  = 15_000;
  let MAX_NOTES  : Nat  = 10_000;
  let SUFFIX     : Text = "[...truncated]";
  let EMPTY_ERR  : Text = "File appears empty. Please paste assignment text manually or try a different file.";
  let PDF_FAIL   : Text = "PDF text extraction failed — the PDF may use compressed streams not supported by the current extractor. Please copy-paste the assignment text manually.";

  // ── helpers ──────────────────────────────────────────────────────────────────

  /// Convert a printable-ASCII Nat8 byte (32–126) to a single-character Text.
  func b2t(b : Nat8) : Text {
    Text.fromChar(Char.fromNat32(b.toNat16().toNat32()));
  };

  /// Collapse consecutive whitespace, limit newlines to 2 in a row, trim, truncate to maxChars.
  func normalizeMax(raw : Text, maxChars : Nat) : Text {
    var out     = "";
    var lastSpc = false;
    var nlCount = 0;

    for (c in raw.toIter()) {
      if (c == '\n') {
        lastSpc := false;
        nlCount += 1;
        if (nlCount <= 2) { out #= "\n" };
      } else if (c == ' ' or c == '\t' or c == '\r') {
        if (not lastSpc) {
          lastSpc := true;
          nlCount := 0;
          out #= " ";
        };
      } else {
        lastSpc := false;
        nlCount := 0;
        out #= Text.fromChar(c);
      };
    };

    let trimmed = out.trimStart(#char ' ').trimEnd(#char ' ');

    if (trimmed.size() > maxChars) {
      let chars = trimmed.toArray();
      let kept  = Array.tabulate(maxChars, func(idx : Nat) : Char { chars[idx] });
      Text.fromArray(kept) # SUFFIX;
    } else {
      trimmed;
    };
  };

  func normalize(raw : Text) : Text = normalizeMax(raw, MAX_CHARS);

  // ── Text cleaning ─────────────────────────────────────────────────────────────

  /// Strip non-printable bytes, PDF metadata artifacts, and collapse excessive whitespace.
  /// Apply this after all extraction paths.
  public func cleanExtractedText(raw : Text) : Text {
    // Step 1: strip common PDF metadata artifact tokens
    let stripped = raw
      .replace(#text "%PDF",    "")
      .replace(#text "%%EOF",   "")
      .replace(#text "endobj",  "")
      .replace(#text "endstream", "")
      .replace(#text "xref",    "")
      .replace(#text " BT ",    " ")
      .replace(#text "\nBT\n",  "\n")
      .replace(#text " ET ",    " ")
      .replace(#text "\nET\n",  "\n");

    // Step 2: filter out non-printable / control characters (keep printable ASCII + newline + tab)
    var cleaned = "";
    for (c in stripped.toIter()) {
      let code = c.toNat32().toNat();
      if (code >= 32 and code < 127) {
        cleaned #= Text.fromChar(c);
      } else if (code == 10 or code == 9) {
        // preserve newline and tab
        cleaned #= Text.fromChar(c);
      };
      // everything else (control chars, null bytes, binary sequences) is dropped
    };

    // Step 3: collapse >3 consecutive whitespace chars to 1 (already done in normalizeMax but be explicit)
    var out        = "";
    var spaceCount = 0;
    for (c in cleaned.toIter()) {
      if (c == ' ' or c == '\t') {
        spaceCount += 1;
        if (spaceCount <= 1) { out #= " " };
      } else {
        spaceCount := 0;
        out #= Text.fromChar(c);
      };
    };

    out.trim(#char ' ');
  };

  /// Returns true if the text is likely junk/garbage extraction output.
  /// Conditions (any triggers junk detection):
  ///   1. More than 2% of characters are non-printable/control chars (was 5%, now tightened)
  ///   2. Text contains 5+ runs of 3+ consecutive non-ASCII characters (indicates binary garbage)
  /// Used to detect junk extraction output and trigger the frontend Clean Text button.
  public func hasJunkContent(raw : Text) : Bool {
    var total   : Nat = 0;
    var junk    : Nat = 0;
    var nonAsciiRun    : Nat = 0;
    var nonAsciiRuns   : Nat = 0;

    for (c in raw.toIter()) {
      total += 1;
      let code = c.toNat32().toNat();
      if (not (code >= 32 and code < 127) and code != 10 and code != 9 and code != 13) {
        junk += 1;
        nonAsciiRun += 1;
      } else {
        if (nonAsciiRun >= 3) { nonAsciiRuns += 1 };
        nonAsciiRun := 0;
      };
    };
    if (nonAsciiRun >= 3) { nonAsciiRuns += 1 };

    if (total == 0) return false;

    // Condition 1: > 5% non-printable chars (was 2% — raised because we now clean aggressively before returning)
    if ((junk * 100) / total > 5) return true;

    // Condition 2: 5+ runs of 3+ consecutive non-ASCII chars (binary garbage indicator)
    if (nonAsciiRuns >= 5) return true;

    false;
  };

  // ── TXT ──────────────────────────────────────────────────────────────────────

  func extractTxt(bytes : Blob) : { #ok : { text : Text; is_clean : Bool }; #err : Text } {
    switch (bytes.decodeUtf8()) {
      case null { #err(EMPTY_ERR) };
      case (?t) {
        let cleaned = cleanExtractedText(t);
        let n = normalize(cleaned);
        if (n.size() == 0) { #err(EMPTY_ERR) } else {
          #ok({ text = n; is_clean = not hasJunkContent(n) })
        };
      };
    };
  };

  // ── PDF ───────────────────────────────────────────────────────────────────────
  // Best-effort plain-text scan:
  // 1. Locate BT…ET text blocks and collect printable ASCII from (string) literals.
  // 2. Also collect hex strings <XXXX> within BT/ET blocks.
  // 3. Fallback: if fewer than 50 chars extracted, do a full-file printable ASCII scan.
  //    This handles many Edge PDFs where content streams are compressed but some
  //    text objects may be embedded in uncompressed annotation or metadata sections.
  // Deterministic: same bytes → same text, no randomness.

  func extractPdf(bytes : Blob) : { #ok : { text : Text; is_clean : Bool }; #err : Text } {
    let arr = bytes.toArray();
    let len = arr.size();

    // Validate %PDF header
    if (len < 4 or arr[0] != 0x25 or arr[1] != 0x50 or arr[2] != 0x44 or arr[3] != 0x46) {
      return #err("File does not appear to be a valid PDF. Please paste assignment text manually.");
    };

    var out = "";
    var i   = 0;

    while (i + 1 < len) {
      // Detect "BT" (0x42 0x54) preceded by whitespace or at position 0
      if (arr[i] == 0x42 and arr[i + 1] == 0x54
          and (i == 0 or arr[i - 1] == 0x0A or arr[i - 1] == 0x20 or arr[i - 1] == 0x0D)) {
        i += 2;
        label btBlock loop {
          if (i + 1 >= len) { break btBlock };
          // Detect "ET" (0x45 0x54)
          if (arr[i] == 0x45 and arr[i + 1] == 0x54) {
            i   += 2;
            out #= "\n";
            break btBlock;
          };
          // String literal: (...)
          if (arr[i] == 0x28) { // '('
            i += 1;
            var word = "";
            label strBlock loop {
              if (i >= len or arr[i] == 0x29) { break strBlock }; // ')'
              let b = arr[i];
              if (b == 0x5C) { // backslash escape — skip escaped byte
                i += 1;
                if (i < len) { i += 1 };
              } else if (b >= 32 and b <= 126) {
                word #= b2t(b);
                i    += 1;
              } else {
                i += 1;
              };
            };
            if (i < len and arr[i] == 0x29) { i += 1 }; // consume ')'
            if (word.size() > 0) { out #= word # " " };
          // Hex string: <XXXX> — decode pairs of hex digits to ASCII chars
          } else if (arr[i] == 0x3C) { // '<'
            i += 1;
            var word = "";
            label hexBlock loop {
              if (i >= len or arr[i] == 0x3E) { break hexBlock }; // '>'
              // Read two hex nibbles
              if (i + 1 < len) {
                let hi = hexNibble(arr[i]);
                let lo = hexNibble(arr[i + 1]);
                if (hi <= 15 and lo <= 15) {
                  let byte8 : Nat8 = Nat8.fromNat((hi * 16 + lo) % 256);
                  if (byte8 >= 32 and byte8 <= 126) {
                    word #= b2t(byte8);
                  };
                  i += 2;
                } else {
                  i += 1;
                };
              } else {
                i += 1;
              };
            };
            if (i < len and arr[i] == 0x3E) { i += 1 }; // consume '>'
            if (word.size() > 0) { out #= word # " " };
          } else {
            i += 1;
          };
        };
      } else {
        i += 1;
      };
    };

    let rawCleaned = cleanExtractedText(out);
    let n = normalize(rawCleaned);

    // Fallback: if BT/ET scan extracted fewer than 50 chars, do full-file printable ASCII scan.
    // This catches many compressed PDFs (Edge-saved) where text isn't in BT/ET blocks.
    if (n.size() < 50) {
      var fallback = "";
      var j = 0;
      while (j < len) {
        let b = arr[j];
        if (b >= 32 and b <= 126) {
          fallback #= b2t(b);
        } else if (b == 0x0A or b == 0x0D) {
          fallback #= " ";
        };
        j += 1;
      };
      // Post-process fallback: strip known PDF binary-structure markers line by line.
      // The raw ASCII scan picks up binary tokens like '3 0 obj <<', 'endobj', '/Type /Page', etc.
      // Strip any segment containing these markers so only human-readable text survives.
      let fbCleaned = stripPdfBinaryMarkers(cleanExtractedText(fallback));
      let fn = normalize(fbCleaned);
      if (fn.size() >= 20) {
        return #ok({ text = fn; is_clean = not hasJunkContent(fn) });
      };
      return #err("PDF content could not be extracted — the document may use compressed streams. Please copy and paste the assignment text manually.");
    };

    #ok({ text = n; is_clean = not hasJunkContent(n) });
  };

  // ── PDF binary marker stripper ─────────────────────────────────────────────
  /// Strip PDF structural tokens that bleed through the printable-ASCII fallback scan.
  /// Works word-by-word: any word containing a PDF binary marker is dropped entirely.
  /// Returns only the surviving human-readable tokens joined by spaces.
  func stripPdfBinaryMarkers(raw : Text) : Text {
    // Split into lines; within each line split into space-separated tokens.
    // Drop any token that matches a known PDF structural keyword or starts with /.
    // Also drop tokens that are numeric sequences (PDF object refs like "3" "0" "obj").
    var outLines : [Text] = [];
    for (line in raw.split(#char '\n').toArray().vals()) {
      let tokens = line.split(#char ' ').toArray();
      var kept : [Text] = [];
      for (tok in tokens.vals()) {
        let tl = tok.toLower();
        // Drop if it's a known PDF keyword or structural marker
        let isPdfKeyword =
          tl == "obj" or tl == "endobj" or tl == "stream" or tl == "endstream" or
          tl == "xref" or tl == "trailer" or tl == "startxref" or
          tl == "null" or tl == "true" or tl == "false" or
          tok.startsWith(#text "%PDF") or tok.startsWith(#text "%%") or
          tok.startsWith(#text "<<") or tok.startsWith(#text ">>") or
          tok.startsWith(#text "/") or tok.startsWith(#text "[") or
          tok.endsWith(#text "obj") or tok.endsWith(#text "R") and tok.size() <= 6 or
          tl.contains(#text "endobj") or tl.contains(#text "xref") or
          tl.contains(#text "%pdf") or tl.contains(#text "<<") or tl.contains(#text ">>");
        // Drop pure-numeric tokens (object number references)
        var isNumeric = tok.size() > 0 and tok.size() <= 8;
        if (isNumeric) {
          for (c in tok.toIter()) {
            let code = c.toNat32().toNat();
            if (not (code >= 48 and code <= 57)) { isNumeric := false };
          };
        };
        if (not isPdfKeyword and not isNumeric and tok.size() > 0) {
          kept := kept.concat([tok]);
        };
      };
      let lineOut = kept.vals().join(" ");
      if (lineOut.size() > 0) {
        outLines := outLines.concat([lineOut]);
      };
    };
    outLines.vals().join("\n");
  };

  /// Decode a hex nibble ASCII byte to 0–15 (returns 255 if invalid).
  func hexNibble(b : Nat8) : Nat {
    let n = b.toNat();
    if (n >= 48 and n <= 57)  return n - 48;       // '0'–'9'
    if (n >= 65 and n <= 70)  return n - 55;       // 'A'–'F'
    if (n >= 97 and n <= 102) return n - 87;       // 'a'–'f'
    255; // invalid
  };

  // ── DOCX ─────────────────────────────────────────────────────────────────────
  // DOCX = ZIP.  Scan for PK local-file-header entries with method 0 (stored)
  // whose filename is "word/document.xml", then extract <w:t>…</w:t> text runs.
  // Method 8 (deflate) is common in real DOCX; a clear error is returned instead.
  // Deterministic: same bytes → same text.

  func extractDocx(bytes : Blob) : { #ok : { text : Text; is_clean : Bool }; #err : Text } {
    let arr = bytes.toArray();
    let len = arr.size();

    // Validate PK signature
    if (len < 4 or arr[0] != 0x50 or arr[1] != 0x4B or arr[2] != 0x03 or arr[3] != 0x04) {
      return #err("File does not appear to be a valid DOCX. Please paste assignment text manually.");
    };

    var xmlData    : [var Nat8] = [var];
    var xmlLen     = 0;
    var foundXml   = false;
    var i          = 0;

    while (i + 30 < len) {
      if (arr[i] == 0x50 and arr[i + 1] == 0x4B and arr[i + 2] == 0x03 and arr[i + 3] == 0x04) {
        let method     = arr[i + 8].toNat()  + arr[i + 9].toNat()  * 256;
        let compSz     = arr[i + 18].toNat() + arr[i + 19].toNat() * 256
                       + arr[i + 20].toNat() * 65536 + arr[i + 21].toNat() * 16777216;
        let fnLen      = arr[i + 26].toNat() + arr[i + 27].toNat() * 256;
        let exLen      = arr[i + 28].toNat() + arr[i + 29].toNat() * 256;
        let dataStart  = i + 30 + fnLen + exLen;

        // Build filename string from ASCII bytes
        var fname = "";
        var fi    = i + 30;
        while (fi < i + 30 + fnLen and fi < len) {
          let b = arr[fi];
          if (b >= 32 and b <= 126) { fname #= b2t(b) };
          fi += 1;
        };

        if (fname == "word/document.xml" and method == 0
            and compSz > 0 and dataStart + compSz <= len) {
          xmlData  := Array.repeat(0 : Nat8, compSz).toVarArray();
          xmlLen   := compSz;
          var k    = 0;
          while (k < compSz) {
            xmlData[k] := arr[dataStart + k];
            k          += 1;
          };
          foundXml := true;
        };

        let nextI = dataStart + compSz;
        i := if (nextI > i + 4) nextI else i + 4;
      } else {
        i += 1;
      };
    };

    if (not foundXml) {
      return #err("Could not read DOCX structure (may be deflate-compressed). Please paste assignment text manually.");
    };

    // Decode XML bytes as UTF-8
    let xmlBlob = Blob.fromArray(xmlData.toArray());
    let xmlText = switch (xmlBlob.decodeUtf8()) {
      case null { return #err("Could not decode DOCX XML. Please paste assignment text manually.") };
      case (?t) { t };
    };

    // Extract content between <w:t...> and </w:t>
    var out      = "";
    let segments = xmlText.split(#text "<w:t");
    let _first   = segments.next(); // skip content before first <w:t

    for (seg in segments) {
      let chars    = seg.toIter();
      var pastGt   = false;
      var content  = "";

      label parseChar for (c in chars) {
        if (not pastGt) {
          if (c == '>') { pastGt := true };
        } else {
          if (c == '<') { break parseChar }; // start of </w:t>
          content #= Text.fromChar(c);
        };
      };

      if (content.size() > 0) { out #= content # " " };
    };

    let cleaned = cleanExtractedText(out);
    let n = normalize(cleaned);
    if (n.size() == 0) { #err(EMPTY_ERR) } else {
      #ok({ text = n; is_clean = not hasJunkContent(n) })
    };
  };

  // ── XLSX shared-strings extractor ────────────────────────────────────────────
  // XLSX = ZIP. Find xl/sharedStrings.xml (stored, method 0) and extract <si>/<t> text.
  // If not stored (deflate), return a helpful error.

  func extractXlsx(bytes : Blob) : { #ok : { text : Text; is_clean : Bool }; #err : Text } {
    let arr = bytes.toArray();
    let len = arr.size();

    if (len < 4 or arr[0] != 0x50 or arr[1] != 0x4B or arr[2] != 0x03 or arr[3] != 0x04) {
      return #err("File does not appear to be a valid XLSX. Please paste text manually.");
    };

    var xmlData  : [var Nat8] = [var];
    var xmlLen   = 0;
    var foundXml = false;
    var i        = 0;

    while (i + 30 < len) {
      if (arr[i] == 0x50 and arr[i + 1] == 0x4B and arr[i + 2] == 0x03 and arr[i + 3] == 0x04) {
        let method    = arr[i + 8].toNat()  + arr[i + 9].toNat()  * 256;
        let compSz    = arr[i + 18].toNat() + arr[i + 19].toNat() * 256
                      + arr[i + 20].toNat() * 65536 + arr[i + 21].toNat() * 16777216;
        let fnLen     = arr[i + 26].toNat() + arr[i + 27].toNat() * 256;
        let exLen     = arr[i + 28].toNat() + arr[i + 29].toNat() * 256;
        let dataStart = i + 30 + fnLen + exLen;

        var fname = "";
        var fi = i + 30;
        while (fi < i + 30 + fnLen and fi < len) {
          let b = arr[fi];
          if (b >= 32 and b <= 126) { fname #= b2t(b) };
          fi += 1;
        };

        if (fname == "xl/sharedStrings.xml" and method == 0
            and compSz > 0 and dataStart + compSz <= len) {
          xmlData  := Array.repeat(0 : Nat8, compSz).toVarArray();
          xmlLen   := compSz;
          var k    = 0;
          while (k < compSz) {
            xmlData[k] := arr[dataStart + k];
            k += 1;
          };
          foundXml := true;
        };

        let nextI = dataStart + compSz;
        i := if (nextI > i + 4) nextI else i + 4;
      } else {
        i += 1;
      };
    };

    if (not foundXml) {
      return #err("Could not read XLSX shared strings (may be deflate-compressed). Please paste text manually.");
    };

    let xmlBlob = Blob.fromArray(xmlData.toArray());
    let xmlText = switch (xmlBlob.decodeUtf8()) {
      case null { return #err("Could not decode XLSX XML. Please paste text manually.") };
      case (?t) { t };
    };

    // Extract text between <t> and </t> tags
    var out      = "";
    let segments = xmlText.split(#text "<t");
    let _first   = segments.next();

    for (seg in segments) {
      let chars  = seg.toIter();
      var pastGt = false;
      var content = "";

      label parseChar for (c in chars) {
        if (not pastGt) {
          if (c == '>') { pastGt := true };
        } else {
          if (c == '<') { break parseChar };
          content #= Text.fromChar(c);
        };
      };

      if (content.size() > 0) { out #= content # " " };
    };

    let cleaned = cleanExtractedText(out);
    let n = normalizeMax(cleaned, MAX_NOTES);
    if (n.size() == 0) { #err(EMPTY_ERR) } else {
      #ok({ text = n; is_clean = not hasJunkContent(n) })
    };
  };

  // ── ZIP text extractor ───────────────────────────────────────────────────────
  // Scan ZIP entries for text-like files. For stored (method 0) entries, read directly.
  // For deflate-compressed (method 8) text files < 500KB, read raw bytes as UTF-8 best-effort.
  // Supports: .txt, .md, .csv, .json, .xml, .yaml, .yml, .toml, .ini, .rst,
  //           .js, .ts, .jsx, .tsx, .py, .go, .java, .rb, .php, .cs, .swift,
  //           .html, .css, .env, .sh, .Makefile
  // Binary files (.png, .jpg, .gif, .mp4, .zip, .exe, .pdf, .docx) are skipped.

  func isTextExtension(fname : Text) : Bool {
    let fl = fname.toLower();
    fl.endsWith(#text ".txt") or fl.endsWith(#text ".md") or fl.endsWith(#text ".csv") or
    fl.endsWith(#text ".json") or fl.endsWith(#text ".xml") or fl.endsWith(#text ".yaml") or
    fl.endsWith(#text ".yml") or fl.endsWith(#text ".toml") or fl.endsWith(#text ".ini") or
    fl.endsWith(#text ".rst") or fl.endsWith(#text ".js") or fl.endsWith(#text ".ts") or
    fl.endsWith(#text ".jsx") or fl.endsWith(#text ".tsx") or fl.endsWith(#text ".py") or
    fl.endsWith(#text ".go") or fl.endsWith(#text ".java") or fl.endsWith(#text ".rb") or
    fl.endsWith(#text ".php") or fl.endsWith(#text ".cs") or fl.endsWith(#text ".swift") or
    fl.endsWith(#text ".html") or fl.endsWith(#text ".css") or fl.endsWith(#text ".sh") or
    fl.endsWith(#text ".env") or fl.endsWith(#text ".rs") or fl.endsWith(#text ".kt") or
    fl == "makefile" or fl.endsWith(#text "/makefile") or
    fl == "dockerfile" or fl.endsWith(#text "/dockerfile");
  };

  func isBinaryExtension(fname : Text) : Bool {
    let fl = fname.toLower();
    fl.endsWith(#text ".png") or fl.endsWith(#text ".jpg") or fl.endsWith(#text ".jpeg") or
    fl.endsWith(#text ".gif") or fl.endsWith(#text ".mp4") or fl.endsWith(#text ".mp3") or
    fl.endsWith(#text ".zip") or fl.endsWith(#text ".exe") or fl.endsWith(#text ".dll") or
    fl.endsWith(#text ".so") or fl.endsWith(#text ".o") or fl.endsWith(#text ".class") or
    fl.endsWith(#text ".jar") or fl.endsWith(#text ".war") or fl.endsWith(#text ".ico") or
    fl.endsWith(#text ".woff") or fl.endsWith(#text ".woff2") or fl.endsWith(#text ".ttf") or
    fl.endsWith(#text ".eot") or fl.endsWith(#text ".svg") or fl.endsWith(#text ".webp") or
    fl.endsWith(#text ".pdf") or fl.endsWith(#text ".docx") or fl.endsWith(#text ".xlsx");
  };

  func extractZip(bytes : Blob) : { #ok : { text : Text; is_clean : Bool }; #err : Text } {
    let arr = bytes.toArray();
    let len = arr.size();

    if (len < 4 or arr[0] != 0x50 or arr[1] != 0x4B or arr[2] != 0x03 or arr[3] != 0x04) {
      return #err("File does not appear to be a valid ZIP.");
    };

    var out = "";
    var i   = 0;
    let MAX_ENTRY : Nat = 512_000; // 500KB per entry

    while (i + 30 < len) {
      if (arr[i] == 0x50 and arr[i + 1] == 0x4B and arr[i + 2] == 0x03 and arr[i + 3] == 0x04) {
        let method    = arr[i + 8].toNat()  + arr[i + 9].toNat()  * 256;
        let compSz    = arr[i + 18].toNat() + arr[i + 19].toNat() * 256
                      + arr[i + 20].toNat() * 65536 + arr[i + 21].toNat() * 16777216;
        let uncompSz  = arr[i + 22].toNat() + arr[i + 23].toNat() * 256
                      + arr[i + 24].toNat() * 65536 + arr[i + 25].toNat() * 16777216;
        let fnLen     = arr[i + 26].toNat() + arr[i + 27].toNat() * 256;
        let exLen     = arr[i + 28].toNat() + arr[i + 29].toNat() * 256;
        let dataStart = i + 30 + fnLen + exLen;

        var fname = "";
        var fi = i + 30;
        while (fi < i + 30 + fnLen and fi < len) {
          let b = arr[fi];
          if (b >= 32 and b <= 126) { fname #= b2t(b) };
          fi += 1;
        };

        let fnameLower = fname.toLower();
        // Skip directory entries (end with /)
        let isDir = fname.endsWith(#text "/");
        let canRead = not isDir and compSz > 0 and dataStart + compSz <= len;

        // Classify file type
        let isImageOrExe =
          fnameLower.endsWith(#text ".png") or fnameLower.endsWith(#text ".jpg") or
          fnameLower.endsWith(#text ".jpeg") or fnameLower.endsWith(#text ".gif") or
          fnameLower.endsWith(#text ".svg") or fnameLower.endsWith(#text ".ico") or
          fnameLower.endsWith(#text ".webp") or fnameLower.endsWith(#text ".exe") or
          fnameLower.endsWith(#text ".dll") or fnameLower.endsWith(#text ".so") or
          fnameLower.endsWith(#text ".class") or fnameLower.endsWith(#text ".woff") or
          fnameLower.endsWith(#text ".woff2") or fnameLower.endsWith(#text ".ttf") or
          fnameLower.endsWith(#text ".mp4") or fnameLower.endsWith(#text ".mp3");

        let isPdfEntry   = fnameLower.endsWith(#text ".pdf");
        let isDocxEntry  = fnameLower.endsWith(#text ".docx") or fnameLower.endsWith(#text ".doc");
        let isXlsxEntry  = fnameLower.endsWith(#text ".xlsx") or fnameLower.endsWith(#text ".xls");
        let isNestedZip  = fnameLower.endsWith(#text ".zip");

        if (canRead and not isImageOrExe and not isNestedZip) {
          // Decide how to handle this entry
          if (isPdfEntry and method == 0 and compSz < MAX_ENTRY) {
            // Stored PDF — try the PDF extractor directly on the raw bytes
            let fileBytes : [var Nat8] = Array.repeat(0 : Nat8, compSz).toVarArray();
            var k = 0;
            while (k < compSz) { fileBytes[k] := arr[dataStart + k]; k += 1 };
            let blob = Blob.fromArray(fileBytes.toArray());
            switch (extractPdf(blob)) {
              case (#ok({ text; is_clean = _ })) {
                if (text.size() > 0) {
                  out #= "\n[" # fname # "]\n" # text;
                };
              };
              case (#err(_)) {}; // skip unreadable PDF silently
            };
          } else if (isDocxEntry and method == 0 and compSz < MAX_ENTRY) {
            // Stored DOCX — try the DOCX extractor
            let fileBytes : [var Nat8] = Array.repeat(0 : Nat8, compSz).toVarArray();
            var k = 0;
            while (k < compSz) { fileBytes[k] := arr[dataStart + k]; k += 1 };
            let blob = Blob.fromArray(fileBytes.toArray());
            switch (extractDocx(blob)) {
              case (#ok({ text; is_clean = _ })) {
                if (text.size() > 0) {
                  out #= "\n[" # fname # "]\n" # text;
                };
              };
              case (#err(_)) {}; // skip silently
            };
          } else if (isXlsxEntry and method == 0 and compSz < MAX_ENTRY) {
            // Stored XLSX — try the XLSX extractor
            let fileBytes : [var Nat8] = Array.repeat(0 : Nat8, compSz).toVarArray();
            var k = 0;
            while (k < compSz) { fileBytes[k] := arr[dataStart + k]; k += 1 };
            let blob = Blob.fromArray(fileBytes.toArray());
            switch (extractXlsx(blob)) {
              case (#ok({ text; is_clean = _ })) {
                if (text.size() > 0) {
                  out #= "\n[" # fname # "]\n" # text;
                };
              };
              case (#err(_)) {}; // skip silently
            };
          } else if (isPdfEntry or isDocxEntry or isXlsxEntry) {
            // Deflate-compressed binary — skip gracefully (cannot decompress natively)
          } else {
            // Text / code file — read as UTF-8 (stored) or best-effort ASCII (deflated)
            let shouldRead = method == 0 or (method == 8 and uncompSz < MAX_ENTRY and compSz < MAX_ENTRY);
            if (shouldRead) {
              let fileBytes : [var Nat8] = Array.repeat(0 : Nat8, compSz).toVarArray();
              var k = 0;
              while (k < compSz) { fileBytes[k] := arr[dataStart + k]; k += 1 };
              let blob = Blob.fromArray(fileBytes.toArray());
              let text : ?Text = if (method == 0) {
                blob.decodeUtf8();
              } else {
                // Best-effort: extract printable ASCII from raw deflate bytes.
                // Keep content only if >60% of characters are printable ASCII.
                var asciiOut = "";
                var asciiCount = 0;
                for (b in fileBytes.vals()) {
                  if (b >= 32 and b <= 126) {
                    asciiOut #= b2t(b);
                    asciiCount += 1;
                  } else if (b == 10 or b == 13) {
                    asciiOut #= "\n";
                  };
                };
                if (asciiCount > 50) ?asciiOut else null;
              };
              switch (text) {
                case (?t) {
                  var printable = 0;
                  var total     = 0;
                  for (c in t.toIter()) {
                    total += 1;
                    let code = c.toNat32().toNat();
                    if (code >= 32 and code < 127) { printable += 1 };
                  };
                  if (total > 0 and (printable * 100) / total >= 60) {
                    out #= "\n[" # fname # "]\n" # t;
                  };
                };
                case null {};
              };
            };
          };
        };

        let nextI = dataStart + compSz;
        i := if (nextI > i + 4) nextI else i + 4;
      } else {
        i += 1;
      };
    };

    let cleaned = cleanExtractedText(out);
    let n = normalizeMax(cleaned, MAX_NOTES);
    if (n.size() == 0) {
      #err("ZIP archive contained no readable text content. Try extracting the ZIP and uploading files individually.")
    } else {
      #ok({ text = n; is_clean = not hasJunkContent(n) })
    };
  };

  // ── Generic binary fallback ───────────────────────────────────────────────────
  // Try UTF-8 decode; if it yields >100 printable chars, return that.

  func extractGeneric(bytes : Blob) : { #ok : { text : Text; is_clean : Bool }; #err : Text } {
    switch (bytes.decodeUtf8()) {
      case (?t) {
        var printable = 0;
        for (c in t.toIter()) {
          let code = c.toNat32().toNat();
          if (code >= 32 and code < 127) { printable += 1 };
        };
        if (printable > 100) {
          let cleaned = cleanExtractedText(t);
          let n = normalizeMax(cleaned, MAX_NOTES);
          #ok({ text = n; is_clean = not hasJunkContent(n) })
        } else {
          #err("Unsupported or binary file format — could not extract readable text.")
        };
      };
      case null {
        #err("Unsupported or binary file format — could not extract readable text.");
      };
    };
  };

  // ── Public entry points ───────────────────────────────────────────────────────

  /// Deterministically extract plain text from an uploaded assignment file.
  /// Accepts: .pdf (including Edge PDFs via fallback scan), .docx, .txt
  /// fileBytes: raw binary content of the uploaded file.
  /// fileName:  original filename — extension selects the parser.
  /// MIME types accepted: application/pdf, application/x-pdf, binary/octet-stream for PDF.
  /// Auto-applies cleanExtractedText as a secondary pass if is_clean=false so the caller
  /// always gets the cleanest possible output — is_clean=false signals the frontend to offer
  /// the "Clean Text" button but also means we already made a best-effort clean attempt.
  public func extractText(fileBytes : Blob, fileName : Text) : { #ok : { text : Text; is_clean : Bool }; #err : Text } {
    if (fileBytes.size() > MAX_BYTES) {
      return #err("File exceeds 10 MB limit. Please upload a smaller file or paste assignment text manually.");
    };

    let lower = fileName.toLower();
    let rawResult = if (lower.endsWith(#text ".txt")) {
      extractTxt(fileBytes);
    } else if (lower.endsWith(#text ".pdf")) {
      extractPdf(fileBytes);
    } else if (lower.endsWith(#text ".docx")) {
      extractDocx(fileBytes);
    } else if (lower.endsWith(#text ".doc")) {
      // DOC (legacy binary) — attempt generic fallback
      switch (extractGeneric(fileBytes)) {
        case (#ok(r)) #ok(r);
        case (#err(_)) #err("Legacy .doc files are not fully supported. Please save as .docx or paste text manually.");
      };
    } else {
      #err("Unsupported file type. Please upload a .pdf, .docx, or .txt file.");
    };

    // Secondary clean pass: if result is ok but is_clean=false, attempt to recover readable text
    switch (rawResult) {
      case (#ok({ text; is_clean = false })) {
        let secondPass = cleanExtractedText(text);
        let normalized = normalize(secondPass);
        if (normalized.size() > 20) {
          // Second pass improved things — return with updated is_clean status
          #ok({ text = normalized; is_clean = not hasJunkContent(normalized) });
        } else {
          // Second pass didn't help either — keep original and flag as not clean
          #ok({ text; is_clean = false });
        };
      };
      case other { other };
    };
  };

  /// Deterministically extract plain text from an uploaded notes file.
  /// Accepts any of: .txt, .pdf, .doc, .docx, .xls, .xlsx, .zip, .rar, or any readable text.
  /// fileBytes: raw binary content.
  /// fileName:  original filename — extension selects the parser.
  public func extractNotesText(fileBytes : Blob, fileName : Text) : { #ok : { text : Text; is_clean : Bool }; #err : Text } {
    if (fileBytes.size() > MAX_BYTES) {
      return #err("File exceeds 10 MB limit.");
    };

    let lower = fileName.toLower();

    if (lower.endsWith(#text ".txt") or lower.endsWith(#text ".md") or lower.endsWith(#text ".csv")) {
      extractTxt(fileBytes);
    } else if (lower.endsWith(#text ".pdf")) {
      extractPdf(fileBytes);
    } else if (lower.endsWith(#text ".docx")) {
      extractDocx(fileBytes);
    } else if (lower.endsWith(#text ".doc")) {
      switch (extractGeneric(fileBytes)) {
        case (#ok(r)) #ok(r);
        case (#err(_)) #err("Legacy .doc files are not fully supported. Please save as .docx or paste text manually.");
      };
    } else if (lower.endsWith(#text ".xlsx") or lower.endsWith(#text ".xls")) {
      extractXlsx(fileBytes);
    } else if (lower.endsWith(#text ".zip")) {
      extractZip(fileBytes);
    } else if (lower.endsWith(#text ".rar")) {
      // RAR: detect magic bytes (52 61 72 21 1A 07 = "Rar!\x1A\x07")
      let arr = fileBytes.toArray();
      let isRar = arr.size() >= 7 and
        arr[0] == 0x52 and arr[1] == 0x61 and arr[2] == 0x72 and arr[3] == 0x21 and
        arr[4] == 0x1A and arr[5] == 0x07;
      if (isRar) {
        #err("RAR archive detected. RAR decompression is not supported natively. Please re-upload as a ZIP file for automatic extraction, or paste the relevant contents manually.");
      } else {
        // Not actually a RAR (extension mismatch) — try generic fallback
        extractGeneric(fileBytes);
      };
    } else {
      // Generic fallback: attempt UTF-8 decode
      extractGeneric(fileBytes);
    };
  };
};
