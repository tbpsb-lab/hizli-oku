/**
 * HızlıOku Pro - Akıllı Kitap, PDF, OCR, Başlık ve Dipnot Ayrıştırıcı (Smart Parser)
 *
 * Özellikler:
 * 1. Künye (ISBN, Yayınevi, Telif), Yazar Özgeçmişi, Basın Övgüleri, İçindekiler,
 *    İthaf/Epigraf ve Arka Kapak / Kaynakça / Dizin tespiti ve filtreleme (Kitap başlığından
 *    doğrudan Önsöz veya 1. Bölüme geçiş)
 * 2. Sayfa numaraları (OCR bozulmaları dahil) ve değişen numaralı üst/alt başlıkları temizleme
 * 3. Bölüm ve alt başlıkları (Font boyutu + yapısal analiz ile) tanıma ve çok satırlı başlıkları birleştirme
 * 4. Dipnotları (¹, ², [1], (1), 1, *, **, †, (ç.n.) veya PDF üst simge) tanıyıp metin içinde
 *    tam geçtiği noktaya yerleştirme ve sayfa sonundaki tekrarı kaldırma
 * 5. Satır sonu / sayfa sonu tire (-, \u00AD, \uFFFD) ve satır içi kerning/OCR bölünmelerini onarma
 * 6. Dijital PDF (PDF.js) ve Taranmış PDF (Tesseract.js OCR) akışlı (streaming) okuma
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
  'issn',
  'yayınevi',
  'yayınları',
  'yayıncılık',
  'okuyan us',
  'basım',
  'baskı',
  'matbaa',
  'matbaacılık',
  'ofset',
  'sertifika no',
  'telif hakkı',
  'tüm hakları',
  'tıim hakları',
  'all rights reserved',
  'copyright',
  'kapak tasarımı',
  'sayfa düzeni',
  'yayın yönetmeni',
  'orijinal adı',
  'özgün adı',
  'çeviren',
  'çeviri:',
  'editör',
  'dağıtım',
  'kütüphane bilgi kartı',
  'cataloging-in-publication',
  'printed in',
  'tic. ltd',
  'san. ve tic',
  'e-posta:',
  'www.',
  '.com.tr'
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

// Türkçe'de tek başına kelime olmayan, kerning/OCR hatasıyla kelimeden kopmuş ek parçaları
const BROKEN_SUFFIX_SET = new Set([
  'iyorsunuz',
  'iyorum',
  'iyorsun',
  'iyoruz',
  'iyorlar',
  'ıyorsunuz',
  'ıyorum',
  'ıyorsun',
  'ıyoruz',
  'ıyorlar',
  'uyorsunuz',
  'uyorum',
  'uyorsun',
  'uyoruz',
  'uyorlar',
  'üyorsunuz',
  'üyorum',
  'üyorsun',
  'üyoruz',
  'üyorlar',
  'acağım',
  'eceğim',
  'acaksın',
  'eceksin',
  'acaklar',
  'ecekler',
  'acağımız',
  'eceğimiz',
  'ışacağım',
  'işeceğim',
  'ışmış',
  'işmiş',
  'uşmuş',
  'üşmüş',
  'iştirmiş',
  'ıştırmış',
  'uşturmuş',
  'üştürmüş',
  'lmamış',
  'lmemiş',
  'lmış',
  'lmiş',
  'lmuş',
  'lmüş',
  'kmayı',
  'kmeyi',
  'kması',
  'kmesi',
  'kmak',
  'kmek',
  'ller',
  'llar',
  'lleri',
  'lları',
  'lir',
  'lirim',
  'lirsin',
  'liriz',
  'lirler',
  'lirdi',
  'lığı',
  'liği',
  'luğu',
  'lüğü',
  'lığım',
  'liğim',
  'lığın',
  'liğin',
  'lığına',
  'liğine',
  'lığında',
  'liğinde',
  'ığı',
  'iği',
  'uğu',
  'üğü',
  'ığım',
  'işim',
  'uğum',
  'üğüm',
  'ığın',
  'iğin',
  'uğun',
  'üğün',
  'ığını',
  'iğini',
  'uğunu',
  'üğünü',
  'ğım',
  'ğim',
  'ğum',
  'ğüm',
  'ğın',
  'ğin',
  'ğun',
  'ğün',
  'ğı',
  'ği',
  'ğu',
  'ğü',
  'ğını',
  'ğini',
  'ğunu',
  'ğünü',
  'ğımız',
  'ğimiz',
  'ğumuz',
  'ğümüz',
  'ım',
  'im',
  'um',
  'üm',
  'ımız',
  'imiz',
  'umuz',
  'ümüz',
  'ıyız',
  'iyiz',
  'uyuz',
  'üyüz',
  'ırım',
  'irim',
  'urum',
  'ürüm',
  'ında',
  'inde',
  'undan',
  'ünden',
  'ından',
  'inden',
  'ına',
  'ine',
  'ını',
  'ini',
  'unu',
  'ünü',
  'ının',
  'inin',
  'unun',
  'ünün',
  'ıkları',
  'ikleri',
  'ukları',
  'ükleri',
  'kları',
  'kleri',
  'mdan',
  'mden',
  'ndan',
  'nden',
  'ip',
  'ıp',
  'up',
  'üp',
  'ız',
  'iz',
  'uz',
  'üz'
]);

const TITLE_CASE_STOPWORDS = new Set([
  've',
  'ile',
  'de',
  'da',
  'ki',
  'bir',
  'için',
  'dair',
  'üzerine',
  'ya',
  'veya',
  'en',
  'bu',
  'o',
  'ne',
  'mı',
  'mi',
  'mu',
  'mü'
]);

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
    if (/^[\•\'\"\"'']+$/.test(s)) {
      return '*';
    }
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
   * Harfleri ayrı yazılmış başlıkları ("Ö n s ö z" -> "Önsöz", "İ ç i n d e k i l e r" -> "İçindekiler") birleştirir
   */
  _collapseSpacedLetters(str) {
    if (!str) return '';
    let s = str;
    // Tek harf + boşluk dizilerini (en az 3 tekil harf) birleştir: "Ö n s ö z" -> "Önsöz"
    s = s.replace(
      /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])([a-zA-ZçğıöşüÇĞİÖŞÜ])\s+([a-zA-ZçğıöşüÇĞİÖŞÜ])\s+([a-zA-ZçğıöşüÇĞİÖŞÜ])(?:\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]))?(?:\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]))?(?:\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]))?(?:\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]))?(?:\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]))?(?:\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]))?(?:\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]))?(?:\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]))?(?![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])/g,
      (_, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11) =>
        [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11].filter(Boolean).join('')
    );
    // Özel OCR durumları: "n a sıl a" -> "nasıla"
    s = s.replace(/(?<![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])n\s+a\s*sıl\s*a(?![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])/gi, 'nasıla');
    return s;
  }

  /**
   * Bir sayfanın künye, iç kapak, yazar biyografisi, basın övgüsü, içindekiler,
   * arka kapak veya kaynakça olup olmadığını tespit eder.
   */
  classifyPageBoilerplate(page, totalPages, context = {}) {
    const { mainContentStarted = false, inBackmatterSection = false } = context;
    const rawLines = page.lines.map((l) => this._collapseSpacedLetters(l.text.trim())).filter(Boolean);
    const fullText = rawLines.join('\n');
    const lower = fullText.toLowerCase();
    const wordCount = fullText.split(/\s+/).filter(Boolean).length;

    if (wordCount === 0) {
      return { isBoilerplate: true, reason: 'Boş Sayfa', category: 'empty' };
    }

    // Sayfada açıkça Önsöz / Sunuş / Giriş / 1. Bölüm başlığı var mı?
    const topLinesText = rawLines.slice(0, 4).join(' ');
    const hasPrefaceOrChapterStart =
      /^(önsöz|sunuş|giriş|prolog|birinci\s+bölüm|1\.\s*bölüm|bölüm\s*1|kısım\s*1|i\.\s*bölüm)(?![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])/i.test(
        rawLines[0] || ''
      ) ||
      /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])(önsöz|sunuş)(?![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])/i.test(topLinesText);

    // 1. İçindekiler (Table of Contents) - Önsöz kelimesi geçse bile noktalı sayfa numaraları varsa İçindekiler'dir!
    const firstLinesLower = rawLines
      .slice(0, 4)
      .map((l) => l.toLowerCase())
      .join(' ');
    const hasTocHeader = TOC_KEYWORDS.some((kw) => firstLinesLower.includes(kw));
    const dottedOrNumberedLines = rawLines.filter((l) =>
      /(\.{2,}|\s{2,})\s*\d{1,4}$|\.{2,}\d{1,4}$/.test(l)
    ).length;

    if (
      (hasTocHeader && dottedOrNumberedLines >= 1) ||
      (rawLines.length >= 4 && dottedOrNumberedLines / rawLines.length >= 0.4)
    ) {
      return {
        isBoilerplate: true,
        reason: 'İçindekiler Tablosu',
        category: 'icindekiler'
      };
    }

    // 2. Künye / Yayın ve Basım Bilgileri (İlk 20 sayfada veya son 3 sayfada)
    if (
      page.pageNumber <= Math.min(20, Math.max(5, totalPages)) ||
      (totalPages >= 5 && page.pageNumber >= totalPages - 2)
    ) {
      let kunyeHits = 0;
      for (const kw of KUNYE_KEYWORDS) {
        if (lower.includes(kw)) kunyeHits++;
      }
      if (fullText.includes('©')) kunyeHits++;
      if (/978[\-\s]?\d/.test(fullText)) kunyeHits += 2;
      if (/sertifika\s*no|baskı\s*ve\s*cilt|basım\s*yeri|t[üıi]m\s*haklar[ıi]/i.test(fullText)) {
        kunyeHits += 2;
      }

      if (kunyeHits >= 2 && wordCount < 380 && !hasPrefaceOrChapterStart) {
        // Eğer son 2 sayfadaysa Arka Kapak olarak sınıflandır
        if (totalPages >= 5 && page.pageNumber >= totalPages - 1) {
          return {
            isBoilerplate: true,
            reason: 'Arka Kapak / Tanıtım ve Barkod',
            category: 'arka_kapak'
          };
        }
        return {
          isBoilerplate: true,
          reason: 'Künye / Yayınevi ve Basım Bilgileri',
          category: 'kunye'
        };
      }
    }

    // 3. Kitap Başındaki Ön Sayfalar (Ana metin / Önsöz başlamadan önceki ilk 16 sayfa)
    const isFrontZone = totalPages >= 5 && page.pageNumber <= Math.min(16, Math.floor(totalPages * 0.25));
    if (isFrontZone && !mainContentStarted && !hasPrefaceOrChapterStart) {
      // 3a. Yazar Özgeçmişi / Yazarın Diğer Kitapları (Bio sayfası)
      const bioPatterns = [
        /\(\s*1[89]\d{2}\s*[\-\–]\s*(?:19\d{2}|20\d{2})?\s*\)/,
        /dile\s+çevril/i,
        /yabancı\s+dile/i,
        /çoksatanlar/i,
        /romanlarının\s+yazarı/i,
        /eserleri\s+arasında/i,
        /ödülü/i,
        /kurucusu\s+olan/i,
        /profesör/i,
        /@[a-z0-9_]{3,}/i
      ];
      let bioHits = 0;
      for (const rx of bioPatterns) {
        if (rx.test(fullText)) bioHits++;
      }
      if (bioHits >= 2 && wordCount < 230) {
        return {
          isBoilerplate: true,
          reason: 'Yazar Özgeçmişi ve Eserleri',
          category: 'yazar_bio'
        };
      }

      // 3b. Basın Yorumları / Kitap Övgüleri (Praise / Blurbs)
      const quoteMatches = fullText.match(/["“”«»]/g) || [];
      const upperReviewerLines = rawLines.filter((l) => {
        const clean = l.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ\s]/g, '').trim();
        return (
          clean.length >= 2 &&
          clean.length <= 35 &&
          clean === clean.toUpperCase() &&
          l.split(/\s+/).length <= 5
        );
      }).length;
      if (
        (quoteMatches.length >= 4 && upperReviewerLines >= 2 && wordCount < 320) ||
        (upperReviewerLines >= 3 && /roman|kitap|hikâye|hikaye|büyüleyici|muhteşem/i.test(fullText) && wordCount < 300)
      ) {
        return {
          isBoilerplate: true,
          reason: 'Basın Yorumları ve Övgüler',
          category: 'ovguler'
        };
      }

      // 3c. Kısa Ön Sayfalar: Kapak, Sırt, İç Kapak, İthaf ("Teşekkürler"), Epigraf (Şiir/Alıntı), Ön Tanıtım
      // Ancak sayfa 7 ve sonrasında başlık + tam cümlelerle başlayan gerçek bir bölüm açılışı varsa atlama!
      const looksLikeChapterStartPage =
        page.pageNumber >= 7 &&
        wordCount >= 25 &&
        rawLines.length >= 3 &&
        this._isHeadingLine({ text: rawLines[0], fontSize: 12 }, 12, 0, page.lines) &&
        !/teşekkürler|sylvia\s+plath|bütün\s+sağlık/i.test(fullText);

      if (wordCount < 60 && !looksLikeChapterStartPage) {
        return {
          isBoilerplate: true,
          reason: 'Ön Sayfa (Kapak / İthaf / Epigraf)',
          category: 'on_sayfa'
        };
      }
    }

    // 4. Arka Kapak (Son 2 sayfada barkod, fiyat, ISBN, KDV, web sitesi içeren tanıtım yazıları)
    if (totalPages >= 5 && page.pageNumber >= totalPages - 1) {
      let backCoverHits = 0;
      if (/isbn|9\s*78\d{3,4}/i.test(fullText)) backCoverHits += 2;
      if (/kdv['’]?den\s+muaftır|kdv\s+dahil|\b\d+\s*tl\b/i.test(fullText)) backCoverHits += 2;
      if (/www\.|\.com\.tr|okuyan\s*us|domingo/i.test(fullText)) backCoverHits++;
      if (/yılın\s+en\s+iyi|çoksatan|psikoloji\s*\/\s*psikiyatri/i.test(fullText)) backCoverHits++;

      if (backCoverHits >= 2 && wordCount < 300) {
        return {
          isBoilerplate: true,
          reason: 'Arka Kapak / Tanıtım Yazısı',
          category: 'arka_kapak'
        };
      }
    }

    // 5. Kaynakça / Dizin (Genellikle son %35'lik kısımda veya açık başlıkla başlayan sayfalar)
    const isBackHalf = totalPages <= 2 || page.pageNumber >= Math.floor(totalPages * 0.65);
    const hasBackHeader = rawLines.slice(0, 3).some((l) => {
      const clean = l.toLowerCase().replace(/[^a-zçğıöşü\s]/g, '').trim();
      return BACKMATTER_KEYWORDS.includes(clean);
    });

    const citationLines = rawLines.filter((l) =>
      /\(\d{4}[a-z]?\)|s\.\s*\d+|pp\.\s*\d+|isbn|yayınları|press,\s*\d{4}/i.test(l)
    ).length;

    if (
      hasBackHeader ||
      (isBackHalf && inBackmatterSection) ||
      (isBackHalf && rawLines.length >= 5 && citationLines / rawLines.length >= 0.5)
    ) {
      return {
        isBoilerplate: true,
        reason: 'Kaynakça / Dizin',
        category: 'kaynakca',
        startsBackmatter: true
      };
    }

    return { isBoilerplate: false, reason: null, category: 'content' };
  }

  /**
   * Atlanan ön sayfalardan (Kapak / İç Kapak) kitabın başlığını tespit eder.
   */
  _extractBookTitleFromFrontPages(pages) {
    const maxCheck = Math.min(8, pages.length);
    const candidates = [];
    const freqMap = new Map();

    for (let i = 0; i < maxCheck; i++) {
      const p = pages[i];
      if (!p.lines || !p.lines.length) continue;
      const lines = p.lines.map((l) => this._collapseSpacedLetters(l.text.trim())).filter(Boolean);
      const wordCount = lines.join(' ').split(/\s+/).filter(Boolean).length;

      // İç kapak genellikle 1 ile 25 kelime arasındadır
      if (wordCount >= 1 && wordCount <= 25) {
        const seenOnPage = new Set();
        for (const line of lines.slice(0, 3)) {
          const clean = line.trim();
          const wCount = clean.split(/\s+/).length;
          if (wCount < 1 || wCount > 8 || clean.length < 3 || clean.length > 65) continue;
          if (
            /^(çeviren|çeviri|editör|okuyan\s*us|domingo|yayın|isbn|baskı|basım|matt\s+haig|viktor\s+e\.\s+frankl)$/i.test(
              clean
            )
          ) {
            continue;
          }
          if (/^[\d\W]+$/.test(clean)) continue;

          const key = clean.toLowerCase();
          if (!seenOnPage.has(key)) {
            seenOnPage.add(key);
            freqMap.set(key, (freqMap.get(key) || 0) + 1);
          }

          candidates.push({
            title: clean,
            key,
            baseScore: (wordCount <= 5 ? 10 : 5) + (lines.length === 1 ? 5 : 0)
          });
        }
      }
    }

    if (!candidates.length) return null;
    for (const c of candidates) {
      c.score = c.baseScore + (freqMap.get(c.key) || 1) * 15;
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].title;
  }

  /**
   * Sayfa satırlarını analiz ederek:
   * - Ön sayfa klişelerini (künye, içindekiler, yazar bio, övgüler, ithaf) ve arka kapak/kaynakçayı atlar
   * - Kitap başlığını en başa ekleyip doğrudan Önsöz veya 1. Bölüme geçer
   * - Sayfa numaralarını ve üst/alt bilgileri (running headers) temizler
   * - Sayfa altındaki dipnot tanımlarını (1., 1, [1], *, †, (ç.n.) vb.) toplar
   * - Başlıkları (BÖLÜM, büyük font, kısa büyük harf satırları, bölüm açılış başlıkları) işaretler
   * - Satır sonu/sayfa sonu (\uFFFD, \u00AD, -) ve satır içi bölünmüş kelimeleri birleştirir
   * - Dipnotları metin içinde geçtiği kelimenin hemen arkasına enjekte eder
   */
  buildStructuredBook(pages, options = {}) {
    const skipBoilerplate = options.skipBoilerplate !== false;
    const detectHeadings = options.detectHeadings !== false;
    const inlineFootnotes = options.inlineFootnotes !== false;
    const manualOverrides = options.manualPageOverrides || {};

    const totalPages = options.expectedTotalPages || pages.length;
    const repeatedEdgeLines = this._findRepeatedHeaderFooterLines(pages);
    const detectedBookTitle = totalPages >= 5 ? this._extractBookTitleFromFrontPages(pages) : null;

    const pageSummaries = [];
    const allTokens = [];
    let globalWordIndex = 0;
    let totalFootnotesMatched = 0;
    let totalHeadingsDetected = 0;

    const preparedPages = [];
    let mainContentStarted = false;
    let inBackmatterSection = false;
    let skippedFrontPagesCount = 0;

    for (const page of pages) {
      const classification = this.classifyPageBoilerplate(page, totalPages, {
        mainContentStarted,
        inBackmatterSection
      });

      if (classification.startsBackmatter) {
        inBackmatterSection = true;
      }

      let isSkippedPage = skipBoilerplate && classification.isBoilerplate;
      if (typeof manualOverrides[page.pageNumber] === 'boolean') {
        isSkippedPage = manualOverrides[page.pageNumber];
      }

      if (!classification.isBoilerplate) {
        mainContentStarted = true;
      } else if (!mainContentStarted) {
        skippedFrontPagesCount++;
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

      // 1. Adım: Sayfa numarası, sahne geçiş yıldızı ve tekrarlayan üst/alt satırları filtrele
      const filteredLines = page.lines.filter((line, idx) => {
        const t = line.text.trim();
        if (!t) return false;

        const isEdgeLine =
          idx === 0 || idx === page.lines.length - 1 || line.yRatio < 0.08 || line.yRatio > 0.92;

        // Tek başına sayfa numarası (Örn: "14", "4 1", "- 14 -", "Sayfa 14", "[14]")
        if (
          isEdgeLine &&
          /^[\-\–\—\s\[\(]*(?:sayfa|page|s\.)?\s*\d(?:\s*\d){0,3}(?:\s*\/\s*\d{1,4})?[\-\–\—\s\]\)]*$/i.test(
            t
          )
        ) {
          return false;
        }

        // Sayfanın en alt satırında OCR kaynaklı bozuk sayfa numarası (Örn: "ı8", "6ı", ":i5", "ı33", "'35", "il")
        if (
          idx === page.lines.length - 1 &&
          t.length <= 4 &&
          /^[0-9ıIlLi|:'\.\-\s]{1,4}$/.test(t) &&
          !/^(o|bu|şu|ne|ve|de|da|ki|mi|mı|mu|mü)$/i.test(t)
        ) {
          return false;
        }

        // Tek başına sahne geçiş yıldızları ("*", "* * *", "***")
        if (/^[\*\•\·\~\s]+$/.test(t) && t.replace(/\s+/g, '').length <= 5) {
          return false;
        }

        // Sayfalar arası tekrarlayan üst/alt bilgi (Değişen sayfa numaralı running header/footer dahil: "İnsanın Anlam Arayışı 7", "8 Viktor E. Frankl")
        if (idx === 0 || idx === page.lines.length - 1) {
          const normEdge = this._normalizeEdgeLineForRepeatCheck(t);
          if (normEdge && repeatedEdgeLines.has(normEdge)) {
            return false;
          }
        }

        return true;
      });

      // Sayfanın son satırında tire/kesme veya kelime sonuna yapışmış sayfa numarasını temizle (Örn: "İçe\uFFFD24" -> "İçe\uFFFD", "anda201" -> "anda")
      if (filteredLines.length > 0) {
        const lastIdx = filteredLines.length - 1;
        let lastText = filteredLines[lastIdx].text;
        // Durum A: Tire/\uFFFD sonrasına yapışan sayfa numarası ("İçe\uFFFD24" -> "İçe\uFFFD")
        lastText = lastText.replace(
          /([a-zA-ZçğıöşüÇĞİÖŞÜ][\-\u00AD\uFFFD\u2010\u2011\u2012\u2013\u2212\u00AC~]+)\s*\d{1,4}$/,
          '$1'
        );
        // Durum B: Sayfa sonundaki kelimenin sonuna yapışmış 3 haneli sayfa numarası ("anda201" -> "anda")
        lastText = lastText.replace(/([a-zçğıöşü]{3,})(\d{3})$/, '$1');
        filteredLines[lastIdx] = { ...filteredLines[lastIdx], text: lastText };
      }

      // 2. Adım: Tek sayfa/metin modunda satır içi Künye veya Kaynakça bloğu varsa filtrele
      const contentLines = skipBoilerplate
        ? this._filterInlineBoilerplateBlocks(filteredLines)
        : filteredLines;

      // 3. Adım: Dipnot tanımlarını (Sayfa altı veya dipnot blokları) ayır
      const { bodyLines, footnoteMap, footnoteOrder } = this._extractFootnotesFromLines(
        contentLines,
        medianFontSize
      );

      // Başlık satırlarını önceden işaretle ve satır içi tire / kerning / OCR hatalarını temizle
      const cleanedBodyLines = bodyLines.map((lineObj) => ({
        ...lineObj,
        text: this._cleanIntraLineHyphens(lineObj.text),
        pageNumber: page.pageNumber
      }));

      const annotatedBodyLines = cleanedBodyLines.map((lineObj, lineIdx) => {
        const isHeading =
          detectHeadings &&
          this._isHeadingLine(lineObj, medianFontSize, lineIdx, cleanedBodyLines);
        return {
          ...lineObj,
          isHeading
        };
      });

      // Aynı sayfadaki ardışık başlık satırlarını tek bir başlıkta birleştir (Örn: "1. Bölüm" + "TOPLAMA KAMPI DENEYİMLERİ")
      const mergedHeadingBodyLines = [];
      for (let i = 0; i < annotatedBodyLines.length; i++) {
        const curr = { ...annotatedBodyLines[i] };
        while (
          curr.isHeading &&
          i + 1 < annotatedBodyLines.length &&
          annotatedBodyLines[i + 1].isHeading
        ) {
          const nextH = annotatedBodyLines[i + 1].text.trim();
          if (nextH) {
            curr.text = `${curr.text.trim()} — ${nextH}`;
          }
          i++;
        }
        mergedHeadingBodyLines.push(curr);
      }

      preparedPages.push({
        pageNumber: page.pageNumber,
        medianFontSize,
        bodyLines: mergedHeadingBodyLines,
        footnoteMap,
        footnoteOrder
      });
    }

    // 4. Adım: Satır sonu ve Sayfa sonu kesme/tire işareti (\uFFFD, \u00AD, -) ile bölünmüş kelimeleri birleştir!
    this._mergeSplitWordsAcrossLinesAndPages(preparedPages);

    // Eğer ön sayfalar atlandıysa ve kitap başlığı tespit edildiyse en başa Kitap Başlığını ekle!
    if (skipBoilerplate && skippedFrontPagesCount > 0 && detectedBookTitle && preparedPages.length > 0) {
      const firstLineText =
        preparedPages[0].bodyLines[0] ? preparedPages[0].bodyLines[0].text.trim() : '';
      if (firstLineText.toLowerCase() !== detectedBookTitle.toLowerCase()) {
        totalHeadingsDetected++;
        allTokens.push({
          index: globalWordIndex++,
          text: detectedBookTitle,
          type: 'heading',
          page: 1,
          isBookTitle: true,
          isSentenceEnd: true,
          isParagraphEnd: true
        });
      }
    }

    // 5. Adım: Birleştirilmiş temiz satırları başlık, kelime ve dipnotlara dönüştür
    for (let pIdx = 0; pIdx < preparedPages.length; pIdx++) {
      const prepPage = preparedPages[pIdx];
      const nextPrepPage = preparedPages[pIdx + 1] || null;
      const { bodyLines, footnoteMap, footnoteOrder } = prepPage;
      let orderedFootnoteCursor = 0;

      for (let lineIdx = 0; lineIdx < bodyLines.length; lineIdx++) {
        const lineObj = bodyLines[lineIdx];
        const lineText = lineObj.text.trim();
        if (!lineText) continue;

        if (lineObj.isHeading) {
          totalHeadingsDetected++;
          const cleanHeading = lineText.replace(/^#+\s*/, '').trim();
          allTokens.push({
            index: globalWordIndex++,
            text: cleanHeading,
            type: 'heading',
            page: prepPage.pageNumber,
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

          // Eğer kelime bir sonraki sayfadan birleştirildiyse dipnotu bir sonraki sayfada da olabilir
          const combinedFnMap = new Map(footnoteMap);
          if (isLastWordInLine && nextPrepPage && lineIdx === bodyLines.length - 1) {
            for (const [k, v] of nextPrepPage.footnoteMap.entries()) {
              if (!combinedFnMap.has(k)) combinedFnMap.set(k, v);
            }
          }

          const { cleanWord, markers } = this._detectWordFootnoteMarkers(
            rawWord,
            combinedFnMap,
            footnoteOrder
          );

          if (cleanWord) {
            const isSentEnd = /[.!?…]+['"”’\)]*$/.test(cleanWord);
            allTokens.push({
              index: globalWordIndex++,
              text: cleanWord,
              type: 'word',
              page: prepPage.pageNumber,
              hasFootnote: markers.length > 0,
              footnoteMarkers: markers,
              isSentenceEnd: isSentEnd,
              isParagraphEnd: isLastWordInLine && isSentEnd
            });
          }

          // Eğer bu kelimede dipnot işareti varsa ve inlineFootnotes açıksa dipnotu hemen şimdi oku!
          if (markers.length > 0 && inlineFootnotes) {
            for (const rawMarker of markers) {
              let fnBody = combinedFnMap.get(rawMarker);
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
                  page: prepPage.pageNumber,
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
                    page: prepPage.pageNumber,
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

    const repairedTokens = this.repairTokenList(allTokens);

    return {
      tokens: repairedTokens,
      pageSummaries,
      stats: {
        totalPages,
        totalTokens: repairedTokens.length,
        skippedPagesCount: pageSummaries.filter((p) => p.skipped).length,
        headingsCount: totalHeadingsDetected,
        footnotesCount: totalFootnotesMatched
      }
    };
  }

  /**
   * Mevcut veya önbellekten (IndexedDB) gelen token listesindeki bölünmüş kelimeleri
   * (satır sonu veya sayfa sonu tire/kesme işareti ile ayrılmış heceleri) birleştirir.
   */
  repairTokenList(tokens) {
    if (!Array.isArray(tokens) || tokens.length < 2) return tokens || [];
    const out = [];
    for (let i = 0; i < tokens.length; i++) {
      const curr = { ...tokens[i] };
      if (curr.type === 'word') {
        curr.text = this._cleanIntraLineHyphens(curr.text);
      }
      if (curr.type === 'word' && i + 1 < tokens.length && tokens[i + 1].type === 'word') {
        const next = tokens[i + 1];
        const prevWord = out.length > 0 ? out[out.length - 1].text : '';
        const hasOpenParentheticalDash = /^[\-\–\—][a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(prevWord);
        const merged = this._tryMergeWordPair(curr.text, next.text, {
          hasOpenParentheticalDash,
          isRepairPass: true
        });
        if (merged && !merged.includes(' ')) {
          curr.text = merged;
          curr.hasFootnote = Boolean(curr.hasFootnote || next.hasFootnote);
          curr.footnoteMarkers = [
            ...(curr.footnoteMarkers || []),
            ...(next.footnoteMarkers || [])
          ];
          curr.isSentenceEnd = Boolean(next.isSentenceEnd);
          curr.isParagraphEnd = Boolean(next.isParagraphEnd);
          i++; // Birleştirilen ikinci parçayı atla
        }
      }
      if (!curr.text || (curr.type === 'word' && /^[\*\uFFFD]+$/.test(curr.text))) {
        continue;
      }
      curr.index = out.length;
      out.push(curr);
    }
    return out;
  }

  /**
   * Satır içindeki görünmez koşullu tireleri (\u00AD), bozuk PDF tire karakterlerini (\uFFFD),
   * kerning boşluklarını ("bil iyorsunuz", "insanları n", "Ö n s ö z") ve OCR noktalama hatalarını onarır.
   */
  _cleanIntraLineHyphens(rawLineText) {
    if (!rawLineText) return '';
    let t = rawLineText;

    // 1. Harfleri ayrı yazılmış başlık veya vurgulu kelimeleri birleştir ("Ö n s ö z" -> "Önsöz")
    t = this._collapseSpacedLetters(t);

    // 2. Kelime ortasındaki görünmez soft-hyphen (\u00AD) karakterlerini birleştir
    t = t.replace(/([a-zA-ZçğıöşüÇĞİÖŞÜ])\u00AD+\s*([a-zA-ZçğıöşüÇĞİÖŞÜ])/g, '$1$2');

    // 3. Kelime ortasındaki PDF/OCR tire değişim karakterini (\uFFFD) analiz et:
    // - Eğer öncesinde açılmış bir ara cümle kısa çizgisi (" -kelime...") varsa veya ikinci kısım Büyük Harfle başlıyorsa "– " yap
    // - Aksi halde hece bölmesidir ("Haya\uFFFDtımda" -> "Hayatımda"), doğrudan birleştir!
    t = t.replace(
      /([a-zA-ZçğıöşüÇĞİÖŞÜ]+)\uFFFD+\s*([a-zA-ZçğıöşüÇĞİÖŞÜ]+)/g,
      (fullMatch, leftPart, rightPart, offset, fullStr) => {
        const beforeSlice = fullStr.slice(0, offset);
        const hasOpenParentheticalDash = /(?:^|\s)[\-\–\—][a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(beforeSlice);
        const isLowerToUpper =
          /[a-zçğıöşü]$/.test(leftPart) && /^[A-ZÇĞİÖŞÜ]/.test(rightPart);
        if (hasOpenParentheticalDash || isLowerToUpper) {
          return `${leftPart}– ${rightPart}`;
        }
        return `${leftPart}${rightPart}`;
      }
    );

    // 4. Satır sonunda harf ile tire/kesme arasına girmiş boşluğu kaldır ("gerçekleştiril -" -> "gerçekleştiril-")
    t = t.replace(
      /([a-zA-ZçğıöşüÇĞİÖŞÜ0-9])\s+([\-\u00AD\uFFFD\u2010\u2011\u2012\u2212\u00AC~'’‘\`]+)$/,
      '$1$2'
    );

    // 5. Noktalama işaretinden sonra kalan yalnız \uFFFD karakterlerini temizle ("...\uFFFD" -> "...")
    t = t.replace(/([^\wçğıöşüÇĞİÖŞÜ])\uFFFD+(?=\s|$)/g, '$1');

    // 6. Satır içinde kesme işareti etrafında oluşan PDF boşluklarını birleştir ("Türkiye ’ nin" -> "Türkiye’nin")
    t = t.replace(
      /([a-zA-ZçğıöşüÇĞİÖŞÜ0-9])\s+(['’‘])\s*([a-zçğıöşü]{1,8})(?![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])/g,
      '$1$2$3'
    );

    // 7. Font kerning hatasıyla kelimeden kopmuş tek harfli Türkçe ekleri birleştir ("insanları n" -> "insanların", "Umarı m" -> "Umarım", "Çal ı'nın" -> "Çalı'nın")
    t = t.replace(
      /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])([a-zA-ZçğıöşüÇĞİÖŞÜ][a-zçğıöşü]{1,20})\s+([nmı](?:['’‘][a-zçğıöşü]{1,8})?)(?=[,.;:!?'”"\)\s]|$)/g,
      '$1$2'
    );

    // 8. Font kerning hatasıyla kelimeden kopmuş çok harfli Türkçe ek parçalarını birleştir ("bil iyorsunuz" -> "biliyorsunuz", "çı kmayı" -> "çıkmayı")
    t = t.replace(
      /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])([a-zA-ZçğıöşüÇĞİÖŞÜ]*[a-zçğıöşü])\s+([a-zçğıöşü]{2,12})(?![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])/g,
      (full, stem, suffix) => {
        if (BROKEN_SUFFIX_SET.has(suffix)) {
          return stem + suffix;
        }
        return full;
      }
    );

    // 9. Türkçe OCR "rı" -> "n" ligatür bozulmalarını düzelt ("kamplannda" -> "kamplarında", "insanlann" -> "insanların")
    t = t.replace(
      /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])([a-zA-ZçğıöşüÇĞİÖŞÜ][a-zçğıöşü]{2,})lan(nda|ndan|nı|na|nın|nm|mız|nız)(?![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])/g,
      (_, stem, tail) => `${stem}ları${tail === 'nm' ? 'nın' : tail}`
    );
    t = t.replace(
      /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])([a-zA-ZçğıöşüÇĞİÖŞÜ][a-zçğıöşü]{2,})lann(?![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])/g,
      '$1ların'
    );
    t = t.replace(
      /(?<![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])(başka|on|bun|şun)lan(?![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])/gi,
      (_, p1) => `${p1}ları`
    );

    // 10. OCR tırnak/noktalama bozulmalarını düzelt (":'" -> '."', ";'" -> ',"')
    t = t.replace(/([a-zA-ZçğıöşüÇĞİÖŞÜ0-9]):'(?=\s|$)/g, '$1."');
    t = t.replace(/([a-zA-ZçğıöşüÇĞİÖŞÜ0-9]);'(?=\s|$)/g, '$1,"');

    return t.trim();
  }

  /**
   * Hem aynı sayfadaki alt alta satırlar arasında hem de bir sayfanın son satırı ile
   * bir sonraki sayfanın ilk satırı arasında tire (-, \u00AD, \uFFFD) veya kesme işareti (') ile
   * bölünmüş kelimeleri tek kelime olarak birleştirir.
   */
  _mergeSplitWordsAcrossLinesAndPages(preparedPages) {
    const sequence = [];
    for (const page of preparedPages) {
      for (const lineObj of page.bodyLines) {
        if (lineObj.text && lineObj.text.trim()) {
          sequence.push(lineObj);
        }
      }
    }

    for (let i = 0; i < sequence.length - 1; i++) {
      const lineA = sequence[i];
      const lineB = sequence[i + 1];

      // Başlık satırları ile normal satırları birbirine birleştirme
      if (lineA.isHeading || lineB.isHeading) continue;

      const wordsA = lineA.text.trim().split(/\s+/).filter(Boolean);
      const wordsB = lineB.text.trim().split(/\s+/).filter(Boolean);
      if (!wordsA.length || !wordsB.length) continue;

      const lastWordA = wordsA[wordsA.length - 1];
      const firstWordB = wordsB[0];

      // Önceki kelimelerde açılmış bir ara cümle kısa çizgisi (" -kelime") var mı kontrol et
      const lineABeforeLast = wordsA.slice(0, -1).join(' ');
      const hasOpenParentheticalDash = /(?:^|\s)[\-\–\—][a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(lineABeforeLast);

      const merged = this._tryMergeWordPair(lastWordA, firstWordB, { hasOpenParentheticalDash });
      if (merged) {
        if (merged.includes(' ')) {
          // Eğer ara cümle çizgisi kapandıysa ("önce– Nora'ya"), iki ayrı kelime olarak koru
          const splitParts = merged.split(/\s+/);
          wordsA[wordsA.length - 1] = splitParts[0];
          wordsB[0] = splitParts.slice(1).join(' ');
        } else {
          wordsA[wordsA.length - 1] = merged;
          wordsB.shift();
        }
        lineA.text = wordsA.join(' ');
        lineB.text = wordsB.join(' ');
      }
    }

    // Birleştirme sonucu tamamen boşalan satırları temizle
    for (const page of preparedPages) {
      page.bodyLines = page.bodyLines.filter((l) => l.text && l.text.trim().length > 0);
    }
  }

  /**
   * İki satır/sayfa sınırındaki (lastWord, nextWord) çiftinin bölünmüş bir kelime olup olmadığını
   * kontrol eder; öyleyse birleştirilmiş tam kelimeyi döndürür, değilse null döndürür.
   */
  _tryMergeWordPair(lastWord, nextWord, context = {}) {
    if (!lastWord || !nextWord) return null;
    const { hasOpenParentheticalDash = false } = context;

    // 1. DURUM: Satır/Sayfa sonu tire veya \uFFFD işareti ile hece bölmesi (Örn: "anla-" + "şılmıyor", "Haya\uFFFD" + "tımda")
    const hyphenMatch = lastWord.match(
      /^(\S*[a-zA-ZçğıöşüÇĞİÖŞÜ])([\-\u00AD\uFFFD\u2010\u2011\u2012\u2212\u00AC~]+)$/
    );
    if (hyphenMatch && /^[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(nextWord)) {
      const prefix = hyphenMatch[1];
      const hyphenChar = hyphenMatch[2];

      // Eğer satırda açılmış bir ara cümle çizgisi varsa ("-biri hariç\uFFFD" + "senin"), bunu "-biri hariç– senin" yap
      if (
        hyphenChar.includes('\uFFFD') &&
        (hasOpenParentheticalDash || (/[a-zçğıöşü]$/.test(prefix) && /^[A-ZÇĞİÖŞÜ]/.test(nextWord)))
      ) {
        return `${prefix}– ${nextWord}`;
      }

      // Alt satırdaki devam hecesi küçük harfle başlıyorsa tireyi tamamen kaldırıp birleştir
      if (/^[a-zçğıöşü]/.test(nextWord)) {
        return prefix + nextWord;
      }

      // Her iki parça da tamamen BÜYÜK HARF ise ("OKU-" + "YUCU" -> "OKUYUCU")
      const prefixLetters = prefix.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ]/g, '');
      const nextLetters = nextWord.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ]/g, '');
      if (
        prefixLetters.length >= 2 &&
        prefixLetters === prefixLetters.toUpperCase() &&
        nextLetters.length >= 1 &&
        nextLetters === nextLetters.toUpperCase()
      ) {
        return prefix + nextWord;
      }
      // Özel bileşik kelime ise ("Türk-" + "İslam" -> "Türk-İslam")
      return prefix + '–' + nextWord;
    }

    // 2. DURUM: Satır/Sayfa sonu kesme işareti (') ile bölünen özel isim veya sayı eki ("Türkiye’" + "nin" -> "Türkiye’nin")
    const apostropheMatch = lastWord.match(/^(\S*[a-zA-ZçğıöşüÇĞİÖŞÜ0-9]['’‘\`])$/);
    if (
      apostropheMatch &&
      /^[a-zçğıöşü]{1,10}(?:['"”’\.,;:\!\?\)\]\¹²³⁴⁵⁶⁷⁸⁹⁰\*†‡]|\[\d+\])*$/.test(nextWord)
    ) {
      return apostropheMatch[1] + nextWord;
    }

    // 3. DURUM: Tire işareti düşmüş ama ikinci parça Türkçe'de tek başına kelime olamayacak bir ek ise
    const cleanNext = nextWord.replace(/['"”’\.,;:\!\?\)\]]+$/, '');
    if (/[a-zçğıöşü]$/.test(lastWord) && BROKEN_SUFFIX_SET.has(cleanNext)) {
      return lastWord + nextWord;
    }

    return null;
  }

  /**
   * Üst/alt bilgi satırlarını karşılaştırırken değişen sayfa numaralarını normalize eder
   * (Örn: "İnsanın Anlam Arayışı 7" -> "insanın anlam arayışı #")
   */
  _normalizeEdgeLineForRepeatCheck(lineText) {
    if (!lineText) return '';
    const norm = lineText
      .trim()
      .toLowerCase()
      .replace(/\d+/g, '#')
      .replace(/\s+/g, ' ')
      .trim();
    return norm;
  }

  /**
   * Birden fazla sayfada en üst veya en alt satırda tekrar eden
   * kitap adı / yazar adı gibi running header/footer satırlarını bulur.
   */
  _findRepeatedHeaderFooterLines(pages) {
    const counts = new Map();
    if (pages.length < 3) return new Set();

    for (const p of pages) {
      if (!p.lines.length) continue;
      const firstRaw = p.lines[0].text.trim();
      const lastRaw = p.lines[p.lines.length - 1].text.trim();

      const first = this._normalizeEdgeLineForRepeatCheck(firstRaw);
      const last = this._normalizeEdgeLineForRepeatCheck(lastRaw);

      if (first.length > 2 && first.length < 70 && !/[.!?]$/.test(firstRaw)) {
        counts.set(first, (counts.get(first) || 0) + 1);
      }
      if (last !== first && last.length > 2 && last.length < 70 && !/[.!?]$/.test(lastRaw)) {
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

    // 2. Açık bölüm kelimeleri (BÖLÜM 1, 1. Bölüm, GİRİŞ, ÖNSÖZ, SONUÇ, CHAPTER 2, KISIM I vb.)
    if (
      /^(?:(\d{1,2}|[IVXLC]{1,5}|birinci|ikinci|üçüncü|dördüncü|beşinci)[\.\-\s]+)?(bölüm|kısım|fasıl|chapter|part|section|giriş|önsöz|sunuş|sonsöz|sonuç|epilog|prolog)(?![a-zA-ZçğıöşüÇĞİÖŞÜ0-9])/i.test(
        t
      ) &&
      words.length <= 9 &&
      !/[.!?]$/.test(t)
    ) {
      return true;
    }

    // 3. PDF'ten gelen büyük font boyutu veya kalın kısa satır
    if (
      lineObj.fontSize &&
      medianFontSize &&
      lineObj.fontSize >= medianFontSize * 1.18 &&
      words.length <= 10
    ) {
      return true;
    }

    // 4. Tamamı BÜYÜK HARF olan kısa satırlar (en az 3 harf içeren ve nokta/virgül ile bitmeyen)
    const lettersOnly = t.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ]/g, '');
    if (
      lettersOnly.length >= 4 &&
      lettersOnly === lettersOnly.toUpperCase() &&
      words.length <= 8 &&
      !/[.,;:]$/.test(t)
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

    // 6. Sayfanın ilk satırında yer alan Title-Case (Baş Harfleri Büyük) bölüm başlıkları
    // (Örn: "Yağmura Dair Bir Sohbet", "Kapıdaki Adam", "Tel Teorisi")
    if (
      lineIdx === 0 &&
      words.length >= 1 &&
      words.length <= 8 &&
      t.length <= 58 &&
      !/[.!?,;:\-\uFFFD\u00AD"“”]$/.test(t) &&
      /^[A-ZÇĞİÖŞÜ]/.test(t)
    ) {
      const significantWords = words.filter(
        (w) => !TITLE_CASE_STOPWORDS.has(w.toLowerCase().replace(/[^a-zçğıöşü]/g, ''))
      );
      const capitalizedCount = significantWords.filter((w) =>
        /^[A-ZÇĞİÖŞÜ0-9]/.test(w.replace(/^['"“‘\(]+/, ''))
      ).length;

      const nextLine = allLines[lineIdx + 1];
      const nextStartsSentence =
        !nextLine || /^[A-ZÇĞİÖŞÜ"“‘'\-\–\—]/.test(nextLine.text.trim());

      if (
        significantWords.length >= 1 &&
        capitalizedCount === significantWords.length &&
        nextStartsSentence
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Sayfa altındaki veya metin içindeki dipnot tanımlarını
   * (Örn: "1. Dipnot...", "1 Dipnot...", "[1] ...", "* ...", "• ... (ç.n.)")
   * ana metinden ayırır ve bir harita (Map) olarak döndürür.
   */
  _extractFootnotesFromLines(lines, medianFontSize) {
    const footnoteMap = new Map();
    const footnoteOrder = [];
    const bodyLines = [];

    // Sayfa gövdesinde yıldızlı dipnot işareti (*, **, ***) var mı önceden kontrol et
    const pageHasStarTrigger = lines.slice(0, -1).some((l) =>
      /[a-zA-ZçğıöşüÇĞİÖŞÜ0-9\.,;:\!\?'"”\)]\*{1,3}(?:['"”’\)\.,;:\!\?]*)(?:\s|$)/.test(l.text)
    );

    // Dipnot başlangıç kalıpları:
    // "[1] Açıklama", "(1) Açıklama", "1. Açıklama", "1 Açıklama", "¹ Açıklama", "* Açıklama", "** Açıklama", "† Açıklama", "Dipnot 1: Açıklama"
    const fnRegex =
      /^(?:\[(\d{1,3}|\*{1,4}|†|‡)\]|\((\d{1,3}|\*{1,4}|†|‡)\)|([¹²³⁴⁵⁶⁷⁸⁹⁰]+)|(\*{1,4}|†|‡)|(?:dipnot|not)\s*(\d{1,3})\s*[\:\.\-]|(\d{1,2})[\.\)]?\s+(?=[A-ZÇĞİÖŞÜ"“'‘\(]))\s*(.+)$/i;

    // OCR'da sayfa altındaki yıldız (*) işaretinin •, ', ", "' olarak çıkma durumu
    const ocrStarFnRegex = /^([\•\'\"\"'']{1,3})\s+([A-ZÇĞİÖŞÜ"“'‘].+)$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const t = line.text.trim();

      const isExplicitFn =
        /^(\[\d{1,3}\]|\(\d{1,3}\)|[¹²³⁴⁵⁶⁷⁸⁹⁰]+|\*{1,4}|†|‡|(?:dipnot|not)\s*\d+)/i.test(t);
      const isBottomArea =
        i >= Math.floor(lines.length * 0.45) ||
        i >= lines.length - 6 ||
        (line.yRatio && line.yRatio > 0.65);
      const isSmallerFont =
        line.fontSize && medianFontSize && line.fontSize < medianFontSize * 0.92;
      const hasTranslatorNoteTag = /\((?:ç\.\s*n\.|ed\.\s*n\.|y\.\s*n\.)\)/i.test(t);

      let match = t.match(fnRegex);
      let rawMarker = null;
      let fnContent = null;

      if (match && (isExplicitFn || isBottomArea || isSmallerFont)) {
        rawMarker = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
        fnContent = match[7].trim();

        // Eğer "1. Bölüm" veya "2. Kısım" gibi bir başlıksa dipnot sanma!
        if (
          match[6] &&
          (/^(bölüm|kısım|fasıl|chapter|part)\b/i.test(fnContent) ||
            (fnContent.split(/\s+/).length <= 3 && !/[.!?]$/.test(fnContent) && !isSmallerFont && !hasTranslatorNoteTag))
        ) {
          bodyLines.push(line);
          continue;
        }
      } else if (isBottomArea && (pageHasStarTrigger || hasTranslatorNoteTag)) {
        const ocrStarMatch = t.match(ocrStarFnRegex);
        if (ocrStarMatch) {
          rawMarker = '*';
          fnContent = ocrStarMatch[2].trim();
        }
      }

      if (rawMarker && fnContent) {
        const key = this.normalizeMarker(rawMarker);
        const displayMarker = /^[\•\'\"\"'']+$/.test(rawMarker) ? '*' : rawMarker;

        const fnObj = {
          key,
          displayMarker,
          text: fnContent,
          used: false
        };
        if (!footnoteMap.has(key)) {
          footnoteMap.set(key, fnObj);
        }
        footnoteOrder.push(fnObj);

        // Sayfanın alt kısmında başlayan dipnotun devam satırlarını (yeni bir dipnot başlamadığı sürece) birleştir
        while (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const nextText = nextLine.text.trim();
          const nextMatchesFn =
            fnRegex.test(nextText) ||
            ((pageHasStarTrigger || /\((?:ç\.n\.|ed\.n\.)\)/i.test(nextText)) &&
              ocrStarFnRegex.test(nextText));

          if (!nextMatchesFn && (isBottomArea || i + 1 >= lines.length - 4)) {
            fnObj.text += ' ' + this._cleanIntraLineHyphens(nextText);
            i++;
          } else {
            break;
          }
        }
        fnObj.text = this._cleanIntraLineHyphens(fnObj.text);
      } else {
        bodyLines.push(line);
      }
    }

    return { bodyLines, footnoteMap, footnoteOrder };
  }

  /**
   * Kelime üzerindeki dipnot işaretlerini
   * (kavram¹, kelime[1], kelime*, çünkü.*", Auschwitz!”3, (epifenomen)9, niteler.1 vb.) yakalar.
   */
  _detectWordFootnoteMarkers(rawWord, footnoteMap, footnoteOrder) {
    if (!rawWord || footnoteOrder.length === 0) {
      return { cleanWord: rawWord, markers: [] };
    }

    let word = rawWord;
    const markers = [];

    // 1. Üst simge rakamlar: kelime¹ veya kelime.”¹
    const superMatch = word.match(/([¹²³⁴⁵⁶⁷⁸⁹⁰]+)(['"”’\)\]\.,;:\!\?]*)$/);
    if (superMatch) {
      const m = this.normalizeMarker(superMatch[1]);
      if (footnoteMap.has(m) || footnoteOrder.length > 0) {
        markers.push(m);
        word = word.slice(0, superMatch.index) + superMatch[2];
      }
    }

    // 2. Köşeli veya normal parantezli dipnot: kelime[1], [1], kelime(1)
    const bracketMatch = word.match(/[\[\(](\d{1,3}|\*{1,4}|†|‡)[\]\)](['"”’\)\]\.,;:\!\?]*)$/);
    if (bracketMatch) {
      const m = this.normalizeMarker(bracketMatch[1]);
      if (footnoteMap.has(m)) {
        markers.push(m);
        word = word.slice(0, bracketMatch.index) + bracketMatch[2];
      }
    }

    // 3. Yıldız veya kama işaretleri: kelime*, çünkü.*", işte..."*, kelime**
    const starMatch = word.match(/(\*{1,4}|†|‡)(['"”’\)\]\.,;:\!\?]*)$/);
    if (starMatch && word.length > starMatch[1].length) {
      const m = this.normalizeMarker(starMatch[1]);
      if (footnoteMap.has(m) || footnoteOrder.some((fn) => fn.key.startsWith('*') && !fn.used)) {
        markers.push(m);
        word = word.slice(0, starMatch.index) + starMatch[2];
      }
    }

    // 4. PDF/OCR metin katmanında kelime veya noktalama/tırnak/parantez sonuna yapışmış dipnot rakamı:
    // Örn: "kavram1", "dönemi.2", "Auschwitz!”3", "biliyormuş).5", "(epifenomen)9", "olabilir,”10"
    if (markers.length === 0) {
      const attachedNumMatch = word.match(
        /^(\S*[a-zA-ZçğıöşüÇĞİÖŞÜ]['"”’\)\]\.,;:\!\?]*)(\d{1,2})(['"”’\)\]\.,;:\!\?]*)$/
      );
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
   * Her sayfa bittiğinde onProgress ve onPageReady çağırarak
   * ilk içerik sayfası hazır olur olmaz hemen okuma yapılabilmesini sağlar!
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
    let firstContentReady = false;

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

      // Akışlı (Streaming) güncelleme: İlk ana metin sayfası hazır olduğunda veya OCR/periyodik adımlarda okuyucuyu besle
      if (onPageReady && (!firstContentReady || usedOCR || pageNum % 25 === 0 || pageNum === numPages)) {
        const partialBook = this.buildStructuredBook(extractedPages, {
          skipBoilerplate,
          detectHeadings,
          inlineFootnotes,
          expectedTotalPages: numPages
        });
        if (partialBook.tokens.length > 1) {
          firstContentReady = true;
          onPageReady(partialBook, pageNum, numPages, usedOCR);
        }
      }
    }

    const finalBook = this.buildStructuredBook(extractedPages, {
      skipBoilerplate,
      detectHeadings,
      inlineFootnotes,
      expectedTotalPages: numPages
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
          width: it.width || 0,
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
    const lineFontSize = lineGroup.maxFontSize || 12;

    for (let i = 0; i < lineGroup.items.length; i++) {
      const curr = lineGroup.items[i];
      if (i > 0) {
        const prev = lineGroup.items[i - 1];
        const isBracketFn = /^\[\d+\]$/.test(curr.str);
        const isTrailingPunctOrHyphen =
          /^[\-\u00AD\uFFFD\u2010\u2011\u2012\u2013\u00AC'’”\)\]\.,;:\!\?]+$/.test(curr.str.trim());
        const prevEndsWithJoiner = /['’‘“\(\[\-\u00AD\uFFFD\u2010\u2011]$/.test(prev.str.trim());

        // PDF.js aynı kelimenin harflerini/hecelerini bazen ayrı item olarak verir.
        // Yatay boşluk (gap) küçükse aynı kelimenin parçasıdır, araya boşluk koyma!
        let hasHorizontalGap = true;
        if (prev.width && prev.width > 0) {
          const gap = curr.x - (prev.x + prev.width);
          const bothLowerLetters =
            /[a-zçğıöşü]$/.test(prev.str.trim()) && /^[a-zçğıöşü]/.test(curr.str.trim());
          const threshold = bothLowerLetters ? lineFontSize * 0.22 : lineFontSize * 0.14;
          if (gap < threshold) {
            hasHorizontalGap = false;
          }
        }

        if (
          hasHorizontalGap &&
          !isBracketFn &&
          !isTrailingPunctOrHyphen &&
          !prevEndsWithJoiner &&
          !text.endsWith(' ') &&
          !curr.str.startsWith(' ')
        ) {
          text += ' ';
        }
      }
      text += curr.str;
    }

    return {
      text: this._cleanIntraLineHyphens(text.replace(/\s+/g, ' ').trim()),
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
        if (
          m.status === 'recognizing text' &&
          typeof m.progress === 'number' &&
          onRecognizeProgress
        ) {
          onRecognizeProgress(m.progress);
        }
      }
    });

    return (result && result.data && result.data.text) || '';
  }

  // ==========================================================================
  // ONLINE PDF LİNKİ & AKILLI WEB SİTESİ / HABER ANA METİN ÇEKİCİ (URL LOADER)
  // ==========================================================================

  /**
   * Kullanıcının girdiği URL'yi normalize eder (Google Drive, Dropbox, GitHub PDF linklerini
   * doğrudan indirilebilir formata çevirir).
   */
  normalizeInputUrl(rawUrl) {
    let url = (rawUrl || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    // Google Drive paylaşım linki -> Doğrudan indirme linki
    const gdriveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
    if (gdriveMatch) {
      return `https://drive.google.com/uc?export=download&id=${gdriveMatch[1]}`;
    }

    // Dropbox paylaşım linki -> dl=1
    if (/dropbox\.com\//i.test(url) && url.includes('dl=0')) {
      return url.replace('dl=0', 'dl=1');
    }

    // GitHub blob PDF linki -> raw.githubusercontent.com
    const ghMatch = url.match(
      /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/(.+\.pdf)(?:\?.*)?$/i
    );
    if (ghMatch) {
      return `https://raw.githubusercontent.com/${ghMatch[1]}/${ghMatch[2]}/${ghMatch[3]}`;
    }

    return url;
  }

  /**
   * Bir ArrayBuffer'ın gerçek bir PDF dosyası (%PDF- imzalı) olup olmadığını kontrol eder.
   */
  _isPdfBuffer(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 8) return false;
    const bytes = new Uint8Array(arrayBuffer, 0, Math.min(1024, arrayBuffer.byteLength));
    let ascii = '';
    for (let i = 0; i < bytes.length; i++) {
      ascii += String.fromCharCode(bytes[i]);
    }
    return ascii.includes('%PDF-');
  }

  /**
   * URL'den okunabilir bir belge başlığı veya dosya adı çıkarır.
   */
  _deriveTitleFromUrl(url, isPdf = false) {
    try {
      const u = new URL(url);
      const segments = u.pathname.split('/').filter(Boolean);
      const lastSeg = decodeURIComponent(segments[segments.length - 1] || u.hostname);
      if (isPdf) {
        return lastSeg.toLowerCase().endsWith('.pdf') ? lastSeg : `${lastSeg}.pdf`;
      }
      const cleanSlug = lastSeg
        .replace(/\.(html?|php|aspx?|jsp)$/i, '')
        .replace(/[\-_]+/g, ' ')
        .trim();
      return cleanSlug.length >= 4 ? `${u.hostname} — ${cleanSlug}` : u.hostname;
    } catch (e) {
      return isPdf ? 'Online PDF Belgesi.pdf' : 'Web Makalesi';
    }
  }

  /**
   * Verilen URL'yi analiz eder:
   * - Eğer bir PDF linkiyse (veya içerik PDF ise) ArrayBuffer olarak indirir ve { kind: 'pdf', arrayBuffer, title } döndürür.
   * - Eğer bir Haber / Makale / Web Sitesi linkiyse menüleri, reklamları ve yan linkleri temizleyip
   *   sadece ana haber başlığını ve ana metni çeker, { kind: 'article', title, text } döndürür.
   */
  async fetchUrlContent(rawUrl, onStatus) {
    const targetUrl = this.normalizeInputUrl(rawUrl);
    if (!targetUrl) {
      throw new Error('Geçerli bir internet adresi (URL) girin.');
    }

    const looksLikePdfUrl =
      /\.pdf($|\?|#)/i.test(targetUrl) ||
      /drive\.google\.com\/uc\?export=download/i.test(targetUrl) ||
      /arxiv\.org\/pdf\//i.test(targetUrl);

    // 1. DURUM: URL açıkça bir PDF işaret ediyorsa önce binary PDF olarak indirmeyi dene
    if (looksLikePdfUrl) {
      if (onStatus) onStatus('⏳ Online PDF dosyası indiriliyor...');
      const pdfBuf = await this._fetchBinaryPdfWithFallbacks(targetUrl, onStatus);
      if (pdfBuf && this._isPdfBuffer(pdfBuf)) {
        return {
          kind: 'pdf',
          arrayBuffer: pdfBuf,
          title: this._deriveTitleFromUrl(targetUrl, true),
          sourceUrl: targetUrl
        };
      }
    }

    // 2. DURUM: Web Sayfası / Haber Linki (veya uzantısız PDF linki)
    if (onStatus) onStatus('⏳ Web sayfası / haber içeriği bağlanıyor...');
    const fetched = await this._fetchHtmlOrPdfWithFallbacks(targetUrl, onStatus);

    if (fetched && fetched.kind === 'pdf') {
      return {
        kind: 'pdf',
        arrayBuffer: fetched.arrayBuffer,
        title: this._deriveTitleFromUrl(targetUrl, true),
        sourceUrl: targetUrl
      };
    }

    let extracted = null;
    if (fetched && fetched.html) {
      if (onStatus) onStatus('🧠 Reklamlar ve menüler temizleniyor, ana haber metni ayıklanıyor...');
      extracted = this.extractMainArticleFromHtml(fetched.html, targetUrl);
    }

    // Eğer sayfa JavaScript (SPA) tabanlıysa veya HTML'den yeterli metin çıkmadıysa (< 40 kelime)
    // Jina Reader motoruyla (headless render) ana metni çekmeyi dene
    const wordCount = extracted && extracted.text ? extracted.text.split(/\s+/).filter(Boolean).length : 0;
    if (wordCount < 40) {
      if (onStatus) onStatus('⚡ Dinamik web sayfası ana metin motoruyla çözümleniyor...');
      const jinaResult = await this._fetchArticleViaJinaReader(targetUrl);
      if (jinaResult && jinaResult.text.split(/\s+/).filter(Boolean).length > wordCount) {
        extracted = jinaResult;
      }
    }

    if (!extracted || !extracted.text || extracted.text.trim().length < 25) {
      throw new Error(
        'Bu linkten okunabilir bir ana metin veya PDF çekilemedi. Site erişime kapalı olabilir veya geçerli bir makale içermiyor olabilir.'
      );
    }

    return {
      kind: 'article',
      title: extracted.title || this._deriveTitleFromUrl(targetUrl, false),
      text: extracted.text,
      sourceUrl: targetUrl
    };
  }

  /**
   * CORS engellerini aşmak için çok katmanlı proxy zinciri ile binary PDF indirir.
   */
  async _fetchBinaryPdfWithFallbacks(targetUrl, onStatus) {
    const endpoints = [
      { name: 'Doğrudan Bağlantı', url: targetUrl },
      { name: 'Proxy 1 (CorsProxy)', url: `https://corsproxy.io/?${encodeURIComponent(targetUrl)}` },
      { name: 'Proxy 2 (CodeTabs)', url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}` },
      { name: 'Proxy 3 (AllOrigins)', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}` }
    ];

    for (const ep of endpoints) {
      try {
        if (onStatus) onStatus(`⏳ Online PDF indiriliyor (${ep.name})...`);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 18000);
        const res = await fetch(ep.url, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        if (this._isPdfBuffer(buf)) {
          return buf;
        }
      } catch (err) {
        // Sıradaki proxy'ye geç
      }
    }
    return null;
  }

  /**
   * Web sayfasının HTML kaynağını (veya uzantısız PDF ise binary verisini) çok katmanlı olarak çeker.
   */
  async _fetchHtmlOrPdfWithFallbacks(targetUrl, onStatus) {
    // 1. AllOrigins JSON (Tarayıcı CORS politikalarına hiç takılmaz ve karakter kodlamasını korur)
    const attempts = [
      async () => {
        const res = await this._fetchWithTimeout(targetUrl, 8000);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        if (this._isPdfBuffer(buf)) return { kind: 'pdf', arrayBuffer: buf };
        return { kind: 'html', html: this._decodeHtmlBuffer(buf, res.headers.get('content-type')) };
      },
      async () => {
        if (onStatus) onStatus('⏳ Haber sayfası çekiliyor (AllOrigins)...');
        const apiUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
        const res = await this._fetchWithTimeout(apiUrl, 12000);
        if (!res.ok) return null;
        const data = await res.json();
        if (data && typeof data.contents === 'string' && data.contents.length > 100) {
          if (data.contents.startsWith('%PDF-')) {
            const rawRes = await this._fetchWithTimeout(
              `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
              14000
            );
            if (rawRes.ok) {
              const buf = await rawRes.arrayBuffer();
              if (this._isPdfBuffer(buf)) return { kind: 'pdf', arrayBuffer: buf };
            }
          }
          return { kind: 'html', html: data.contents };
        }
        return null;
      },
      async () => {
        if (onStatus) onStatus('⏳ Haber sayfası çekiliyor (CodeTabs)...');
        const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`;
        const res = await this._fetchWithTimeout(proxyUrl, 12000);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        if (this._isPdfBuffer(buf)) return { kind: 'pdf', arrayBuffer: buf };
        return { kind: 'html', html: this._decodeHtmlBuffer(buf, res.headers.get('content-type')) };
      },
      async () => {
        if (onStatus) onStatus('⏳ Haber sayfası çekiliyor (CorsProxy)...');
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
        const res = await this._fetchWithTimeout(proxyUrl, 12000);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        if (this._isPdfBuffer(buf)) return { kind: 'pdf', arrayBuffer: buf };
        return { kind: 'html', html: this._decodeHtmlBuffer(buf, res.headers.get('content-type')) };
      }
    ];

    for (const fn of attempts) {
      try {
        const result = await fn();
        if (result && (result.kind === 'pdf' || (result.html && result.html.length > 80))) {
          return result;
        }
      } catch (e) {
        // Sıradaki yöntemi dene
      }
    }
    return null;
  }

  async _fetchWithTimeout(url, timeoutMs = 10000, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Türkçe web sitelerindeki UTF-8 veya windows-1254 / iso-8859-9 karakter kodlamalarını doğru çözümler.
   */
  _decodeHtmlBuffer(arrayBuffer, contentTypeHeader = '') {
    const utf8Text = new TextDecoder('utf-8').decode(arrayBuffer);
    const charsetMatch =
      (contentTypeHeader || '').match(/charset=([^\s;]+)/i) ||
      utf8Text.slice(0, 2048).match(/charset=["']?([a-zA-Z0-9_\-]+)["']?/i);

    if (charsetMatch) {
      const charset = charsetMatch[1].toLowerCase();
      if (charset.includes('1254') || charset.includes('8859-9') || charset === 'turkish') {
        try {
          return new TextDecoder('windows-1254').decode(arrayBuffer);
        } catch (e) {
          return utf8Text;
        }
      }
    }
    return utf8Text;
  }

  /**
   * Dinamik (JavaScript/SPA) haber ve makale siteleri için Jina Reader yedek motoru
   */
  async _fetchArticleViaJinaReader(targetUrl) {
    try {
      const jinaUrl = `https://r.jina.ai/${targetUrl}`;
      const res = await this._fetchWithTimeout(jinaUrl, 14000, {
        headers: {
          Accept: 'text/plain'
        }
      });
      if (!res.ok) return null;
      const raw = await res.text();
      if (!raw || raw.length < 60) return null;

      let title = '';
      const titleMatch = raw.match(/^Title:\s*(.+)$/m);
      if (titleMatch) {
        title = this._cleanArticleTitle(titleMatch[1].trim());
      }

      // Markdown meta satırlarını, resim/link kalıntılarını ve menü satırlarını temizle
      const bodyRaw = raw
        .replace(/^Title:.*$/gm, '')
        .replace(/^URL Source:.*$/gm, '')
        .replace(/^Published Time:.*$/gm, '')
        .replace(/^Markdown Content:\s*/gm, '')
        .replace(/!\[[^\]]*\]\([^\)]*\)/g, '') // Resimleri kaldır
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'); // Markdown linklerini düz metne çevir

      const rawLines = bodyRaw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      const cleanLines = this._filterNewsBoilerplateLines(rawLines, title);
      if (!cleanLines.length) return null;

      const finalLines = title ? [`# ${title}`, ...cleanLines] : cleanLines;
      return {
        title: title || this._deriveTitleFromUrl(targetUrl, false),
        text: finalLines.join('\n\n')
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Bir haber sitesinin veya makalenin ham HTML'ini analiz ederek:
   * - Menüleri, reklamları, yan sütunları, "İlgili Haberler / Çok Okunanlar" listelerini,
   *   sosyal medya butonlarını, etiketleri ve alt bilgileri (footer) tamamen çöpe atar.
   * - Sadece Haberin/Makalenin Ana Başlığını, Spotunu (Özetini), Alt Başlıklarını ve Ana Metnini çıkarır!
   */
  extractMainArticleFromHtml(htmlString, pageUrl = '') {
    if (!htmlString) return null;

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    // Relative linklerin Readability'de hata vermemesi için <base> ekle
    if (pageUrl && doc.head && !doc.querySelector('base')) {
      try {
        const baseEl = doc.createElement('base');
        baseEl.setAttribute('href', pageUrl);
        doc.head.insertBefore(baseEl, doc.head.firstChild);
      } catch (e) {}
    }

    // 1. AŞAMA: JSON-LD (Yapısal Haber Verisi: NewsArticle / Article / BlogPosting) Analizi
    // Türkiye'deki ve dünyadaki haber sitelerinin %90'ı saf haber metnini JSON-LD articleBody içinde tutar!
    const jsonLdData = this._extractJsonLdArticleData(doc);

    // 2. AŞAMA: Haberin / Makalenin Ana Başlığını (Headline) Tespit Et
    const rawTitle =
      jsonLdData.headline ||
      this._getMetaContent(doc, 'meta[property="og:title"]') ||
      this._getMetaContent(doc, 'meta[name="twitter:title"]') ||
      (doc.querySelector('article h1, main h1, h1.title, h1.news-title, h1.haber-baslik, h1') || {})
        .textContent ||
      doc.title ||
      '';
    const cleanTitle = this._cleanArticleTitle(rawTitle);

    // Haberin Spotu / Özeti (Lead / Description)
    const rawLead =
      jsonLdData.description ||
      (
        doc.querySelector(
          '[itemprop="description"], .article-lead, .news-spot, .haber-spot, .spot, .lead, h2.spot'
        ) || {}
      ).textContent ||
      this._getMetaContent(doc, 'meta[property="og:description"]') ||
      '';
    const cleanLead = this._normalizeWhitespace(rawLead);

    // 3. AŞAMA: DOM Ağacındaki Reklam, Menü, İlgili Haberler ve Gürültü Elementlerini Temizle
    this._stripNoiseFromArticleDom(doc);

    // 4. AŞAMA: Üç Aday Motoru Çalıştır ve En Temiz / En Kapsamlı Ana Metni Seç!
    // Aday 1: JSON-LD articleBody (Saf haber metni)
    const jsonLdLines = jsonLdData.articleBody
      ? this._filterNewsBoilerplateLines(
          this._splitArticleBodyIntoLines(jsonLdData.articleBody),
          cleanTitle
        )
      : [];

    // Aday 2: Özel Haber & Makale Konteyner Puanlayıcı (DOM Scorer)
    const domScoredLines = this._filterNewsBoilerplateLines(
      this._extractLinesViaDomScorer(doc),
      cleanTitle
    );

    // Aday 3: Mozilla Readability Motoru
    let readabilityLines = [];
    if (window.Readability) {
      try {
        const docClone = doc.cloneNode(true);
        const reader = new window.Readability(docClone, { charThreshold: 120 });
        const parsed = reader.parse();
        if (parsed && parsed.content) {
          readabilityLines = this._filterNewsBoilerplateLines(
            this._htmlFragmentToStructuredLines(parsed.content),
            cleanTitle
          );
        }
      } catch (e) {}
    }

    // En iyi sonucu seç:
    // DOM veya Readability alt başlıkları da koruduğu için, yeterli kelimeye sahipse ve JSON-LD'den
    // aşırı kısa değilse onları tercih et; aksi halde saf JSON-LD articleBody'yi kullan.
    const countWords = (arr) => arr.join(' ').split(/\s+/).filter(Boolean).length;
    const wJson = countWords(jsonLdLines);
    const wDom = countWords(domScoredLines);
    const wRead = countWords(readabilityLines);

    let chosenLines = [];
    if (wDom >= 45 && wDom >= wJson * 0.75 && wDom >= wRead * 0.85) {
      chosenLines = domScoredLines;
    } else if (wRead >= 45 && wRead >= wJson * 0.75) {
      chosenLines = readabilityLines;
    } else if (wJson >= 25) {
      chosenLines = jsonLdLines;
    } else {
      // Hangisi en uzunsa onu al
      chosenLines = [jsonLdLines, domScoredLines, readabilityLines].sort(
        (a, b) => countWords(b) - countWords(a)
      )[0];
    }

    // Eğer haberin spotu (özeti) ana metnin ilk paragrafında henüz yoksa ve anlamlı bir cümleyse en başa ekle
    if (
      cleanLead &&
      cleanLead.split(/\s+/).length >= 6 &&
      cleanLead.length <= 420 &&
      chosenLines.length > 0
    ) {
      const firstParaLower = chosenLines[0].toLowerCase();
      const leadLower = cleanLead.toLowerCase();
      if (
        !firstParaLower.includes(leadLower.slice(0, 35)) &&
        !leadLower.includes(firstParaLower.slice(0, 35)) &&
        (!cleanTitle || leadLower !== cleanTitle.toLowerCase())
      ) {
        chosenLines.unshift(cleanLead);
      }
    }

    // En başa Haberin Ana Başlığını (# Başlık olarak) yerleştir
    const finalOutputLines = [];
    if (cleanTitle) {
      finalOutputLines.push(`# ${cleanTitle}`);
    }
    for (const line of chosenLines) {
      if (cleanTitle && line.replace(/^#+\s*/, '').toLowerCase() === cleanTitle.toLowerCase()) {
        continue;
      }
      finalOutputLines.push(line);
    }

    return {
      title: cleanTitle,
      text: finalOutputLines.join('\n\n')
    };
  }

  _getMetaContent(doc, selector) {
    const el = doc.querySelector(selector);
    return el ? (el.getAttribute('content') || '').trim() : '';
  }

  _normalizeWhitespace(str) {
    return (str || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Haber başlıklarının sonundaki site adı uzantılarını (" - Son Dakika Haberleri | Habertürk" vb.) temizler.
   */
  _cleanArticleTitle(rawTitle) {
    let t = this._normalizeWhitespace(rawTitle);
    if (!t) return '';
    // " | Site Adı" veya " - Site Adı" uzantısını temizle (ancak başlığın kendisi çok kısalmasın)
    const parts = t.split(/\s+[\|\-\–\—]\s+/);
    if (parts.length > 1 && parts[0].split(/\s+/).length >= 3) {
      t = parts[0].trim();
    }
    return t;
  }

  /**
   * Sayfadaki <script type="application/ld+json"> etiketlerinden NewsArticle / Article / BlogPosting verisini çeker.
   */
  _extractJsonLdArticleData(doc) {
    const result = { headline: '', description: '', articleBody: '' };
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');

    const inspectObject = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach(inspectObject);
        return;
      }
      if (obj['@graph'] && Array.isArray(obj['@graph'])) {
        obj['@graph'].forEach(inspectObject);
      }

      const typeVal = Array.isArray(obj['@type'])
        ? obj['@type'].join(' ')
        : String(obj['@type'] || '');
      const isArticleType =
        /Article|NewsArticle|BlogPosting|Reportage|Analysis|Opinion|WebPage/i.test(typeVal) ||
        Boolean(obj.articleBody);

      if (isArticleType) {
        if (!result.headline && typeof obj.headline === 'string') {
          result.headline = this._decodeHtmlEntities(obj.headline);
        }
        if (!result.description && typeof obj.description === 'string') {
          result.description = this._decodeHtmlEntities(obj.description);
        }
        if (typeof obj.articleBody === 'string') {
          const decodedBody = this._decodeHtmlEntities(obj.articleBody);
          if (decodedBody.length > result.articleBody.length) {
            result.articleBody = decodedBody;
          }
        }
      }
    };

    scripts.forEach((scr) => {
      const raw = (scr.textContent || '').trim();
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        inspectObject(parsed);
      } catch (e) {
        // Bozuk JSON-LD içinde articleBody varsa regex ile kurtar
        const bodyMatch = raw.match(/"articleBody"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (bodyMatch) {
          try {
            const unescaped = JSON.parse(`"${bodyMatch[1]}"`);
            const decoded = this._decodeHtmlEntities(unescaped);
            if (decoded.length > result.articleBody.length) {
              result.articleBody = decoded;
            }
          } catch (err2) {}
        }
      }
    });

    return result;
  }

  _decodeHtmlEntities(str) {
    if (!str) return '';
    const txt = document.createElement('textarea');
    // Eğer metin içinde HTML etiketleri (<p>, <br>) varsa satır sonuna çevir
    const withBreaks = String(str)
      .replace(/<\s*(?:br|\/p|\/div|\/h[1-6]|\/li)\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');
    txt.innerHTML = withBreaks;
    return txt.value;
  }

  _splitArticleBodyIntoLines(rawBody) {
    if (!rawBody) return [];
    const lines = rawBody
      .split(/\r?\n+/)
      .map((l) => this._normalizeWhitespace(l))
      .filter((l) => l.length > 0);
    return lines;
  }

  /**
   * DOM ağacından menü, reklam, ilgili haberler, yorumlar, sosyal medya, etiketler ve alt bilgileri siler.
   */
  _stripNoiseFromArticleDom(doc) {
    const removeSelectors = [
      'script',
      'style',
      'noscript',
      'iframe',
      'svg',
      'canvas',
      'form',
      'nav',
      'footer',
      'aside',
      'button',
      'input',
      'select',
      'textarea',
      'dialog',
      'menu',
      'figcaption',
      'header:not(article header)',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      '[role="complementary"]',
      '[aria-hidden="true"]',
      '.ad',
      '.ads',
      '.advert',
      '.advertisement',
      '.reklam',
      '.sponsor',
      '.related',
      '.related-news',
      '.related-posts',
      '.related-articles',
      '.ilgili-haber',
      '.ilgili-haberler',
      '.benzer-haberler',
      '.cok-okunanlar',
      '.populer-haberler',
      '.recommended',
      '.more-stories',
      '.comments',
      '.comment-section',
      '.yorumlar',
      '#comments',
      '#disqus_thread',
      '.share',
      '.social',
      '.social-share',
      '.paylas',
      '.etiketler',
      '.tags',
      '.tag-list',
      '.breadcrumb',
      '.breadcrumbs',
      '.pagination',
      '.newsletter',
      '.abone',
      '.cookie',
      '.consent',
      '.popup',
      '.modal',
      '.sidebar',
      '.widget',
      '.author-bio',
      '.author-box',
      '.yazar-kutusu',
      '.read-more',
      '.devami',
      '.gallery-thumbs',
      '.next-prev',
      '.post-navigation'
    ];

    try {
      doc.querySelectorAll(removeSelectors.join(',')).forEach((el) => el.remove());
    } catch (e) {}

    // Class veya ID içinde gürültü kelimesi geçen yan/alt blokları temizle (ancak body/main/article'a dokunma)
    const noiseRegex =
      /(^|[\-_\s])(nav|navbar|menu|sidebar|footer|breadcrumb|comment|yorum|share|paylas|social|related|ilgili|benzer|reklam|advert|sponsor|banner|popup|modal|cookie|consent|newsletter|abone|tags|etiket|widget|most-read|cok-okunan|recommended|outbrain|taboola|read-more|haberi-goruntule|son-dakika-bar|breaking-bar)($|[\-_\s])/i;

    const allElements = Array.from(doc.querySelectorAll('div, section, ul, ol, aside'));
    for (const el of allElements) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'body' || tag === 'main' || tag === 'article') continue;
      if (el.querySelector('article, [itemprop="articleBody"]')) continue;

      const attrStr = `${el.className || ''} ${el.id || ''}`;
      if (noiseRegex.test(attrStr)) {
        el.remove();
      }
    }
  }

  /**
   * DOM içindeki paragraf yoğunluğu, noktalama sayısı ve düşük link yoğunluğuna göre
   * gerçek haber/makale gövdesini bulur ve alt başlıklarla birlikte satır listesi döndürür.
   */
  _extractLinesViaDomScorer(doc) {
    if (!doc || !doc.body) return [];

    // Öncelikli semantik haber konteynerleri
    const semanticSelectors = [
      '[itemprop="articleBody"]',
      'article .article-body',
      'article .news-body',
      'article .haber-metni',
      'article .detay-metin',
      '.article-body',
      '.article-content',
      '.news-content',
      '.news-body',
      '.haber-detay',
      '.haber-metni',
      '.detay-icerik',
      '.post-content',
      '.entry-content',
      '.story-body',
      'article',
      'main'
    ];

    const candidates = new Map();

    const addScore = (node, pts) => {
      if (!node || node.nodeType !== 1) return;
      candidates.set(node, (candidates.get(node) || 0) + pts);
    };

    // Semantik seçicilere başlangıç bonusu ver
    semanticSelectors.forEach((sel, idx) => {
      doc.querySelectorAll(sel).forEach((el) => {
        addScore(el, Math.max(25, 90 - idx * 5));
      });
    });

    // Tüm anlamlı paragrafları tara ve üst kapsayıcılarına puan ver
    const paragraphs = Array.from(doc.querySelectorAll('p, div.paragraph, .text-block'));
    for (const p of paragraphs) {
      const text = this._normalizeWhitespace(p.textContent);
      if (text.length < 35) continue;

      // Link yoğunluğu yüksekse (menü veya "İlgili Haberler" listesiyse) puan verme
      const linkDensity = this._calculateLinkDensity(p);
      if (linkDensity > 0.45) continue;

      const commaCount = (text.match(/[,;:]/g) || []).length;
      const wordCount = text.split(/\s+/).length;
      const score = 10 + Math.min(35, Math.floor(wordCount / 4)) + commaCount * 3;

      const parent = p.parentElement;
      const grandParent = parent ? parent.parentElement : null;
      if (parent) addScore(parent, score);
      if (grandParent) addScore(grandParent, Math.floor(score * 0.55));
    }

    // En yüksek puanlı kapsayıcıyı seç (link yoğunluğu cezasını uygula)
    let bestContainer = doc.querySelector('article, [itemprop="articleBody"], main') || doc.body;
    let bestScore = -1;

    for (const [container, rawScore] of candidates.entries()) {
      const linkDensity = this._calculateLinkDensity(container);
      const finalScore = rawScore * (1 - Math.min(0.85, linkDensity));
      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestContainer = container;
      }
    }

    return this._extractStructuredLinesFromElement(bestContainer);
  }

  _calculateLinkDensity(el) {
    if (!el) return 0;
    const totalLen = (el.textContent || '').replace(/\s+/g, '').length;
    if (totalLen === 0) return 0;
    let linkLen = 0;
    el.querySelectorAll('a').forEach((a) => {
      linkLen += (a.textContent || '').replace(/\s+/g, '').length;
    });
    return linkLen / totalLen;
  }

  _htmlFragmentToStructuredLines(htmlFragment) {
    const parser = new DOMParser();
    const fragDoc = parser.parseFromString(htmlFragment, 'text/html');
    return this._extractStructuredLinesFromElement(fragDoc.body);
  }

  /**
   * Seçilen ana makale konteynerinin içindeki alt başlıkları (h2, h3) ve paragrafları (p, blockquote, li)
   * okuma sırasına göre çıkarır.
   */
  _extractStructuredLinesFromElement(rootEl) {
    if (!rootEl) return [];
    const lines = [];
    const seen = new Set();

    const blocks = Array.from(rootEl.querySelectorAll('h2, h3, h4, p, blockquote, li'));
    if (blocks.length === 0) {
      return this._splitArticleBodyIntoLines(rootEl.textContent || '');
    }

    for (const block of blocks) {
      // İç içe bloklarda mükerrer okumayı engelle
      if (block.tagName !== 'LI' && block.querySelector('p, h2, h3')) continue;

      const linkDensity = this._calculateLinkDensity(block);
      const text = this._normalizeWhitespace(block.textContent);
      if (!text) continue;

      const tag = block.tagName.toLowerCase();
      const isSubheading = tag === 'h2' || tag === 'h3' || tag === 'h4';

      // Çok kısa veya tamamen linkten oluşan liste/navigasyon satırlarını atla
      if (tag === 'li' && (text.length < 40 || linkDensity > 0.35 || !/[.!?]$/.test(text))) {
        continue;
      }
      if (!isSubheading && linkDensity > 0.5 && text.length < 180) {
        continue;
      }
      if (isSubheading && (text.length < 3 || text.length > 140 || linkDensity > 0.4)) {
        continue;
      }

      const normKey = text.toLowerCase();
      if (seen.has(normKey)) continue;
      seen.add(normKey);

      if (isSubheading) {
        lines.push(`# ${text.replace(/^#+\s*/, '')}`);
      } else {
        lines.push(text);
      }
    }

    return lines;
  }

  /**
   * Haber sitelerinin paragraf aralarına sıkıştırdığı reklam, "İlgili Haber",
   * "Google News'te takip edin", "Abone ol", "Haberi Görüntüle" gibi cümleleri temizler.
   */
  _filterNewsBoilerplateLines(rawLines, articleTitle = '') {
    if (!Array.isArray(rawLines)) return [];
    const out = [];
    const seen = new Set();
    const titleLower = (articleTitle || '').toLowerCase().trim();

    const junkLineRegex =
      /^(haberi\s+görüntüle|haberin\s+devamı|devamı\s+için\s+tıkla|ilgili\s+haber|benzer\s+haberler|bizi\s+google\s+news|google\s+news['’]?te\s+takip|abone\s+ol|yorum\s+yaz|paylaş|etiketler\s*:|kaynak\s*:\s*(aa|iha|dha|reuters|afp)|fotoğraf\s*:|tüm\s+hakları\s+saklıdır|copyright\s*©|son\s+güncelleme\s*:|yayınlanma\s+tarihi\s*:|okuma\s+süresi\s*:|reklam|advertisement|sponsored)/i;

    for (let raw of rawLines) {
      let line = this._normalizeWhitespace(raw);
      if (!line) continue;

      const isHeading = /^#{1,4}\s+/.test(line);
      const cleanContent = line.replace(/^#{1,4}\s+/, '').trim();
      const lower = cleanContent
        .replace(/İ/g, 'i')
        .replace(/I/g, 'ı')
        .toLowerCase()
        .replace(/\u0307/g, '');

      if (cleanContent.length < 3) continue;
      if (titleLower && (lower === titleLower || lower.replace(/[^a-z0-9çğıöşü]/gi, '') === titleLower.replace(/[^a-z0-9çğıöşü]/gi, ''))) continue;

      // Haber içi reklam / yönlendirme kalıplarını atla (Türkçe karakter varyasyonları dahil)
      if (
        /^(haber[iı]?\s*g[oö]r[uü]nt[uü]le|haberin\s*devam[ıi]|devam[ıi]\s*i[cç]in|ilgili\s*haber|benzer\s*haber|bizi\s*google\s*news|google\s*news|abone\s*ol|yorum\s*yaz|payla[sş]|etiketler|kaynak\s*:|foto[gğ]raf\s*:|t[uü]m\s*haklar[ıi]|copyright|son\s*g[uü]ncelleme|yay[ıi]nlanma\s*tarihi|okuma\s*s[uü]resi|reklam|advertisement|sponsored)/i.test(
          lower
        )
      ) {
        continue;
      }
      if (
        cleanContent.length < 160 &&
        /(haber[iı]?\s*g[oö]r[uü]nt[uü]le|haberin\s*devam[ıi]|ilgili\s*haber|google\s*news|whatsapp\s*kanal|b[uü]ltenimize\s*abone|[cç]erez\s*politikas[ıi]|ayd[ıi]nlatma\s*metni|t[ıi]klay[ıi]n[ıi]z)/i.test(
          lower
        )
      ) {
        continue;
      }

      // Başlık olmayan çok kısa ve cümle niteliği taşımayan kırıntıları (tarih, saat, kategori adı vb.) atla
      if (!isHeading && cleanContent.split(/\s+/).length <= 3 && !/[.!?]$/.test(cleanContent)) {
        continue;
      }

      if (seen.has(lower)) continue;
      seen.add(lower);

      out.push(isHeading ? `# ${cleanContent}` : cleanContent);
    }

    return out;
  }
}

window.smartBookParser = new SmartBookParser();
