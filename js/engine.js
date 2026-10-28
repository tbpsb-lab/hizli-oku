/**
 * HızlıOku Pro - RSVP Hız Okuma Motoru (Engine)
 *
 * Özellikler:
 * - Dinamik öbekleme (Chunking): chunkSize kadar kelime gösterimi ve sağa/sola tam öbek kadar kaydırma
 * - Speed Variability: Uzun/kısa öbeklerde ortalama WPM'i koruyan akıllı süre hesabı
 * - Cümle ve paragraf sonlarında yeni öbeğe geçme ve mikro duraklama
 * - Başlıklarda özel çerçeve ve uzun bekleme süresi
 * - Dipnotlarda görsel geçiş ve ana metne kesintisiz dönüş
 * - ORP (Optimal Recognition Point - Kırmızı odak harfi) hesaplama
 * - Context Peek: Duraklatıldığında içinde bulunulan cümleyi/paragrafı tam gösterme
 */

const STOPWORDS_SET = new Set([
  // Türkçe Stopwords
  'bir', 've', 'ile', 'için', 'bu', 'şu', 'o', 'de', 'da', 'ki', 'mi', 'mı', 'mu', 'mü',
  'ama', 'fakat', 'lakin', 'veya', 'ya', 'hem', 'ne', 'gibi', 'kadar', 'göre', 'üzere',
  'olan', 'olarak', 'ise', 'daha', 'çok', 'en', 'her', 'bazı', 'tüm', 'bütün',
  // İngilizce Stopwords
  'the', 'a', 'an', 'of', 'to', 'in', 'for', 'on', 'with', 'as', 'by', 'at', 'from',
  'that', 'this', 'it', 'is', 'are', 'was', 'were', 'be', 'been', 'or', 'and'
]);

class RSVPEngine {
  constructor(settings = {}, callbacks = {}) {
    this.settings = settings;
    this.callbacks = callbacks; // onChunkChange, onStateChange, onFinish

    this.tokens = [];
    this.chunks = [];
    this.wordToChunkMap = new Map();

    this.currentChunkIndex = 0;
    this.isPlaying = false;
    this.timerId = null;
    this.playSessionChunkCount = 0;
  }

  updateSettings(newSettings) {
    const currentWordIdx = this.getCurrentWordIndex();
    this.settings = { ...this.settings, ...newSettings };
    if (this.tokens.length > 0) {
      this.buildChunks();
      this.seekToWordIndex(currentWordIdx, false);
    }
  }

  /**
   * Token listesini yükler ve mevcut ayarlara göre öbekleri (chunks) oluşturur.
   */
  loadTokens(tokens, initialWordIndex = 0) {
    this.pause();
    this.tokens = Array.isArray(tokens) ? tokens : [];
    this.buildChunks();
    this.seekToWordIndex(initialWordIndex, true);
  }

  /**
   * Token dizisini ayarlara göre gösterim öbeklerine (chunks) böler.
   */
  buildChunks() {
    this.chunks = [];
    this.wordToChunkMap.clear();

    if (!this.tokens.length) return;

    const chunkSize = Math.max(1, Math.min(10, parseInt(this.settings.chunkSize, 10) || 1));
    const sentenceBreak = this.settings.sentenceBreak !== false;
    const skipStopwords = Boolean(this.settings.skipStopwords);

    let currentGroup = [];
    let currentGroupType = 'word'; // 'word' | 'footnote'

    const flushGroup = () => {
      if (!currentGroup.length) return;
      const chunkIdx = this.chunks.length;
      const firstToken = currentGroup[0];
      const lastToken = currentGroup[currentGroup.length - 1];
      const text = currentGroup.map((t) => t.text).join(' ');

      const chunkObj = {
        chunkIndex: chunkIdx,
        text,
        tokens: [...currentGroup],
        type: currentGroupType,
        footnoteId: firstToken.footnoteId || null,
        footnoteFullText: firstToken.footnoteFullText || null,
        hasFootnoteTrigger: currentGroup.some((t) => t.hasFootnote),
        startWordIndex: firstToken.index,
        endWordIndex: lastToken.index,
        page: firstToken.page || 1,
        isSentenceEnd: lastToken.isSentenceEnd,
        isParagraphEnd: lastToken.isParagraphEnd
      };

      for (const tok of currentGroup) {
        this.wordToChunkMap.set(tok.index, chunkIdx);
      }

      this.chunks.push(chunkObj);
      currentGroup = [];
    };

    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];

