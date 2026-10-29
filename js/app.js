/**
 * HızlıOku Pro - Ana Uygulama Kontrolcüsü (App Controller)
 *
 * Klavye Kısayolları:
 *   r     -> restart (başa sar)
 *   space -> read/pause (oku/duraklat)
 *   n     -> new text / PDF yükle
 *   s     -> settings (ayarlar)
 *   ← →   -> skip back or ahead (ekrandaki öbek boyutu kadar: 1 kelimeyse 1, 3 kelimeyse 3 kelime)
 *   ↑ ↓   -> increase or decrease wpm x25
 *   b     -> hızlı ayraç koy
 */

const SAMPLE_BOOK_TEXT = `--- Sayfa 1 ---
KUANTUM YAYINLARI - BİLİM VE DÜŞÜNCE DİZİSİ
Yayın No: 418
ISBN: 978-605-123-456-7
Sertifika No: 44102
Birinci Basım: Ekim 2025, İstanbul
Baskı ve Cilt: Merkez Matbaacılık San. ve Tic. A.Ş.
Kapak Tasarımı: Elif Yılmaz
Editör: Prof. Dr. Ahmet Karahan
Telif Hakkı © 2025 Kuantum Yayınları. Tüm hakları saklıdır. All rights reserved.
Bu kitabın hiçbir bölümü yayınevinin yazılı izni olmadan çoğaltılamaz.
1

--- Sayfa 2 ---
BÖLÜM 1: ZİHNİN HIZI VE GÖRSEL ALGI
İnsan beyni, yazılı sembolleri anlamlandırırken göz kaslarının sıçramalı hareketlerine¹ bağımlı kalır. Geleneksel okuma sırasında vaktimizin büyük bölümü, gözün bir kelimeden diğerine fiziksel olarak taşınmasıyla geçer. Oysa kelimeler sabit bir odak noktasında sunulduğunda², zihin doğrudan kavramsal işlemeye geçer.
Modern nörobilim araştırmaları, görsel dikkat penceresinin daraltılmasıyla iç seslendirmenin* azaldığını ve kavrama hızının iki katına çıkabildiğini göstermektedir. Böylece okuyucu, satırlar arasında kaybolmadan metnin ana fikrine odaklanır.
¹ Gözün satır üzerinde yaptığı bu sıçramalı hareketlere bilişsel psikolojide "sakkad" (saccade) adı verilir.
² Bu yöntem literatürde RSVP (Rapid Serial Visual Presentation - Hızlı Seri Görsel Sunum) olarak tanımlanmaktadır.
* İç seslendirme (subvokalizasyon), kelimeleri zihinden sesli okuyormuş gibi tekrarlama alışkanlığıdır ve hızı dakikada 250 kelimeyle sınırlar.
2

--- Sayfa 3 ---
BÖLÜM 2: DİPNOTLAR VE METİN BÜTÜNLÜĞÜ
Akademik ve edebi eserlerde dipnotlar[1], metnin derinliğini artıran en önemli unsurlardır. Klasik hızlı okuma araçları sayfa altındaki bu açıklamaları ya tamamen yok sayar ya da sayfa sonunda bağlamdan kopuk bir yığın halinde okutur. Akıllı bir okuma motoru ise dipnot işaretini gördüğü anda açıklamayı okuyup cümlenin kaldığı noktaya[2] kusursuzca geri dönmelidir.
Kitap okurken ayrıca bölüm başlıklarında zihnin kısa bir nefes alması gerekir. Başlıkların çerçeve içinde gösterilmesi ve biraz daha uzun bekletilmesi, yeni bir kavramsal bölüme geçildiğini beyne bildirir.
[1] Dipnotlar tarih boyunca hem kaynak göstermek hem de ana cümlenin akışını bozacak yan bilgileri aktarmak için kullanılmıştır.
[2] Bağlamsal geri dönüş (inline footnote resolution), okuyucunun sayfa altına göz kaydırıp satır kaybetmesini tamamen engeller.
3

--- Sayfa 4 ---
KAYNAKÇA
Potter, M. C. (1984). Rapid serial visual presentation (RSVP): A method for studying language processing. Newieras Press, 1984, s. 91-118.
Rayner, K. (1998). Eye movements in reading and information processing: 20 years of research. Psychological Bulletin, s. 372-422.
Spritz Inc. (2014). Optimal Recognition Point and Saccadic Suppression in Digital Reading. Boston Publishing, ISBN 978-1-4028-9462-6.
4`;

class HizliOkuApp {
  constructor() {
    this.settings = window.storageManager.getSettings();
    this.currentDoc = {
      docHash: null,
      title: 'Örnek Kitap Bölümü',
      sourceType: 'text',
      tokens: [],
      pageSummaries: [],
      stats: {},
      bookmarks: [],
      rawPages: null,
      rawText: SAMPLE_BOOK_TEXT
    };

    this.engine = new window.RSVPEngine(this.settings, {
      onChunkChange: (chunk, idx, total) => this.renderChunk(chunk, idx, total),
      onStateChange: (isPlaying) => this.onPlayStateChange(isPlaying),
      onFinish: () => this.onReadingFinished()
    });

    this.savePositionThrottleTimer = null;
    this._configurePdfWorker();
    this._cacheElements();
    this.applyTheme(this.settings.theme || 'apple');
    this._bindEvents();
    this.applyVisualSettings();
    this._initInitialDocument();
  }

