import { supabase } from './supabase';
import type { Message } from '@/types';

export function directThreadId(id1: string, id2: string): string {
  return `direct_${[id1, id2].sort().join('_')}`;
}

export async function upsertThread(
  id: string,
  type: 'direct' | 'group',
  name: string,
  participantIds: string[],
  gameId?: string,
): Promise<{ error: any }> {
  const { error } = await supabase
    .from('threads')
    .upsert(
      { id, type, name, participant_ids: participantIds, game_id: gameId ?? null },
      { onConflict: 'id', ignoreDuplicates: true },
    );
  return { error };
}

export async function sendMessageToSupabase(
  threadId: string,
  senderId: string,
  text: string,
): Promise<{ error: any }> {
  const { error } = await supabase
    .from('messages')
    .insert({ thread_id: threadId, sender_id: senderId, text });

  if (!error) {
    supabase
      .from('threads')
      .update({ last_message_text: text, last_message_at: new Date().toISOString() })
      .eq('id', threadId)
      .then(() => {});
  }

  return { error };
}

export async function loadMessagesFromSupabase(
  threadId: string,
  myId: string,
  limit = 60,
): Promise<Message[]> {
  const { data } = await supabase
    .from('messages')
    .select('id, sender_id, text, created_at, profiles(first_name, last_name)')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(limit);

  return (data ?? []).map((row: any): Message => ({
    id: row.id,
    from: row.sender_id === myId ? 'me' : row.sender_id,
    text: row.text,
    time: new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    senderName: row.profiles
      ? [row.profiles.first_name, row.profiles.last_name].filter(Boolean).join(' ') || undefined
      : undefined,
  }));
}

export async function loadUserThreads(): Promise<{
  id: string;
  name: string;
  type: string;
  participant_ids: string[];
  last_message_text: string | null;
  last_message_at: string;
}[]> {
  const { data } = await supabase
    .from('threads')
    .select('id, name, type, participant_ids, last_message_text, last_message_at')
    .order('last_message_at', { ascending: false });
  return data ?? [];
}

export function subscribeToThreadMessages(
  threadId: string,
  onInsert: (row: { id: string; sender_id: string; text: string; created_at: string }) => void,
) {
  return supabase
    .channel(`messages:${threadId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `thread_id=eq.${threadId}`,
      },
      (payload: any) => onInsert(payload.new),
    )
    .subscribe();
}
