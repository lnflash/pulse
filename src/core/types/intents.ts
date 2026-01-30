/**
 * Core intent enum - all command intents from feature inventory
 * Source: docs/feature-inventory.md Intent Mapping Table
 */
export enum Intent {
  // Account Management
  Help = 'HELP',
  LinkAccount = 'LINK_ACCOUNT',
  UnlinkAccount = 'UNLINK_ACCOUNT',
  VerifyOTP = 'VERIFY_OTP',
  SkipOnboarding = 'SKIP_ONBOARDING',

  // Wallet Operations
  CheckBalance = 'CHECK_BALANCE',
  RefreshBalance = 'REFRESH_BALANCE',
  CheckPrice = 'CHECK_PRICE',

  // Payments
  SendPayment = 'SEND_PAYMENT',
  CreateInvoice = 'CREATE_INVOICE',
  PayInvoice = 'PAY_INVOICE',
  RequestPayment = 'REQUEST_PAYMENT',
  ConfirmPayment = 'CONFIRM_PAYMENT',
  UndoTransaction = 'UNDO_TRANSACTION',
  InvoiceDetected = 'INVOICE_DETECTED',

  // Transaction Management
  ViewHistory = 'VIEW_HISTORY',
  ViewPending = 'VIEW_PENDING',

  // Contacts
  ManageContacts = 'MANAGE_CONTACTS',
  SaveContactVCard = 'SAVE_CONTACT_VCARD',

  // Templates
  ManageTemplate = 'MANAGE_TEMPLATE',

  // Settings
  ManageUsername = 'MANAGE_USERNAME',
  ViewSettings = 'VIEW_SETTINGS',
  ManageConsent = 'MANAGE_CONSENT',
  ManageVoice = 'MANAGE_VOICE',

  // Content Sharing
  ShareContent = 'SHARE_CONTENT', // Vybz/Nostr

  // Admin
  AdminCommand = 'ADMIN_COMMAND',

  // Learning
  Learn = 'LEARN',

  // Conversational
  Conversational = 'CONVERSATIONAL',
  Greeting = 'GREETING',
  Unknown = 'UNKNOWN',
}

/**
 * Plugin IDs - from feature inventory plugins section
 */
export enum PluginId {
  Trivia = 'trivia',
  DailyChallenge = 'daily-challenge',
  GroupGames = 'group-games',
  Anonymous = 'anonymous-messaging',
  Decision = 'decision-making',
  Translation = 'translation',
  Entertainment = 'joke-meme',
}

/**
 * Intent classification result - discriminated union for core vs plugin
 */
export type IntentResult =
  | {
      kind: 'core';
      intent: Intent;
      slots: Record<string, string>;
      confidence: number;
      rawText: string;
    }
  | {
      kind: 'plugin';
      pluginId: PluginId;
      action: string;
      slots: Record<string, string>;
      confidence: number;
      rawText: string;
    };
