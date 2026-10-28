/**
 * HızlıOku Pro - Akıllı Kitap, PDF, OCR, Başlık ve Dipnot Ayrıştırıcı (Smart Parser)
 *
 * Özellikler:
 * 1. Künye (ISBN, Yayınevi, Telif), İçindekiler ve Kaynakça/Dizin tespiti ve filtreleme
 * 2. Sayfa numaraları ve tekrarlayan üst/alt başlıkları (running headers) temizleme
 * 3. Bölüm ve alt başlıkları (Font boyutu + yapısal analiz ile) tanıma
 * 4. Dipnotları (¹, ², [1], (1), *, **, † veya PDF üst simge) tanıyıp metin içinde
 *    tam geçtiği noktaya yerleştirme ve sayfa sonundaki tekrarı kaldırma
 * 5. Dijital PDF (PDF.js) ve Taranmış PDF (Tesseract.js OCR) akışlı (streaming) okuma
 */

const SUPERSCRIPT_MAP = {
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁰': '0'
};

const KUNYE_KEYWORDS = [
  'isbn',
  'yayınevi',
  'yayınları',
  'basım',
  'baskı',
  'matbaa',
  'sertifika no',
  'telif hakkı',
  'tüm hakları saklıdır',
  'all rights reserved',
  'copyright',
  'kapak tasarımı',
  'sayfa düzeni',
  'yayın yönetmeni',
  'orijinal adı',
  'çeviren',
  'editör',
  'dağıtım',
  'kütüphane bilgi kartı',
  'cataloging-in-publication',
  'printed in'
];

const TOC_KEYWORDS = ['içindekiler', 'table of contents', 'contents', 'bölümler'];

const BACKMATTER_KEYWORDS = [
  'kaynakça',
  'bibliyografya',
  'kaynaklar',
  'references',
  'bibliography',
  'dizin',
  'index',
  'notlar ve kaynaklar'
];

class SmartBookParser {
  constructor() {
    this.ocrWorker = null;
    this.abortController = null;
  }

  cancelActiveJob() {
    if (this.abortController) {
      this.abortController.aborted = true;
    }
  }