  /**
   * PDF.js Worker yapılandırması (Hem HTTP/HTTPS hem de yerel file:// açılışlarını destekler)
   */
  _configurePdfWorker() {
    if (!window.pdfjsLib) return;
    const workerCdnUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    try {
      const blobCode = `importScripts('${workerCdnUrl}');`;
      const blob = new Blob([blobCode], { type: 'application/javascript' });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
    } catch (e) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerCdnUrl;
    }
  }

  _cacheElements() {
    this.el = {
      docTitleText: document.getElementById('docTitleText'),
      btnSmartStats: document.getElementById('btnSmartStats'),
      smartStatsText: document.getElementById('smartStatsText'),
      btnNewText: document.getElementById('btnNewText'),
      btnQuickBookmark: document.getElementById('btnQuickBookmark'),
      btnOpenBookmarks: document.getElementById('btnOpenBookmarks'),
      bookmarkCountBadge: document.getElementById('bookmarkCountBadge'),
      btnSettings: document.getElementById('btnSettings'),
      btnFullscreen: document.getElementById('btnFullscreen'),

      // Banners
      resumeBanner: document.getElementById('resumeBanner'),
      resumeBannerText: document.getElementById('resumeBannerText'),
      btnResumeJump: document.getElementById('btnResumeJump'),
      btnResumeDismiss: document.getElementById('btnResumeDismiss'),
      ocrBanner: document.getElementById('ocrBanner'),
      ocrBannerText: document.getElementById('ocrBannerText'),
      btnCancelOcr: document.getElementById('btnCancelOcr'),

      // Reader Window
      readerWindow: document.getElementById('readerWindow'),
      readerModePill: document.getElementById('readerModePill'),
      readerPageCorner: document.getElementById('readerPageCorner'),
      wordDisplay: document.getElementById('wordDisplay'),
      footnoteLiveBar: document.getElementById('footnoteLiveBar'),
      touchZoneLeft: document.getElementById('touchZoneLeft'),
      touchZoneCenter: document.getElementById('touchZoneCenter'),
      touchZoneRight: document.getElementById('touchZoneRight'),

      // Context Peek
      contextPeekPanel: document.getElementById('contextPeekPanel'),
      contextPeekBody: document.getElementById('contextPeekBody'),
      contextStepInfo: document.getElementById('contextStepInfo'),

      // Progress & Controls
      progressSlider: document.getElementById('progressSlider'),
      wordCounterText: document.getElementById('wordCounterText'),
      percentText: document.getElementById('percentText'),
      remainingTimeText: document.getElementById('remainingTimeText'),
      btnRestart: document.getElementById('btnRestart'),
      btnStepBack: document.getElementById('btnStepBack'),
      btnStepBackLabel: document.getElementById('btnStepBackLabel'),
      btnPlayPause: document.getElementById('btnPlayPause'),
      btnPlayPauseIcon: document.getElementById('btnPlayPauseIcon'),
      btnPlayPauseText: document.getElementById('btnPlayPauseText'),
      btnStepForward: document.getElementById('btnStepForward'),
      btnStepForwardLabel: document.getElementById('btnStepForwardLabel'),
      btnWpmDown: document.getElementById('btnWpmDown'),
      btnWpmUp: document.getElementById('btnWpmUp'),
      wpmDisplayValue: document.getElementById('wpmDisplayValue'),

      // Settings Modal
      settingsModal: document.getElementById('settingsModal'),
      btnCloseSettingsTop: document.getElementById('btnCloseSettingsTop'),
      btnSaveSettings: document.getElementById('btnSaveSettings'),
      btnCloseSettings: document.getElementById('btnCloseSettings'),
      setWpm: document.getElementById('setWpm'),
      setChunkSize: document.getElementById('setChunkSize'),
      setWindowWidth: document.getElementById('setWindowWidth'),
      setWindowHeight: document.getElementById('setWindowHeight'),
      setFontSize: document.getElementById('setFontSize'),
      setFontColor: document.getElementById('setFontColor'),
      setBgColor: document.getElementById('setBgColor'),
      setAlignment: document.getElementById('setAlignment'),
      setSpeedVariability: document.getElementById('setSpeedVariability'),
      setSentenceBreak: document.getElementById('setSentenceBreak'),
      setSentencePause: document.getElementById('setSentencePause'),
      setSkipStopwords: document.getElementById('setSkipStopwords'),
      setDetectHeadings: document.getElementById('setDetectHeadings'),
      setInlineFootnotes: document.getElementById('setInlineFootnotes'),
      setSkipBoilerplate: document.getElementById('setSkipBoilerplate'),
      settingsLivePreview: document.getElementById('settingsLivePreview'),

      // New Text & PDF Modal
      newTextModal: document.getElementById('newTextModal'),
      btnCloseNewText: document.getElementById('btnCloseNewText'),
      btnCancelNewText: document.getElementById('btnCancelNewText'),
      btnApplyNewText: document.getElementById('btnApplyNewText'),
      urlFetchInput: document.getElementById('urlFetchInput'),
      btnFetchUrl: document.getElementById('btnFetchUrl'),
      pdfDropzone: document.getElementById('pdfDropzone'),
      pdfFileInput: document.getElementById('pdfFileInput'),
      chkForceOcr: document.getElementById('chkForceOcr'),
      btnLoadSampleBook: document.getElementById('btnLoadSampleBook'),
      pasteTitleInput: document.getElementById('pasteTitleInput'),
      pasteTextarea: document.getElementById('pasteTextarea'),

      // Bookmarks Modal
      bookmarksModal: document.getElementById('bookmarksModal'),
      btnCloseBookmarks: document.getElementById('btnCloseBookmarks'),
      btnCloseBookmarksFooter: document.getElementById('btnCloseBookmarksFooter'),
      bookmarkNoteInput: document.getElementById('bookmarkNoteInput'),
      btnAddNamedBookmark: document.getElementById('btnAddNamedBookmark'),
      currentDocBookmarksList: document.getElementById('currentDocBookmarksList'),
      recentDocsList: document.getElementById('recentDocsList'),

      // Structure Modal
      structureModal: document.getElementById('structureModal'),
      btnCloseStructure: document.getElementById('btnCloseStructure'),
      btnCloseStructureFooter: document.getElementById('btnCloseStructureFooter'),
      structureSummaryBox: document.getElementById('structureSummaryBox'),
      detectedHeadingsList: document.getElementById('detectedHeadingsList'),
      pageFilterReportList: document.getElementById('pageFilterReportList')
    };
  }

  _bindEvents() {
    // Üst bar butonları
    this.el.btnNewText.addEventListener('click', () => this.openNewTextModal());
    this.el.btnSettings.addEventListener('click', () => this.openSettingsModal());
    this.el.btnQuickBookmark.addEventListener('click', () => this.createQuickBookmark());
    this.el.btnOpenBookmarks.addEventListener('click', () => this.openBookmarksModal());
    this.el.btnSmartStats.addEventListener('click', () => this.openStructureModal());
    this.el.btnFullscreen.addEventListener('click', () => this.toggleFullscreenLandscape());

    // Transport & Hız butonları
    this.el.btnPlayPause.addEventListener('click', () => this.engine.togglePlay());
    this.el.btnRestart.addEventListener('click', () => this.engine.restart());
    this.el.btnStepBack.addEventListener('click', () => this.engine.stepChunk(-1));
    this.el.btnStepForward.addEventListener('click', () => this.engine.stepChunk(1));
    this.el.btnWpmDown.addEventListener('click', () => this.changeWpm(-25));
    this.el.btnWpmUp.addEventListener('click', () => this.changeWpm(25));

    // Dokunmatik 3 Bölge (Sol: -1 öbek, Orta: Oku/Duraklat, Sağ: +1 öbek)
    this.el.touchZoneLeft.addEventListener('click', (e) => {
      e.stopPropagation();
      this.engine.stepChunk(-1);
    });
    this.el.touchZoneCenter.addEventListener('click', (e) => {
      e.stopPropagation();
      this.engine.togglePlay();
    });
    this.el.touchZoneRight.addEventListener('click', (e) => {
      e.stopPropagation();
      this.engine.stepChunk(1);
    });

    // Mobil Parmak Kaydırma (Swipe Left / Right) Desteği
    let touchStartX = null;
    let touchStartY = null;
    this.el.readerWindow.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      },
      { passive: true }
    );

    this.el.readerWindow.addEventListener(
      'touchend',
      (e) => {
        if (touchStartX === null || !e.changedTouches.length) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        touchStartX = null;
        touchStartY = null;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx < 0) {
            this.engine.stepChunk(1); // Sola kaydır -> ileri
          } else {
            this.engine.stepChunk(-1); // Sağa kaydır -> geri
          }
        }
      },
      { passive: true }
    );

    // İlerleme çubuğu (Scrubber)
    this.el.progressSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10) || 0;
      this.engine.seekToChunkIndex(val);
    });

    // Banner butonları
    this.el.btnResumeDismiss.addEventListener('click', () => {
      this.el.resumeBanner.classList.add('hidden');
    });
    this.el.btnCancelOcr.addEventListener('click', () => {
      window.smartBookParser.cancelActiveJob();
      this.el.ocrBanner.classList.add('hidden');
    });

    // Tasarım Teması Seçicileri (Header Segmented Control & Settings Modal Cards)
    document.querySelectorAll('#headerThemeSelector .theme-seg-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchTheme(btn.dataset.themeVal);
      });
    });

    document.querySelectorAll('#modalThemeSelector .theme-option-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchTheme(card.dataset.themeVal);
      });
    });

    // Settings Modal
    this.el.btnCloseSettingsTop.addEventListener('click', () => this.closeSettingsModal());
    this.el.btnCloseSettings.addEventListener('click', () => this.closeSettingsModal());
    this.el.btnSaveSettings.addEventListener('click', () => this.saveSettingsFromModal());

    const liveInputs = [
      this.el.setWpm,
      this.el.setChunkSize,
      this.el.setWindowWidth,
      this.el.setWindowHeight,
      this.el.setFontSize,
      this.el.setFontColor,
      this.el.setBgColor,
      this.el.setAlignment
    ];
    liveInputs.forEach((inp) => {
      inp.addEventListener('input', () => this.updateSettingsLivePreview());
    });

    document.querySelectorAll('.theme-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        this.el.setBgColor.value = chip.dataset.bg;
        this.el.setFontColor.value = chip.dataset.fg;
        this.updateSettingsLivePreview();
      });
    });

    // New Text / PDF / URL Modal
    this.el.btnCloseNewText.addEventListener('click', () => this.closeNewTextModal());
    this.el.btnCancelNewText.addEventListener('click', () => this.closeNewTextModal());
    this.el.btnApplyNewText.addEventListener('click', () => this.handlePasteTextSubmit());
    this.el.btnFetchUrl.addEventListener('click', () => this.handleUrlFetch());
    this.el.urlFetchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleUrlFetch();
      }
    });
    this.el.btnLoadSampleBook.addEventListener('click', () => {
      this.el.pasteTitleInput.value = 'Kuantum Yayınları - Zihnin Hızı ve Görsel Algı';
      this.el.pasteTextarea.value = SAMPLE_BOOK_TEXT;
    });

    this.el.pdfDropzone.addEventListener('click', () => this.el.pdfFileInput.click());
    this.el.pdfFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handlePdfFileUpload(e.target.files[0]);
        e.target.value = '';
      }
    });

    this.el.pdfDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.el.pdfDropzone.classList.add('drag-over');
    });
    this.el.pdfDropzone.addEventListener('dragleave', () => {
      this.el.pdfDropzone.classList.remove('drag-over');
    });
    this.el.pdfDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.el.pdfDropzone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.handlePdfFileUpload(e.dataTransfer.files[0]);
      }
    });

    // Bookmarks Modal
    this.el.btnCloseBookmarks.addEventListener('click', () => this.closeBookmarksModal());
    this.el.btnCloseBookmarksFooter.addEventListener('click', () => this.closeBookmarksModal());
    this.el.btnAddNamedBookmark.addEventListener('click', () => {
      const note = this.el.bookmarkNoteInput.value.trim();
      this.createQuickBookmark(note);
      this.el.bookmarkNoteInput.value = '';
      this.renderBookmarksModalContent();
    });

    // Structure Modal
    this.el.btnCloseStructure.addEventListener('click', () => this.closeStructureModal());
    this.el.btnCloseStructureFooter.addEventListener('click', () => this.closeStructureModal());

    // KLAVYE KISAYOLLARI (İstenen Birebir Haritalama)
    window.addEventListener('keydown', (e) => this._handleGlobalKeydown(e));

    // Sayfadan çıkarken son kalınan kelimeyi kaydet
    window.addEventListener('beforeunload', () => {
      if (this.currentDoc.docHash) {
        window.storageManager.updateReadingPosition(
          this.currentDoc.docHash,
          this.engine.getCurrentWordIndex(),
          this.currentDoc.tokens.length
        );
      }
    });
  }

  /**
   * Klavye Kısayolları Yöneticisi:
   * r - restart | space - read/pause | n - new text | s - settings
   * ← → - skip back or ahead (chunk size kadar) | ↑ ↓ - wpm ±25 | b - ayraç koy
   */
  _handleGlobalKeydown(e) {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    const isInputFocused = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

    if (e.key === 'Escape') {
      this.closeAllModals();
      return;
    }

    if (isInputFocused) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const key = e.key.toLowerCase();

    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      this.closeAllModals();
      this.engine.togglePlay();
    } else if (key === 'r') {
      e.preventDefault();
      this.engine.restart();
    } else if (key === 'n') {
      e.preventDefault();
      this.toggleNewTextModal();
    } else if (key === 's') {
      e.preventDefault();
      this.toggleSettingsModal();
    } else if (key === 'b') {
      e.preventDefault();
      this.createQuickBookmark();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.engine.stepChunk(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.engine.stepChunk(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.changeWpm(25);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.changeWpm(-25);
    }
  }

  /**
   * İlk açılışta en son okunan belgeyi hafızadan getirir, yoksa örnek kitabı yükler.
   */
  async _initInitialDocument() {
    const lastHash = window.storageManager.getLastActiveHash();
    if (lastHash) {
      const savedDoc = await window.storageManager.getDocumentState(lastHash);
      if (savedDoc && Array.isArray(savedDoc.tokens) && savedDoc.tokens.length > 0) {
        const repairedTokens = window.smartBookParser.repairTokenList(savedDoc.tokens);
        this.currentDoc = {
          docHash: savedDoc.docHash,
          title: savedDoc.title,
          sourceType: savedDoc.sourceType,
          tokens: repairedTokens,
          pageSummaries: savedDoc.rawStructure ? savedDoc.rawStructure.pageSummaries : [],
          stats: savedDoc.rawStructure ? savedDoc.rawStructure.stats : {
            totalPages: savedDoc.totalPages || 1,
            totalTokens: repairedTokens.length,
            skippedPagesCount: 0,
            headingsCount: repairedTokens.filter((t) => t.type === 'heading').length,
            footnotesCount: repairedTokens.filter((t) => t.type === 'footnote-start').length
          },
          bookmarks: savedDoc.bookmarks || []
        };
        this._ActivateCurrentDocument(savedDoc.lastWordIndex || 0, true);
        return;
      }
    }

    // İlk kez açılıyorsa Künye + Başlık + Dipnot + Kaynakça içeren örnek kitabı yükle
    await this.loadPlainTextDocument(
      SAMPLE_BOOK_TEXT,
      'Örnek Kitap: Zihnin Hızı ve Görsel Algı'
    );
  }

  /**
   * Düz metni ayrıştırır, SHA-256 parmak izini hesaplar ve hafızada varsa kaldığı yeri hatırlar.
   */
  async loadPlainTextDocument(rawText, customTitle = '') {
    const clean = (rawText || '').trim();
    if (!clean) return;

    this.engine.pause();
    const docHash = await window.storageManager.computeHash(clean);
    const existingRecord = await window.storageManager.getDocumentState(docHash);

    const parsed = window.smartBookParser.parsePlainText(clean, {
      skipBoilerplate: this.settings.skipBoilerplate,
      detectHeadings: this.settings.detectHeadings,
      inlineFootnotes: this.settings.inlineFootnotes
    });

    const title =
      customTitle ||
      (existingRecord && existingRecord.title) ||
      clean.split('\n')[0].slice(0, 48) ||
      'Metin Belgesi';

    const targetResumeWord = this._determineTargetResumeWord(existingRecord);

    this.currentDoc = {
      docHash,
      title,
      sourceType: 'text',
      tokens: parsed.tokens,
      pageSummaries: parsed.pageSummaries,
      stats: parsed.stats,
      bookmarks: existingRecord && existingRecord.bookmarks ? existingRecord.bookmarks : [],
      rawText: clean
    };

    await window.storageManager.saveDocumentState({
      docHash,
      title,
      sourceType: 'text',
      totalWords: parsed.tokens.length,
      totalPages: parsed.stats.totalPages,
      lastWordIndex: targetResumeWord,
      bookmarks: this.currentDoc.bookmarks,
      tokens: parsed.tokens,
      rawStructure: {
        pageSummaries: parsed.pageSummaries,
        stats: parsed.stats
      }
    });

    this._ActivateCurrentDocument(targetResumeWord, Boolean(existingRecord));
  }

  /**
   * PDF Dosyasını (Dijital veya Taranmış OCR) yükler, SHA-256 ile hafızayı kontrol eder
   * ve 1. sayfa biter bitmez hemen okuma ekranına aktarır.
   */
  async handlePdfFileUpload(file) {
    if (!file) return;
    const forceOCR = Boolean(this.el.chkForceOcr && this.el.chkForceOcr.checked);
    const arrayBuffer = await file.arrayBuffer();
    await this.handlePdfBufferUpload(arrayBuffer, file.name, forceOCR);
  }

  /**
   * Bir PDF ArrayBuffer'ını (yerel dosyadan veya internetteki bir URL'den) işler.
   */
  async handlePdfBufferUpload(arrayBuffer, fileName = 'Online PDF', forceOCR = false) {
    this.closeNewTextModal();
    this.engine.pause();

    try {
      this.el.ocrBanner.classList.remove('hidden');
      this.el.ocrBannerText.textContent = `⏳ "${fileName}" parmak izi (SHA-256) kontrol ediliyor...`;

      const docHash = await window.storageManager.computeHash(arrayBuffer);
      const existingRecord = await window.storageManager.getDocumentState(docHash);

      const targetResumeWord = this._determineTargetResumeWord(existingRecord);
      let firstPageActivated = false;

      const finalBook = await window.smartBookParser.processPDF(
        arrayBuffer,
        {
          forceOCR,
          ocrLanguage: this.settings.ocrLanguage || 'tur+eng',
          skipBoilerplate: this.settings.skipBoilerplate,
          detectHeadings: this.settings.detectHeadings,
          inlineFootnotes: this.settings.inlineFootnotes
        },
        {
          onProgress: (prog) => {
            this.el.ocrBanner.classList.remove('hidden');
            this.el.ocrBannerText.textContent = `⚡ ${prog.message} (Okumaya hemen başlayabilirsiniz!)`;
          },
          onPageReady: (partialBook, pageNum, totalPages, usedOCR) => {
            if (partialBook.tokens.length === 0) return;

            this.currentDoc = {
              docHash,
              title: fileName,
              sourceType: usedOCR ? 'ocr-pdf' : 'pdf',
              tokens: partialBook.tokens,
              pageSummaries: partialBook.pageSummaries,
              stats: partialBook.stats,
              bookmarks: existingRecord && existingRecord.bookmarks ? existingRecord.bookmarks : []
            };

            if (!firstPageActivated) {
              firstPageActivated = true;
              const initialIdx =
                targetResumeWord < partialBook.tokens.length ? targetResumeWord : 0;
              this._ActivateCurrentDocument(initialIdx, Boolean(existingRecord));
            } else {
              // Okuyucu çalışırken yeni sayfaların kelimelerini kesintisiz ekle
              const currentWord = this.engine.getCurrentWordIndex();
              const wasPlaying = this.engine.isPlaying;
              this.engine.tokens = partialBook.tokens;
              this.engine.buildChunks();
              this.engine.seekToWordIndex(currentWord, false);
              if (wasPlaying && !this.engine.isPlaying) {
                this.engine.play();
              }
              this.updateProgressUI();
              this.updateSmartStatsPill();
            }
          }
        }
      );

      this.el.ocrBanner.classList.add('hidden');

      if (!finalBook.tokens.length) {
        alert(
          'Bu PDF içinde okunabilir metin bulunamadı. Eğer taranmış bir belge ise "Taranmış PDF için OCR zorla" seçeneğini işaretleyip tekrar deneyin.'
        );
        return;
      }

      this.currentDoc = {
        docHash,
        title: fileName,
        sourceType: finalBook.usedOCR ? 'ocr-pdf' : 'pdf',
        tokens: finalBook.tokens,
        pageSummaries: finalBook.pageSummaries,
        stats: finalBook.stats,
        bookmarks: existingRecord && existingRecord.bookmarks ? existingRecord.bookmarks : [],
        rawPages: finalBook.rawPages
      };

      const finalResumeIdx =
        targetResumeWord < finalBook.tokens.length
          ? targetResumeWord
          : this.engine.getCurrentWordIndex();

      await window.storageManager.saveDocumentState({
        docHash,
        title: fileName,
        sourceType: this.currentDoc.sourceType,
        totalWords: finalBook.tokens.length,
        totalPages: finalBook.stats.totalPages,
        lastWordIndex: finalResumeIdx,
        bookmarks: this.currentDoc.bookmarks,
        tokens: finalBook.tokens,
        rawStructure: {
          pageSummaries: finalBook.pageSummaries,
          stats: finalBook.stats
        }
      });

      this._ActivateCurrentDocument(finalResumeIdx, Boolean(existingRecord));
    } catch (err) {
      this.el.ocrBanner.classList.add('hidden');
      console.error('PDF Okuma Hatası:', err);
      alert('PDF işlenirken bir hata oluştu: ' + (err.message || err));
    }
  }

  /**
   * Belge daha önce açılmışsa en son ayracı veya son kalınan kelime indeksini döndürür.
   */
  _determineTargetResumeWord(existingRecord) {
    if (!existingRecord) return 0;
    if (Array.isArray(existingRecord.bookmarks) && existingRecord.bookmarks.length > 0) {
      return existingRecord.bookmarks[0].wordIndex || existingRecord.lastWordIndex || 0;
    }
    return existingRecord.lastWordIndex || 0;
  }

  _ActivateCurrentDocument(resumeWordIndex = 0, hadPreviousSession = false) {
    this.el.docTitleText.textContent = this.currentDoc.title;
    this.el.bookmarkCountBadge.textContent = (this.currentDoc.bookmarks || []).length;
    this.updateSmartStatsPill();

    // Otomatik ayraç/kaldığın yer konumuna git
    const startIdx = this.settings.autoJumpBookmark !== false ? resumeWordIndex : 0;
    this.engine.loadTokens(this.currentDoc.tokens, startIdx);

    if (hadPreviousSession && resumeWordIndex > 0) {
      const pct = Math.round((resumeWordIndex / Math.max(1, this.currentDoc.tokens.length)) * 100);
      const hasBm = this.currentDoc.bookmarks && this.currentDoc.bookmarks.length > 0;
      const bmLabel = hasBm ? `"${this.currentDoc.bookmarks[0].label}" ayracınıza` : `${resumeWordIndex + 1}. kelimeye (%${pct})`;

      this.el.resumeBannerText.innerHTML = `✨ <strong>Hafıza Tanındı:</strong> "${this.currentDoc.title}" belgesinde kaldığınız <strong>${bmLabel}</strong> otomatik gidildi.`;
      this.el.btnResumeJump.textContent = 'Baştan Başla (0)';
      this.el.btnResumeJump.onclick = () => {
        this.engine.restart();
        this.el.resumeBanner.classList.add('hidden');
      };
      this.el.resumeBanner.classList.remove('hidden');
    } else {
      this.el.resumeBanner.classList.add('hidden');
    }
  }

  updateSmartStatsPill() {
    const s = this.currentDoc.stats || {};
    const parts = [];
    if (s.skippedPagesCount > 0) parts.push(`${s.skippedPagesCount} gereksiz sayfa atlandı`);
    if (s.headingsCount > 0) parts.push(`${s.headingsCount} başlık`);
    if (s.footnotesCount > 0) parts.push(`${s.footnotesCount} dipnot`);

    this.el.smartStatsText.textContent = parts.length
      ? parts.join(' • ')
      : 'Kitap Zekası Aktif';
  }

  /**
   * Ekrana mevcut öbeği (Normal Kelime, Başlık Çerçevesi veya Dipnot Çerçevesi) çizer.
   */
  renderChunk(chunk, chunkIdx, totalChunks) {
    const win = this.el.readerWindow;
    const display = this.el.wordDisplay;
    const pill = this.el.readerModePill;
    const fnBar = this.el.footnoteLiveBar;

    win.classList.remove('mode-heading', 'mode-footnote', 'show-reticle');
    display.className = 'word-display';
    pill.className = 'reader-mode-pill hidden';
    fnBar.classList.add('hidden');

    if (!chunk) {
      display.classList.add('align-center');
      display.textContent = 'Metin Yok';
      return;
    }

    this.el.readerPageCorner.textContent = `Sayfa ${chunk.page || 1} • Öbek ${chunkIdx + 1}/${totalChunks}`;

    // 1. DURUM: BÖLÜM VEYA KİTAP BAŞLIĞI (Özel Çerçeve, Farklı Renk ve Uzun Bekleme)
    if (chunk.type === 'heading') {
      win.classList.add('mode-heading');
      pill.textContent = chunk.isBookTitle ? '📘 KİTAP BAŞLIĞI' : '📑 BÖLÜM BAŞLIĞI';
      pill.classList.remove('hidden');
      pill.classList.add('pill-heading');

      display.classList.add('is-heading-display');
      display.textContent = chunk.text;
    }
    // 2. DURUM: DİPNOT GEÇİŞİ VEYA DİPNOT METNİ
    else if (chunk.type === 'footnote-start' || chunk.type === 'footnote') {
      win.classList.add('mode-footnote');
      pill.textContent = `📌 DİPNOT ${chunk.footnoteId || ''} OKUNUYOR`;
      pill.classList.remove('hidden');
      pill.classList.add('pill-footnote');

      display.classList.add(`align-${this.settings.alignment === 'orp' ? 'center' : this.settings.alignment}`);
      display.textContent = chunk.text;

      if (chunk.footnoteFullText) {
        fnBar.textContent = `Dipnot ${chunk.footnoteId || ''}: ${chunk.footnoteFullText}`;
        fnBar.classList.remove('hidden');
      }
    }
    // 3. DURUM: NORMAL ANA METİN KELİMESİ / ÖBEĞİ
    else {
      const useOrp =
        this.settings.alignment === 'orp' ||
        (parseInt(this.settings.chunkSize, 10) === 1 && this.settings.alignment === 'center');

      if (useOrp && chunk.tokens && chunk.tokens.length === 1) {
        win.classList.add('show-reticle');
        display.classList.add('align-orp');
        const { prefix, pivot, suffix } = window.RSVPEngine.computeORP(chunk.text);
        display.innerHTML = `<span class="orp-prefix">${this._escapeHtml(prefix)}</span><span class="orp-pivot">${this._escapeHtml(pivot)}</span><span class="orp-suffix">${this._escapeHtml(suffix)}</span>`;
      } else {
        const alignClass =
          this.settings.alignment === 'orp' ? 'align-center' : `align-${this.settings.alignment}`;
        display.classList.add(alignClass);
        display.textContent = chunk.text;
      }
    }

    this.updateProgressUI();
    if (!this.engine.isPlaying) {
      this.renderContextPeek();
    }
    this._throttledSavePosition();
  }

  /**
   * Duraklatıldığında (veya gezinirken) içinde bulunulan cümleyi/paragrafı
   * Context Peek panelinde vurgulu olarak gösterir.
   */
  renderContextPeek() {
    const ctx = this.engine.getContextWindow(26);
    const container = this.el.contextPeekBody;

    if (!ctx.items.length) {
      container.innerHTML = '<span style="color:var(--text-muted)">Metin yüklenmedi.</span>';
      return;
    }

    const htmlParts = ctx.items.map((item) => {
      const classes = ['context-word'];
      if (item.isActive) classes.push('active-chunk-word');
      if (item.type === 'heading') classes.push('heading-word');
      if (item.type === 'footnote' || item.type === 'footnote-start') classes.push('footnote-word');

      return `<span class="${classes.join(' ')}" data-word-idx="${item.wordIndex}">${this._escapeHtml(item.text)}</span>`;
    });

    container.innerHTML = htmlParts.join(' ');

    container.querySelectorAll('.context-word').forEach((span) => {
      span.addEventListener('click', () => {
        const wIdx = parseInt(span.dataset.wordIdx, 10);
        this.engine.pause();
        this.engine.seekToWordIndex(wIdx, true);
      });
    });

    const activeEl = container.querySelector('.active-chunk-word');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  updateProgressUI() {
    const totalChunks = this.engine.chunks.length;
    const currentChunkIdx = this.engine.currentChunkIndex;
    const currentWordIdx = this.engine.getCurrentWordIndex();
    const totalWords = this.currentDoc.tokens.length;

    this.el.progressSlider.max = Math.max(0, totalChunks - 1);
    this.el.progressSlider.value = currentChunkIdx;

    const stats = this.engine.getRemainingTimeStats();
    this.el.wordCounterText.textContent = `${Math.min(totalWords, currentWordIdx + 1)} / ${totalWords} kelime`;
    this.el.percentText.textContent = `%${stats.percent}`;
    this.el.remainingTimeText.textContent = `Kalan: ${stats.formattedTime}`;
  }

  onPlayStateChange(isPlaying) {
    document.body.classList.toggle('is-reading', isPlaying);
    this.el.btnPlayPauseIcon.textContent = isPlaying ? '⏸' : '▶';
    this.el.btnPlayPauseText.textContent = isPlaying ? 'DURAKLAT' : 'OKU';

    if (!isPlaying) {
      this.renderContextPeek();
      if (this.currentDoc.docHash) {
        window.storageManager.updateReadingPosition(
          this.currentDoc.docHash,
          this.engine.getCurrentWordIndex(),
          this.currentDoc.tokens.length
        );
      }
    }
  }

  onReadingFinished() {
    this.onPlayStateChange(false);
  }

  _throttledSavePosition() {
    if (this.savePositionThrottleTimer) return;
    this.savePositionThrottleTimer = setTimeout(() => {
      this.savePositionThrottleTimer = null;
      if (this.currentDoc.docHash) {
        window.storageManager.updateReadingPosition(
          this.currentDoc.docHash,
          this.engine.getCurrentWordIndex(),
          this.currentDoc.tokens.length
        );
      }
    }, 2500);
  }

  changeWpm(delta) {
    const currentWpm = parseInt(this.settings.wpm, 10) || 325;
    const nextWpm = Math.max(50, Math.min(2000, currentWpm + delta));
    this.settings = window.storageManager.saveSettings({ wpm: nextWpm });
    this.engine.updateSettings(this.settings);
    this.el.wpmDisplayValue.textContent = nextWpm;
    this.updateProgressUI();
  }

  /**
   * Ayarlardaki görsel parametreleri (Genişlik, Yükseklik, Font Boyutu, Renkler, Kaydırma Adımı) uygular.
   */
  applyVisualSettings() {
    const root = document.documentElement;
    const isKindle = this.settings.theme === 'kindle';
    const isApple = !this.settings.theme || this.settings.theme === 'apple';
    const fallbackBg = isKindle ? '#f9f4ea' : '#000000';
    const fallbackFg = isKindle ? '#241c15' : (isApple ? '#f5f5f7' : '#ffff00');

    root.style.setProperty('--reader-bg', this.settings.backgroundColor || fallbackBg);
    root.style.setProperty('--reader-fg', this.settings.fontColor || fallbackFg);
    root.style.setProperty('--reader-width', `${this.settings.windowWidth || 750}px`);
    root.style.setProperty('--reader-height', `${this.settings.windowHeight || 500}px`);
    root.style.setProperty('--reader-font-size', `${this.settings.fontSize || 32}px`);

    this.el.wpmDisplayValue.textContent = this.settings.wpm;

    const cs = parseInt(this.settings.chunkSize, 10) || 1;
    const stepText = cs === 1 ? '1 Kelime' : `${cs} Kelime`;
    this.el.btnStepBackLabel.textContent = `⏪ -${stepText}`;
    this.el.btnStepForwardLabel.textContent = `+${stepText} ⏩`;
    this.el.contextStepInfo.textContent = `Kaydırma Adımı (←/→): ${stepText}`;
  }

  // ==========================================================================
  // AYRAÇ (BOOKMARK) SİSTEMİ
  // ==========================================================================

  async createQuickBookmark(customLabel = '') {
    if (!this.currentDoc.docHash) return;
    const chunk = this.engine.getCurrentChunk();
    const wordIndex = this.engine.getCurrentWordIndex();
    const page = chunk ? chunk.page : 1;
    const snippet = chunk ? chunk.text : '';
    const pct = Math.round((wordIndex / Math.max(1, this.currentDoc.tokens.length)) * 100);

    const label = customLabel || `Sayfa ${page} (%${pct}) — "${snippet.slice(0, 28)}"`;
    const bm = await window.storageManager.addBookmark(this.currentDoc.docHash, {
      label,
      wordIndex,
      page,
      snippet
    });

    if (bm) {
      const updatedDoc = await window.storageManager.getDocumentState(this.currentDoc.docHash);
      this.currentDoc.bookmarks = updatedDoc ? updatedDoc.bookmarks : [];
      this.el.bookmarkCountBadge.textContent = this.currentDoc.bookmarks.length;

      // Görsel onay
      const originalText = this.el.btnQuickBookmark.innerHTML;
      this.el.btnQuickBookmark.innerHTML = '<span>✅ Ayraç Eklendi!</span>';
      setTimeout(() => {
        this.el.btnQuickBookmark.innerHTML = originalText;
      }, 1400);
    }
  }

  async openBookmarksModal() {
    this.engine.pause();
    await this.renderBookmarksModalContent();
    this.el.bookmarksModal.classList.remove('hidden');
  }

  closeBookmarksModal() {
    this.el.bookmarksModal.classList.add('hidden');
  }

  async renderBookmarksModalContent() {
    const bmListEl = this.el.currentDocBookmarksList;
    const recentListEl = this.el.recentDocsList;

    const docState = await window.storageManager.getDocumentState(this.currentDoc.docHash);
    const bookmarks = (docState && docState.bookmarks) || this.currentDoc.bookmarks || [];
    this.currentDoc.bookmarks = bookmarks;
    this.el.bookmarkCountBadge.textContent = bookmarks.length;

    if (!bookmarks.length) {
      bmListEl.innerHTML =
        '<div style="font-size:0.82rem; color:var(--text-muted); padding:8px;">Bu belgede henüz kayıtlı ayracınız yok. Okurken "🔖 Ayraç Koy" (b) tuşuna basarak ekleyebilirsiniz.</div>';
    } else {
      bmListEl.innerHTML = bookmarks
        .map(
          (b) => `
        <div class="list-item-card">
          <div class="list-item-info">
            <div class="list-item-title">🔖 ${this._escapeHtml(b.label)}</div>
            <div class="list-item-meta">Sayfa ${b.page} • ${b.wordIndex + 1}. kelime • ${new Date(b.createdAt).toLocaleString('tr-TR')}</div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-primary btn-jump-bm" data-word="${b.wordIndex}" style="padding:5px 10px; font-size:0.78rem;">Oraya Git</button>
            <button class="btn btn-del-bm" data-id="${b.id}" style="padding:5px 9px; font-size:0.78rem;">🗑</button>
          </div>
        </div>`
        )
        .join('');

      bmListEl.querySelectorAll('.btn-jump-bm').forEach((btn) => {
        btn.addEventListener('click', () => {
          const wIdx = parseInt(btn.dataset.word, 10) || 0;
          this.engine.seekToWordIndex(wIdx, true);
          this.closeBookmarksModal();
        });
      });

      bmListEl.querySelectorAll('.btn-del-bm').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await window.storageManager.removeBookmark(this.currentDoc.docHash, btn.dataset.id);
          await this.renderBookmarksModalContent();
        });
      });
    }

    // Son Okunanlar Rafı
    const recents = window.storageManager.getRecentSummaries();
    if (!recents.length) {
      recentListEl.innerHTML =
        '<div style="font-size:0.82rem; color:var(--text-muted); padding:8px;">Henüz geçmiş belge kaydı yok.</div>';
    } else {
      recentListEl.innerHTML = recents
        .map((r) => {
          const pct = Math.round(((r.lastWordIndex || 0) / Math.max(1, r.totalWords || 1)) * 100);
          const bmCount = (r.bookmarks || []).length;
          return `
          <div class="list-item-card">
            <div class="list-item-info">
              <div class="list-item-title">${r.sourceType === 'ocr-pdf' ? '🔍' : '📘'} ${this._escapeHtml(r.title)}</div>
              <div class="list-item-meta">İlerleme: %${pct} (${(r.lastWordIndex || 0) + 1}/${r.totalWords} kelime) • ${bmCount} Ayraç</div>
            </div>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-primary btn-open-recent" data-hash="${r.docHash}" style="padding:5px 10px; font-size:0.78rem;">Devam Et</button>
              <button class="btn btn-del-recent" data-hash="${r.docHash}" style="padding:5px 9px; font-size:0.78rem;">🗑</button>
            </div>
          </div>`;
        })
        .join('');

      recentListEl.querySelectorAll('.btn-open-recent').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const fullDoc = await window.storageManager.getDocumentState(btn.dataset.hash);
          if (fullDoc && Array.isArray(fullDoc.tokens) && fullDoc.tokens.length) {
            const repairedTokens = window.smartBookParser.repairTokenList(fullDoc.tokens);
            this.currentDoc = {
              docHash: fullDoc.docHash,
              title: fullDoc.title,
              sourceType: fullDoc.sourceType,
              tokens: repairedTokens,
              pageSummaries: fullDoc.rawStructure ? fullDoc.rawStructure.pageSummaries : [],
              stats: fullDoc.rawStructure ? fullDoc.rawStructure.stats : {},
              bookmarks: fullDoc.bookmarks || []
            };
            const targetW = this._determineTargetResumeWord(fullDoc);
            this._ActivateCurrentDocument(targetW, true);
            this.closeBookmarksModal();
          }
        });
      });

      recentListEl.querySelectorAll('.btn-del-recent').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await window.storageManager.deleteDocument(btn.dataset.hash);
          await this.renderBookmarksModalContent();
        });
      });
    }
  }

  // ==========================================================================
  // TASARIM TEMALARI (APPLE / LINEAR / KINDLE)
  // ==========================================================================

  switchTheme(themeName) {
    if (!['apple', 'linear', 'kindle'].includes(themeName)) return;

    let defaultBg = '#000000';
    let defaultFg = '#f5f5f7';

    if (themeName === 'apple') {
      defaultBg = '#000000';
      defaultFg = '#f5f5f7';
    } else if (themeName === 'linear') {
      defaultBg = '#000000';
      defaultFg = '#ffff00';
    } else if (themeName === 'kindle') {
      defaultBg = '#f9f4ea';
      defaultFg = '#241c15';
    }

    const updated = {
      theme: themeName,
      backgroundColor: defaultBg,
      fontColor: defaultFg
    };

    this.settings = window.storageManager.saveSettings(updated);
    this.applyTheme(themeName);
    this.applyVisualSettings();

    if (this.el.setBgColor) this.el.setBgColor.value = defaultBg;
    if (this.el.setFontColor) this.el.setFontColor.value = defaultFg;
    this.updateSettingsLivePreview();

    if (this.engine) {
      this.engine.updateSettings(this.settings);
      this.renderChunk(
        this.engine.getCurrentChunk(),
        this.engine.currentChunkIndex,
        this.engine.chunks.length
      );
    }
  }

  applyTheme(themeName) {
    const valid = ['apple', 'linear', 'kindle'].includes(themeName) ? themeName : 'apple';
    document.documentElement.setAttribute('data-theme', valid);

    // Mobil Durum Çubuğu (Status Bar) Rengini Güncelle
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', valid === 'kindle' ? '#f4ebd9' : (valid === 'linear' ? '#08090a' : '#0c0e14'));
    }

    // Header Segmented Kontrolü Senkronize Et
    document.querySelectorAll('#headerThemeSelector .theme-seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeVal === valid);
    });

    // Ayarlar Modalı Kartlarını Senkronize Et
    document.querySelectorAll('#modalThemeSelector .theme-option-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.themeVal === valid);
    });
  }

  // ==========================================================================
  // SETTINGS MODAL (Yüklenen Görsel İle Birebir Uyumlu)
  // ==========================================================================

  openSettingsModal() {
    this.engine.pause();
    const s = this.settings;
    const activeTheme = s.theme || 'apple';
    document.querySelectorAll('#modalThemeSelector .theme-option-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.themeVal === activeTheme);
    });

    this.el.setWpm.value = s.wpm;
    this.el.setChunkSize.value = s.chunkSize;
    this.el.setWindowWidth.value = s.windowWidth;
    this.el.setWindowHeight.value = s.windowHeight;
    this.el.setFontSize.value = s.fontSize;
    this.el.setFontColor.value = s.fontColor;
    this.el.setBgColor.value = s.backgroundColor;
    this.el.setAlignment.value = s.alignment;
    this.el.setSpeedVariability.checked = s.speedVariability !== false;
    this.el.setSentenceBreak.checked = s.sentenceBreak !== false;
    this.el.setSentencePause.checked = s.sentencePause !== false;
    this.el.setSkipStopwords.checked = Boolean(s.skipStopwords);
    this.el.setDetectHeadings.checked = s.detectHeadings !== false;
    this.el.setInlineFootnotes.checked = s.inlineFootnotes !== false;
    this.el.setSkipBoilerplate.checked = s.skipBoilerplate !== false;

    this.updateSettingsLivePreview();
    this.el.settingsModal.classList.remove('hidden');
  }

  closeSettingsModal() {
    this.el.settingsModal.classList.add('hidden');
  }

  toggleSettingsModal() {
    if (this.el.settingsModal.classList.contains('hidden')) {
      this.openSettingsModal();
    } else {
      this.closeSettingsModal();
    }
  }

  updateSettingsLivePreview() {
    const preview = this.el.settingsLivePreview;
    const cs = Math.max(1, Math.min(10, parseInt(this.el.setChunkSize.value, 10) || 3));
    const sampleWords = ['Hızlı', 'okuma', 'zihnin', 'odaklanma', 'gücünü', 'artırır.'];
    preview.style.backgroundColor = this.el.setBgColor.value;
    preview.style.color = this.el.setFontColor.value;
    preview.style.fontSize = `${Math.min(44, parseInt(this.el.setFontSize.value, 10) || 28)}px`;
    preview.style.justifyContent =
      this.el.setAlignment.value === 'left'
        ? 'flex-start'
        : this.el.setAlignment.value === 'right'
        ? 'flex-end'
        : 'center';
    preview.textContent = sampleWords.slice(0, cs).join(' ');
  }

  async saveSettingsFromModal() {
    const prevBoilerplate = this.settings.skipBoilerplate;
    const prevHeadings = this.settings.detectHeadings;
    const prevFootnotes = this.settings.inlineFootnotes;

    const updated = {
      theme: this.settings.theme || 'apple',
      wpm: Math.max(50, Math.min(2000, parseInt(this.el.setWpm.value, 10) || 325)),
      chunkSize: Math.max(1, Math.min(10, parseInt(this.el.setChunkSize.value, 10) || 3)),
      windowWidth: Math.max(280, Math.min(1800, parseInt(this.el.setWindowWidth.value, 10) || 750)),
      windowHeight: Math.max(180, Math.min(1200, parseInt(this.el.setWindowHeight.value, 10) || 500)),
      fontSize: Math.max(14, Math.min(96, parseInt(this.el.setFontSize.value, 10) || 32)),
      fontColor: this.el.setFontColor.value || (this.settings.theme === 'kindle' ? '#241c15' : '#f5f5f7'),
      backgroundColor: this.el.setBgColor.value || (this.settings.theme === 'kindle' ? '#f9f4ea' : '#000000'),
      alignment: this.el.setAlignment.value || 'center',
      speedVariability: this.el.setSpeedVariability.checked,
      sentenceBreak: this.el.setSentenceBreak.checked,
      sentencePause: this.el.setSentencePause.checked,
      skipStopwords: this.el.setSkipStopwords.checked,
      detectHeadings: this.el.setDetectHeadings.checked,
      inlineFootnotes: this.el.setInlineFootnotes.checked,
      skipBoilerplate: this.el.setSkipBoilerplate.checked
    };

    this.settings = window.storageManager.saveSettings(updated);
    this.applyVisualSettings();

    // Eğer kitap ayrıştırma kuralları değiştiyse ve ham metin/sayfalar mevcutsa yeniden ayrıştır
    const parserRulesChanged =
      prevBoilerplate !== updated.skipBoilerplate ||
      prevHeadings !== updated.detectHeadings ||
      prevFootnotes !== updated.inlineFootnotes;

    if (parserRulesChanged && this.currentDoc.rawPages) {
      const rebuilt = window.smartBookParser.buildStructuredBook(this.currentDoc.rawPages, {
        skipBoilerplate: updated.skipBoilerplate,
        detectHeadings: updated.detectHeadings,
        inlineFootnotes: updated.inlineFootnotes
      });
      this.currentDoc.tokens = rebuilt.tokens;
      this.currentDoc.pageSummaries = rebuilt.pageSummaries;
      this.currentDoc.stats = rebuilt.stats;
      this.engine.loadTokens(rebuilt.tokens, 0);
      this.updateSmartStatsPill();
    } else if (parserRulesChanged && this.currentDoc.rawText) {
      await this.loadPlainTextDocument(this.currentDoc.rawText, this.currentDoc.title);
    } else {
      this.engine.updateSettings(this.settings);
      this.renderChunk(
        this.engine.getCurrentChunk(),
        this.engine.currentChunkIndex,
        this.engine.chunks.length
      );
    }

    this.closeSettingsModal();
  }

  // ==========================================================================
  // NEW TEXT / PDF MODAL (n)
  // ==========================================================================

  openNewTextModal() {
    this.engine.pause();
    this.el.newTextModal.classList.remove('hidden');
  }

  closeNewTextModal() {
    this.el.newTextModal.classList.add('hidden');
  }

  toggleNewTextModal() {
    if (this.el.newTextModal.classList.contains('hidden')) {
      this.openNewTextModal();
    } else {
      this.closeNewTextModal();
    }
  }

  async handlePasteTextSubmit() {
    const text = this.el.pasteTextarea.value.trim();
    const title = this.el.pasteTitleInput.value.trim();
    if (!text) {
      alert('Lütfen okumak istediğiniz metni yapıştırın, bir PDF dosyası seçin veya bir link girin.');
      return;
    }

    // Eğer kullanıcı metin kutusuna tek başına bir internet adresi (URL) yapıştırdıysa
    // doğrudan akıllı link çekiciye yönlendir!
    if (/^https?:\/\/[^\s]+$/i.test(text)) {
      this.closeNewTextModal();
      await this.handleUrlFetch(text, title);
      return;
    }

    this.closeNewTextModal();
    await this.loadPlainTextDocument(text, title || 'Yapıştırılan Metin');
  }

  /**
   * Online PDF Linki veya Haber / Web Sitesi Linkini çeker, analiz eder ve okuyucuya aktarır.
   */
  async handleUrlFetch(customUrl = null, customTitle = null) {
    const rawUrl = (customUrl || (this.el.urlFetchInput ? this.el.urlFetchInput.value : '')).trim();
    if (!rawUrl) {
      alert('Lütfen geçerli bir internet adresi (URL) yapıştırın.');
      if (this.el.urlFetchInput) this.el.urlFetchInput.focus();
      return;
    }

    this.closeNewTextModal();
    this.engine.pause();

    try {
      this.el.ocrBanner.classList.remove('hidden');
      this.el.ocrBannerText.textContent = '⏳ İnternet bağlantısı kuruluyor...';

      const result = await window.smartBookParser.fetchUrlContent(rawUrl, (statusMsg) => {
        this.el.ocrBanner.classList.remove('hidden');
        this.el.ocrBannerText.textContent = statusMsg;
      });

      if (result.kind === 'pdf') {
        const forceOCR = Boolean(this.el.chkForceOcr && this.el.chkForceOcr.checked);
        await this.handlePdfBufferUpload(
          result.arrayBuffer,
          customTitle || result.title,
          forceOCR
        );
      } else if (result.kind === 'article') {
        this.el.ocrBanner.classList.add('hidden');
        await this.loadPlainTextDocument(result.text, customTitle || result.title);
      }
    } catch (err) {
      this.el.ocrBanner.classList.add('hidden');
      console.error('URL Okuma Hatası:', err);
      alert('Link çekilirken bir hata oluştu: ' + (err.message || err));
    }
  }

  // ==========================================================================
  // KİTAP ZEKASI VE BÖLÜM BAŞLIKLARI MODALI
  // ==========================================================================

  openStructureModal() {
    this.engine.pause();
    const s = this.currentDoc.stats || {};
    this.el.structureSummaryBox.innerHTML = `
      Bu belgede toplam <strong>${s.totalPages || 1} sayfa</strong> ve <strong>${this.currentDoc.tokens.length} kelime/öğe</strong> analiz edildi.<br/>
      • Otomatik filtrelenen künye/kaynakça sayfası: <strong>${s.skippedPagesCount || 0}</strong><br/>
      • Tespit edilen bölüm/konu başlığı: <strong>${s.headingsCount || 0}</strong> (Başlıklarda çerçeve ve uzun bekleme uygulanır)<br/>
      • Metin içine yerleştirilen dipnot: <strong>${s.footnotesCount || 0}</strong> (Dipnotlar cümle içinde sırası geldiğinde okunur)
    `;

    // Tespit edilen başlıklar
    const headings = this.currentDoc.tokens.filter((t) => t.type === 'heading');
    if (!headings.length) {
      this.el.detectedHeadingsList.innerHTML =
        '<div style="font-size:0.82rem; color:var(--text-muted); padding:6px;">Bu metinde ayrı bir başlık satırı tespit edilmedi.</div>';
    } else {
      this.el.detectedHeadingsList.innerHTML = headings
        .map(
          (h) => `
        <div class="list-item-card">
          <div class="list-item-info">
            <div class="list-item-title">📑 ${this._escapeHtml(h.text)}</div>
            <div class="list-item-meta">Sayfa ${h.page || 1} • ${h.index + 1}. kelime</div>
          </div>
          <button class="btn btn-primary btn-jump-heading" data-word="${h.index}" style="padding:5px 10px; font-size:0.78rem;">
            Bölüme Git
          </button>
        </div>`
        )
        .join('');

      this.el.detectedHeadingsList.querySelectorAll('.btn-jump-heading').forEach((btn) => {
        btn.addEventListener('click', () => {
          const wIdx = parseInt(btn.dataset.word, 10) || 0;
          this.engine.seekToWordIndex(wIdx, true);
          this.closeStructureModal();
        });
      });
    }

    // Sayfa filtre raporu
    const pages = this.currentDoc.pageSummaries || [];
    if (!pages.length) {
      this.el.pageFilterReportList.innerHTML =
        '<div style="font-size:0.82rem; color:var(--text-muted); padding:6px;">Sayfa raporu mevcut değil.</div>';
    } else {
      this.el.pageFilterReportList.innerHTML = pages
        .map(
          (p) => `
        <div class="list-item-card">
          <div class="list-item-info">
            <div class="list-item-title">
              Sayfa ${p.pageNumber}: ${p.skipped ? '🚫 Atlandı (' + p.reason + ')' : '✅ Okumaya Dahil (' + p.reason + ')'}
            </div>
            <div class="list-item-meta">${this._escapeHtml(p.preview || '')}</div>
          </div>
          <button class="btn btn-toggle-page-skip" data-page="${p.pageNumber}" data-skipped="${p.skipped ? '1' : '0'}" style="padding:5px 10px; font-size:0.76rem;">
            ${p.skipped ? 'Okumaya Dahil Et' : 'Bu Sayfayı Atla'}
          </button>
        </div>`
        )
        .join('');

      this.el.pageFilterReportList.querySelectorAll('.btn-toggle-page-skip').forEach((btn) => {
        btn.addEventListener('click', () => {
          const pageNum = parseInt(btn.dataset.page, 10);
          const currentlySkipped = btn.dataset.skipped === '1';
          this.toggleManualPageOverride(pageNum, !currentlySkipped);
        });
      });
    }

    this.el.structureModal.classList.remove('hidden');
  }

  toggleManualPageOverride(pageNumber, shouldSkip) {
    if (!this.currentDoc.manualPageOverrides) {
      this.currentDoc.manualPageOverrides = {};
    }
    this.currentDoc.manualPageOverrides[pageNumber] = shouldSkip;

    let pagesToRebuild = this.currentDoc.rawPages;
    if (!pagesToRebuild && this.currentDoc.rawText) {
      pagesToRebuild = window.smartBookParser._splitPlainTextIntoVirtualPages(this.currentDoc.rawText);
    }

    if (pagesToRebuild) {
      const rebuilt = window.smartBookParser.buildStructuredBook(pagesToRebuild, {
        skipBoilerplate: this.settings.skipBoilerplate,
        detectHeadings: this.settings.detectHeadings,
        inlineFootnotes: this.settings.inlineFootnotes,
        manualPageOverrides: this.currentDoc.manualPageOverrides
      });
      this.currentDoc.tokens = rebuilt.tokens;
      this.currentDoc.pageSummaries = rebuilt.pageSummaries;
      this.currentDoc.stats = rebuilt.stats;
      this.engine.loadTokens(rebuilt.tokens, 0);
      this.updateSmartStatsPill();
      this.openStructureModal();
    }
  }

  closeStructureModal() {
    this.el.structureModal.classList.add('hidden');
  }

  closeAllModals() {
    this.closeSettingsModal();
    this.closeNewTextModal();
    this.closeBookmarksModal();
    this.closeStructureModal();
  }

  async toggleFullscreenLandscape() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape').catch(() => {});
        }
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.warn('Tam ekran geçişi yapılamadı:', e);
    }
  }

  _escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.hizliOkuApp = new HizliOkuApp();
});
