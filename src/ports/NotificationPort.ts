/**
 * NotificationPort — hexagonal boundary for out-of-band notification delivery.
 * Handles push notifications, alerts, and scheduled reminders.
 */

/** Priority level of a notification. */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

/** Category of notification for filtering/routing. */
export type NotificationCategory =
  | 'payment_received'
  | 'payment_sent'
  | 'payment_failed'
  | 'invoice_paid'
  | 'invoice_expired'
  | 'security_alert'
  | 'kyc_update'
  | 'balance_low'
  | 'system'
  | 'reminder'
  | string;

/** A notification to be delivered to a user. */
export interface Notification {
  /**
   * Unique identifier for this notification.
   * Used for deduplication and tracking delivery.
   */
  id: string;
  /** Recipient identifier (phone number, user ID, etc.) */
  recipient: string;
  /** Short notification title */
  title: string;
  /** Full notification body text */
  body: string;
  /** Notification category for routing and filtering */
  category: NotificationCategory;
  /** Delivery priority */
  priority: NotificationPriority;
  /**
   * Structured data payload for the recipient's client.
   * E.g. deeplink info, transaction details, etc.
   */
  data?: Record<string, unknown>;
  /**
   * When to deliver the notification.
   * If omitted, deliver immediately.
   */
  scheduledFor?: Date;
  /**
   * How long the notification should remain valid.
   * Undelivered notifications older than this are discarded.
   */
  expiresAt?: Date;
  /** Whether to require explicit delivery confirmation */
  requireDeliveryReceipt?: boolean;
}

/** Result of a notification delivery attempt. */
export interface NotificationResult {
  /** ID of the notification that was sent */
  notificationId: string;
  /** Whether the notification was accepted for delivery */
  accepted: boolean;
  /** Platform-specific delivery ID for tracking */
  deliveryId?: string;
  /** When the notification was accepted */
  acceptedAt?: Date;
  /**
   * If accepted === false, the reason why.
   */
  failureReason?: string;
}

/** Status of a previously sent notification. */
export interface NotificationStatus {
  notificationId: string;
  /** Current delivery status */
  status: 'pending' | 'delivered' | 'failed' | 'expired' | 'cancelled';
  /** When the notification was delivered (if status === 'delivered') */
  deliveredAt?: Date;
  /** Failure reason (if status === 'failed') */
  failureReason?: string;
}

/**
 * NotificationPort — implement this for each notification channel/backend.
 */
export interface NotificationPort {
  /**
   * Send (or schedule) a notification to a user.
   * @param notification The notification to send.
   * @returns Delivery result indicating whether the notification was accepted.
   */
  sendNotification(notification: Notification): Promise<NotificationResult>;

  /**
   * Send multiple notifications in a batch.
   * More efficient than calling sendNotification() in a loop.
   * @param notifications Array of notifications to send.
   * @returns Array of delivery results in the same order as the input.
   */
  sendBatch(notifications: Notification[]): Promise<NotificationResult[]>;

  /**
   * Cancel a previously scheduled notification before it is delivered.
   * @param notificationId The ID of the notification to cancel.
   * @returns true if the notification was found and cancelled, false otherwise.
   */
  cancelNotification(notificationId: string): Promise<boolean>;

  /**
   * Get the current delivery status of a notification.
   * @param notificationId The ID of the notification to check.
   */
  getStatus(notificationId: string): Promise<NotificationStatus | null>;

  /** Human-readable name of this notification provider. */
  getProviderName(): string;

  /**
   * Health check — returns true if the notification service is reachable.
   */
  ping(): Promise<boolean>;
}