  /**
   * Üst simge karakterlerini (¹²³) standart anahtara dönüştürür
   */
  normalizeMarker(raw) {
    if (!raw) return '';
    let s = raw.trim();
    s = s.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]/g, (ch) => SUPERSCRIPT_MAP[ch] || ch);
    s = s.replace(/^[\[\(\{]|[\]\)\}\.\:\-]$/g, '').trim();
    return s;
  }

  /**
   * Düz metni (Kopyala-Yapıştır) akıllı şekilde sayfa/bölüm, başlık ve dipnotlarıyla ayrıştırır.
   */
  parsePlainText(rawText, options = {}) {
    const pages = this._splitPlainTextIntoVirtualPages(rawText);
    return this.buildStructuredBook(pages, options);
  }

  _splitPlainTextIntoVirtualPages(rawText) {
    const cleaned = (rawText || '').replace(/\r\n/g, '\n');
    // Eğer metinde "--- Sayfa X ---" veya "\f" varsa oradan böl
    const formFeedParts = cleaned
      .split(/(?:^|\n)\s*---\s*Sayfa\s+\d+\s*---\s*\n|\f/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (formFeedParts.length > 1) {
      return formFeedParts.map((text, idx) => ({
        pageNumber: idx + 1,
        lines: this._textToLines(text, idx + 1),
        rawText: text
      }));
    }

    // Tek blok metinde dipnotların hem paragraf altında hem metin sonunda yakalanabilmesi için
    // çift boşluklarla ayrılmış mantıksal bölümleri veya tüm metni sayfa olarak hazırla
    return [
      {
        pageNumber: 1,
        lines: this._textToLines(cleaned, 1),
        rawText: cleaned
      }
    ];
  }

  _textToLines(text, pageNumber) {
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((lineText) => ({
        text: lineText,
        fontSize: 12,
        isBold: false,
        yRatio: 0.5,
        pageNumber
      }));
  }

  /**
   * Bir sayfanın künye, içindekiler veya kaynakça olup olmadığını tespit eder.
   */
  classifyPageBoilerplate(page, totalPages) {
    const fullText = page.lines.map((l) => l.text).join('\n');
    const lower = fullText.toLowerCase();
    const wordCount = fullText.split(/\s+/).filter(Boolean).length;

    if (wordCount === 0) {
      return { isBoilerplate: true, reason: 'Boş Sayfa', category: 'empty' };
    }

    // 1. Künye / Yayın Bilgileri (Genellikle ilk 6 sayfada veya kısa metin bloklarında)
    if (page.pageNumber <= Math.min(7, Math.max(3, totalPages))) {
      let kunyeHits = 0;
      for (const kw of KUNYE_KEYWORDS) {
        if (lower.includes(kw)) kunyeHits++;
      }
      if (kunyeHits >= 2 && wordCount < 350) {
        return {
          isBoilerplate: true,
          reason: 'Künye / Yayınevi ve Basım Bilgileri',
          category: 'kunye'
        };
      }
    }

    // 2. İçindekiler (Table of Contents)
    const firstLinesLower = page.lines
      .slice(0, 4)
      .map((l) => l.text.toLowerCase())
      .join(' ');
    const hasTocHeader = TOC_KEYWORDS.some((kw) => firstLinesLower.includes(kw));
    const dottedOrNumberedLines = page.lines.filter((l) =>
      /(\.{2,}|\s{2,})\s*\d{1,4}$/.test(l.text)
    ).length;

    if (
      (hasTocHeader && dottedOrNumberedLines >= 2) ||
      (page.lines.length >= 5 && dottedOrNumberedLines / page.lines.length > 0.45)
    ) {
      return {
        isBoilerplate: true,
        reason: 'İçindekiler Tablosu',
        category: 'icindekiler'
      };
    }

    // 3. Kaynakça / Dizin (Genellikle son %25'lik kısımda veya açık başlıkla başlayan sayfalar)
    const isBackHalf = totalPages <= 2 || page.pageNumber >= Math.floor(totalPages * 0.65);
    const hasBackHeader = page.lines.slice(0, 3).some((l) => {
      const clean = l.text.toLowerCase().replace(/[^a-zçğıöşü\s]/g, '').trim();
      return BACKMATTER_KEYWORDS.includes(clean);
    });

    const citationLines = page.lines.filter((l) =>
      /\(\d{4}[a-z]?\)|s\.\s*\d+|pp\.\s*\d+|isbn|yayınları|press,\s*\d{4}/i.test(l.text)
    ).length;

    if (hasBackHeader || (isBackHalf && page.lines.length >= 5 && citationLines / page.lines.length >= 0.5)) {
      return {
        isBoilerplate: true,
        reason: 'Kaynakça / Dizin',
        category: 'kaynakca'
      };
    }

    return { isBoilerplate: false, reason: null, category: 'content' };
  }

  /**
   * Sayfa satırlarını analiz ederek:
   * - Sayfa numaralarını ve üst/alt bilgileri (running headers) temizler
   * - Künye ve Kaynakça paragraflarını (tek sayfa modunda bile) ayıklar
   * - Sayfa altındaki dipnot tanımlarını (1., [1], *, † vb.) toplar
   * - Başlıkları (BÖLÜM, büyük font, kısa büyük harf satırları) işaretler
   * - Dipnotları metin içinde geçtiği kelimenin hemen arkasına enjekte eder
   */
  buildStructuredBook(pages, options = {}) {
    const skipBoilerplate = options.skipBoilerplate !== false;
    const detectHeadings = options.detectHeadings !== false;
    const inlineFootnotes = options.inlineFootnotes !== false;
    const manualOverrides = options.manualPageOverrides || {};

    const totalPages = pages.length;
    const repeatedEdgeLines = this._findRepeatedHeaderFooterLines(pages);

    const pageSummaries = [];
    const allTokens = [];
    let globalWordIndex = 0;
    let totalFootnotesMatched = 0;
    let totalHeadingsDetected = 0;

    for (const page of pages) {
      const classification = this.classifyPageBoilerplate(page, totalPages);
      let isSkippedPage = skipBoilerplate && classification.isBoilerplate;
      if (typeof manualOverrides[page.pageNumber] === 'boolean') {
        isSkippedPage = manualOverrides[page.pageNumber];
      }

      pageSummaries.push({
        pageNumber: page.pageNumber,
        isBoilerplate: classification.isBoilerplate,
        skipped: isSkippedPage,
        reason: classification.reason || 'Ana Metin',
        category: classification.category,
        preview: page.lines
          .slice(0, 2)
          .map((l) => l.text)
          .join(' — ')
          .slice(0, 100)
      });

      if (isSkippedPage) {
        continue;
      }

      // Medyan font boyutunu hesapla
      const fontSizes = page.lines.map((l) => l.fontSize || 12).sort((a, b) => a - b);
      const medianFontSize = fontSizes.length
        ? fontSizes[Math.floor(fontSizes.length / 2)]
        : 12;

      // 1. Adım: Sayfa numarası ve tekrarlayan üst/alt satırları filtrele
      const filteredLines = page.lines.filter((line, idx) => {
        const t = line.text.trim();
        if (!t) return false;

        // Tek başına sayfa numarası (Örn: "14", "- 14 -", "Sayfa 14", "[14]")
        if (/^(\-|\–|\—|\s)*(sayfa|page|s\.)?\s*\d{1,4}(\s*\/\s*\d{1,4})?(\-|\–|\—|\s)*$/i.test(t)) {
          if (idx === 0 || idx === page.lines.length - 1 || line.yRatio < 0.08 || line.yRatio > 0.92) {
            return false;
          }
        }

        // Sayfalar arası tekrarlayan üst/alt bilgi (Running header/footer)
        if (( idx === 0 || idx === page.lines.length - 1 ) && repeatedEdgeLines.has(t.toLowerCase())) {
          return false;
        }

        return true;
      });

      // 2. Adım: Tek sayfa/metin modunda satır içi Künye veya Kaynakça bloğu varsa filtrele
      const contentLines = skipBoilerplate
        ? this._filterInlineBoilerplateBlocks(filteredLines)
        : filteredLines;

      // 3. Adım: Dipnot tanımlarını (Sayfa altı veya dipnot blokları) ayır
      const { bodyLines, footnoteMap, footnoteOrder } = this._extractFootnotesFromLines(
        contentLines,
        medianFontSize
      );

      let orderedFootnoteCursor = 0;

      // 4. Adım: Ana metin satırlarını başlık ve kelimelere dönüştür
      for (let lineIdx = 0; lineIdx < bodyLines.length; lineIdx++) {
        const lineObj = bodyLines[lineIdx];
        const lineText = lineObj.text.trim();
        if (!lineText) continue;

        const isHeading =
          detectHeadings && this._isHeadingLine(lineObj, medianFontSize, lineIdx, bodyLines);

        if (isHeading) {
          totalHeadingsDetected++;
          const cleanHeading = lineText.replace(/^#+\s*/, '').trim();
          allTokens.push({
            index: globalWordIndex++,
            text: cleanHeading,
            type: 'heading',
            page: page.pageNumber,
            isSentenceEnd: true,
            isParagraphEnd: true
          });
          continue;
        }

        // Satırdaki kelimeleri ayrıştır ve dipnot işaretlerini kontrol et
        const rawWords = lineText.split(/\s+/).filter(Boolean);
        for (let wIdx = 0; wIdx < rawWords.length; wIdx++) {
          const rawWord = rawWords[wIdx];
          const isLastWordInLine = wIdx === rawWords.length - 1;

          const { cleanWord, markers } = this._detectWordFootnoteMarkers(
            rawWord,
            footnoteMap,
            footnoteOrder
          );

          if (cleanWord) {
            const isSentEnd = /[.!?…]+['"”’\)]*$/.test(cleanWord);
            allTokens.push({
              index: globalWordIndex++,
              text: cleanWord,
              type: 'word',
              page: page.pageNumber,
              hasFootnote: markers.length > 0,
              footnoteMarkers: markers,
              isSentenceEnd: isSentEnd,
              isParagraphEnd: isLastWordInLine && isSentEnd
            });
          }

          // Eğer bu kelimede dipnot işareti varsa ve inlineFootnotes açıksa dipnotu hemen şimdi oku!
          if (markers.length > 0 && inlineFootnotes) {
            for (const rawMarker of markers) {
              let fnBody = footnoteMap.get(rawMarker);
              // Eğer yıldız veya sembol sırayla eşleşiyorsa
              if (!fnBody && orderedFootnoteCursor < footnoteOrder.length) {
                const candidate = footnoteOrder[orderedFootnoteCursor];
                if (!candidate.used) {
                  fnBody = candidate;
                }
              }

              if (fnBody && !fnBody.used) {
                fnBody.used = true;
                orderedFootnoteCursor++;
                totalFootnotesMatched++;

                const fnWords = fnBody.text.split(/\s+/).filter(Boolean);
                // Dipnot başlangıç kartı / etiketi
                allTokens.push({
                  index: globalWordIndex++,
                  text: `📌 Dipnot ${fnBody.displayMarker}:`,
                  type: 'footnote-start',
                  footnoteId: fnBody.displayMarker,
                  footnoteFullText: fnBody.text,
                  page: page.pageNumber,
                  isSentenceEnd: false,
                  isParagraphEnd: false
                });

                for (let f = 0; f < fnWords.length; f++) {
                  const fw = fnWords[f];
                  const isEnd = f === fnWords.length - 1;
                  allTokens.push({
                    index: globalWordIndex++,
                    text: fw,
                    type: 'footnote',
                    footnoteId: fnBody.displayMarker,
                    footnoteFullText: fnBody.text,
                    page: page.pageNumber,
                    isSentenceEnd: isEnd || /[.!?…]+$/.test(fw),
                    isParagraphEnd: isEnd
                  });
                }
              }
            }
          }
        }
      }
    }

    return {
      tokens: allTokens,
      pageSummaries,
      stats: {
        totalPages,
        totalTokens: allTokens.length,
        skippedPagesCount: pageSummaries.filter((p) => p.skipped).length,
        headingsCount: totalHeadingsDetected,
        footnotesCount: totalFootnotesMatched
      }
    };
  }

  /**
   * Birden fazla sayfada en üst veya en alt satırda birebir tekrar eden
   * kitap adı / yazar adı gibi running header'ları bulur.
   */
  _findRepeatedHeaderFooterLines(pages) {
    const counts = new Map();
    if (pages.length < 3) return new Set();

    for (const p of pages) {
      if (!p.lines.length) continue;
      const first = p.lines[0].text.trim().toLowerCase();
      const last = p.lines[p.lines.length - 1].text.trim().toLowerCase();
      if (first.length > 2 && first.length < 70) {
        counts.set(first, (counts.get(first) || 0) + 1);
      }
      if (last !== first && last.length > 2 && last.length < 70) {
        counts.set(last, (counts.get(last) || 0) + 1);
      }
    }

    const repeated = new Set();
    for (const [text, count] of counts.entries()) {
      if (count >= 3) repeated.add(text);
    }
    return repeated;
  }

  /**
   * Tek blok metinlerde (veya birleşik sayfalarda) Künye ve Kaynakça satırlarını temizler.
   */
  _filterInlineBoilerplateBlocks(lines) {
    const result = [];
    let inBackmatter = false;

    for (let i = 0; i < lines.length; i++) {
      const text = lines[i].text.trim();
      const lower = text.toLowerCase();

      // Kaynakça veya Dizin başlığı başladıysa ve metnin son %35'indeysek geri kalanını atla
      const cleanHeader = lower.replace(/[^a-zçğıöşü\s]/g, '').trim();
      if (i > lines.length * 0.5 && BACKMATTER_KEYWORDS.includes(cleanHeader) && text.length < 35) {
        inBackmatter = true;
      }
      if (inBackmatter) continue;

      // İlk 15 satır içinde doğrudan ISBN / Sertifika No / Baskı / Telif satırı varsa atla
      if (i < 18) {
        const isKunyeLine =
          /^(isbn|issn|sertifika no|basım yeri|matbaa|kapak tasarımı|tüm hakları saklıdır|all rights reserved|copyright\s*©|birinci basım|yayın no)/i.test(
            text
          );
        if (isKunyeLine) continue;
      }

      result.push(lines[i]);
    }
    return result;
  }

  /**
   * Bir satırın Bölüm / Konu Başlığı olup olmadığını tespit eder.
   */
  _isHeadingLine(lineObj, medianFontSize, lineIdx, allLines) {
    const t = lineObj.text.trim();
    if (!t || t.length > 95) return false;

    const words = t.split(/\s+/);
    if (words.length > 12) return false;

    // 1. Markdown başlığı (# Başlık)
    if (/^#{1,4}\s+\S+/.test(t)) return true;

    // 2. Açık bölüm kelimeleri (BÖLÜM 1, GİRİŞ, SONUÇ, CHAPTER 2, KISIM I vb.)
    if (
      /^(bölüm|kısım|fasıl|chapter|part|section|giriş|önsöz|sonsöz|sonuç|epilog|prolog)\b/i.test(t) &&
      words.length <= 9
    ) {
      return true;
    }

    // 3. PDF'ten gelen büyük font boyutu veya kalın kısa satır
    if (lineObj.fontSize && medianFontSize && lineObj.fontSize >= medianFontSize * 1.18 && words.length <= 10) {
      return true;
    }

    // 4. Tamamı BÜYÜK HARF olan kısa satırlar (en az 3 harf içeren ve nokta/virgül ile bitmeyen)
    const lettersOnly = t.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ]/g, '');
    if (
      lettersOnly.length >= 4 &&
      lettersOnly === lettersOnly.toUpperCase() &&
      words.length <= 8 &&
      !/[,;:]$/.test(t)
    ) {
      return true;
    }

    // 5. Roma rakamı veya numara ile başlayan kısa başlık (Örn: "I. Modern Bilimin Doğuşu")
    if (
      /^([IVXLC]{1,5})\.\s+[A-ZÇĞİÖŞÜ]/.test(t) &&
      words.length <= 8 &&
      !/[.!?]$/.test(t)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Sayfa altındaki veya metin içindeki dipnot tanımlarını (Örn: "1. Dipnot...", "[1] ...", "* ...")
   * ana metinden ayırır ve bir harita (Map) olarak döndürür.
   */
  _extractFootnotesFromLines(lines, medianFontSize) {
    const footnoteMap = new Map();
    const footnoteOrder = [];
    const bodyLines = [];

    // Dipnot başlangıç kalıpları:
    // "[1] Açıklama", "(1) Açıklama", "1. Açıklama", "¹ Açıklama", "* Açıklama", "** Açıklama", "† Açıklama", "Dipnot 1: Açıklama"
    const fnRegex =
      /^(?:\[(\d{1,3}|\*{1,4}|†|‡)\]|\((\d{1,3}|\*{1,4}|†|‡)\)|([¹²³⁴⁵⁶⁷⁸⁹⁰]+)|(\*{1,4}|†|‡)|(?:dipnot|not)\s*(\d{1,3})\s*[\:\.\-]|(\d{1,2})[\.\)]\s+(?=[A-ZÇĞİÖŞÜa-zçğıöşü"“']))\s*(.+)$/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const t = line.text.trim();

      // Dipnotlar genellikle sayfanın alt yarısında olur VEYA açıkça [1], ¹, *, Dipnot 1 şeklinde başlar
      const isExplicitFn =
        /^(\[\d{1,3}\]|\(\d{1,3}\)|[¹²³⁴⁵⁶⁷⁸⁹⁰]+|\*{1,4}|†|‡|(?:dipnot|not)\s*\d+)/i.test(t);
      const isBottomArea = i >= Math.floor(lines.length * 0.45) || (line.yRatio && line.yRatio > 0.65);
      const isSmallerFont = line.fontSize && medianFontSize && line.fontSize < medianFontSize * 0.92;

      const match = t.match(fnRegex);
      if (match && (isExplicitFn || isBottomArea || isSmallerFont)) {
        const rawMarker = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
        const fnContent = match[7].trim();
        const key = this.normalizeMarker(rawMarker);

        // Eğer "1. Bölüm" gibi çok kısa bir başlıksa dipnot sanma
        if (match[6] && fnContent.split(/\s+/).length <= 4 && !/[.!?]$/.test(fnContent) && !isSmallerFont) {
          bodyLines.push(line);
          continue;
        }

        const fnObj = {
          key,
          displayMarker: rawMarker,
          text: fnContent,
          used: false
        };
        footnoteMap.set(key, fnObj);
        footnoteOrder.push(fnObj);

        // Eğer bir sonraki satır da sayfanın en altındaysa ve yeni bir dipnot/paragraf değilse, çok satırlı dipnotun devamı olabilir
        while (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const nextText = nextLine.text.trim();
          const nextMatchesFn = fnRegex.test(nextText);
          if (
            !nextMatchesFn &&
            (i + 1 >= lines.length - 3 || (nextLine.fontSize && nextLine.fontSize === line.fontSize)) &&
            !/[.!?]$/.test(fnObj.text)
          ) {
            fnObj.text += ' ' + nextText;
            i++;
          } else {
            break;
          }
        }
      } else {
        bodyLines.push(line);
      }
    }

    return { bodyLines, footnoteMap, footnoteOrder };
  }

  /**
   * Kelime üzerindeki dipnot işaretlerini (kavram¹, kelime[1], kelime*, kelime.1 vb.) yakalar.
   */
  _detectWordFootnoteMarkers(rawWord, footnoteMap, footnoteOrder) {
    if (!rawWord || footnoteOrder.length === 0) {
      return { cleanWord: rawWord, markers: [] };
    }

    let word = rawWord;
    const markers = [];

    // 1. Üst simge rakamlar: kelime¹ veya kelime.¹
    const superMatch = word.match(/([¹²³⁴⁵⁶⁷⁸⁹⁰]+)(['"”’\.,;:\!\?]*)$/);
    if (superMatch) {
      const m = this.normalizeMarker(superMatch[1]);
      if (footnoteMap.has(m) || footnoteOrder.length > 0) {
        markers.push(m);
        word = word.slice(0, superMatch.index) + superMatch[2];
      }
    }

    // 2. Köşeli veya normal parantezli dipnot: kelime[1], [1], kelime(1)
    const bracketMatch = word.match(/[\[\(](\d{1,3}|\*{1,4}|†|‡)[\]\)](['"”’\.,;:\!\?]*)$/);
    if (bracketMatch) {
      const m = this.normalizeMarker(bracketMatch[1]);
      if (footnoteMap.has(m)) {
        markers.push(m);
        word = word.slice(0, bracketMatch.index) + bracketMatch[2];
      }
    }

    // 3. Yıldız veya kama işaretleri: kelime*, kelime**, kelime†
    const starMatch = word.match(/(\*{1,4}|†|‡)(['"”’\.,;:\!\?]*)$/);
    if (starMatch && word.length > starMatch[1].length) {
      const m = this.normalizeMarker(starMatch[1]);
      if (footnoteMap.has(m)) {
        markers.push(m);
        word = word.slice(0, starMatch.index) + starMatch[2];
      }
    }

    // 4. PDF metin katmanında kelime sonuna yapışmış dipnot rakamı: "kavram1", "dönemi.2"
    // Sadece bu sayfada o numaralı bir dipnot gerçekten varsa!
    if (markers.length === 0) {
      const attachedNumMatch = word.match(/^([a-zA-ZçğıöşüÇĞİÖŞÜ]{2,}[\.,;:\!\?]?)(\d{1,2})(['"”’\.,;:\!\?]*)$/);
      if (attachedNumMatch) {
        const candidateNum = attachedNumMatch[2];
        if (footnoteMap.has(candidateNum)) {
          markers.push(candidateNum);
          word = attachedNumMatch[1] + attachedNumMatch[3];
        }
      }
    }

    return { cleanWord: word, markers };
  }

  /**
   * PDF dosyasını (Dijital veya Taranmış/OCR) sayfa sayfa ayrıştırır.
   * Her sayfa bittiğinde onProgress ve onPartialUpdate çağırarak
   * 1. sayfa biter bitmez hemen okuma yapılabilmesini sağlar!
   */
  async processPDF(arrayBuffer, options = {}, callbacks = {}) {
    const {
      forceOCR = false,
      ocrLanguage = 'tur+eng',
      skipBoilerplate = true,
      detectHeadings = true,
      inlineFootnotes = true
    } = options;

    const { onProgress, onPageReady } = callbacks;
    this.abortController = { aborted: false };

    if (!window.pdfjsLib) {
      throw new Error('PDF.js kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin.');
    }

    let pdfDoc;
    try {
      const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
      pdfDoc = await loadingTask.promise;
    } catch (workerErr) {
      const fallbackTask = window.pdfjsLib.getDocument({
        data: arrayBuffer.slice(0),
        disableWorker: true
      });
      pdfDoc = await fallbackTask.promise;
    }
    const numPages = pdfDoc.numPages;

    const extractedPages = [];
    let usedOCR = false;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      if (this.abortController.aborted) break;

      if (onProgress) {
        onProgress({
          pageNum,
          totalPages: numPages,
          phase: 'extract',
          message: `Sayfa ${pageNum} / ${numPages} analiz ediliyor...`
        });
      }

      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();

      let lines = this._groupPdfItemsIntoLines(textContent.items, viewport.height, pageNum);
      const charCount = lines.reduce((acc, l) => acc + l.text.replace(/\s+/g, '').length, 0);

      // Eğer sayfada metin katmanı yoksa (< 20 karakter) veya kullanıcı OCR zorladıysa -> Tesseract.js ile OCR yap!
      if (forceOCR || charCount < 20) {
        usedOCR = true;
        if (onProgress) {
          onProgress({
            pageNum,
            totalPages: numPages,
            phase: 'ocr',
            message: `Taranmış Sayfa ${pageNum} / ${numPages} OCR ile metne dönüştürülüyor...`
          });
        }

        const ocrText = await this._runOcrOnPdfPage(page, ocrLanguage, (ocrProg) => {
          if (onProgress) {
            onProgress({
              pageNum,
              totalPages: numPages,
              phase: 'ocr',
              ocrPercent: Math.round(ocrProg * 100),
              message: `Sayfa ${pageNum}/${numPages} OCR taranıyor (%${Math.round(ocrProg * 100)})...`
            });
          }
        });

        lines = this._textToLines(ocrText, pageNum);
      }

      extractedPages.push({
        pageNumber: pageNum,
        lines
      });

      // Akışlı (Streaming) güncelleme: İlk sayfa veya her yeni sayfa hazır olduğunda okuyucuyu besle
      if (onPageReady) {
        const partialBook = this.buildStructuredBook(extractedPages, {
          skipBoilerplate,
          detectHeadings,
          inlineFootnotes
        });
        onPageReady(partialBook, pageNum, numPages, usedOCR);
      }
    }

    const finalBook = this.buildStructuredBook(extractedPages, {
      skipBoilerplate,
      detectHeadings,
      inlineFootnotes
    });
    finalBook.usedOCR = usedOCR;
    finalBook.rawPages = extractedPages;
    return finalBook;
  }

  /**
   * PDF.js metin parçalarını Y koordinatlarına göre satırlara dönüştürür ve üst simge dipnotları yakalar.
   */
  _groupPdfItemsIntoLines(items, pageHeight, pageNumber) {
    if (!items || !items.length) return [];

    // Font boyutu medyanını bul (üst simge dipnot tespiti için)
    const heights = items
      .filter((it) => it.str && it.str.trim())
      .map((it) => Math.abs(it.transform[3]) || it.height || 12)
      .sort((a, b) => a - b);
    const medianH = heights.length ? heights[Math.floor(heights.length / 2)] : 12;

    // Y koordinatına göre yukarıdan aşağıya, X'e göre soldan sağa sırala
    const validItems = items
      .filter((it) => it.str && it.str.trim().length > 0)
      .map((it) => {
        const x = it.transform[4];
        const y = it.transform[5]; // PDF'de 0 alt köşedir
        const fontSize = Math.abs(it.transform[3]) || it.height || 12;
        return {
          str: it.str,
          x,
          y,
          fontSize,
          yFromTop: pageHeight - y
        };
      });

    validItems.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 4) {
        return b.y - a.y; // Yukarıdan aşağıya
      }
      return a.x - b.x; // Soldan sağa
    });

    const lines = [];
    let currentLine = null;

    for (const item of validItems) {
      if (!currentLine) {
        currentLine = {
          items: [item],
          y: item.y,
          yFromTop: item.yFromTop,
          maxFontSize: item.fontSize
        };
        continue;
      }

      const yDiff = Math.abs(item.y - currentLine.y);
      // Üst simge (superscript) kontrolü: Y biraz daha yukarıda ve fontu küçükse aynı satıra dipnot olarak ekle!
      const isSuperscript =
        item.fontSize < medianH * 0.85 &&
        item.y > currentLine.y &&
        item.y - currentLine.y <= medianH * 0.75 &&
        /^\d{1,2}$|^\*{1,3}$|^†$/.test(item.str.trim());

      if (yDiff <= Math.max(4, currentLine.maxFontSize * 0.45) || isSuperscript) {
        if (isSuperscript) {
          item.str = `[${item.str.trim()}]`;
        }
        currentLine.items.push(item);
        if (item.fontSize > currentLine.maxFontSize && !isSuperscript) {
          currentLine.maxFontSize = item.fontSize;
        }
      } else {
        lines.push(this._finalizePdfLine(currentLine, pageHeight, pageNumber));
        currentLine = {
          items: [item],
          y: item.y,
          yFromTop: item.yFromTop,
          maxFontSize: item.fontSize
        };
      }
    }

    if (currentLine) {
      lines.push(this._finalizePdfLine(currentLine, pageHeight, pageNumber));
    }

    return lines;
  }

  _finalizePdfLine(lineGroup, pageHeight, pageNumber) {
    lineGroup.items.sort((a, b) => a.x - b.x);
    let text = '';
    for (let i = 0; i < lineGroup.items.length; i++) {
      const curr = lineGroup.items[i];
      if (i > 0) {
        const prev = lineGroup.items[i - 1];
        const isBracketFn = /^\[\d+\]$/.test(curr.str);
        if (!isBracketFn && !text.endsWith(' ') && !curr.str.startsWith(' ')) {
          text += ' ';
        }
      }
      text += curr.str;
    }

    return {
      text: text.replace(/\s+/g, ' ').trim(),
      fontSize: lineGroup.maxFontSize,
      yRatio: pageHeight ? lineGroup.yFromTop / pageHeight : 0.5,
      pageNumber
    };
  }

  /**
   * PDF sayfasını yüksek çözünürlüklü Canvas'a çizip Tesseract.js ile OCR yapar.
   */
  async _runOcrOnPdfPage(pdfPage, lang = 'tur+eng', onRecognizeProgress) {
    if (!window.Tesseract) {
      throw new Error('Tesseract.js (OCR) kütüphanesi yüklenemedi.');
    }

    const viewport = pdfPage.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await pdfPage.render({ canvasContext: ctx, viewport }).promise;

    const result = await window.Tesseract.recognize(canvas, lang, {
      logger: (m) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number' && onRecognizeProgress) {
          onRecognizeProgress(m.progress);
        }
      }
    });

    return (result && result.data && result.data.text) || '';
  }
}

window.smartBookParser = new SmartBookParser();
