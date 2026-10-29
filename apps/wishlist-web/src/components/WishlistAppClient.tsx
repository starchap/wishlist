'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Card, Badge, Chat, Alert } from '@wishlist/lightly';
import { ChibiMascotSvg, ChibiGiftPlaceholderSvg } from '@wishlist/chibi-theme';
import { commonI18n, type Locale } from '@wishlist/i18n';
import { iamI18n, CHIBI_AVATARS, type SessionPayload, type InviteDto } from '@wishlist/domain-iam/client';
import { wishlistI18n, type WishlistSummaryDto } from '@wishlist/domain-wishlist/client';
import { metadataImporterI18n, type ScrapedWishMetadata } from '@wishlist/domain-metadata-importer/client';
import {
  giftingI18n,
  type PledgeType,
  type WishGiftStatus,
  type WishGiftingStateDto
} from '@wishlist/domain-gifting/client';
import {
  coordinationChatI18n,
  ALLOWED_QUICK_EMOJIS,
  type ChatMessageDto
} from '@wishlist/domain-coordination-chat/client';

interface WishlistAppClientProps {
  initialInviteToken?: string;
}

export function WishlistAppClient({ initialInviteToken }: WishlistAppClientProps) {
  const [locale, setLocale] = useState<Locale>('da');
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Navigation tab: 'my' | 'all' | 'admin'
  const [activeTab, setActiveTab] = useState<'my' | 'all' | 'admin'>('my');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Domain states
  const [wishlists, setWishlists] = useState<WishlistSummaryDto[]>([]);
  const [giftingStates, setGiftingStates] = useState<Record<string, WishGiftingStateDto>>({});
  const [invites, setInvites] = useState<InviteDto[]>([]);

  // Login / Invite Registration state
  const [inviteInfo, setInviteInfo] = useState<InviteDto | null>(null);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [avatarEmoji, setAvatarEmoji] = useState<string>(CHIBI_AVATARS[0]);
  const [authError, setAuthError] = useState<string | null>(null);

  // Add Wish Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [wishUrl, setWishUrl] = useState('');
  const [wishTitle, setWishTitle] = useState('');
  const [wishDesc, setWishDesc] = useState('');
  const [wishQty, setWishQty] = useState(1);
  const [wishPrice, setWishPrice] = useState('');
  const [wishImageDataUrl, setWishImageDataUrl] = useState<string | null>(null);
  const [scrapedAvif, setScrapedAvif] = useState<ScrapedWishMetadata['avifImage']>(null);
  const [scrapingStatus, setScrapingStatus] = useState<string | null>(null);
  const [savingWish, setSavingWish] = useState(false);

  // Ønskeskyen Import Modal state
  const [showOenskeskyenModal, setShowOenskeskyenModal] = useState(false);
  const [oenskeskyenUrl, setOenskeskyenUrl] = useState('');
  const [oenskeskyenPreview, setOenskeskyenPreview] = useState<ScrapedWishMetadata[]>([]);
  const [selectedImportIndices, setSelectedImportIndices] = useState<number[]>([]);
  const [importingOenskeskyen, setImportingOenskeskyen] = useState(false);

  // Admin Invite state
  const [newInviteLabel, setNewInviteLabel] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Co-giver Chat Modal & Notifications state
  const [activeChatWish, setActiveChatWish] = useState<{ id: string; title: string; giverCount: number } | null>(
    null
  );
  const [chatMessages, setChatMessages] = useState<ChatMessageDto[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [seenChatIds, setSeenChatIds] = useState<Record<string, string>>({});

  // Gift Pledge / Split-Gift Modal & Filter state
  const [giftStatusFilter, setGiftStatusFilter] = useState<'all' | WishGiftStatus>('all');
  const [activePledgeWish, setActivePledgeWish] = useState<{
    id: string;
    title: string;
    priceDkk: number | null;
  } | null>(null);
  const [pledgeType, setPledgeType] = useState<PledgeType>('full');
  const [pledgeAmountDkk, setPledgeAmountDkk] = useState<string>('');
  const [pledgePercentShare, setPledgePercentShare] = useState<number>(50);
  const [pledgeError, setPledgeError] = useState<string | null>(null);
  const [savingPledge, setSavingPledge] = useState(false);

  const markChatSeen = useCallback(
    (wishId: string, latestMessageId?: string | null) => {
      if (!session || !latestMessageId) return;
      setSeenChatIds((prev) => {
        if (prev[wishId] === latestMessageId) return prev;
        const next = { ...prev, [wishId]: latestMessageId };
        try {
          localStorage.setItem(`wishlist_seen_chats_${session.userId}`, JSON.stringify(next));
        } catch {
          // ignore storage quota errors
        }
        return next;
      });
    },
    [session]
  );

  useEffect(() => {
    if (!session) return;
    try {
      const raw = localStorage.getItem(`wishlist_seen_chats_${session.userId}`);
      if (raw) {
        setSeenChatIds(JSON.parse(raw));
      } else {
        setSeenChatIds({});
      }
    } catch {
      setSeenChatIds({});
    }
  }, [session]);

  const loadWishlists = useCallback(async () => {
    const res = await fetch('/api/wishlists', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setWishlists(data.wishlists || []);
      setGiftingStates(data.giftingStates || {});
    }
  }, []);

  // Poll every 8s for new co-giver chat messages & gifting updates
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(async () => {
      await loadWishlists();
      if (activeChatWish) {
        const res = await fetch(`/api/chat?wishId=${encodeURIComponent(activeChatWish.id)}`, {
          cache: 'no-store'
        });
        if (res.ok) {
          const data = await res.json();
          const msgs: ChatMessageDto[] = data.messages || [];
          setChatMessages(msgs);
          if (msgs.length > 0) {
            markChatSeen(activeChatWish.id, msgs[msgs.length - 1].id);
          }
        }
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [session, activeChatWish, loadWishlists, markChatSeen]);

  const loadInvites = useCallback(async () => {
    const res = await fetch('/api/invites', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setInvites(data.invites || []);
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        if (initialInviteToken) {
          const invRes = await fetch(`/api/invites?token=${encodeURIComponent(initialInviteToken)}`, {
            cache: 'no-store'
          });
          if (invRes.ok) {
            const invData = await invRes.json();
            setInviteInfo(invData.invite || null);
          }
        }
        const authRes = await fetch('/api/auth', { cache: 'no-store' });
        if (authRes.ok) {
          const authData = await authRes.json();
          if (authData.session) {
            setSession(authData.session);
            await loadWishlists();
            if (authData.session.role === 'admin') {
              await loadInvites();
            }
          }
        }
      } finally {
        setLoadingAuth(false);
      }
    }
    init();
  }, [initialInviteToken, loadWishlists, loadInvites]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      setAuthError(iamI18n.t(locale, data.error || 'errorInvalidCredentials'));
      return;
    }
    const authRes = await fetch('/api/auth', { cache: 'no-store' });
    const authData = await authRes.json();
    setSelectedUserId(null);
    setSession(authData.session);
    await loadWishlists();
    if (authData.session?.role === 'admin') {
      await loadInvites();
    }
  };

  const handleRegisterWithInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!initialInviteToken) return;
    setAuthError(null);
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'registerWithInvite',
        token: initialInviteToken,
        username,
        displayName,
        password,
        avatarEmoji
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setAuthError(iamI18n.t(locale, data.error || 'invalidInviteTitle'));
      return;
    }
    window.location.href = '/';
  };

  const handleLogout = async () => {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' })
    });
    setSelectedUserId(null);
    setActiveTab('my');
    setSession(null);
  };

  const handleScrapeSingleUrl = async (overrideUrl?: string) => {
    const target = (overrideUrl ?? wishUrl).trim();
    if (!target) return;
    setScrapingStatus(metadataImporterI18n.t(locale, 'fetchingStatus'));
    try {
      const res = await fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'single', url: target })
      });
      const data = await res.json();
      if (res.ok && data.metadata) {
        const meta: ScrapedWishMetadata = data.metadata;
        if (meta.productUrl) setWishUrl(meta.productUrl);
        if (meta.title) setWishTitle(meta.title);
        if (meta.description) setWishDesc(meta.description);
        if (meta.priceDkk !== null) setWishPrice(String(meta.priceDkk));
        if (meta.avifImage) {
          setScrapedAvif(meta.avifImage);
          setWishImageDataUrl(`data:image/avif;base64,${meta.avifImage.avifBase64}`);
        } else if (meta.imageUrl) {
          setWishImageDataUrl(meta.imageUrl);
        }
        setScrapingStatus(metadataImporterI18n.t(locale, 'fetchSuccess'));
      } else {
        setScrapingStatus(metadataImporterI18n.t(locale, 'fetchError'));
      }
    } catch {
      setScrapingStatus(metadataImporterI18n.t(locale, 'fetchError'));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setWishImageDataUrl(reader.result);
        setScrapedAvif(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddWish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wishTitle.trim() && !wishUrl.trim()) return;
    setSavingWish(true);
    try {
      const res = await fetch('/api/wishlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: wishTitle,
          description: wishDesc,
          quantity: wishQty,
          priceDkk: wishPrice ? Number(wishPrice) : null,
          productUrl: wishUrl || null,
          imageDataUrl: scrapedAvif ? null : wishImageDataUrl,
          avifImage: scrapedAvif
        })
      });
      if (res.ok) {
        setShowAddModal(false);
        setWishUrl('');
        setWishTitle('');
        setWishDesc('');
        setWishQty(1);
        setWishPrice('');
        setWishImageDataUrl(null);
        setScrapedAvif(null);
        setScrapingStatus(null);
        await loadWishlists();
      }
    } finally {
      setSavingWish(false);
    }
  };

  const handleDeleteWish = async (wishId: string) => {
    await fetch(`/api/wishlists?wishId=${encodeURIComponent(wishId)}`, { method: 'DELETE' });
    await loadWishlists();
  };

  const handlePreviewOenskeskyen = async () => {
    if (!oenskeskyenUrl.trim()) return;
    setImportingOenskeskyen(true);
    try {
      const res = await fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'oenskeskyen', url: oenskeskyenUrl })
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.items)) {
        setOenskeskyenPreview(data.items);
        setSelectedImportIndices(data.items.map((_: unknown, idx: number) => idx));
      }
    } finally {
      setImportingOenskeskyen(false);
    }
  };

  const handleConfirmOenskeskyenImport = async () => {
    const chosen = oenskeskyenPreview.filter((_, idx) => selectedImportIndices.includes(idx));
    if (chosen.length === 0) return;
    setImportingOenskeskyen(true);
    try {
      const res = await fetch('/api/wishlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: chosen })
      });
      if (res.ok) {
        setShowOenskeskyenModal(false);
        setOenskeskyenUrl('');
        setOenskeskyenPreview([]);
        await loadWishlists();
      }
    } finally {
      setImportingOenskeskyen(false);
    }
  };

  const openPledgeModal = (wish: { id: string; title: string; priceDkk: number | null }) => {
    const gState = giftingStates[wish.id];
    const existing = gState?.viewerPledge;
    setPledgeError(null);
    setActivePledgeWish(wish);

    if (existing) {
      setPledgeType(existing.pledgeType);
      setPledgeAmountDkk(existing.amountDkk ? String(existing.amountDkk) : '');
      setPledgePercentShare(existing.percentShare || 50);
    } else if (gState && gState.status === 'co_giving_open') {
      // Default to taking the remaining share when joining an open co-gift!
      if (wish.priceDkk && gState.remainingDkk && gState.remainingDkk > 0) {
        setPledgeType('partial_amount');
        setPledgeAmountDkk(String(gState.remainingDkk));
        setPledgePercentShare(gState.remainingPercent || 50);
      } else {
        setPledgeType('partial_percent');
        setPledgePercentShare(gState.remainingPercent > 0 ? gState.remainingPercent : 50);
        setPledgeAmountDkk('');
      }
    } else {
      setPledgeType('full');
      setPledgeAmountDkk(wish.priceDkk ? String(Math.round(wish.priceDkk / 2)) : '200');
      setPledgePercentShare(50);
    }
  };

  const handleSaveGiftPledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePledgeWish) return;
    setPledgeError(null);
    setSavingPledge(true);
    try {
      const res = await fetch('/api/gifting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wishId: activePledgeWish.id,
          action: 'upsert',
          pledgeType,
          amountDkk: pledgeType === 'partial_amount' ? Number(pledgeAmountDkk) : null,
          percentShare: pledgeType === 'partial_percent' ? Number(pledgePercentShare) : null,
          quantity: 1
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setPledgeError(giftingI18n.t(locale, data.error || 'errorInvalidAmount'));
        return;
      }
      setActivePledgeWish(null);
      await loadWishlists();
    } finally {
      setSavingPledge(false);
    }
  };

  const handleRemoveGiftPledge = async (wishId: string) => {
    setSavingPledge(true);
    try {
      const res = await fetch('/api/gifting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wishId, action: 'remove' })
      });
      if (res.ok) {
        setActivePledgeWish(null);
        await loadWishlists();
      }
    } finally {
      setSavingPledge(false);
    }
  };

  const openCoGiverChat = async (wish: { id: string; title: string }, giverCount: number) => {
    setShowNotificationsModal(false);
    setActiveChatWish({ id: wish.id, title: wish.title, giverCount });
    setChatError(null);
    const res = await fetch(`/api/chat?wishId=${encodeURIComponent(wish.id)}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const msgs: ChatMessageDto[] = data.messages || [];
      setChatMessages(msgs);
      if (msgs.length > 0) {
        markChatSeen(wish.id, msgs[msgs.length - 1].id);
      }
    }
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChatWish || !chatInput.trim()) return;
    setChatError(null);
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wishId: activeChatWish.id, content: chatInput })
    });
    const data = await res.json();
    if (!res.ok) {
      setChatError(coordinationChatI18n.t(locale, data.error || 'errorLinksOrHtmlNotAllowed'));
      return;
    }
    setChatMessages((prev) => [...prev, data.message]);
    if (data.message?.id) {
      markChatSeen(activeChatWish.id, data.message.id);
    }
    setChatInput('');
    await loadWishlists();
  };

  const handleGenerateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInviteLabel.trim()) return;
    const res = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newInviteLabel })
    });
    if (res.ok) {
      setNewInviteLabel('');
      await loadInvites();
    }
  };

  if (loadingAuth) {
    return (
      <div className="chibi-shell" style={{ textAlign: 'center', paddingTop: 80 }}>
        <ChibiMascotSvg size={68} />
        <p style={{ fontWeight: 700, color: 'var(--color-primary-700)' }}>
          {commonI18n.t(locale, 'loading')}
        </p>
      </div>
    );
  }

  // 1. Invite Registration Screen (/invite/[token])
  if (initialInviteToken && !session) {
    return (
      <div className="chibi-shell" style={{ maxWidth: 480, paddingTop: 40 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            type="button"
            className="chibi-btn chibi-btn-secondary"
            onClick={() => setLocale(locale === 'da' ? 'en' : 'da')}
          >
            🌐 {locale === 'da' ? 'EN' : 'DA'}
          </button>
        </div>

        <Card.Root className="chibi-card" style={{ padding: 24 }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <ChibiMascotSvg size={64} />
          </div>
          {!inviteInfo || !inviteInfo.canBeRedeemed ? (
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: 'var(--color-primary-700)' }}>
                {iamI18n.t(locale, 'invalidInviteTitle')}
              </h2>
              <p>{iamI18n.t(locale, 'invalidInviteDescription')}</p>
              <a href="/" className="chibi-btn" style={{ textDecoration: 'none', marginTop: 12 }}>
                {iamI18n.t(locale, 'loginButton')}
              </a>
            </div>
          ) : (
            <form onSubmit={handleRegisterWithInvite} style={{ display: 'grid', gap: 14 }}>
              <h2 style={{ margin: 0, color: 'var(--color-primary-700)', textAlign: 'center' }}>
                {iamI18n.t(locale, 'registerTitle')}
              </h2>
              <p style={{ margin: 0, textAlign: 'center', fontSize: '0.9rem' }}>
                {iamI18n.t(locale, 'registerSubtitle', { label: inviteInfo.label })}
              </p>

              {authError && (
                <Alert.Root color="error">
                  <Alert.Description>{authError}</Alert.Description>
                </Alert.Root>
              )}

              <div>
                <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  {iamI18n.t(locale, 'chooseAvatarLabel')}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  {CHIBI_AVATARS.map((emo) => (
                    <button
                      key={emo}
                      type="button"
                      onClick={() => setAvatarEmoji(emo)}
                      style={{
                        fontSize: '1.4rem',
                        padding: '6px 10px',
                        borderRadius: 12,
                        border:
                          avatarEmoji === emo
                            ? '2.5px solid var(--color-primary-600)'
                            : '1.5px solid var(--color-primary-200)',
                        background:
                          avatarEmoji === emo ? 'var(--color-primary-100)' : 'var(--color-neutral-50)',
                        cursor: 'pointer'
                      }}
                    >
                      {emo}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  {iamI18n.t(locale, 'displayNameLabel')}
                </label>
                <input
                  className="chibi-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={iamI18n.t(locale, 'displayNamePlaceholder')}
                  required
                />
              </div>

              <div>
                <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  {iamI18n.t(locale, 'usernameLabel')}
                </label>
                <input
                  className="chibi-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={iamI18n.t(locale, 'usernamePlaceholder')}
                  required
                />
              </div>

              <div>
                <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  {iamI18n.t(locale, 'passwordLabel')}
                </label>
                <input
                  type="password"
                  className="chibi-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={iamI18n.t(locale, 'passwordPlaceholder')}
                  required
                />
              </div>

              <Button type="submit" color="primary" className="chibi-btn">
                {iamI18n.t(locale, 'createAccountButton')}
              </Button>
            </form>
          )}
        </Card.Root>
      </div>
    );
  }

  // 2. Login Screen
  if (!session) {
    return (
      <div className="chibi-shell" style={{ maxWidth: 440, paddingTop: 48 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            type="button"
            className="chibi-btn chibi-btn-secondary"
            onClick={() => setLocale(locale === 'da' ? 'en' : 'da')}
          >
            🌐 {locale === 'da' ? 'EN' : 'DA'}
          </button>
        </div>

        <Card.Root className="chibi-card" style={{ padding: 26 }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <ChibiMascotSvg size={68} />
            <h1 style={{ margin: '10px 0 4px', color: 'var(--color-primary-700)', fontSize: '1.5rem' }}>
              {iamI18n.t(locale, 'loginTitle')}
            </h1>
            <p style={{ margin: 0, color: 'var(--color-neutral-600)', fontSize: '0.9rem' }}>
              {iamI18n.t(locale, 'loginSubtitle')}
            </p>
          </div>

          {authError && (
            <div style={{ marginBottom: 12 }}>
              <Alert.Root color="error">
                <Alert.Description>{authError}</Alert.Description>
              </Alert.Root>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                {iamI18n.t(locale, 'usernameLabel')}
              </label>
              <input
                className="chibi-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={iamI18n.t(locale, 'usernamePlaceholder')}
                required
              />
            </div>

            <div>
              <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                {iamI18n.t(locale, 'passwordLabel')}
              </label>
              <input
                type="password"
                className="chibi-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={iamI18n.t(locale, 'passwordPlaceholder')}
                required
              />
            </div>

            <Button type="submit" color="primary" className="chibi-btn">
              {iamI18n.t(locale, 'loginButton')}
            </Button>
          </form>

          <div
            style={{
              marginTop: 18,
              padding: 12,
              borderRadius: 14,
              background: 'var(--color-primary-50)',
              border: '1.5px dashed var(--color-primary-200)',
              fontSize: '0.82rem',
              textAlign: 'center',
              color: 'var(--color-primary-800)'
            }}
          >
            🔒 {iamI18n.t(locale, 'inviteOnlyNotice')}
          </div>
        </Card.Root>
      </div>
    );
  }

  // 3. Authenticated Main App
  const myWishlist = wishlists.find((w) => w.userId === session.userId);
  const otherWishlists = wishlists.filter((w) => w.userId !== session.userId);
  const visibleOtherWishlists = selectedUserId
    ? otherWishlists.filter((w) => w.userId === selectedUserId)
    : otherWishlists;

  // Compute all co-giver chats relevant to this user (Surprise Guard already enforced on server)
  const coGiverChatRooms = otherWishlists.flatMap((wl) =>
    wl.wishes
      .filter((w) => giftingStates[w.id]?.isViewerInvolvedInChat)
      .map((w) => {
        const gState = giftingStates[w.id];
        const latest = gState?.latestChatMessage || null;
        const isUnread =
          Boolean(latest) &&
          latest!.senderUserId !== session.userId &&
          seenChatIds[w.id] !== latest!.id;
        return {
          wish: w,
          ownerDisplayName: wl.ownerDisplayName,
          ownerAvatarEmoji: wl.ownerAvatarEmoji,
          giverCount: Math.max(1, gState.givers.length),
          givers: gState.givers,
          chatMessageCount: gState.chatMessageCount || 0,
          latestChatMessage: latest,
          isUnread
        };
      })
  );

  const unreadChatRooms = coGiverChatRooms.filter((r) => r.isUnread);

  return (
    <div className="chibi-shell">
      {/* Top Header with Mobile Burger Menu */}
      <header className="chibi-header">
        <div className="chibi-header-top">
          <div className="chibi-brand">
            <ChibiMascotSvg size={44} />
            <div>
              <h1>{commonI18n.t(locale, 'appName')}</h1>
              <p>{commonI18n.t(locale, 'lowDataBadge')}</p>
            </div>
          </div>

          <button
            type="button"
            className="chibi-burger-btn"
            aria-label="Menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          >
            {mobileMenuOpen ? '✕' : '☰'}
            {unreadChatRooms.length > 0 && <span className="chibi-burger-dot" />}
          </button>
        </div>

        <nav className={`chibi-nav-actions ${mobileMenuOpen ? 'is-open' : ''}`}>
          <button
            type="button"
            className={`chibi-btn ${activeTab === 'my' ? '' : 'chibi-btn-secondary'}`}
            onClick={() => {
              setActiveTab('my');
              setMobileMenuOpen(false);
              loadWishlists();
            }}
          >
            {session.avatarEmoji} {commonI18n.t(locale, 'myWishlist')}
          </button>

          <button
            type="button"
            className={`chibi-btn ${activeTab === 'all' ? '' : 'chibi-btn-secondary'}`}
            onClick={() => {
              setActiveTab('all');
              setMobileMenuOpen(false);
              loadWishlists();
            }}
          >
            🎁 {commonI18n.t(locale, 'allWishlists')} ({otherWishlists.length})
          </button>

          <button
            type="button"
            className={`chibi-btn ${
              unreadChatRooms.length > 0 ? 'chibi-btn-lavender' : 'chibi-btn-secondary'
            }`}
            style={{ position: 'relative' }}
            onClick={() => {
              setShowNotificationsModal(true);
              setMobileMenuOpen(false);
            }}
          >
            🔔 {coordinationChatI18n.t(locale, 'notificationsButton')} ({coGiverChatRooms.length})
            {unreadChatRooms.length > 0 && (
              <span
                style={{
                  marginLeft: 4,
                  padding: '2px 7px',
                  borderRadius: 999,
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  background: '#e11d48',
                  color: '#ffffff'
                }}
              >
                {unreadChatRooms.length} {coordinationChatI18n.t(locale, 'newMessageBadge')}
              </span>
            )}
          </button>

          {session.role === 'admin' && (
            <button
              type="button"
              className={`chibi-btn ${activeTab === 'admin' ? '' : 'chibi-btn-secondary'}`}
              onClick={() => {
                setActiveTab('admin');
                setMobileMenuOpen(false);
              }}
            >
              🔑 {commonI18n.t(locale, 'adminPanel')}
            </button>
          )}

          <button
            type="button"
            className="chibi-btn chibi-btn-secondary"
            onClick={() => {
              setLocale(locale === 'da' ? 'en' : 'da');
              setMobileMenuOpen(false);
            }}
            title={commonI18n.t(locale, 'languageLabel')}
          >
            🌐 {locale.toUpperCase()}
          </button>

          <button
            type="button"
            className="chibi-btn chibi-btn-secondary"
            onClick={() => {
              setMobileMenuOpen(false);
              handleLogout();
            }}
          >
            {commonI18n.t(locale, 'logout')}
          </button>
        </nav>
      </header>

      {/* Live Unread Co-Giver Chat Notification Banner */}
      {unreadChatRooms.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
          {unreadChatRooms.map((room) => (
            <button
              key={room.wish.id}
              type="button"
              onClick={() => openCoGiverChat(room.wish, room.giverCount)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                width: '100%',
                textAlign: 'left',
                padding: '12px 18px',
                borderRadius: 16,
                border: '2px solid var(--color-primary-400)',
                background: 'linear-gradient(135deg, var(--color-primary-50), #ffffff)',
                boxShadow: '0 8px 20px -6px rgba(14, 145, 233, 0.25)',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span
                  style={{
                    padding: '3px 9px',
                    borderRadius: 999,
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    background: '#e11d48',
                    color: '#ffffff'
                  }}
                >
                  🔔 {coordinationChatI18n.t(locale, 'newMessageBadge')}
                </span>
                <span style={{ fontWeight: 700, color: 'var(--color-primary-900)', fontSize: '0.92rem' }}>
                  {coordinationChatI18n.t(locale, 'toastNewMessage', {
                    sender: `${room.latestChatMessage?.senderAvatarEmoji || '🎁'} ${
                      room.latestChatMessage?.senderDisplayName || ''
                    }`,
                    wish: room.wish.title
                  })}
                </span>
                {room.latestChatMessage && (
                  <span
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--color-neutral-700)',
                      fontStyle: 'italic'
                    }}
                  >
                    “{room.latestChatMessage.content}”
                  </span>
                )}
              </div>
              <span className="chibi-pill" style={{ flexShrink: 0 }}>
                {coordinationChatI18n.t(locale, 'openChatAction')}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* TAB 1: MY WISHLIST */}
      {activeTab === 'my' && (
        <section>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16
            }}
          >
            <div>
              <h2 style={{ margin: 0, color: 'var(--color-primary-800)' }}>
                {session.avatarEmoji} {wishlistI18n.t(locale, 'myWishlistTitle')}
              </h2>
              <span className="chibi-pill chibi-pill-lavender" style={{ marginTop: 6 }}>
                {wishlistI18n.t(locale, 'surpriseProtectedBadge')}
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <button
                type="button"
                className="chibi-btn chibi-btn-secondary"
                onClick={() => setShowOenskeskyenModal(true)}
              >
                {wishlistI18n.t(locale, 'importOenskeskyenButton')}
              </button>
              <button type="button" className="chibi-btn" onClick={() => setShowAddModal(true)}>
                {wishlistI18n.t(locale, 'addWishButton')}
              </button>
            </div>
          </div>

          {!myWishlist || myWishlist.wishes.length === 0 ? (
            <Card.Root className="chibi-card" style={{ padding: 36, textAlign: 'center' }}>
              <ChibiGiftPlaceholderSvg size={80} />
              <h3 style={{ color: 'var(--color-primary-700)' }}>
                {wishlistI18n.t(locale, 'emptyWishlistTitle')}
              </h3>
              <p style={{ color: 'var(--color-neutral-600)' }}>
                {wishlistI18n.t(locale, 'emptyWishlistDesc')}
              </p>
            </Card.Root>
          ) : (
            <div className="chibi-grid">
              {myWishlist.wishes.map((wish) => (
                <Card.Root key={wish.id} className="chibi-card">
                  <div className="chibi-wish-img-wrap">
                    <button
                      type="button"
                      className="chibi-card-remove-btn"
                      onClick={() => handleDeleteWish(wish.id)}
                      title={commonI18n.t(locale, 'delete')}
                    >
                      🗑️ {commonI18n.t(locale, 'delete')}
                    </button>
                    {wish.imageApiUrl ? (
                      <img
                        src={wish.imageApiUrl}
                        alt={wish.title}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <ChibiGiftPlaceholderSvg size={72} />
                    )}
                  </div>
                  <Card.Content style={{ padding: '12px 4px 4px 4px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <h3 className="chibi-wish-title">
                      {wish.productUrl ? (
                        <a
                          href={wish.productUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="chibi-wish-title-link"
                        >
                          {wish.title} <span aria-hidden="true">↗</span>
                        </a>
                      ) : (
                        wish.title
                      )}
                    </h3>

                    {wish.description && (
                      <p className="chibi-wish-desc" title={wish.description}>
                        {wish.description}
                      </p>
                    )}

                    <div style={{ marginTop: 4, marginBottom: 8 }}>
                      <span className="chibi-pill">
                        {wishlistI18n.t(locale, 'quantityBadge', { qty: wish.quantity })}
                      </span>
                    </div>

                    {wish.priceDkk !== null && (
                      <div className="chibi-price-tag">
                        {wish.priceDkk.toLocaleString(locale === 'da' ? 'da-DK' : 'en-US')}{' '}
                        {commonI18n.t(locale, 'currency')}
                      </div>
                    )}
                  </Card.Content>
                </Card.Root>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: EVERYONE'S WISHLISTS (Gifting & Secret Co-giver Chat) */}
      {activeTab === 'all' && (
        <section>
          {/* User Filter Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <button
              type="button"
              className={`chibi-btn ${selectedUserId === null ? '' : 'chibi-btn-secondary'}`}
              onClick={() => setSelectedUserId(null)}
            >
              ✨ {commonI18n.t(locale, 'allWishlists')} ({otherWishlists.length})
            </button>
            {otherWishlists.map((wl) => (
              <button
                key={wl.id}
                type="button"
                className={`chibi-btn ${
                  selectedUserId === wl.userId ? '' : 'chibi-btn-secondary'
                }`}
                onClick={() => setSelectedUserId(wl.userId)}
              >
                {wl.ownerAvatarEmoji} {wl.ownerDisplayName} ({wl.wishCount})
              </button>
            ))}
          </div>

          {/* Gift Status Filter Bar (Available / Open for Co-Givers / Reserved) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
            {(
              [
                { id: 'all', label: giftingI18n.t(locale, 'filterAllStatus') },
                { id: 'available', label: giftingI18n.t(locale, 'filterAvailable') },
                { id: 'co_giving_open', label: giftingI18n.t(locale, 'filterCoGiving') },
                { id: 'fully_reserved', label: giftingI18n.t(locale, 'filterReserved') }
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                className={`chibi-pill ${giftStatusFilter === f.id ? 'chibi-pill-mint' : ''}`}
                style={{
                  cursor: 'pointer',
                  padding: '6px 14px',
                  fontSize: '0.84rem',
                  fontWeight: giftStatusFilter === f.id ? 800 : 600,
                  borderWidth: giftStatusFilter === f.id ? 2 : 1
                }}
                onClick={() => setGiftStatusFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {visibleOtherWishlists.length === 0 ? (
            <Card.Root className="chibi-card" style={{ padding: 32, textAlign: 'center' }}>
              <ChibiMascotSvg size={64} />
              <p>{iamI18n.t(locale, 'inviteOnlyNotice')}</p>
            </Card.Root>
          ) : (
            <div style={{ display: 'grid', gap: 32 }}>
              {visibleOtherWishlists.map((otherWl) => {
                const filteredWishes = otherWl.wishes.filter((w) => {
                  if (giftStatusFilter === 'all') return true;
                  const st = giftingStates[w.id]?.status || 'available';
                  return st === giftStatusFilter;
                });

                return (
                  <div key={otherWl.id}>
                    <h2 style={{ marginTop: 0, marginBottom: 14, color: 'var(--color-primary-800)' }}>
                      {otherWl.ownerAvatarEmoji}{' '}
                      {wishlistI18n.t(locale, 'ownerWishlistTitle', {
                        name: otherWl.ownerDisplayName
                      })}
                    </h2>

                    {filteredWishes.length === 0 ? (
                      <Card.Root className="chibi-card" style={{ padding: 24, textAlign: 'center' }}>
                        <p style={{ margin: 0, color: 'var(--color-neutral-600)' }}>
                          {wishlistI18n.t(locale, 'emptyWishlistTitle')}
                        </p>
                      </Card.Root>
                    ) : (
                      <div className="chibi-grid">
                        {filteredWishes.map((wish) => {
                          const gState = giftingStates[wish.id];
                          const givers = gState?.givers || [];
                          const status: WishGiftStatus = gState?.status || 'available';
                          const isViewerPledged = gState?.isViewerPledged || false;
                          const canChat = gState?.canAccessCoGiverChat || false;
                          const totalPercent = gState?.totalPledgedPercent || 0;
                          const totalDkk = gState?.totalPledgedDkk || 0;
                          const remainingDkk = gState?.remainingDkk ?? null;
                          const remainingPercent = gState?.remainingPercent ?? 100;

                          return (
                            <Card.Root key={wish.id} className="chibi-card">
                              <div className="chibi-wish-img-wrap">
                                {/* Top-Left Status Pill on Image */}
                                <span
                                  style={{
                                    position: 'absolute',
                                    top: 10,
                                    left: 10,
                                    zIndex: 4,
                                    padding: '4px 10px',
                                    borderRadius: 999,
                                    fontSize: '0.75rem',
                                    fontWeight: 800,
                                    background:
                                      status === 'available'
                                        ? 'rgba(236, 253, 245, 0.95)'
                                        : status === 'co_giving_open'
                                          ? 'rgba(254, 243, 199, 0.95)'
                                          : 'rgba(224, 242, 254, 0.95)',
                                    color:
                                      status === 'available'
                                        ? '#065f46'
                                        : status === 'co_giving_open'
                                          ? '#92400e'
                                          : '#075985',
                                    border:
                                      status === 'available'
                                        ? '1.5px solid #6ee7b7'
                                        : status === 'co_giving_open'
                                          ? '1.5px solid #fcd34d'
                                          : '1.5px solid #7dd3fc',
                                    boxShadow: '0 2px 8px rgba(15, 28, 46, 0.08)'
                                  }}
                                >
                                  {status === 'available'
                                    ? giftingI18n.t(locale, 'filterAvailable')
                                    : status === 'co_giving_open'
                                      ? giftingI18n.t(locale, 'statusCoGivingOpen', {
                                          percent: totalPercent
                                        })
                                      : giftingI18n.t(locale, 'statusFullyReserved', {
                                          percent: totalPercent
                                        })}
                                </span>

                                {wish.imageApiUrl ? (
                                  <img
                                    src={wish.imageApiUrl}
                                    alt={wish.title}
                                    loading="lazy"
                                    decoding="async"
                                  />
                                ) : (
                                  <ChibiGiftPlaceholderSvg size={72} />
                                )}
                              </div>
                              <Card.Content
                                style={{
                                  padding: '12px 4px 4px 4px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  flex: 1
                                }}
                              >
                                <h3 className="chibi-wish-title">
                                  {wish.productUrl ? (
                                    <a
                                      href={wish.productUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="chibi-wish-title-link"
                                    >
                                      {wish.title} <span aria-hidden="true">↗</span>
                                    </a>
                                  ) : (
                                    wish.title
                                  )}
                                </h3>

                                {wish.description && (
                                  <p className="chibi-wish-desc" title={wish.description}>
                                    {wish.description}
                                  </p>
                                )}

                                <div style={{ marginTop: 4, marginBottom: 8 }}>
                                  <span className="chibi-pill">
                                    {wishlistI18n.t(locale, 'quantityBadge', { qty: wish.quantity })}
                                  </span>
                                </div>

                                {wish.priceDkk !== null && (
                                  <div className="chibi-price-tag" style={{ marginBottom: 10 }}>
                                    {wish.priceDkk.toLocaleString(locale === 'da' ? 'da-DK' : 'en-US')}{' '}
                                    {commonI18n.t(locale, 'currency')}
                                  </div>
                                )}

                                {/* Secret Gifting & Co-Giving Status Box (Hidden from Owner!) */}
                                <div
                                  style={{
                                    marginTop: wish.priceDkk !== null ? 0 : 'auto',
                                    padding: 12,
                                    borderRadius: 16,
                                    background:
                                      status === 'co_giving_open'
                                        ? '#fffbeb'
                                        : 'var(--color-neutral-100)',
                                    border:
                                      status === 'co_giving_open'
                                        ? '1.5px solid #fde68a'
                                        : '1px solid var(--color-primary-100)',
                                    display: 'grid',
                                    gap: 8
                                  }}
                                >
                                  {givers.length === 0 ? (
                                    <span style={{ fontSize: '0.82rem', color: 'var(--color-neutral-700)', fontWeight: 600 }}>
                                      {giftingI18n.t(locale, 'availableToBuy')}
                                    </span>
                                  ) : (
                                    <div style={{ display: 'grid', gap: 6 }}>
                                      {/* Progress Bar */}
                                      <div
                                        style={{
                                          width: '100%',
                                          height: 8,
                                          borderRadius: 999,
                                          background: 'rgba(14, 145, 233, 0.14)',
                                          overflow: 'hidden'
                                        }}
                                      >
                                        <div
                                          style={{
                                            width: `${Math.min(100, Math.max(8, totalPercent))}%`,
                                            height: '100%',
                                            borderRadius: 999,
                                            background:
                                              status === 'fully_reserved'
                                                ? 'var(--color-success-500, #10b981)'
                                                : 'var(--color-primary-500, #0e91e9)',
                                            transition: 'width 0.25s ease'
                                          }}
                                        />
                                      </div>

                                      {/* Summary Line */}
                                      {status === 'co_giving_open' && (
                                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#92400e' }}>
                                          {wish.priceDkk && remainingDkk !== null
                                            ? giftingI18n.t(locale, 'coveredSummaryDkk', {
                                                covered: totalDkk.toLocaleString(
                                                  locale === 'da' ? 'da-DK' : 'en-US'
                                                ),
                                                total: wish.priceDkk.toLocaleString(
                                                  locale === 'da' ? 'da-DK' : 'en-US'
                                                ),
                                                percent: totalPercent,
                                                remaining: remainingDkk.toLocaleString(
                                                  locale === 'da' ? 'da-DK' : 'en-US'
                                                )
                                              })
                                            : giftingI18n.t(locale, 'coveredSummaryPercent', {
                                                percent: totalPercent,
                                                remainingPercent
                                              })}
                                        </div>
                                      )}

                                      {/* Givers List with Exact Share */}
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {givers.map((g) => {
                                          let shareLabel = giftingI18n.t(locale, 'fullGiftBadge');
                                          if (g.pledgeType === 'partial_amount' && g.amountDkk) {
                                            shareLabel = `${g.amountDkk.toLocaleString(
                                              locale === 'da' ? 'da-DK' : 'en-US'
                                            )} ${commonI18n.t(locale, 'currency')}${
                                              g.effectivePercent ? ` (${g.effectivePercent}%)` : ''
                                            }`;
                                          } else if (g.pledgeType === 'partial_percent' && g.percentShare) {
                                            shareLabel = `${g.percentShare}%${
                                              g.effectiveAmountDkk
                                                ? ` (${g.effectiveAmountDkk.toLocaleString(
                                                    locale === 'da' ? 'da-DK' : 'en-US'
                                                  )} ${commonI18n.t(locale, 'currency')})`
                                                : ''
                                            }`;
                                          }
                                          return (
                                            <span
                                              key={g.userId}
                                              className="chibi-pill"
                                              style={{
                                                fontSize: '0.76rem',
                                                padding: '3px 9px',
                                                background: '#ffffff'
                                              }}
                                            >
                                              {g.avatarEmoji} <strong>{g.displayName}:</strong> {shareLabel}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  <div style={{ display: 'grid', gap: 6, marginTop: 2 }}>
                                    <button
                                      type="button"
                                      className={`chibi-btn ${isViewerPledged ? 'chibi-btn-mint' : ''}`}
                                      onClick={() => openPledgeModal(wish)}
                                    >
                                      {isViewerPledged
                                        ? `✅ ${giftingI18n.t(locale, 'editPledgeButton')}`
                                        : giftingI18n.t(locale, 'pledgeButton')}
                                    </button>

                                    {canChat && (givers.length > 0 || (gState?.chatMessageCount || 0) > 0) && (
                                      <button
                                        type="button"
                                        className="chibi-btn chibi-btn-lavender"
                                        onClick={() => openCoGiverChat(wish, Math.max(1, givers.length))}
                                      >
                                        {givers.length >= 2 || isViewerPledged
                                          ? giftingI18n.t(locale, 'openGiftChatButton')
                                          : giftingI18n.t(locale, 'startDialogueButton')}
                                        {gState?.chatMessageCount ? ` (${gState.chatMessageCount})` : ''}
                                        {gState?.latestChatMessage &&
                                          gState.latestChatMessage.senderUserId !== session.userId &&
                                          seenChatIds[wish.id] !== gState.latestChatMessage.id && (
                                            <span
                                              style={{
                                                marginLeft: 6,
                                                padding: '2px 7px',
                                                borderRadius: 999,
                                                fontSize: '0.7rem',
                                                fontWeight: 800,
                                                background: '#e11d48',
                                                color: '#ffffff'
                                              }}
                                            >
                                              🔔 {coordinationChatI18n.t(locale, 'newMessageBadge')}
                                            </span>
                                          )}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </Card.Content>
                            </Card.Root>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 3: ADMIN INVITES */}
      {activeTab === 'admin' && session.role === 'admin' && (
        <section>
          <Card.Root className="chibi-card" style={{ padding: 24, marginBottom: 24 }}>
            <h2 style={{ marginTop: 0, color: 'var(--color-primary-800)' }}>
              {iamI18n.t(locale, 'adminInviteTitle')}
            </h2>
            <p style={{ color: 'var(--color-neutral-700)' }}>
              {iamI18n.t(locale, 'adminInviteSubtitle')}
            </p>

            <form
              onSubmit={handleGenerateInvite}
              style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}
            >
              <input
                className="chibi-input"
                style={{ maxWidth: 320 }}
                value={newInviteLabel}
                onChange={(e) => setNewInviteLabel(e.target.value)}
                placeholder={iamI18n.t(locale, 'inviteForPlaceholder')}
                required
              />
              <button type="submit" className="chibi-btn">
                {iamI18n.t(locale, 'generateInviteButton')}
              </button>
            </form>
          </Card.Root>

          <div className="chibi-grid">
            {invites.map((inv) => {
              const inviteUrl =
                typeof window !== 'undefined'
                  ? `${window.location.origin}/invite/${inv.token}`
                  : `/invite/${inv.token}`;
              return (
                <Card.Root key={inv.id} className="chibi-card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>🎀 {inv.label}</strong>
                    <span
                      className={`chibi-pill ${
                        inv.canBeRedeemed ? 'chibi-pill-mint' : 'chibi-pill-lavender'
                      }`}
                    >
                      {inv.redeemedByUserId
                        ? iamI18n.t(locale, 'statusRedeemed')
                        : inv.canBeRedeemed
                          ? iamI18n.t(locale, 'statusActive')
                          : iamI18n.t(locale, 'statusExpired')}
                    </span>
                  </div>
                  <input
                    readOnly
                    className="chibi-input"
                    style={{ marginTop: 10, fontSize: '0.8rem' }}
                    value={inviteUrl}
                  />
                  <button
                    type="button"
                    className="chibi-btn chibi-btn-secondary"
                    style={{ marginTop: 10, width: '100%' }}
                    onClick={() => {
                      navigator.clipboard?.writeText(inviteUrl);
                      setCopiedToken(inv.token);
                    }}
                  >
                    {copiedToken === inv.token
                      ? `✅ ${iamI18n.t(locale, 'copiedBadge')}`
                      : `📋 ${iamI18n.t(locale, 'copyLinkButton')}`}
                  </button>
                </Card.Root>
              );
            })}
          </div>
        </section>
      )}

      {/* MODAL 1: ADD WISH (With URL Auto-Scraper & AVIF 512px Compressor) */}
      {showAddModal && (
        <div className="chibi-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="chibi-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: 'var(--color-primary-800)' }}>
              {wishlistI18n.t(locale, 'addWishButton')}
            </h3>

            <div
              style={{
                padding: 12,
                borderRadius: 16,
                background: 'var(--color-primary-50)',
                border: '1.5px solid var(--color-primary-200)',
                marginBottom: 14
              }}
            >
              <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                {metadataImporterI18n.t(locale, 'fetchFromUrlLabel')}
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input
                  className="chibi-input"
                  value={wishUrl}
                  onChange={(e) => setWishUrl(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData?.getData('text');
                    if (pasted && pasted.trim()) {
                      setWishUrl(pasted.trim());
                      setTimeout(() => handleScrapeSingleUrl(pasted.trim()), 50);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleScrapeSingleUrl();
                    }
                  }}
                  placeholder={metadataImporterI18n.t(locale, 'urlPlaceholder')}
                />
                <button
                  type="button"
                  className="chibi-btn chibi-btn-lavender"
                  onClick={() => handleScrapeSingleUrl()}
                >
                  {metadataImporterI18n.t(locale, 'fetchButton')}
                </button>
              </div>
              {scrapingStatus && (
                <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--color-accent-800)' }}>
                  {scrapingStatus}
                </p>
              )}
            </div>

            <form onSubmit={handleAddWish} style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  {wishlistI18n.t(locale, 'wishTitleLabel')}
                </label>
                <input
                  className="chibi-input"
                  value={wishTitle}
                  onChange={(e) => setWishTitle(e.target.value)}
                  placeholder={wishlistI18n.t(locale, 'wishTitlePlaceholder')}
                  required={!wishUrl.trim()}
                />
              </div>

              <div>
                <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  {wishlistI18n.t(locale, 'wishDescLabel')}
                </label>
                <textarea
                  className="chibi-input"
                  rows={2}
                  value={wishDesc}
                  onChange={(e) => setWishDesc(e.target.value)}
                  placeholder={wishlistI18n.t(locale, 'wishDescPlaceholder')}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                    {wishlistI18n.t(locale, 'wishQtyLabel')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    className="chibi-input"
                    value={wishQty}
                    onChange={(e) => setWishQty(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                    {wishlistI18n.t(locale, 'wishPriceLabel')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="chibi-input"
                    value={wishPrice}
                    onChange={(e) => setWishPrice(e.target.value)}
                    placeholder={wishlistI18n.t(locale, 'wishPricePlaceholder')}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  {wishlistI18n.t(locale, 'wishImageUploadLabel')}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: 'block', marginTop: 6, fontSize: '0.85rem' }}
                />
                {wishImageDataUrl && (
                  <div style={{ marginTop: 8, textAlign: 'center' }}>
                    <img
                      src={wishImageDataUrl}
                      alt="Preview"
                      style={{ maxHeight: 110, borderRadius: 12 }}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="chibi-btn chibi-btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  {commonI18n.t(locale, 'cancel')}
                </button>
                <button type="submit" className="chibi-btn" disabled={savingWish}>
                  {savingWish ? commonI18n.t(locale, 'loading') : commonI18n.t(locale, 'save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: IMPORT FROM ØNSKESKYEN */}
      {showOenskeskyenModal && (
        <div className="chibi-modal-backdrop" onClick={() => setShowOenskeskyenModal(false)}>
          <div className="chibi-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: 'var(--color-primary-800)' }}>
              {metadataImporterI18n.t(locale, 'oenskeskyenTitle')}
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--color-neutral-700)' }}>
              {metadataImporterI18n.t(locale, 'oenskeskyenSubtitle')}
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input
                className="chibi-input"
                value={oenskeskyenUrl}
                onChange={(e) => setOenskeskyenUrl(e.target.value)}
                placeholder={metadataImporterI18n.t(locale, 'oenskeskyenPlaceholder')}
              />
              <button
                type="button"
                className="chibi-btn"
                onClick={handlePreviewOenskeskyen}
                disabled={importingOenskeskyen}
              >
                {metadataImporterI18n.t(locale, 'previewButton')}
              </button>
            </div>

            {oenskeskyenPreview.length > 0 && (
              <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                {oenskeskyenPreview.map((item, idx) => {
                  const checked = selectedImportIndices.includes(idx);
                  return (
                    <label
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: 10,
                        borderRadius: 14,
                        border: '1.5px solid var(--color-primary-200)',
                        background: checked ? 'var(--color-primary-50)' : '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedImportIndices((prev) =>
                            checked ? prev.filter((i) => i !== idx) : [...prev, idx]
                          )
                        }
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.title}</div>
                        {item.priceDkk !== null && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-neutral-600)' }}>
                            {item.priceDkk} {commonI18n.t(locale, 'currency')}
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                className="chibi-btn chibi-btn-secondary"
                onClick={() => setShowOenskeskyenModal(false)}
              >
                {commonI18n.t(locale, 'close')}
              </button>
              {oenskeskyenPreview.length > 0 && (
                <button
                  type="button"
                  className="chibi-btn chibi-btn-mint"
                  onClick={handleConfirmOenskeskyenImport}
                  disabled={importingOenskeskyen || selectedImportIndices.length === 0}
                >
                  {metadataImporterI18n.t(locale, 'importSelectedButton', {
                    count: selectedImportIndices.length
                  })}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: CO-GIVER SECRET CHAT ROOM (Lightly Chat Component, Plain-text + Emoji only, 14d TTL) */}
      {activeChatWish && (
        <div className="chibi-modal-backdrop" onClick={() => setActiveChatWish(null)}>
          <div className="chibi-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, color: 'var(--color-accent-800)' }}>
              {coordinationChatI18n.t(locale, 'chatRoomTitle', {
                wishTitle: activeChatWish.title
              })}
            </h3>
            <p style={{ margin: '4px 0 8px', fontSize: '0.84rem', color: 'var(--color-neutral-700)' }}>
              {coordinationChatI18n.t(locale, 'chatRoomSubtitle', {
                count: activeChatWish.giverCount
              })}
            </p>
            <div className="chibi-pill chibi-pill-lavender" style={{ marginBottom: 12 }}>
              {coordinationChatI18n.t(locale, 'ttlNotice')}
            </div>

            <div
              style={{
                background: 'var(--color-neutral-50)',
                border: '2px solid var(--color-primary-200)',
                borderRadius: 18,
                padding: 14,
                minHeight: 200,
                maxHeight: 300,
                overflowY: 'auto',
                display: 'grid',
                gap: 10,
                marginBottom: 12
              }}
            >
              {chatMessages.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--color-neutral-600)', margin: 'auto' }}>
                  {coordinationChatI18n.t(locale, 'emptyChat')}
                </p>
              ) : (
                chatMessages.map((msg) => {
                  const isMine = msg.senderUserId === session.userId;
                  return (
                    <Chat.Root
                      key={msg.id}
                      placement={isMine ? 'end' : 'start'}
                      color={isMine ? 'primary' : 'neutral'}
                    >
                      <Chat.Header style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {msg.senderAvatarEmoji} {msg.senderDisplayName}
                      </Chat.Header>
                      <Chat.Bubble>{msg.content}</Chat.Bubble>
                    </Chat.Root>
                  );
                })
              )}
            </div>

            {/* Quick Emoji Picker Bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {ALLOWED_QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setChatInput((prev) => `${prev}${emoji}`)}
                  style={{
                    border: '1px solid var(--color-primary-200)',
                    background: 'var(--color-primary-50)',
                    borderRadius: 10,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '1.1rem'
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {chatError && (
              <div style={{ marginBottom: 8 }}>
                <Alert.Root color="error">
                  <Alert.Description>{chatError}</Alert.Description>
                </Alert.Root>
              </div>
            )}

            <form onSubmit={handleSendChatMessage} style={{ display: 'flex', gap: 8 }}>
              <input
                className="chibi-input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={coordinationChatI18n.t(locale, 'messagePlaceholder')}
              />
              <button type="submit" className="chibi-btn">
                {coordinationChatI18n.t(locale, 'sendButton')}
              </button>
            </form>
            <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--color-neutral-600)' }}>
              {coordinationChatI18n.t(locale, 'plainTextOnlyNotice')}
            </p>
          </div>
        </div>
      )}

      {/* MODAL 4: CO-GIVER NOTIFICATIONS & ACTIVE GIFT CHATS */}
      {showNotificationsModal && (
        <div className="chibi-modal-backdrop" onClick={() => setShowNotificationsModal(false)}>
          <div className="chibi-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: 'var(--color-primary-800)' }}>
                {coordinationChatI18n.t(locale, 'notificationsTitle')}
              </h3>
              <button
                type="button"
                className="chibi-btn chibi-btn-secondary"
                onClick={() => setShowNotificationsModal(false)}
              >
                {commonI18n.t(locale, 'close')}
              </button>
            </div>

            {coGiverChatRooms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--color-neutral-700)' }}>
                <ChibiMascotSvg size={56} />
                <p style={{ marginTop: 10 }}>{coordinationChatI18n.t(locale, 'notificationsEmpty')}</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {coGiverChatRooms.map((room) => (
                  <div
                    key={room.wish.id}
                    style={{
                      padding: 14,
                      borderRadius: 16,
                      border: room.isUnread
                        ? '2px solid var(--color-primary-500)'
                        : '1.5px solid var(--color-primary-200)',
                      background: room.isUnread ? 'var(--color-primary-50)' : '#ffffff',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      flexWrap: 'wrap'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong>{room.wish.title}</strong>
                        <span className="chibi-pill">
                          {room.ownerAvatarEmoji}{' '}
                          {coordinationChatI18n.t(locale, 'forRecipient', {
                            owner: room.ownerDisplayName
                          })}
                        </span>
                        {room.isUnread && (
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 999,
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              background: '#e11d48',
                              color: '#ffffff'
                            }}
                          >
                            🔔 {coordinationChatI18n.t(locale, 'newMessageBadge')}
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.8rem', color: 'var(--color-neutral-600)', marginTop: 4 }}>
                        👥 {room.givers.map((g) => `${g.avatarEmoji} ${g.displayName}`).join(', ')}
                      </div>

                      {room.latestChatMessage ? (
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: '0.86rem',
                            color: 'var(--color-neutral-900)',
                            background: 'rgba(255,255,255,0.8)',
                            padding: '6px 10px',
                            borderRadius: 10
                          }}
                        >
                          <strong>
                            {room.latestChatMessage.senderAvatarEmoji}{' '}
                            {room.latestChatMessage.senderDisplayName}:
                          </strong>{' '}
                          {room.latestChatMessage.content}
                        </div>
                      ) : (
                        <div style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--color-neutral-500)' }}>
                          {coordinationChatI18n.t(locale, 'emptyChat')}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="chibi-btn chibi-btn-lavender"
                      onClick={() => openCoGiverChat(room.wish, room.giverCount)}
                    >
                      {coordinationChatI18n.t(locale, 'openChatAction')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 5: GIFT PLEDGE / CO-GIVING SPLIT MODAL */}
      {activePledgeWish && (
        <div className="chibi-modal-backdrop" onClick={() => setActivePledgeWish(null)}>
          <div className="chibi-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: 'var(--color-primary-800)' }}>
              {giftingI18n.t(locale, 'pledgeModalTitle', { title: activePledgeWish.title })}
            </h3>
            <p style={{ marginTop: 4, fontSize: '0.88rem', color: 'var(--color-neutral-700)' }}>
              {giftingI18n.t(locale, 'pledgeModalSubtitle')}
            </p>

            {activePledgeWish.priceDkk !== null && (
              <div style={{ marginBottom: 14 }}>
                <span className="chibi-pill">
                  💰 {activePledgeWish.priceDkk.toLocaleString(locale === 'da' ? 'da-DK' : 'en-US')}{' '}
                  {commonI18n.t(locale, 'currency')}
                </span>
              </div>
            )}

            {pledgeError && (
              <div style={{ marginBottom: 12 }}>
                <Alert.Root color="error">
                  <Alert.Description>{pledgeError}</Alert.Description>
                </Alert.Root>
              </div>
            )}

            <form onSubmit={handleSaveGiftPledge} style={{ display: 'grid', gap: 12 }}>
              {/* Option 1: Full Gift */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: 12,
                  borderRadius: 14,
                  border:
                    pledgeType === 'full'
                      ? '2px solid var(--color-primary-500)'
                      : '1.5px solid var(--color-primary-200)',
                  background: pledgeType === 'full' ? 'var(--color-primary-50)' : '#ffffff',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="radio"
                  name="pledgeType"
                  checked={pledgeType === 'full'}
                  onChange={() => setPledgeType('full')}
                  style={{ marginTop: 4 }}
                />
                <div>
                  <strong style={{ display: 'block', fontSize: '0.94rem' }}>
                    {giftingI18n.t(locale, 'modeFullTitle')}
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-neutral-600)' }}>
                    {giftingI18n.t(locale, 'modeFullDesc')}
                  </span>
                </div>
              </label>

              {/* Option 2: Partial Fixed Amount (DKK) */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: 12,
                  borderRadius: 14,
                  border:
                    pledgeType === 'partial_amount'
                      ? '2px solid var(--color-primary-500)'
                      : '1.5px solid var(--color-primary-200)',
                  background: pledgeType === 'partial_amount' ? 'var(--color-primary-50)' : '#ffffff',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="radio"
                  name="pledgeType"
                  checked={pledgeType === 'partial_amount'}
                  onChange={() => setPledgeType('partial_amount')}
                  style={{ marginTop: 4 }}
                />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '0.94rem' }}>
                    {giftingI18n.t(locale, 'modeAmountTitle')}
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-neutral-600)' }}>
                    {giftingI18n.t(locale, 'modeAmountDesc')}
                  </span>

                  {pledgeType === 'partial_amount' && (
                    <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                      <input
                        type="number"
                        min={1}
                        className="chibi-input"
                        value={pledgeAmountDkk}
                        onChange={(e) => setPledgeAmountDkk(e.target.value)}
                        placeholder={giftingI18n.t(locale, 'amountInputLabel')}
                        required
                      />
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {[100, 200, 300, 500].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            className="chibi-pill"
                            style={{ cursor: 'pointer', background: '#ffffff' }}
                            onClick={() => setPledgeAmountDkk(String(amt))}
                          >
                            {amt} {commonI18n.t(locale, 'currency')}
                          </button>
                        ))}
                        {(() => {
                          const gs = giftingStates[activePledgeWish.id];
                          if (gs && gs.remainingDkk && gs.remainingDkk > 0) {
                            return (
                              <button
                                type="button"
                                className="chibi-pill chibi-pill-mint"
                                style={{ cursor: 'pointer' }}
                                onClick={() => setPledgeAmountDkk(String(gs.remainingDkk))}
                              >
                                ✨{' '}
                                {giftingI18n.t(locale, 'takeRemainingButton', {
                                  amount: gs.remainingDkk,
                                  percent: gs.remainingPercent
                                })}
                              </button>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      {activePledgeWish.priceDkk && Number(pledgeAmountDkk) > 0 && (
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary-800)' }}>
                          {giftingI18n.t(locale, 'correspondsToPercent', {
                            percent: Math.min(
                              100,
                              Math.round((Number(pledgeAmountDkk) / activePledgeWish.priceDkk) * 100)
                            ),
                            total: activePledgeWish.priceDkk.toLocaleString(
                              locale === 'da' ? 'da-DK' : 'en-US'
                            )
                          })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </label>

              {/* Option 3: Partial Percentage (%) */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: 12,
                  borderRadius: 14,
                  border:
                    pledgeType === 'partial_percent'
                      ? '2px solid var(--color-primary-500)'
                      : '1.5px solid var(--color-primary-200)',
                  background: pledgeType === 'partial_percent' ? 'var(--color-primary-50)' : '#ffffff',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="radio"
                  name="pledgeType"
                  checked={pledgeType === 'partial_percent'}
                  onChange={() => setPledgeType('partial_percent')}
                  style={{ marginTop: 4 }}
                />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '0.94rem' }}>
                    {giftingI18n.t(locale, 'modePercentTitle')}
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-neutral-600)' }}>
                    {giftingI18n.t(locale, 'modePercentDesc')}
                  </span>

                  {pledgeType === 'partial_percent' && (
                    <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input
                          type="range"
                          min={5}
                          max={100}
                          step={5}
                          value={pledgePercentShare}
                          onChange={(e) => setPledgePercentShare(Number(e.target.value))}
                          style={{ flex: 1 }}
                        />
                        <input
                          type="number"
                          min={1}
                          max={100}
                          className="chibi-input"
                          style={{ width: 84, textAlign: 'center', fontWeight: 800 }}
                          value={pledgePercentShare}
                          onChange={(e) => setPledgePercentShare(Number(e.target.value))}
                          required
                        />
                        <strong>%</strong>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {[20, 25, 33, 50, 75].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            className="chibi-pill"
                            style={{ cursor: 'pointer', background: '#ffffff' }}
                            onClick={() => setPledgePercentShare(pct)}
                          >
                            {pct}%
                          </button>
                        ))}
                        {(() => {
                          const gs = giftingStates[activePledgeWish.id];
                          if (gs && gs.remainingPercent > 0 && gs.remainingPercent < 100) {
                            return (
                              <button
                                type="button"
                                className="chibi-pill chibi-pill-mint"
                                style={{ cursor: 'pointer' }}
                                onClick={() => setPledgePercentShare(gs.remainingPercent)}
                              >
                                ✨ {gs.remainingPercent}%
                              </button>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      {activePledgeWish.priceDkk && pledgePercentShare > 0 && (
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary-800)' }}>
                          {giftingI18n.t(locale, 'correspondsToDkk', {
                            amount: Math.round(
                              (activePledgeWish.priceDkk * pledgePercentShare) / 100
                            ).toLocaleString(locale === 'da' ? 'da-DK' : 'en-US'),
                            total: activePledgeWish.priceDkk.toLocaleString(
                              locale === 'da' ? 'da-DK' : 'en-US'
                            )
                          })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </label>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginTop: 6
                }}
              >
                {giftingStates[activePledgeWish.id]?.isViewerPledged ? (
                  <button
                    type="button"
                    className="chibi-btn chibi-btn-secondary"
                    style={{ color: '#e11d48', borderColor: '#fecdd3' }}
                    onClick={() => handleRemoveGiftPledge(activePledgeWish.id)}
                    disabled={savingPledge}
                  >
                    🗑️ {giftingI18n.t(locale, 'unpledgeButton')}
                  </button>
                ) : (
                  <span />
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="chibi-btn chibi-btn-secondary"
                    onClick={() => setActivePledgeWish(null)}
                  >
                    {commonI18n.t(locale, 'cancel')}
                  </button>
                  <button type="submit" className="chibi-btn" disabled={savingPledge}>
                    {giftingI18n.t(locale, 'savePledgeButton')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
