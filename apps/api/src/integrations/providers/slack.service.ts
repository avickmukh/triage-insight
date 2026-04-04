import { Injectable, Logger } from '@nestjs/common';

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  memberCount?: number;
  topic?: string;
}

export interface SlackMessage {
  ts: string;
  threadTs?: string;
  userId?: string;
  username?: string;
  text: string;
  replyCount?: number;
  reactions?: Array<{ name: string; count: number }>;
  channelId: string;
  channelName: string;
}

/**
 * SlackService — thin wrapper around the Slack Web API.
 *
 * All methods accept a bot token and return typed results.
 * The token is fetched from IntegrationConnection.accessToken at call-site.
 */
@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private readonly baseUrl = 'https://slack.com/api';

  private async slackGet<T>(
    token: string,
    method: string,
    params: Record<string, string | number | boolean> = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${method}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Slack API HTTP error: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as { ok: boolean; error?: string } & T;
    if (!json.ok) {
      throw new Error(`Slack API error: ${json.error ?? 'unknown'}`);
    }
    return json;
  }

  /**
   * List all public (and private if bot has access) channels in the workspace.
   */
  async listChannels(token: string): Promise<SlackChannel[]> {
    const channels: SlackChannel[] = [];
    let cursor: string | undefined;

    do {
      const params: Record<string, string | number | boolean> = {
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 200,
      };
      if (cursor) params.cursor = cursor;

      const res = await this.slackGet<{
        channels: Array<{
          id: string;
          name: string;
          is_private: boolean;
          num_members?: number;
          topic?: { value: string };
        }>;
        response_metadata?: { next_cursor?: string };
      }>(token, 'conversations.list', params);

      for (const ch of res.channels ?? []) {
        channels.push({
          id: ch.id,
          name: ch.name,
          isPrivate: ch.is_private,
          memberCount: ch.num_members,
          topic: ch.topic?.value || undefined,
        });
      }

      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return channels;
  }

  /**
   * Fetch messages from a channel since a given timestamp.
   * Returns messages in ascending chronological order.
   */
  async fetchMessages(
    token: string,
    channelId: string,
    channelName: string,
    oldest?: string,
    limit = 100,
  ): Promise<SlackMessage[]> {
    const params: Record<string, string | number | boolean> = {
      channel: channelId,
      limit,
      inclusive: false,
    };
    if (oldest) params.oldest = oldest;

    const res = await this.slackGet<{
      messages: Array<{
        ts: string;
        thread_ts?: string;
        user?: string;
        username?: string;
        text: string;
        reply_count?: number;
        reactions?: Array<{ name: string; count: number }>;
        subtype?: string;
        bot_id?: string;
      }>;
    }>(token, 'conversations.history', params);

    return (res.messages ?? [])
      .filter((m) => !m.subtype && !m.bot_id && m.text?.trim())
      .map((m) => ({
        ts: m.ts,
        threadTs: m.thread_ts,
        userId: m.user,
        username: m.username,
        text: m.text,
        replyCount: m.reply_count,
        reactions: m.reactions,
        channelId,
        channelName,
      }))
      .reverse(); // oldest first
  }

  /**
   * Fetch thread replies for a given parent message.
   */
  async fetchThreadReplies(
    token: string,
    channelId: string,
    channelName: string,
    threadTs: string,
  ): Promise<SlackMessage[]> {
    const res = await this.slackGet<{
      messages: Array<{
        ts: string;
        thread_ts?: string;
        user?: string;
        username?: string;
        text: string;
        subtype?: string;
        bot_id?: string;
      }>;
    }>(token, 'conversations.replies', {
      channel: channelId,
      ts: threadTs,
    });

    // Skip the first message (it's the parent)
    return (res.messages ?? [])
      .slice(1)
      .filter((m) => !m.subtype && !m.bot_id && m.text?.trim())
      .map((m) => ({
        ts: m.ts,
        threadTs: m.thread_ts,
        userId: m.user,
        username: m.username,
        text: m.text,
        channelId,
        channelName,
      }));
  }

  /**
   * Validate that a token is valid and return basic team info.
   */
  async testAuth(
    token: string,
  ): Promise<{ teamId: string; teamName: string; botUserId: string }> {
    const res = await this.slackGet<{
      team_id: string;
      team: string;
      user_id: string;
    }>(token, 'auth.test');
    return {
      teamId: res.team_id,
      teamName: res.team,
      botUserId: res.user_id,
    };
  }
}
