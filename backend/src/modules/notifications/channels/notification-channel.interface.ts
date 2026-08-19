export interface ChannelMessage {
  userId: string;
  email?: string;
  title: string;
  body?: string;
  data?: Record<string, string>;
}

export interface NotificationChannel {
  readonly name: string;
  /** False when the channel has no credentials configured — callers skip it silently. */
  isConfigured(): boolean;
  send(message: ChannelMessage): Promise<void>;
}