      // 1. Başlıklar her zaman tek başına özel bir çerçevede gösterilir
      if (token.type === 'heading') {
        flushGroup();
        const chunkIdx = this.chunks.length;
        this.wordToChunkMap.set(token.index, chunkIdx);
        this.chunks.push({
          chunkIndex: chunkIdx,
          text: token.text,
          tokens: [token],
          type: 'heading',
          isBookTitle: Boolean(token.isBookTitle),
          startWordIndex: token.index,
          endWordIndex: token.index,
          page: token.page || 1,
          isSentenceEnd: true,
          isParagraphEnd: true
        });
        continue;
      }

      // 2. Dipnot başlangıç etiketi (Örn: "📌 Dipnot 1:")
      if (token.type === 'footnote-start') {
        flushGroup();
        const chunkIdx = this.chunks.length;
        this.wordToChunkMap.set(token.index, chunkIdx);
        this.chunks.push({
          chunkIndex: chunkIdx,
          text: token.text,
          tokens: [token],
          type: 'footnote-start',
          footnoteId: token.footnoteId,
          footnoteFullText: token.footnoteFullText,
          startWordIndex: token.index,
          endWordIndex: token.index,
          page: token.page || 1,
          isSentenceEnd: false,
          isParagraphEnd: false
        });
        continue;
      }

      // 3. Normal kelime ile Dipnot kelimesi birbirine karışmasın
      const targetType = token.type === 'footnote' ? 'footnote' : 'word';
      if (currentGroup.length > 0 && currentGroupType !== targetType) {
        flushGroup();
      }
      currentGroupType = targetType;

      // 4. Stopwords kontrolü (Cümle sonu veya dipnot tetikleyicisi değilse atla)
      if (skipStopwords && !token.isSentenceEnd && !token.hasFootnote && this.tokens.length > 20) {
        const cleanLower = token.text.toLowerCase().replace(/[^a-zçğıöşü]/g, '');
        if (STOPWORDS_SET.has(cleanLower)) {
          // Haritada bir sonraki/mevcut öbeğe bağla ki indeks kaybolmasın
          this.wordToChunkMap.set(token.index, this.chunks.length);
          continue;
        }
      }

      currentGroup.push(token);

      const reachedSize = currentGroup.length >= chunkSize;
      const shouldBreakForSentence =
        sentenceBreak && (token.isSentenceEnd || token.isParagraphEnd || token.hasFootnote);

