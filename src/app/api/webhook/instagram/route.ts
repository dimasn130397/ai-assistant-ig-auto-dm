import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import type { IgAutomation, IgUserState } from '@/types/automation';

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';
const VERIFY_FOLLOW_PAYLOAD = 'VERIFY_FOLLOW';
const VERIFY_FOLLOW_BUTTON_TITLE = 'Udah follow 🙌';

interface MetaCommentValue {
  id?: string;
  text?: string;
  from?: {
    id?: string;
    username?: string;
  };
  media?: {
    id?: string;
  };
}

interface MetaChange {
  field?: string;
  value?: MetaCommentValue;
}

interface MetaMessagingEvent {
  sender?: {
    id?: string;
  };
  recipient?: {
    id?: string;
  };
  timestamp?: number;
  postback?: {
    title?: string;
    payload?: string;
  };
}

interface MetaWebhookEntry {
  id?: string;
  time?: number;
  changes?: MetaChange[];
  messaging?: MetaMessagingEvent[];
}

interface MetaWebhookPayload {
  object?: string;
  entry?: MetaWebhookEntry[];
}

type DmRecipient = { comment_id: string } | { id: string };

async function callGraphApi<T = unknown>(
  endpointPath: string,
  accessToken: string,
  init?: RequestInit
): Promise<{ ok: boolean; data: T | null; error?: string }> {
  const url = `${GRAPH_API_BASE}${endpointPath}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const rawText = await response.text();
  let parsed: T | null = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as T;
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      data: parsed,
      error: `Graph API ${response.status}: ${rawText}`,
    };
  }

  return { ok: true, data: parsed };
}

async function replyToComment(
  commentId: string,
  message: string,
  accessToken: string
): Promise<void> {
  const res = await callGraphApi(
    `/${encodeURIComponent(commentId)}/replies`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ message }),
    }
  );

  if (!res.ok) {
    console.error('[IG Webhook] Failed to reply comment:', res.error);
  }
}

async function sendFollowerGateDm(
  recipient: DmRecipient,
  gateMessage: string,
  accessToken: string
): Promise<void> {
  const res = await callGraphApi('/me/messages', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      recipient,
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: gateMessage,
            buttons: [
              {
                type: 'postback',
                title: VERIFY_FOLLOW_BUTTON_TITLE,
                payload: VERIFY_FOLLOW_PAYLOAD,
              },
            ],
          },
        },
      },
    }),
  });

  if (!res.ok) {
    console.error('[IG Webhook] Failed to send follower gate DM:', res.error);
  }
}

async function sendSuccessLinkDm(
  igUserId: string,
  successMessage: string,
  targetUrl: string,
  accessToken: string
): Promise<void> {
  const res = await callGraphApi('/me/messages', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      recipient: { id: igUserId },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: successMessage,
            buttons: [
              {
                type: 'web_url',
                url: targetUrl,
                title: 'Buka Link',
              },
            ],
          },
        },
      },
    }),
  });

  if (!res.ok) {
    console.error('[IG Webhook] Failed to send success link DM:', res.error);
  }
}

async function checkIsUserFollowing(
  igUserId: string,
  accessToken: string
): Promise<boolean> {
  const res = await callGraphApi<{ is_user_follow_business?: boolean }>(
    `/${encodeURIComponent(igUserId)}?fields=is_user_follow_business`,
    accessToken,
    { method: 'GET' }
  );

  if (!res.ok) {
    console.error('[IG Webhook] Failed to check follower status:', res.error);
    return false;
  }

  return res.data?.is_user_follow_business === true;
}

function findMatchingAutomation(
  commentText: string,
  automations: IgAutomation[]
): IgAutomation | null {
  const normalizedComment = commentText.trim().toLowerCase();
  if (!normalizedComment) {
    return null;
  }

  const exactMatch = automations.find(
    (item) => item.keyword.trim().toLowerCase() === normalizedComment
  );
  if (exactMatch) {
    return exactMatch;
  }

  const sortedByLength = [...automations].sort(
    (a, b) => b.keyword.trim().length - a.keyword.trim().length
  );

  return (
    sortedByLength.find((item) => {
      const kw = item.keyword.trim().toLowerCase();
      return kw.length > 0 && normalizedComment.includes(kw);
    }) ?? null
  );
}

async function handleCommentChange(
  entryId: string | undefined,
  change: MetaChange,
  automations: IgAutomation[],
  accessToken: string
): Promise<void> {
  if (change.field !== 'comments' || !change.value) {
    return;
  }

  const commentId = change.value.id;
  const commentText = change.value.text;
  const fromId = change.value.from?.id;
  const fromUsername = change.value.from?.username ?? null;

  if (!commentId || !commentText || !fromId) {
    return;
  }

  // Abaikan komentar dari akun IG bisnis sendiri agar tidak terjadi loop
  if (entryId && fromId === entryId) {
    return;
  }

  const matched = findMatchingAutomation(commentText, automations);
  if (!matched) {
    return;
  }

  const supabase = getSupabaseAdmin();

  const { error: stateError } = await supabase.from('ig_user_states').upsert(
    {
      ig_user_id: fromId,
      username: fromUsername,
      last_automation_id: matched.id,
      is_follower: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'ig_user_id' }
  );

  if (stateError) {
    console.error('[IG Webhook] Failed to upsert ig_user_states:', stateError);
    return;
  }

  const nextTriggerCount = matched.trigger_count + 1;
  matched.trigger_count = nextTriggerCount;

  const { error: countError } = await supabase
    .from('ig_automations')
    .update({ trigger_count: nextTriggerCount })
    .eq('id', matched.id);

  if (countError) {
    console.error('[IG Webhook] Failed to increment trigger_count:', countError);
  }

  await replyToComment(commentId, matched.comment_reply, accessToken);
  await sendFollowerGateDm(
    { comment_id: commentId },
    matched.gate_message,
    accessToken
  );
}

async function handlePostbackEvent(
  event: MetaMessagingEvent,
  accessToken: string
): Promise<void> {
  if (event.postback?.payload !== VERIFY_FOLLOW_PAYLOAD) {
    return;
  }

  const igUserId = event.sender?.id;
  if (!igUserId) {
    return;
  }

  const supabase = getSupabaseAdmin();

  const { data: userState, error: stateError } = await supabase
    .from('ig_user_states')
    .select('*')
    .eq('ig_user_id', igUserId)
    .maybeSingle<IgUserState>();

  if (stateError || !userState || !userState.last_automation_id) {
    console.error('[IG Webhook] User state not found for postback:', stateError);
    return;
  }

  const { data: automation, error: autoError } = await supabase
    .from('ig_automations')
    .select('*')
    .eq('id', userState.last_automation_id)
    .maybeSingle<IgAutomation>();

  if (autoError || !automation) {
    console.error('[IG Webhook] Automation not found for user state:', autoError);
    return;
  }

  const isFollowing = await checkIsUserFollowing(igUserId, accessToken);

  if (isFollowing) {
    const { error: updateError } = await supabase
      .from('ig_user_states')
      .update({
        is_follower: true,
        updated_at: new Date().toISOString(),
      })
      .eq('ig_user_id', igUserId);

    if (updateError) {
      console.error('[IG Webhook] Failed to mark user verified:', updateError);
    }

    await sendSuccessLinkDm(
      igUserId,
      automation.success_message,
      automation.target_url,
      accessToken
    );
    return;
  }

  await sendFollowerGateDm(
    { id: igUserId },
    automation.gate_message,
    accessToken
  );
}

/**
 * GET /api/webhook/instagram
 * Verifikasi webhook Meta (hub.mode, hub.verify_token, hub.challenge).
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.IG_VERIFY_TOKEN;

  if (
    mode === 'subscribe' &&
    Boolean(expectedToken) &&
    token === expectedToken
  ) {
    return new NextResponse(challenge ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * POST /api/webhook/instagram
 * Menerima event komentar dan DM postback dari Meta Instagram Graph API.
 */
export async function POST(request: NextRequest) {
  let payload: MetaWebhookPayload;
  try {
    payload = (await request.json()) as MetaWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    console.error('[IG Webhook] Supabase is not configured.');
    return NextResponse.json(
      { received: false, error: 'Supabase not configured' },
      { status: 500 }
    );
  }

  const accessToken = process.env.IG_PAGE_ACCESS_TOKEN;
  if (!accessToken || accessToken.includes('your-instagram-page-access-token')) {
    console.error('[IG Webhook] IG_PAGE_ACCESS_TOKEN is not configured.');
    return NextResponse.json(
      { received: false, error: 'IG_PAGE_ACCESS_TOKEN not configured' },
      { status: 500 }
    );
  }

  const entries = payload.entry ?? [];
  const hasCommentChanges = entries.some((entry) =>
    (entry.changes ?? []).some((change) => change.field === 'comments')
  );

  let activeAutomations: IgAutomation[] = [];
  if (hasCommentChanges) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('ig_automations')
      .select('*')
      .eq('is_active', true)
      .returns<IgAutomation[]>();

    if (error) {
      console.error('[IG Webhook] Failed to fetch active automations:', error);
    } else {
      activeAutomations = data ?? [];
    }
  }

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      await handleCommentChange(
        entry.id,
        change,
        activeAutomations,
        accessToken
      );
    }

    for (const event of entry.messaging ?? []) {
      await handlePostbackEvent(event, accessToken);
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
