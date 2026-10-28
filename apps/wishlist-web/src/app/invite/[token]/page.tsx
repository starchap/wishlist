import React from 'react';
import { WishlistAppClient } from '../../../components/WishlistAppClient';

export default async function InvitePage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <WishlistAppClient initialInviteToken={token} />;
}
