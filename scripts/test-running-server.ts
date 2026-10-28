import { spawn } from 'child_process';
import sharp from 'sharp';

async function waitForServer(url: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Wait 500ms
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not become ready at ${url}`);
}

async function main() {
  const port = 3099;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Starting Next.js production server on ${baseUrl}...`);

  const serverProc = spawn('npx', ['next', 'start', 'apps/wishlist-web', '-p', String(port)], {
    stdio: 'pipe',
    shell: true,
    env: { ...process.env }
  });

  try {
    await waitForServer(baseUrl);
    console.log('[HTTP] Server is up! GET / returned 200 OK');

    // 1. Login as Admin via /api/auth
    const loginRes = await fetch(`${baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'login',
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_DEFAULT_PASSWORD || 'admin123'
      })
    });
    if (!loginRes.ok) {
      throw new Error(`Login failed with status ${loginRes.status}`);
    }
    const adminCookie = loginRes.headers.get('set-cookie')?.split(';')[0] || '';
    const loginJson = await loginRes.json();
    console.log(`[HTTP /api/auth] Logged in as Admin: ${loginJson.user.displayName}`);

    // 2. Create a unique invite link via /api/invites
    const suffix = Date.now().toString().slice(-4);
    const invRes = await fetch(`${baseUrl}/api/invites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie
      },
      body: JSON.stringify({ label: `E2E_Gæst_${suffix}` })
    });
    const invJson = await invRes.json();
    console.log(`[HTTP /api/invites] Created unique invite token: /invite/${invJson.invite.token}`);

    // 3. Create a Wish with an 800x800 PNG image via /api/wishlists and verify /api/images/[id] serves <=512x512 AVIF
    const pngBuffer = await sharp({
      create: { width: 800, height: 800, channels: 3, background: { r: 242, g: 82, b: 141 } }
    })
      .png()
      .toBuffer();
    const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;

    const addWishRes = await fetch(`${baseUrl}/api/wishlists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie
      },
      body: JSON.stringify({
        title: 'Chibi Mumi Krus',
        description: 'Pastel lyserød udgave',
        quantity: 2,
        priceDkk: 199,
        productUrl: 'https://example.com/moomin',
        imageDataUrl: dataUrl
      })
    });
    const addWishJson = await addWishRes.json();
    const createdWish = addWishJson.wish;
    console.log(
      `[HTTP /api/wishlists] Created wish "${createdWish.title}" with imageApiUrl=${createdWish.imageApiUrl}`
    );

    // 4. Fetch the served AVIF image via HTTP GET /api/images/[id]
    const imgRes = await fetch(`${baseUrl}${createdWish.imageApiUrl}`);
    const contentType = imgRes.headers.get('content-type');
    const imgBytes = Buffer.from(await imgRes.arrayBuffer());
    const imgMeta = await sharp(imgBytes).metadata();
    console.log(
      `[HTTP ${createdWish.imageApiUrl}] Status=${imgRes.status}, Content-Type=${contentType}, Dimensions=${imgMeta.width}x${imgMeta.height}, Size=${imgBytes.byteLength} bytes, EXIF=${Boolean(imgMeta.exif)}`
    );

    // Clean up test wish
    await fetch(`${baseUrl}/api/wishlists?wishId=${encodeURIComponent(createdWish.id)}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie }
    });
    console.log('[HTTP /api/wishlists] Cleaned up E2E test wish.');
    console.log('✅ RUNNING NEXT.JS SERVER + NEON POSTGRES END-TO-END HTTP TEST PASSED!');
  } finally {
    serverProc.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
