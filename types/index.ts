export type Phase = 'free' | 'freePro' | 'pro';

export type TeeColor = 'Black' | 'Blue' | 'White' | 'Yellow' | 'Red';

export interface Player {
  id: string;
  who: string;
  name: string;
  rating: number;
  home: string;
  homePro: string;
  hcp: string;
  tees: TeeColor;
  pace: string;
  cart: string;
  music: string;
  online: boolean;
  distance: string;
  bio: string;
}

export interface Friend {
  id: string;
  who: string;
  name: string;
  avatar_url?: string | null;
  hcp: string;
  home: string;
  homePro?: string;
  rating?: number;
  tees: TeeColor;
  pace?: string;
  cart?: string;
  music?: string;
  online: boolean;
  games: number;
  distance?: string;
  bio?: string;
}

export interface Game {
  id: string;
  title: string;
  venue: string;
  city?: string;           // city the game is in, e.g. 'Lahore'
  when: string;            // display string, e.g. 'Today 4:00 PM'
  crew: string[];
  crewNames: string;
  crewRating: string;
  chips: [string, string][];
  spots: number;
  boosted: boolean;
  hcp_range?: string;         // 'Open' | 'Hcp 0–6' | 'Hcp 6–12' | 'Hcp 12–18' | 'Hcp 18–24' | 'Hcp 24+'
  pace?: string;              // 'Any' | 'Fast' | 'Moderate' | 'Relaxed' | 'Casual'
  tees?: string;              // 'Any' | 'Blue' | 'Red' etc.
  cart?: string;              // 'Any' | 'Walking' | 'Cart'
  holes?: string;             // '9 Holes' | '18 Holes' | '27 Holes' | '36 Holes'
  format?: string;            // 'Stroke Play' | 'Match Play' | 'Stableford'
  broadcaster_id?: string;    // Supabase user ID of the person who posted
  co_broadcasters?: string[]; // IDs of users co-broadcasting (max 2, besides broadcaster)
  pending_co_broadcasters?: string[]; // subset of co_broadcasters awaiting confirmation
  joined_players?: string[];          // IDs of players who joined and were accepted
  pending_joined_players?: string[];  // IDs of players who requested to join, awaiting broadcaster acceptance
  roundStatus?:  'open' | 'in_progress' | 'completed';
  scheduledAt?:  string;             // ISO timestamp of the planned round start time
}

export interface ReceivedRating {
  total: number;   // sum of all star values received
  count: number;   // number of ratings received
}

export interface Message {
  id?: string;           // Supabase UUID — undefined for mock/optimistic messages
  from: 'me' | string;  // sender_id UUID, 'me', or 'system'
  text: string;
  time: string;
  senderName?: string;  // populated from profiles join for real group messages
}

export interface Thread {
  id: string;
  who: string;
  name: string;
  last: string;
  time: string;
  unread: number;
  msgs: Message[];
  isGroup?: boolean;            // true for game group chats
  crew?: string[];              // member user-IDs (mirrors Game.crew)
  joinedMsgIndex?: number;      // msgs[] index from which the current user can see messages (undefined = all)
  participant_ids?: string[];   // real-mode: Supabase user IDs of all participants
}

export interface SheetState {
  type: 'player' | 'game' | 'availability' | 'editProfile';
  data: Player | Friend | Game | Record<string, unknown>;
}
