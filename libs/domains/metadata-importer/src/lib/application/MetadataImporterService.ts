import * as cheerio from 'cheerio';
import { Result } from '@wishlist/shared-kernel';
import { AvifImageProcessor } from '@wishlist/image-processor';

export interface ScrapedWishMetadata {
  title: string;
  description: string;
  priceDkk: number | null;
  productUrl: string;
  quantity: number;
  imageUrl?: string | null;
  avifImage?: {
    avifBase64: string;
    width: number;
    height: number;
    sizeBytes: number;
  } | null;
}

export class MetadataImporterService {
  /**
   * Normalizes a user-supplied URL (adds https:// if protocol is omitted).
   */
  public static normalizeUrl(rawUrl: string): URL {
    const trimmed = rawUrl.trim();
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol);
  }

  /**
   * Detects anti-bot / WAF challenge titles (Cloudflare, Akamai, DataDome, etc.)
   * so they are never mistaken for real product titles.
   */
  public static isBotChallengeTitle(raw?: string | null): boolean {
    if (!raw) return true;
    const t = raw.trim().toLowerCase();
    if (!t || t.length < 2) return true;
    const blockedPatterns = [
      'just a moment',
      'one moment, please',
      'attention required',
      'access denied',
      'security check',
      'robot check',
      'are you a human',
      'verifying you are human',
      'cloudflare',
      '403 forbidden',
      '404 not found',
      'bot verification',
      'ddos-guard',
      'pardon our interruption'
    ];
    return blockedPatterns.some((p) => t.includes(p));
  }

  /**
   * Parses a raw price string or number into whole DKK.
   * Properly isolates the first price token so strings like "529,95 kr.Tilgængelig nu" parse as 530.
   */
  public static parsePriceDkk(raw?: unknown): number | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw <= 10_000_000) {
      return Math.round(raw);
    }
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const p = MetadataImporterService.parsePriceDkk(item);
        if (p !== null) return p;
      }
      return null;
    }
    const str = String(raw).trim();
    if (!str) return null;

    // Match the first number token (supports "1.299,95", "1,299.95", "499,-", "529,95", "299")
    const match = str.match(/(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
    if (!match) return null;

    let token = match[1];
    if (token.includes(',') && token.includes('.')) {
      if (token.lastIndexOf(',') > token.lastIndexOf('.')) {
        // Danish/European: 1.299,95
        token = token.replace(/\./g, '').replace(',', '.');
      } else {
        // US/UK: 1,299.95
        token = token.replace(/,/g, '');
      }
    } else if (token.includes(',')) {
      const parts = token.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        token = `${parts[0]}.${parts[1]}`;
      } else {
        token = token.replace(/,/g, '');
      }
    } else if (token.includes('.')) {
      const parts = token.split('.');
      if (parts.length > 2) {
        token = token.replace(/\./g, '');
      } else if (parts.length === 2 && parts[1].length === 3 && str.toLowerCase().includes('kr')) {
        token = token.replace(/\./g, '');
      }
    }

    const parsed = parseFloat(token);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10_000_000) {
      return null;
    }
    return Math.round(parsed);
  }

  private static resolveAbsoluteUrl(baseUrl: string, maybeRelative?: string | null): string | null {
    if (!maybeRelative) return null;
    const cleaned = maybeRelative.trim();
    if (!cleaned || cleaned.startsWith('data:')) return cleaned || null;
    try {
      return new URL(cleaned, baseUrl).toString();
    } catch {
      return null;
    }
  }

  private static cleanTitle(rawTitle: string): string {
    if (MetadataImporterService.isBotChallengeTitle(rawTitle)) {
      return '';
    }
    const cleaned = rawTitle
      .replace(/\s+/g, ' ')
      .replace(/\s*(?:\||-|\u2013|\u2014|»)\s*(?:Køb|Shop|Find|Se\b|Fri fragt|Officiel).*$/i, '')
      .trim();
    if (cleaned.includes(' | ')) {
      const firstPart = cleaned.split(' | ')[0].trim();
      if (firstPart.length >= 3) return firstPart;
    }
    return cleaned;
  }

  /**
   * Queries GoWish/Ønskeskyen's public GraphQL product resolver for fast, anti-bot-resilient
   * Danish product metadata (title, price, imageUrls).
   */
  private static async fetchProductFromGoWishApi(targetUrl: string): Promise<{
    title?: string;
    priceDkk?: number | null;
    imageUrl?: string | null;
  } | null> {
    try {
      const res = await fetch('https://api.gowish.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://onskeskyen.dk',
          Referer: 'https://onskeskyen.dk/'
        },
        body: JSON.stringify({
          query: `
            query productByUrl($url: String!) {
              products {
                getByUrl(url: $url, countryCode: "DK") {
                  product {
                    title
                    price
                    currency
                    imageUrls
                  }
                }
              }
            }
          `,
          variables: { url: targetUrl }
        }),
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) return null;
      const json = await res.json();
      const prod = json?.data?.products?.getByUrl?.product;
      if (!prod) return null;
      return {
        title: typeof prod.title === 'string' ? prod.title.trim() : undefined,
        priceDkk: MetadataImporterService.parsePriceDkk(prod.price),
        imageUrl:
          Array.isArray(prod.imageUrls) && prod.imageUrls.length > 0
            ? String(prod.imageUrls[0])
            : null
      };
    } catch {
      return null;
    }
  }

  /**
   * Converts an image URL into a <=512x512px metadata-free AVIF, with fallback to image proxy
   * if the origin CDN blocks direct requests.
   */
  private static async downloadAndConvertToAvif(
    imageUrl: string,
    refererOrigin: string
  ): Promise<ScrapedWishMetadata['avifImage']> {
    const directRes = await AvifImageProcessor.processFromUrl(imageUrl, refererOrigin);
    if (directRes.isSuccess) {
      const p = directRes.getValue();
      return {
        avifBase64: p.buffer.toString('base64'),
        width: p.width,
        height: p.height,
        sizeBytes: p.sizeBytes
      };
    }

    // Fallback: if not already using proxy, try via image proxy to bypass CDN hotlink blocks
    if (!imageUrl.includes('img.gowish.com') && imageUrl.startsWith('http')) {
      const proxyUrl = `https://img.gowish.com/scrapers/v1/image/url?targetUrl=${encodeURIComponent(imageUrl)}&proxyGeoCountryCode=DK&width=800&height=800&fit=bounds`;
      const proxyRes = await AvifImageProcessor.processFromUrl(proxyUrl, 'https://onskeskyen.dk');
      if (proxyRes.isSuccess) {
        const p = proxyRes.getValue();
        return {
          avifBase64: p.buffer.toString('base64'),
          width: p.width,
          height: p.height,
          sizeBytes: p.sizeBytes
        };
      }
    }

    return null;
  }

  /**
   * Fetches HTML from a target URL using realistic browser headers, with automatic fallback
   * to social preview crawler headers (WhatsApp/Facebook) when sites block standard requests.
   * Strictly ignores 403/503 challenge pages.
   */
  private static async fetchHtmlWithFallbacks(urlStr: string): Promise<{ html: string; finalUrl: string }> {
    const attempts: Record<string, string>[] = [
      {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Upgrade-Insecure-Requests': '1'
      },
      {
        'User-Agent':
          'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php) WhatsApp/2.23.20.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'da-DK,da;q=0.9,en;q=0.8'
      }
    ];

    let bestHtml = '';
    let finalUrl = urlStr;
    for (const headers of attempts) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7500);
      try {
        const res = await fetch(urlStr, {
          signal: controller.signal,
          headers,
          redirect: 'follow'
        });
        if (res.url) {
          finalUrl = res.url;
        }
        if (!res.ok) {
          continue;
        }
        const text = await res.text();
        const $ = cheerio.load(text);
        const pageTitle = $('head > title').first().text().trim();
        if (pageTitle && MetadataImporterService.isBotChallengeTitle(pageTitle)) {
          continue;
        }
        if (text.length > bestHtml.length) {
          bestHtml = text;
        }
        if (
          text.includes('og:title') ||
          text.includes('application/ld+json') ||
          text.includes('__NEXT_DATA__') ||
          text.includes('__next_f')
        ) {
          return { html: text, finalUrl };
        }
      } catch {
        // Try next header profile
      } finally {
        clearTimeout(timeout);
      }
    }
    return { html: bestHtml, finalUrl };
  }

  /**
   * Recursively walks any JSON-LD object/array to extract Product / Offer details.
   */
  private static extractFromJsonLdNode(
    node: unknown,
    acc: {
      title?: string;
      description?: string;
      priceDkk?: number | null;
      imageUrl?: string | null;
    }
  ): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) {
        MetadataImporterService.extractFromJsonLdNode(item, acc);
      }
      return;
    }

    const rec = node as Record<string, unknown>;
    const rawType = rec['@type'];
    const typeStr = Array.isArray(rawType)
      ? rawType.map(String).join(' ').toLowerCase()
      : String(rawType || '').toLowerCase();

    const isProductLike =
      typeStr.includes('product') || 'offers' in rec || 'sku' in rec || 'gtin' in rec;

    if (isProductLike) {
      if (
        !acc.title &&
        typeof rec.name === 'string' &&
        !MetadataImporterService.isBotChallengeTitle(rec.name)
      ) {
        acc.title = rec.name.trim();
      }
      if (!acc.description && typeof rec.description === 'string' && rec.description.trim()) {
        acc.description = cheerio.load(rec.description).text().replace(/\s+/g, ' ').trim();
      }
      if (!acc.imageUrl && rec.image) {
        const imgVal = rec.image;
        if (typeof imgVal === 'string') {
          acc.imageUrl = imgVal;
        } else if (Array.isArray(imgVal) && imgVal.length > 0) {
          const first = imgVal[0];
          acc.imageUrl =
            typeof first === 'string'
              ? first
              : (first as Record<string, string>)?.url ||
                (first as Record<string, string>)?.contentUrl ||
                null;
        } else if (typeof imgVal === 'object' && imgVal !== null) {
          acc.imageUrl =
            (imgVal as Record<string, string>).url ||
            (imgVal as Record<string, string>).contentUrl ||
            null;
        }
      }
    }

    if (typeStr.includes('offer') || 'price' in rec || 'lowPrice' in rec) {
      if (acc.priceDkk === null || acc.priceDkk === undefined) {
        const p =
          MetadataImporterService.parsePriceDkk(rec.price) ??
          MetadataImporterService.parsePriceDkk(rec.lowPrice) ??
          MetadataImporterService.parsePriceDkk(
            (rec.priceSpecification as Record<string, unknown>)?.price
          );
        if (p !== null) {
          acc.priceDkk = p;
        }
      }
    }

    for (const [key, val] of Object.entries(rec)) {
      if (
        key === '@graph' ||
        key === 'mainEntity' ||
        key === 'offers' ||
        key === 'hasVariant' ||
        key === 'itemListElement' ||
        key === 'item'
      ) {
        MetadataImporterService.extractFromJsonLdNode(val, acc);
      }
    }
  }

  /**
   * Scrapes product metadata (title, description, price, image) from a single URL
   * and converts the discovered image into a <=512x512px metadata-free AVIF.
   */
  public static async scrapeProductUrl(targetUrl: string): Promise<Result<ScrapedWishMetadata>> {
    try {
      const parsedUrl = MetadataImporterService.normalizeUrl(targetUrl);

      // Run direct HTML fetch and GoWish product lookup in parallel for maximum speed & accuracy
      const [{ html }, gowishData] = await Promise.all([
        MetadataImporterService.fetchHtmlWithFallbacks(parsedUrl.toString()),
        MetadataImporterService.fetchProductFromGoWishApi(parsedUrl.toString())
      ]);

      const $ = cheerio.load(html || '');

      // 1. Extract from JSON-LD
      const ldExtracted: {
        title?: string;
        description?: string;
        priceDkk?: number | null;
        imageUrl?: string | null;
      } = {};

      $('script[type="application/ld+json"]').each((_, el) => {
        const rawJson = ($(el).html() || $(el).text() || '').trim();
        if (!rawJson) return;
        try {
          const parsed = JSON.parse(rawJson);
          MetadataImporterService.extractFromJsonLdNode(parsed, ldExtracted);
        } catch {
          try {
            const sanitized = rawJson.replace(/[\r\n\t]+/g, ' ');
            MetadataImporterService.extractFromJsonLdNode(JSON.parse(sanitized), ldExtracted);
          } catch {
            // Ignore malformed JSON-LD
          }
        }
      });

      // 2. Extract from OpenGraph / Meta / Microdata / DOM
      const ogTitle =
        $('meta[property="og:title"]').attr('content') ||
        $('meta[name="og:title"]').attr('content') ||
        $('meta[name="twitter:title"]').attr('content') ||
        $('meta[property="twitter:title"]').attr('content') ||
        '';

      const domH1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
      const docTitle = $('head > title').first().text().replace(/\s+/g, ' ').trim();

      let title = MetadataImporterService.cleanTitle(
        ldExtracted.title || gowishData?.title || ogTitle || domH1 || docTitle || ''
      );

      let description =
        ldExtracted.description ||
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        $('meta[name="twitter:description"]').attr('content') ||
        $('[itemprop="description"]').first().text().replace(/\s+/g, ' ').trim() ||
        '';

      // 3. Extract Price from all possible sources
      let priceDkk: number | null = ldExtracted.priceDkk ?? gowishData?.priceDkk ?? null;
      if (priceDkk === null) {
        const priceCandidates = [
          $('meta[property="product:price:amount"]').attr('content'),
          $('meta[property="og:price:amount"]').attr('content'),
          $('meta[name="twitter:data1"]').attr('content'),
          $('[itemprop="price"]').attr('content'),
          $('[itemprop="lowPrice"]').attr('content'),
          $('[data-product-price]').attr('data-product-price'),
          $('[data-price]').attr('data-price'),
          $('[itemprop="price"]').first().text(),
          $('[data-test*="price" i]').first().text(),
          $('[data-testid*="price" i]').first().text(),
          $('.product-price, .price-sales, .current-price, .price').first().text()
        ];
        for (const cand of priceCandidates) {
          const parsed = MetadataImporterService.parsePriceDkk(cand);
          if (parsed !== null) {
            priceDkk = parsed;
            break;
          }
        }
      }

      if (priceDkk === null && html) {
        const inlinePriceMatch =
          html.match(
            /"(?:price|currentPrice|salesPrice|priceAmount)"\s*:\s*"?(\d+(?:[.,]\d{1,2})?)"?/i
          ) || html.match(/(\d{1,5}(?:[.,]\d{2})?)\s*(?:kr\.?|DKK)/i);
        if (inlinePriceMatch) {
          priceDkk = MetadataImporterService.parsePriceDkk(inlinePriceMatch[1]);
        }
      }

      // 4. Extract Image URL from all possible sources
      let rawImageUrl =
        ldExtracted.imageUrl ||
        $('meta[property="og:image:secure_url"]').attr('content') ||
        $('meta[property="og:image"]').attr('content') ||
        $('meta[name="og:image"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content') ||
        $('meta[property="twitter:image"]').attr('content') ||
        $('link[rel="image_src"]').attr('href') ||
        $('[itemprop="image"]').attr('src') ||
        $('[itemprop="image"]').attr('content') ||
        gowishData?.imageUrl ||
        $('main img[src], article img[src], [class*="product" i] img[src]').first().attr('src') ||
        null;

      // 5. Fallback to Microlink headless extraction if title, description, image, or price is still missing
      if (!title || !description || !rawImageUrl || priceDkk === null) {
        try {
          const mlUrl = new URL('https://api.microlink.io/');
          mlUrl.searchParams.set('url', parsedUrl.toString());
          mlUrl.searchParams.set(
            'data.priceMeta.selector',
            'meta[property="product:price:amount"], meta[property="og:price:amount"], [itemprop="price"]'
          );
          mlUrl.searchParams.set('data.priceMeta.attr', 'content');
          mlUrl.searchParams.set(
            'data.priceText.selector',
            '[data-test*="price"], [data-testid*="price"], [itemprop="price"], [class*="price" i]'
          );
          mlUrl.searchParams.set('data.priceText.attr', 'text');

          const mlRes = await fetch(mlUrl.toString(), { signal: AbortSignal.timeout(7500) });
          if (mlRes.ok) {
            const mlJson = await mlRes.json();
            const mlData = mlJson?.data;
            if (mlData) {
              if (!title && mlData.title && !MetadataImporterService.isBotChallengeTitle(mlData.title)) {
                title = MetadataImporterService.cleanTitle(String(mlData.title));
              }
              if (!description && mlData.description) {
                description = String(mlData.description).trim();
              }
              if (!rawImageUrl && mlData.image?.url) {
                rawImageUrl = String(mlData.image.url);
              }
              if (priceDkk === null) {
                priceDkk =
                  MetadataImporterService.parsePriceDkk(mlData.priceMeta) ??
                  MetadataImporterService.parsePriceDkk(mlData.priceText);
              }
            }
          }
        } catch {
          // Ignore Microlink fallback errors
        }
      }

      const resolvedImageUrl = MetadataImporterService.resolveAbsoluteUrl(
        parsedUrl.toString(),
        rawImageUrl
      );

      let avifImage: ScrapedWishMetadata['avifImage'] = null;
      if (resolvedImageUrl) {
        avifImage = await MetadataImporterService.downloadAndConvertToAvif(
          resolvedImageUrl,
          parsedUrl.origin
        );
      }

      if (!title) {
        const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
        const lastSegment = pathSegments[pathSegments.length - 1] || '';
        const slugTitle = decodeURIComponent(lastSegment)
          .replace(/\.(html?|php|aspx?)$/i, '')
          .replace(/[-_]+/g, ' ')
          .trim();
        title = slugTitle.length > 2 ? slugTitle : parsedUrl.hostname.replace(/^www\./, '');
      }

      return Result.ok({
        title: title.slice(0, 140),
        description: description.slice(0, 500),
        priceDkk,
        productUrl: parsedUrl.toString(),
        quantity: 1,
        imageUrl: resolvedImageUrl,
        avifImage
      });
    } catch (err) {
      return Result.fail(
        `Could not scrape product metadata: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Helper to walk any JSON tree (from __NEXT_DATA__, Next.js App Router __next_f, or GraphQL)
   * and collect wish items.
   */
  private static walkObjectForWishes(
    obj: unknown,
    baseUrl: string,
    extracted: ScrapedWishMetadata[]
  ): void {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        MetadataImporterService.walkObjectForWishes(item, baseUrl, extracted);
      }
      return;
    }

    const rec = obj as Record<string, unknown>;
    const rawTitle =
      typeof rec.title === 'string'
        ? rec.title.trim()
        : typeof rec.name === 'string' && String(rec.__typename || '').toLowerCase().includes('wish')
          ? rec.name.trim()
          : '';

    const looksLikeWish =
      rawTitle.length > 1 &&
      rawTitle.length < 200 &&
      !MetadataImporterService.isBotChallengeTitle(rawTitle) &&
      ('price' in rec ||
        'url' in rec ||
        'redirectUrl' in rec ||
        'link' in rec ||
        'photos' in rec ||
        'photo' in rec ||
        'imageUrl' in rec ||
        String(rec.__typename || '').toLowerCase().includes('wish'));

    if (looksLikeWish) {
      const description = typeof rec.description === 'string' ? rec.description.trim() : '';
      const priceDkk = MetadataImporterService.parsePriceDkk(rec.price ?? rec.priceAmount ?? null);
      const rawLink = rec.url || rec.redirectUrl || rec.link || rec.productUrl;
      const productUrl =
        typeof rawLink === 'string' && rawLink.startsWith('http') ? rawLink : baseUrl;

      const photos = Array.isArray(rec.photos) ? rec.photos : [];
      const firstPhoto =
        photos.length > 0
          ? typeof photos[0] === 'string'
            ? photos[0]
            : (photos[0] as Record<string, string>)?.url ||
              (photos[0] as Record<string, string>)?.originalUrl
          : typeof rec.photo === 'string'
            ? rec.photo
            : typeof rec.imageUrl === 'string'
              ? rec.imageUrl
              : typeof rec.image === 'string'
                ? rec.image
                : null;

      const quantity = typeof rec.quantity === 'number' && rec.quantity > 0 ? rec.quantity : 1;

      if (!extracted.some((e) => e.title.toLowerCase() === rawTitle.toLowerCase())) {
        extracted.push({
          title: rawTitle.slice(0, 140),
          description: description.slice(0, 500),
          priceDkk,
          productUrl,
          quantity,
          imageUrl: MetadataImporterService.resolveAbsoluteUrl(baseUrl, firstPhoto),
          avifImage: null
        });
      }
    }

    for (const [key, val] of Object.entries(rec)) {
      if (key === 'initialI18nStore' || key === 'runtimeConfig') continue;
      MetadataImporterService.walkObjectForWishes(val, baseUrl, extracted);
    }
  }

  /**
   * Attempts to fetch wishes directly from Ønskeskyen / GoWish GraphQL API if a wishlist ID is in the URL.
   */
  private static async fetchOenskeskyenWishlistViaGraphQL(
    resolvedUrl: string,
    extracted: ScrapedWishMetadata[]
  ): Promise<void> {
    // Match /wishlists/<id> or /wishlist/<id> or /archived/<id>
    const wlMatch = resolvedUrl.match(/\/(?:wishlists?|archived)\/([A-Za-z0-9_-]{4,})/i);
    if (!wlMatch) return;
    const wishlistId = wlMatch[1];

    try {
      const res = await fetch('https://api.gowish.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://onskeskyen.dk',
          Referer: 'https://onskeskyen.dk/'
        },
        body: JSON.stringify({
          query: `
            query getSharedWishlist($id: ID!) {
              wishlist(id: $id) {
                id
                title
                wishes(input: { cursor: 0, limit: 100 }) {
                  data {
                    id
                    title
                    description
                    price
                    quantity
                    photos
                    url
                    redirectUrl
                  }
                }
              }
            }
          `,
          variables: { id: wishlistId }
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (res.ok) {
        const json = await res.json();
        MetadataImporterService.walkObjectForWishes(json, resolvedUrl, extracted);
      }
    } catch {
      // Ignore GraphQL errors
    }

    // Also try creator wishlist endpoint if it's a creator list (/creator/<slug>/wishlist/<id>)
    if (extracted.length === 0) {
      try {
        const res = await fetch('https://api.gowish.com/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://onskeskyen.dk',
            Referer: 'https://onskeskyen.dk/'
          },
          body: JSON.stringify({
            query: `
              query getCreatorWishlist($id: String!) {
                creators {
                  creatorList {
                    getById(id: $id) {
                      creatorProducts(input: { cursor: 0, limit: 100 }) {
                        data {
                          id
                          title
                          description
                          price
                          photo
                          url
                        }
                      }
                    }
                  }
                }
              }
            `,
            variables: { id: wishlistId }
          }),
          signal: AbortSignal.timeout(6000)
        });
        if (res.ok) {
          const json = await res.json();
          MetadataImporterService.walkObjectForWishes(json, resolvedUrl, extracted);
        }
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Imports wishes from a public Ønskeskyen share link (onskeskyen.dk / gowish.com)
   * or any shared wishlist page, and converts discovered images into <=512x512px metadata-free AVIF.
   */
  public static async scrapeOenskeskyenShareUrl(
    shareUrl: string,
    convertImagesToAvif = false
  ): Promise<Result<ScrapedWishMetadata[]>> {
    try {
      const parsedUrl = MetadataImporterService.normalizeUrl(shareUrl);
      const { html, finalUrl } = await MetadataImporterService.fetchHtmlWithFallbacks(
        parsedUrl.toString()
      );
      const extracted: ScrapedWishMetadata[] = [];

      // 1. Try Ønskeskyen / GoWish GraphQL API using the resolved URL
      await MetadataImporterService.fetchOenskeskyenWishlistViaGraphQL(finalUrl, extracted);

      const $ = cheerio.load(html || '');

      // 2. Check __NEXT_DATA__ (Next.js Pages Router / Apollo cache)
      if (extracted.length === 0) {
        const nextDataScript = $('#__NEXT_DATA__').html() || $('#__NEXT_DATA__').text();
        if (nextDataScript) {
          try {
            const nextData = JSON.parse(nextDataScript);
            MetadataImporterService.walkObjectForWishes(nextData, finalUrl, extracted);
          } catch {
            // Ignore malformed __NEXT_DATA__
          }
        }
      }

      // 3. Check Next.js App Router RSC payload (`self.__next_f.push([1, "..."])`)
      if (extracted.length === 0) {
        $('script').each((_, el) => {
          const scriptContent = $(el).html() || $(el).text() || '';
          if (!scriptContent.includes('__next_f.push')) return;

          const pushMatches = scriptContent.matchAll(/__next_f\.push\(\[\d+,\s*("(?:\\.|[^"\\])*")\]\)/g);
          for (const m of pushMatches) {
            try {
              const unescapedChunk: string = JSON.parse(m[1]);
              const lines = unescapedChunk.split('\n');
              for (const line of lines) {
                const colonIdx = line.indexOf(':');
                const jsonCandidate = colonIdx !== -1 ? line.slice(colonIdx + 1) : line;
                if (jsonCandidate.startsWith('{') || jsonCandidate.startsWith('[')) {
                  try {
                    const parsedLine = JSON.parse(jsonCandidate);
                    MetadataImporterService.walkObjectForWishes(parsedLine, finalUrl, extracted);
                  } catch {
                    // Not pure JSON on this line
                  }
                }
              }
            } catch {
              // Ignore unparseable chunk
            }
          }
        });
      }

      // 4. Check JSON-LD ItemList / Product list
      if (extracted.length === 0) {
        $('script[type="application/ld+json"]').each((_, el) => {
          const rawJson = ($(el).html() || $(el).text() || '').trim();
          if (!rawJson) return;
          try {
            const parsed = JSON.parse(rawJson);
            MetadataImporterService.walkObjectForWishes(parsed, finalUrl, extracted);
          } catch {
            // Ignore
          }
        });
      }

      // 5. Fallback: Check HTML product/wish cards on the page
      if (extracted.length === 0) {
        $('article, [data-testid*="wish" i], [class*="wish" i], [class*="card" i]').each((_, el) => {
          const cardTitle = $(el)
            .find('h2, h3, h4, [class*="title" i], [class*="name" i]')
            .first()
            .text()
            .replace(/\s+/g, ' ')
            .trim();
          if (!cardTitle || cardTitle.length < 2 || MetadataImporterService.isBotChallengeTitle(cardTitle))
            return;
          const cardDesc = $(el)
            .find('p, [class*="description" i]')
            .first()
            .text()
            .replace(/\s+/g, ' ')
            .trim();
          const cardPriceText = $(el).find('[class*="price" i]').first().text().trim();
          const cardImg =
            $(el).find('img').first().attr('src') ||
            $(el).find('img').first().attr('data-src') ||
            null;
          const cardLink =
            $(el).find('a[href^="http"]').first().attr('href') || finalUrl;

          if (!extracted.some((e) => e.title.toLowerCase() === cardTitle.toLowerCase())) {
            extracted.push({
              title: cardTitle.slice(0, 140),
              description: cardDesc.slice(0, 500),
              priceDkk: MetadataImporterService.parsePriceDkk(cardPriceText),
              productUrl: cardLink,
              quantity: 1,
              imageUrl: MetadataImporterService.resolveAbsoluteUrl(finalUrl, cardImg),
              avifImage: null
            });
          }
        });
      }

      // 6. Fallback: Single product/wish scrape
      if (extracted.length === 0) {
        const single = await MetadataImporterService.scrapeProductUrl(finalUrl);
        if (single.isSuccess) {
          extracted.push(single.getValue());
        }
      }

      if (convertImagesToAvif && extracted.length > 0) {
        const originUrl = new URL(finalUrl).origin;
        await Promise.all(
          extracted.map(async (item) => {
            if (item.imageUrl && !item.avifImage) {
              item.avifImage = await MetadataImporterService.downloadAndConvertToAvif(
                item.imageUrl,
                originUrl
              );
            }
          })
        );
      }

      return Result.ok(extracted);
    } catch (err) {
      return Result.fail(
        `Failed to import from link: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