      if (reachedSize || shouldBreakForSentence) {
        flushGroup();
      }
    }

    flushGroup();
  }

  /**
   * Bir öbeğin ekranda kalacağı süreyi (ms) hesaplar.
   */
  calculateChunkDuration(chunk) {
    if (!chunk) return 200;

    const wpm = Math.max(50, Math.min(2000, parseInt(this.settings.wpm, 10) || 325));
    const chunkSizeSetting = Math.max(1, parseInt(this.settings.chunkSize, 10) || 1);
    const singleWordMs = 60000 / wpm;

    // 1. Başlık ise: Okuyucunun yeni bölümü idrak etmesi için uzun bekleme ve çerçeve
    if (chunk.type === 'heading') {
      const headingWords = chunk.text.split(/\s+/).length;
      return Math.max(1350, Math.min(3200, singleWordMs * Math.max(3.2, headingWords * 1.15)));
    }

    // 2. Dipnot geçiş kartı ise
    if (chunk.type === 'footnote-start') {
      return Math.max(700, singleWordMs * 2.0);
    }

    const actualWordCount = chunk.tokens ? chunk.tokens.length : 1;
    let duration;

    if (this.settings.speedVariability !== false) {
      // Speed variability açık: Kelime sayısına ve harf uzunluğuna göre esnet, ortalama WPM sabit kalsın
      const charLength = chunk.text.replace(/\s+/g, '').length;
      const expectedChars = chunkSizeSetting * 5.6;
      const charRatio = charLength / Math.max(1, expectedChars);
      const wordRatio = actualWordCount / chunkSizeSetting;
      const blendedFactor = Math.max(0.65, Math.min(1.55, wordRatio * 0.55 + charRatio * 0.45));
      duration = singleWordMs * chunkSizeSetting * blendedFactor;
    } else {
      // Sabit süre
      duration = singleWordMs * actualWordCount;
    }

    // Dipnot metni okunurken %15 daha sakin okut
    if (chunk.type === 'footnote') {
      duration *= 1.15;
    }

    // Cümle ve paragraf sonu duraklamaları
    if (this.settings.sentencePause !== false) {
      const trimmed = chunk.text.trim();
      if (chunk.isParagraphEnd) {
        duration += singleWordMs * 0.95;
      } else if (chunk.isSentenceEnd || /[.!?…]+['"”’\)]*$/.test(trimmed)) {
        duration += singleWordMs * 0.65;
      } else if (/[,;:—–]+$/.test(trimmed)) {
        duration += singleWordMs * 0.35;
      }
    }

    // Isınma Modu (Warm-up): Oku tuşuna basıldıktan sonraki ilk 6 öbekte yumuşak hızlanma
    if (this.settings.warmupMode && this.playSessionChunkCount < 6) {
      const warmupMultipliers = [1.45, 1.32, 1.22, 1.14, 1.08, 1.03];
      duration *= warmupMultipliers[this.playSessionChunkCount] || 1;
    }

    return Math.round(Math.max(45, duration));
  }

  /**
   * Spritz / ORP (Optimal Recognition Point) için odak harfi indeksini döndürür.
   */
  static computeORP(text) {
    const clean = (text || '').trim();
    if (!clean) return { prefix: '', pivot: '', suffix: '' };

    const len = clean.length;
    let pivotIdx = 0;
    if (len === 1) pivotIdx = 0;
    else if (len <= 5) pivotIdx = 1;
    else if (len <= 9) pivotIdx = 2;
    else if (len <= 13) pivotIdx = 3;
    else pivotIdx = 4;

    // Boşluğa denk gelirse yan harfe kaydır
    if (clean[pivotIdx] === ' ' && pivotIdx + 1 < len) {
      pivotIdx++;
    }

    return {
      prefix: clean.slice(0, pivotIdx),
      pivot: clean[pivotIdx] || '',
      suffix: clean.slice(pivotIdx + 1)
    };
  }

  play() {
    if (this.isPlaying) return;
    if (!this.chunks.length) return;

    if (this.currentChunkIndex >= this.chunks.length - 1) {
      this.currentChunkIndex = 0;
    }

    this.isPlaying = true;
    this.playSessionChunkCount = 0;
    this._notifyState();
    this._notifyChunk();
    this._scheduleNext();
  }

  pause() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.isPlaying) {
      this.isPlaying = false;
      this._notifyState();
      this._notifyChunk();
    }
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  restart() {
    this.pause();
    this.currentChunkIndex = 0;
    this._notifyChunk();
  }

  /**
   * Sağa / Sola kaydırma:
   * Kullanıcının istediği gibi tam ekrandaki öbek (chunk) kadar kaydırır:
   * - Tek kelime gösteriliyorsa 1 kelime
   * - 3 kelime gösteriliyorsa 3 kelime (1 öbek)
   */
  stepChunk(delta) {
    if (!this.chunks.length) return;
    const nextIdx = Math.max(0, Math.min(this.chunks.length - 1, this.currentChunkIndex + delta));
    this.currentChunkIndex = nextIdx;
    this._notifyChunk();

    if (this.isPlaying) {
      if (this.timerId) clearTimeout(this.timerId);
      this._scheduleNext();
    }
  }

  seekToChunkIndex(chunkIdx) {
    if (!this.chunks.length) return;
    this.currentChunkIndex = Math.max(0, Math.min(this.chunks.length - 1, chunkIdx));
    this._notifyChunk();
  }

  seekToWordIndex(wordIdx, notify = true) {
    if (!this.chunks.length) {
      this.currentChunkIndex = 0;
      if (notify) this._notifyChunk();
      return;
    }

    const targetWord = Math.max(0, Math.min(this.tokens.length - 1, wordIdx || 0));
    if (this.wordToChunkMap.has(targetWord)) {
      this.currentChunkIndex = this.wordToChunkMap.get(targetWord);
    } else {
      const foundIdx = this.chunks.findIndex(
        (c) => c.startWordIndex <= targetWord && c.endWordIndex >= targetWord
      );
      this.currentChunkIndex = foundIdx >= 0 ? foundIdx : 0;
    }

    if (notify) this._notifyChunk();
  }

  getCurrentChunk() {
    return this.chunks[this.currentChunkIndex] || null;
  }

  getCurrentWordIndex() {
    const ch = this.getCurrentChunk();
    return ch ? ch.startWordIndex : 0;
  }

  /**
   * Duraklatıldığında gösterilecek "Context Peek" (Tüm Cümle ve Çevre Bağlamı) verisini döndürür.
   */
  getContextWindow(radiusTokens = 28) {
    const currentChunk = this.getCurrentChunk();
    if (!currentChunk || !this.tokens.length) {
      return { items: [], activeStart: 0, activeEnd: 0 };
    }

    const centerStart = currentChunk.startWordIndex;
    const centerEnd = currentChunk.endWordIndex;

    // Cümle başını ve sonunu da kapsayacak şekilde genişlet
    let fromIdx = Math.max(0, centerStart - radiusTokens);
    let toIdx = Math.min(this.tokens.length - 1, centerEnd + radiusTokens);

    const items = [];
    for (let i = fromIdx; i <= toIdx; i++) {
      const tok = this.tokens[i];
      items.push({
        wordIndex: tok.index,
        text: tok.text,
        type: tok.type,
        isActive: tok.index >= centerStart && tok.index <= centerEnd
      });
    }

    return {
      items,
      activeStart: centerStart,
      activeEnd: centerEnd,
      currentChunk
    };
  }

  /**
   * Tahmini kalan okuma süresini (dakika:saniye) hesaplar.
   */
  getRemainingTimeStats() {
    if (!this.chunks.length) {
      return { percent: 0, remainingSeconds: 0, formattedTime: '0:00' };
    }

    const percent = Math.round(((this.currentChunkIndex + 1) / this.chunks.length) * 100);
    const remainingChunks = Math.max(0, this.chunks.length - 1 - this.currentChunkIndex);
    const chunkSize = Math.max(1, parseInt(this.settings.chunkSize, 10) || 1);
    const wpm = Math.max(50, parseInt(this.settings.wpm, 10) || 325);
    const remainingWords = remainingChunks * chunkSize;
    const remainingSeconds = Math.ceil((remainingWords / wpm) * 60);

    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    return {
      percent: Math.min(100, percent),
      remainingSeconds,
      formattedTime: `${mins}:${secs.toString().padStart(2, '0')}`
    };
  }

  _scheduleNext() {
    if (!this.isPlaying) return;
    const currentChunk = this.getCurrentChunk();
    if (!currentChunk) {
      this.pause();
      return;
    }

    const delay = this.calculateChunkDuration(currentChunk);
    this.timerId = setTimeout(() => {
      if (!this.isPlaying) return;
      if (this.currentChunkIndex < this.chunks.length - 1) {
        this.currentChunkIndex++;
        this.playSessionChunkCount++;
        this._notifyChunk();
        this._scheduleNext();
      } else {
        this.pause();
        if (this.callbacks.onFinish) {
          this.callbacks.onFinish();
        }
      }
    }, delay);
  }

  _notifyChunk() {
    if (this.callbacks.onChunkChange) {
      this.callbacks.onChunkChange(this.getCurrentChunk(), this.currentChunkIndex, this.chunks.length);
    }
  }

  _notifyState() {
    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange(this.isPlaying);
    }
  }
}

window.RSVPEngine = RSVPEngine;
