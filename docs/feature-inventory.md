# Feature Inventory

> Exhaustive feature inventory extracted from the Pulse codebase (god service, command parser, plugins, router).
> Source: `whatsapp.service.ts` (6,508 lines), `command-parser.service.ts` (1,861 lines), 7 plugins, message router.
> Task 1 of 23 — Hexagonal Rewrite Plan.

---

## Commands

### CommandType.HELP

- **Description**: Shows contextual help based on session state and optional category. Supports numbered navigation (1=wallet, 2=send, 3=receive), named categories (wallet, send, receive, contacts, pending, voice, games, more), instructional Q&A ("how do I send money?"), and group-specific help.
- **Handler**: `getHelpMessage()`, `getFullHelpMenu()`, `getCategoryHelp()`, `getInstructionalResponse()`
- **Natural language triggers**: `help please`, `please help`, `help me`, `i need help`, `can you help me`, `what can you do`, `show me what you can do`, `need assistance`, `how does this work`, `how do i use this`, `what are the commands`, `show commands`, `list commands`, `available commands`, `what can i do`, `menu`, `main menu`, `?`, `info`, `commands`, `options`, `start`, `get started`, `getting started`, `tutorial`, `instructions`, `guide me`
- **Regex pattern**: `/^help(?:\s+(wallet|send|receive|contacts|pending|voice|games|more|1|2|3))?$/i`
- **Flash API calls**: None
- **Redis keys accessed**: None
- **Response format**: Multi-line WhatsApp markdown with bullet points and backtick commands. Varies by: unlinked user (link CTA), unverified user (verify CTA), verified DM (concise 6-command list + `help more`), verified group (group-specific commands), category drill-down, instructional Q&A
- **Auth required**: NO (response varies by auth state)
- **Group support**: YES (shows group-specific commands)

---

### CommandType.LINK

- **Description**: Initiates Flash account linking via OTP. Supports three flows: (1) standard DM link → OTP verification, (2) `link group` in DM → generates 6-char privacy code for group use, (3) `link CODE` in group → verifies privacy code for @lid users.
- **Handler**: `handleLinkCommand()`
- **Natural language triggers**: `link my account`, `connect my account`, `link my flash`, `connect to flash`, `setup my account`, `set up my account`, `authenticate me`, `sign me up`, `register me`, `join flash`, `connect wallet`, `link wallet`, `link me`, `connect me`, `link`, `connect`, `setup`, `register`, `authenticate`, `auth`
- **Regex pattern**: `/^link(?:\s+(group|[A-Z0-9]{6}))?$|^connect(?:\s+(?:to\s+)?(?:flash|me|my\s+account))?$/i`
- **Flash API calls**: `authService.initiateAccountLinking()` (sends OTP), `groupAuthService.verifyGroupLinkCode()`, `groupAuthService.generateGroupLinkCode()`
- **Redis keys accessed**: `session:{sessionId}` (encrypted), `whatsapp:{hash(whatsappId)}` (session lookup), group link codes via GroupAuthService
- **Response format**: OTP prompt ("Enter the 6-digit verification code"), already-linked message, manual verification instructions, group privacy code display, @lid privacy mode instructions
- **Auth required**: NO (initiates auth)
- **Group support**: YES (privacy code flow)

---

### CommandType.UNLINK

- **Description**: Disconnects Flash account from WhatsApp. Two-step: first shows confirmation prompt, then `unlink confirm` executes.
- **Handler**: `handleUnlinkCommand()`
- **Natural language triggers**: None beyond regex
- **Regex pattern**: `/^unlink(?:\s+(confirm))?$/i`
- **Flash API calls**: `authService.unlinkAccount()`
- **Redis keys accessed**: Session deletion via `sessionService.deleteSession()`
- **Response format**: Confirmation prompt or success message
- **Auth required**: YES
- **Group support**: NO (not explicitly blocked but designed for DM)

---

### CommandType.VERIFY

- **Description**: Verifies 6-digit OTP code to complete account linking. On success: fetches and stores username mapping, auto-claims pending payments, publishes `user_verified` event, shows welcome message.
- **Handler**: `handleVerifyCommand()`
- **Natural language triggers**: Bare 6-digit code is auto-converted to verify command by parser
- **Regex pattern**: `/^(?:verify|v)\s+(\d{6})$/i` + implicit 6-digit bare input
- **Flash API calls**: `authService.verifyAccountLinking()`, `usernameService.getUsername()`, `pendingPaymentService.getPendingPaymentsByPhone()`, `processPendingPaymentClaim()` (for auto-claim)
- **Redis keys accessed**: `session:{sessionId}` (encrypted, update), username mapping via `sessionService.storeUsernameMapping()`
- **Response format**: Welcome message with user's first name, optional pending payment claim summary, forceVoice flag
- **Auth required**: NO (completes auth)
- **Group support**: NO

---

### CommandType.BALANCE

- **Description**: Fetches and displays wallet balance with currency conversion. Shows BTC balance, fiat balance in user's display currency, last updated timestamp.
- **Handler**: `handleBalanceCommand()`
- **Natural language triggers**: `check my balance`, `what is my balance`, `show me my balance`, `how much do i have`, `how much money`, `my wallet balance`, `tell me my balance`, `balance please`, `how much money do i have`, `bal`, `funds`, `$`, plus ~30 more variations
- **Regex pattern**: `/^balance|^bal$/i`
- **Flash API calls**: `balanceService.getUserBalance()` (with 5s deduplication cache)
- **Redis keys accessed**: Balance cache via `DeduplicationKeyBuilder.forBalance()`
- **Response format**: `BalanceTemplate.generateBalanceMessage()` — formatted BTC + fiat + timestamp. Voice: `generateVoiceBalanceMessage()`
- **Auth required**: YES
- **Group support**: YES (returns same response)

---

### CommandType.REFRESH

- **Description**: Clears balance cache and fetches fresh balance data. Same display as balance but with `ttl: 0` (no cache).
- **Handler**: `handleRefreshCommand()`
- **Natural language triggers**: None beyond regex
- **Regex pattern**: `/^refresh$/i`
- **Flash API calls**: `balanceService.clearBalanceCache()`, `balanceService.getUserBalance(force=true)`
- **Redis keys accessed**: Balance cache cleared
- **Response format**: Same as BALANCE (BalanceTemplate)
- **Auth required**: YES
- **Group support**: YES

---

### CommandType.USERNAME

- **Description**: View or set Flash username. Without args: shows current username + lightning address. With arg: sets new username (one-time, immutable).
- **Handler**: `handleUsernameCommand()`
- **Natural language triggers**: None beyond regex
- **Regex pattern**: `/^username(?:\s+(.+))?$/i`
- **Flash API calls**: `usernameService.getUsername()`, `usernameService.setUsername()`
- **Redis keys accessed**: Username mapping via `sessionService.storeUsernameMapping()`
- **Response format**: Current username + lightning address (`username@flashapp.me`), or set confirmation, or error
- **Auth required**: YES
- **Group support**: YES

---

### CommandType.PRICE

- **Description**: Shows current Bitcoin price. Authenticated users see price in their display currency; unauthenticated see USD with link CTA.
- **Handler**: `handlePriceCommand()`
- **Natural language triggers**: `bitcoin price`, `btc price`, `price of bitcoin`, `how much is bitcoin`, `what is bitcoin worth`, `current bitcoin price`, `bitcoin rate`, `btc value`, `show me the price`, `price`, `rate`, `btc`, `bitcoin`, plus ~30 more
- **Regex pattern**: `/^price|^rate|^btc$/i`
- **Flash API calls**: `priceService.getBitcoinPrice()` (with configurable TTL cache)
- **Redis keys accessed**: Price cache via `DeduplicationKeyBuilder.forPrice()`
- **Response format**: `priceService.formatPriceMessage()` — price data. Unauthed: appends link CTA
- **Auth required**: NO (enhanced for authed users)
- **Group support**: YES

---

### CommandType.SEND

- **Description**: Send Lightning payment. Complex multi-path handler supporting: (1) intraledger to @username, (2) Lightning invoice (lnbc...), (3) Lightning address (user@domain — not yet implemented), (4) saved contact → auto-resolve to username or escrow, (5) phone number → escrow with claim code. Pre-confirmation flow stores pending payment; user confirms with yes/ok/pay. Includes voice payment confirmation, recipient notification (voice + text), undo tracking, analytics logging.
- **Handler**: `handleSendCommand()`, `validateSendRecipient()`, payment confirmation flow in `handleCommand()`
- **Natural language triggers**: `send 10 to john`, `pay 5 to jane`, `transfer 20 to bob`, `give john 10`, `i want to send 15 to alice`, `i owe bob 10`, `pay back john 5`, `send john $10`, `zap 10 to john`, `shoot 10 to john`, `wire 10 to john`, `10 to john`, `10 for john`, plus word-number support ("send one dollar to john")
- **Regex pattern**: `/^(?:send|sent)\s+(\d*\.?\d+)\s+to\s+(?:@?(\w+)|(\+?\d{10,})|(\w+))(?:\s+(.*))?$/i`
- **Flash API calls**: `flashApiService.executeQuery(ACCOUNT_DEFAULT_WALLET_QUERY)` (username lookup), `paymentService.getUserWallets()`, `paymentService.sendIntraLedgerUsdPayment()`, `paymentService.sendLightningPayment()`, `balanceService.getUserBalance()` (post-payment display), `usernameService.getUsername()` (sender display name), `pendingPaymentService.createPendingPaymentWithCode()` (escrow)
- **Redis keys accessed**: `contacts:{whatsappId}` (contact lookup), `pending_send:{whatsappId}` (5min TTL), `pending_payments:{whatsappId}` (encrypted), undo transaction storage, analytics logging
- **Response format**: Confirmation prompt with details → success message with amount/recipient/txId/new balance/tip, or error with contextual next-steps. Voice: `formatPaymentSuccessForVoice()` / `formatPaymentErrorForVoice()`
- **Auth required**: YES
- **Group support**: YES (via username)

---

### CommandType.RECEIVE

- **Description**: Create Lightning invoice for receiving payment. Generates QR code. Stores invoice for tracking.
- **Handler**: `handleReceiveCommand()`
- **Natural language triggers**: Covered in NLP section of parser (receive variations)
- **Regex pattern**: `/^receive(?:\s+(\d*\.?\d+))?\s*(.*)$/i`
- **Flash API calls**: `invoiceService.createInvoice()`, `qrCodeService.generateLightningQrCode()`
- **Redis keys accessed**: `invoice:{paymentHash}` (encrypted, stored for tracking), `user:{whatsappId}:invoices` (set)
- **Response format**: `invoiceService.formatInvoiceMessage()` + QR code image (Buffer)
- **Auth required**: YES
- **Group support**: YES

---

### CommandType.HISTORY

- **Description**: Shows recent transaction history (last 10). Supports drill-down by transaction ID (`history #txId`).
- **Handler**: `handleHistoryCommand()`, `getTransactionDetails()`
- **Natural language triggers**: `show my history`, `transaction history`, `show my transactions`, `recent transactions`, `payment history`, `my transactions`, `check history`, `view transactions`, `past transactions`, `activity`, `log`, `records`, `tx`, `txs`, `history`, plus ~30 more
- **Regex pattern**: `/^(?:history|transactions|txs)(?:\s+#?([A-Za-z0-9]+))?$/i`
- **Flash API calls**: `transactionService.getRecentTransactions()` (10 or 50 for detail lookup), `balanceService.getUserBalance()` (display currency), `transactionService.formatTransactionHistory()`, `transactionService.formatDetailedTransaction()`
- **Redis keys accessed**: None directly
- **Response format**: Formatted transaction list with amounts, direction, dates. Detail view for specific tx. Voice support.
- **Auth required**: YES
- **Group support**: YES

---

### CommandType.REQUEST

- **Description**: Request payment from another user. Creates invoice and sends it via WhatsApp to the target. Supports username, phone number, and saved contacts. Stores pending request for recipient to pay with `pay` command.
- **Handler**: `handleRequestCommand()`
- **Natural language triggers**: `request 10 from john`, `ask john for 10`, `john owes me 10`, `charge john 10`, `bill john 10`, `invoice john for 10`, `collect 10 from john`, `get 10 from john`, `need 10 from john`, plus more
- **Regex pattern**: `/^request\s+(\d*\.?\d+)\s+from\s+(?:@?(\w+)|(\+?\d{10,}))(?:\s+(.+))?$/i`
- **Flash API calls**: `flashApiService.executeQuery(ACCOUNT_DEFAULT_WALLET_QUERY)` (validate username), `usernameService.getUsername()`, `invoiceService.createInvoice()`
- **Redis keys accessed**: `contacts:{whatsappId}` (contact lookup), `pending_request:{whatsappId}` (5min for unknown contacts), `pending_request:{recipientWhatsappId}` (encrypted, 1hr, for recipient), `contact_history:{whatsappId}:{contactName}` (tracking)
- **Response format**: Confirmation of request sent, or prompt to add contact if not found
- **Auth required**: YES
- **Group support**: YES (via username)

---

### CommandType.CONTACTS

- **Description**: Manage saved contacts. Sub-commands: `list` (default), `add name phone`, `remove name`, `history name`. Contacts stored in Redis with 1-year TTL. Also handles vCard auto-save.
- **Handler**: `handleContactsCommand()`, `handleVCardMessage()`
- **Natural language triggers**: None beyond regex
- **Regex pattern**: `/^contacts(?:\s+(add|list|remove|history))?(?:\s+(\w+))?(?:\s+(.+))?$/i`
- **Flash API calls**: None
- **Redis keys accessed**: `contacts:{whatsappId}` (JSON object, 1yr TTL), `contact_history:{whatsappId}:{contactName}` (JSON array, 1yr TTL)
- **Response format**: Contact list with icons (📲 vcard, 📝 manual), quick actions. Add/remove confirmation. History with dates.
- **Auth required**: YES
- **Group support**: YES (list only)

---

### CommandType.CONSENT

- **Description**: Record AI consent choice (yes/no). If pending AI question exists, processes it after consent.
- **Handler**: `handleConsentCommand()`
- **Natural language triggers**: None beyond regex
- **Regex pattern**: `/^consent\s+(yes|no)$/i`
- **Flash API calls**: `authService.recordConsent()`
- **Redis keys accessed**: `pending_ai_question:{whatsappId}` (checked and cleared)
- **Response format**: Consent confirmation, optionally followed by AI answer to pending question
- **Auth required**: YES
- **Group support**: NO

---

### CommandType.PAY

- **Description**: Pay pending Lightning invoices or payment requests. Sub-commands: `confirm`, `cancel`, `list`, `[number]` (select), `[template_name]` (template payment). Checks for pending payment requests first (from `request` command), then pending Lightning invoices.
- **Handler**: `handlePayCommand()`, `handlePayWithTemplate()`
- **Natural language triggers**: None beyond regex
- **Regex pattern**: `/^pay(?:\s+(confirm|cancel|list|\d+))?(?:\s+(all))?$/i`
- **Flash API calls**: `paymentService.getUserWallets()`, `paymentService.sendLightningPayment()`, `usernameService.getUsername()`
- **Redis keys accessed**: `pending_request:{whatsappId}` (encrypted), `pending_payments:{whatsappId}` (encrypted, list of Lightning invoices)
- **Response format**: Payment confirmation, invoice list, or error. Notifies requester on success.
- **Auth required**: YES
- **Group support**: NO

---

### CommandType.VYBZ

- **Description**: Share content to Nostr and earn sats via zaps. Sub-commands: default (start sharing), `status`/`check` (view earnings). Daily limit of 3 posts. Content moderation via AI.
- **Handler**: `handleVybzCommand()`, `getVybzStatus()`, `processVybzContent()`, `moderateContent()`
- **Natural language triggers**: None beyond regex
- **Regex pattern**: `/^(?:vybz|vybe|vibes|vibe|post|share|drop)(?:\s+(status|check))?$/i`
- **Flash API calls**: `usernameService.getUsername()`
- **Redis keys accessed**: `vybz_daily:{whatsappId}:{dateString}` (daily count, 24hr TTL), `vybz_queue:{whatsappId}` (processing queue, 5min), `vybz_waiting:{whatsappId}` (waiting flag, 5min), `vybz_posts:{whatsappId}` (post history)
- **Response format**: Content prompt, status with totals/recent posts/daily count
- **Auth required**: YES
- **Group support**: NO

---

### CommandType.PENDING

- **Description**: View and manage pending payments. Sub-commands: `sent` (sent by user), `received` (default, for user's phone), `claim CODE` (manual claim).
- **Handler**: `handlePendingCommand()`, `processPendingPaymentClaim()`
- **Natural language triggers**: None beyond regex
- **Regex pattern**: `/^pending(?:\s+(sent|received|claim))?(?:\s+(.+))?$/i`
- **Flash API calls**: `pendingPaymentService.getPendingPaymentsBySender()`, `pendingPaymentService.getPendingPaymentsByPhone()`, `pendingPaymentService.claimPendingPayment()`, `paymentService.getUserWallets()`, `paymentService.sendIntraLedgerUsdPayment()` (escrow release)
- **Redis keys accessed**: Pending payments via PendingPaymentService
- **Response format**: List of pending payments with amounts, codes, expiry dates
- **Auth required**: YES (for sent/claim), partial for received
- **Group support**: NO

---

### CommandType.VOICE

- **Description**: Voice settings management. Sub-commands: `on`, `off`, `only`, `status`, `help`, `list` (available voices), `select NAME`, `add NAME ID`, `remove NAME`, or direct voice name.
- **Handler**: `handleVoiceCommand()`
- **Natural language triggers**: `voice only`, `voicenote only`, `just voice`, `i want voice only`, plus ~15 more voice-only patterns
- **Regex pattern**: `/^voice(?:\s+(.+))?$/i`
- **Flash API calls**: None
- **Redis keys accessed**: Voice settings via `userVoiceSettingsService` (Redis-backed), voice list via `voiceManagementService` (Redis-backed)
- **Response format**: Status display, mode confirmation, voice list with ElevenLabs IDs
- **Auth required**: NO
- **Group support**: YES (limited)

---

### CommandType.SETTINGS

- **Description**: Display all user settings: account status, username, currency, voice mode/voice, AI consent status, notification settings, privacy settings, quick actions.
- **Handler**: `handleSettingsCommand()`
- **Natural language triggers**: None beyond regex
- **Regex pattern**: `/^settings?$/i`
- **Flash API calls**: `usernameService.getUsername()`, `balanceService.getUserBalance()` (for currency)
- **Redis keys accessed**: Voice settings, admin voice mode
- **Response format**: Multi-section settings display with emojis and action hints
- **Auth required**: NO (partial info for unlinked)
- **Group support**: NO

---

### CommandType.ADMIN

- **Description**: Admin-only commands for system management. Sub-commands: `help`, `status` (WhatsApp connection), `disconnect`, `reconnect`, `clear-session`, `settings` (admin settings view), `lockdown on/off`, `group on/off`, `audio always/on/off`, `audio default NAME`, `find TERM`, `add admin/support PHONE`, `remove admin/support PHONE`, `analytics daily/weekly`.
- **Handler**: `handleAdminCommand()`, `handleAdminFindCommand()`
- **Natural language triggers**: None beyond regex
- **Regex pattern**: `/^admin(?:\s+(help|disconnect|reconnect|status|clear-session|settings|lockdown|find|group|add|remove|audio|analytics))?\s*(?:support|admin)?\s*(.*)$/i`
- **Flash API calls**: None directly (admin settings in Redis)
- **Redis keys accessed**: Admin settings via `adminSettingsService`, `contacts:*` (find command scans all), sessions via `sessionService.getAllActiveSessions()`, analytics via `adminAnalyticsService`
- **Response format**: Varies by sub-command. Structured admin panels with emojis.
- **Auth required**: YES (admin phone number check)
- **Group support**: NO

---

### CommandType.UNDO

- **Description**: Undo the last undoable transaction (intraledger sends only).
- **Handler**: `handleUndoCommand()`
- **Natural language triggers**: None beyond regex
- **Regex pattern**: `/^undo$/i`
- **Flash API calls**: Via `undoTransactionService.undoTransaction()`
- **Redis keys accessed**: Undo transaction storage
- **Response format**: Success/failure message from UndoTransactionService
- **Auth required**: YES
- **Group support**: NO

---

### CommandType.TEMPLATE

- **Description**: Manage payment templates for recurring payments. Sub-commands: `list` (default), `add name amount to recipient "memo"`, `remove name`.
- **Handler**: `handleTemplateCommand()`, `handlePayWithTemplate()`
- **Natural language triggers**: None beyond regex
- **Regex pattern**: `/^template(?:\s+(add|remove|list))?(?:\s+(.+))?$/i`
- **Flash API calls**: Via `handleSendCommand()` when executing a template
- **Redis keys accessed**: Templates via `paymentTemplatesService` (Redis-backed)
- **Response format**: Template list, add/remove confirmation
- **Auth required**: YES
- **Group support**: NO

---

### CommandType.SKIP

- **Description**: Skip/dismiss onboarding tutorial.
- **Handler**: `handleSkipCommand()`
- **Natural language triggers**: None beyond regex
- **Regex pattern**: `/^skip(?:\s+(?:onboarding|tutorial|intro))?$/i`
- **Flash API calls**: None
- **Redis keys accessed**: Onboarding state via `onboardingService.dismissOnboarding()`
- **Response format**: Brief confirmation + help CTA
- **Auth required**: NO
- **Group support**: NO

---

### CommandType.LEARN

- **Description**: Interactive knowledge base / Q&A learning system. Sub-commands: `ask` (default — random question), `category NAME`, `delete ID`, `stats`, `reset`.
- **Handler**: `handleLearnCommand()`
- **Natural language triggers**: None beyond regex
- **Regex pattern**: `/^learn(?:\s+(category|delete|stats|reset))?(?:\s+(.+))?$/i`
- **Flash API calls**: None
- **Redis keys accessed**: Via `randomQuestionService` and `userKnowledgeBaseService` (Redis-backed)
- **Response format**: Question display, category knowledge, stats with category counts
- **Auth required**: YES (partially)
- **Group support**: NO

---

### CommandType.UNKNOWN (fallback)

- **Description**: Handles unrecognized commands. Flow: (1) try plugin system, (2) check greeting/casual → AI response, (3) check for pending send with @username response, (4) check for inline contact/phone for pending request, (5) check for Lightning invoice in message, (6) fallback to Gemini AI conversational response with contextual CTAs.
- **Handler**: `handleCommand()` default case, `tryPluginCommand()`, `getUnknownCommandMessage()`, `handleAiQuery()`, `handleInvoiceDetected()`
- **Natural language triggers**: Everything not matched by other commands
- **Flash API calls**: `geminiAiService.processQuery()` (AI conversation)
- **Redis keys accessed**: `pending_send:{whatsappId}` (5min), `pending_request:{whatsappId}` (5min)
- **Response format**: AI-generated conversational response with contextual CTAs
- **Auth required**: NO
- **Group support**: YES

---

### Payment Confirmation Flow (cross-cutting)

- **Description**: Intercepts all messages when a pending payment exists. Handles `yes`/`ok`/`pay` (confirm), `no`/`cancel` (cancel), bare number (amount update), or re-displays pending details.
- **Handler**: `handleCommand()` lines 511-559
- **Redis keys accessed**: Via `paymentConfirmationService.getPendingPayment()` / `storePendingPayment()` / `clearPendingPayment()`
- **Response format**: Confirmation prompt with payment details, updated amount notice, or cancellation

---

### Support Mode (cross-cutting)

- **Description**: Messages from the configured support phone number are routed through `supportModeService.routeMessage()` before normal processing.
- **Handler**: `processCloudMessage()` lines 163-192
- **Redis keys accessed**: Via SupportModeService

---

### vCard Handling (cross-cutting)

- **Description**: WhatsApp contact sharing auto-saves contacts. Detected by `isVCard` flag from message router.
- **Handler**: `handleVCardMessage()`
- **Redis keys accessed**: `contacts:{whatsappId}` (JSON, 1yr TTL)

---

### Lockdown Mode (cross-cutting)

- **Description**: When lockdown is enabled, only admin commands pass through. All others get lockdown message.
- **Handler**: `checkLockdown()`
- **Redis keys accessed**: Via `adminSettingsService.isLockdown()`, `adminSettingsService.isAdmin()`

---

## Plugins

### Trivia Games (`trivia`)

- **ID**: `trivia`
- **Version**: 1.0.0
- **Interface methods**: `handleCommand()` → `startTrivia()`, `handleAnswer()`, `handleHint()`, `showLeaderboard()`
- **Commands**: `trivia`/`quiz` (start), `answer`/`a`/`1-4` (answer), `hint` (get hint, -50% reward), `leaderboard`/`top`/`ranking`
- **State management**: Redis — `trivia:active:{userId}` (active question), `trivia:answered:{userId}` (answered IDs), `trivia:score:{userId}` (cumulative score), `trivia:leaderboard` (sorted set)
- **Triggers**: `/(?:play\s+)?trivia/i`, `/(?:start\s+)?quiz/i`, `/test my knowledge/i`, `/earn sats/i`
- **Auth required**: YES
- **Group support**: YES
- **Sats rewards**: 10 (easy), 20 (medium), 50 (hard); -50% with hint
- **Categories**: crypto, lightning, general

### Daily Challenges (`daily-challenge`)

- **ID**: `daily-challenge`
- **Version**: 1.0.0
- **Interface methods**: `handleCommand()` → `handleDailyChallenge()`, `handleStreak()`, `handleComplete()`
- **Commands**: `daily`/`challenge`/`dailychallenge` (view today's), `streak` (check streak), `complete` (submit)
- **State management**: Redis — `daily:progress:{userId}:{challengeId}`, `daily:streak:{userId}`
- **Triggers**: `/daily\s*(?:challenge)?/i`, `/today's challenge/i`, `/my streak/i`, `/complete challenge/i`
- **Auth required**: YES
- **Group support**: YES (view), NO (complete)
- **Challenge types**: trivia, puzzle, task, social

### Group Games & Polls (`group-games`)

- **ID**: `group-games`
- **Version**: 1.0.0
- **Interface methods**: `handleCommand()` with poll, vote, results, game, join, guess sub-handlers
- **Commands**: `poll` (create poll), `vote` (vote), `results` (show results), `game` (start: quickdraw, wordchain, numberguess, emoji), `join` (join game), `guess` (make guess)
- **State management**: Redis — poll and game state objects per group
- **Triggers**: `/create poll/i`, `/start poll/i`, `/vote\s+([1-9]|[a-z])/i`, `/start game/i`, `/play (.*)/i`, `/join game/i`, `/i'm in/i`
- **Auth required**: NO (polls), varies for games
- **Group support**: YES (primary use case)
- **Game types**: quickdraw (typing race), wordchain (word connections), numberguess, emoji

### Anonymous Messaging (`anonymous-messaging`)

- **ID**: `anonymous-messaging`
- **Version**: 1.0.0
- **Interface methods**: `handleCommand()` with anon, anonreply sub-handlers
- **Commands**: `anon MESSAGE` (send anonymous), `anonreply MESSAGE` (reply anonymously)
- **State management**: Redis — anonymous messages, conversations with animal+color aliases
- **Triggers**: `/anon(?:ymous)?\s+(.+)/i`, `/confess\s+(.+)/i`, `/reply anon(?:ymous)?\s+(.+)/i`
- **Auth required**: NO
- **Group support**: YES

### Group Decision Making (`decision-making`)

- **ID**: `decision-making`
- **Version**: 1.0.0
- **Interface methods**: `handleCommand()` with decide, vote, consensus, discuss sub-handlers
- **Commands**: `decide QUESTION` (start decision), `vote OPTION` (vote), `consensus QUESTION` (consensus mode), `discuss COMMENT` (add discussion)
- **State management**: Redis — decision objects with voting data, consensus discussions
- **Triggers**: `/decide\s+(.+)/i`, `/make decision\s+(.+)/i`, `/consensus\s+(.+)/i`, `/discuss\s+(.+)/i`
- **Voting methods**: simple, ranked, weighted, consensus
- **Auth required**: NO
- **Group support**: YES (primary use case)

### Language Translation (`translation`)

- **ID**: `translation`
- **Version**: 1.0.0
- **Interface methods**: `handleCommand()` with translate, detect, languages, autotranslate sub-handlers
- **Commands**: `translate TEXT to LANG`, `detect language TEXT`, `languages` (list), `autotranslate on/off`
- **State management**: Redis — translation cache, auto-translate settings per group
- **Triggers**: `/translate\s+(.+)/i`, `/(.+)\s+to\s+(\w+)$/i`, `/what is\s+(.+)\s+in\s+(\w+)/i`, `/detect language\s+(.+)/i`
- **Supported languages**: en, es, fr, de, it, pt, ru, ja, ko, zh, ar, hi, nl, pl, tr, vi, th, id, ms, tl (20 languages)
- **Auth required**: NO
- **Group support**: YES

### Entertainment / Jokes & Memes (`joke-meme`)

- **ID**: `joke-meme`
- **Version**: 1.0.0
- **Interface methods**: `handleCommand()` with joke, meme, roast, dadjoke, fortune sub-handlers
- **Commands**: `joke` (random joke), `meme` (random meme), `roast @USER` (playful roast), `dadjoke` (dad joke), `fortune` (fortune cookie)
- **State management**: None (stateless)
- **Triggers**: `/tell me a joke/i`, `/make me laugh/i`, `/show me a meme/i`, `/roast (\w+)/i`, `/dad joke/i`, `/tell my fortune/i`, `/fortune cookie/i`
- **Auth required**: NO
- **Group support**: YES
- **Joke categories**: crypto-themed, general, dad jokes, fortunes

---

## Group Features

- **Group detection**: `message.from.endsWith('@g.us')` in WhatsApp message router
- **Privacy mode (@lid)**: Users with WhatsApp privacy mode get `@lid` format IDs; special linking flow via 6-char codes (`link group` → `link CODE`)
- **Group-specific help**: Simplified help menu showing games, fun commands, and money commands
- **Group auth**: `GroupAuthService` manages group link codes (5min expiry)
- **Admin group control**: `admin group on/off` — enable/disable group responses globally
- **Group plugins**: Polls, group games, anonymous messaging, decision making, translation — all `groupSupported: true`

---

## Intent Mapping Table

| CommandType / handleX()          | Proposed Intent (core) or PluginId (plugin) | Expected Slots                                                                                                               | Notes                                                                           |
| -------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `CommandType.HELP`               | `Intent.HELP`                               | `category?: string`, `isQuestion?: bool`, `originalQuestion?: string`                                                        | Category: wallet, send, receive, contacts, pending, voice, games, more, 1, 2, 3 |
| `CommandType.LINK`               | `Intent.LINK_ACCOUNT`                       | `code?: string`, `type?: 'group'`                                                                                            | Three flows: standard, group code gen, group code verify                        |
| `CommandType.UNLINK`             | `Intent.UNLINK_ACCOUNT`                     | `confirm?: bool`                                                                                                             | Two-step confirmation                                                           |
| `CommandType.VERIFY`             | `Intent.VERIFY_OTP`                         | `otp: string`                                                                                                                | 6-digit code, also bare 6-digit input                                           |
| `CommandType.BALANCE`            | `Intent.CHECK_BALANCE`                      | —                                                                                                                            | Voice-capable                                                                   |
| `CommandType.REFRESH`            | `Intent.REFRESH_BALANCE`                    | —                                                                                                                            | Clears cache first                                                              |
| `CommandType.USERNAME`           | `Intent.MANAGE_USERNAME`                    | `username?: string`                                                                                                          | View (no arg) or set (with arg)                                                 |
| `CommandType.PRICE`              | `Intent.CHECK_PRICE`                        | —                                                                                                                            | Currency depends on auth state                                                  |
| `CommandType.SEND`               | `Intent.SEND_PAYMENT`                       | `amount: number`, `recipient: string`, `memo?: string`                                                                       | Recipient: @username, phone, contact name, lnbc invoice, lightning address      |
| `CommandType.RECEIVE`            | `Intent.CREATE_INVOICE`                     | `amount?: number`, `memo?: string`                                                                                           | Returns QR code media                                                           |
| `CommandType.HISTORY`            | `Intent.VIEW_HISTORY`                       | `transactionId?: string`                                                                                                     | List or detail view                                                             |
| `CommandType.REQUEST`            | `Intent.REQUEST_PAYMENT`                    | `amount: number`, `target: string`, `memo?: string`                                                                          | Target: @username, phone, contact name                                          |
| `CommandType.CONTACTS`           | `Intent.MANAGE_CONTACTS`                    | `action: 'list'\|'add'\|'remove'\|'history'`, `name?: string`, `phone?: string`                                              | Also handles vCard auto-save                                                    |
| `CommandType.CONSENT`            | `Intent.MANAGE_CONSENT`                     | `choice: 'yes'\|'no'`                                                                                                        | AI consent toggle                                                               |
| `CommandType.PAY`                | `Intent.PAY_INVOICE`                        | `action?: 'confirm'\|'cancel'\|'list'\|number\|template_name`, `modifier?: 'all'`                                            | Handles both payment requests and Lightning invoices                            |
| `CommandType.VYBZ`               | `Intent.SHARE_CONTENT`                      | `action?: 'status'\|'check'`                                                                                                 | Nostr integration (TODO: incomplete)                                            |
| `CommandType.PENDING`            | `Intent.VIEW_PENDING`                       | `action: 'sent'\|'received'\|'claim'`, `claimCode?: string`                                                                  | Escrow payment management                                                       |
| `CommandType.VOICE`              | `Intent.MANAGE_VOICE`                       | `action: 'on'\|'off'\|'only'\|'status'\|'help'\|'list'\|'select'\|'add'\|'remove'`, `voiceName?: string`, `voiceId?: string` | ElevenLabs TTS management                                                       |
| `CommandType.SETTINGS`           | `Intent.VIEW_SETTINGS`                      | —                                                                                                                            | Read-only settings display                                                      |
| `CommandType.ADMIN`              | `Intent.ADMIN_COMMAND`                      | `action: string`, `mode?: string`, `searchTerm?: string`, `subAction?: string`, `phoneNumber?: string`, `period?: string`    | Admin-only, 12+ sub-commands                                                    |
| `CommandType.UNDO`               | `Intent.UNDO_TRANSACTION`                   | —                                                                                                                            | Last intraledger send only                                                      |
| `CommandType.TEMPLATE`           | `Intent.MANAGE_TEMPLATE`                    | `action: 'list'\|'add'\|'remove'`, `name?: string`, `amount?: number`, `recipient?: string`, `memo?: string`                 | Payment shortcuts                                                               |
| `CommandType.SKIP`               | `Intent.SKIP_ONBOARDING`                    | —                                                                                                                            | One-shot                                                                        |
| `CommandType.LEARN`              | `Intent.LEARN`                              | `action: 'ask'\|'category'\|'delete'\|'stats'\|'reset'`, `query?: string`                                                    | Knowledge base Q&A                                                              |
| `CommandType.UNKNOWN` → AI       | `Intent.CONVERSATIONAL`                     | `rawText: string`                                                                                                            | Gemini AI fallback                                                              |
| `CommandType.UNKNOWN` → Invoice  | `Intent.INVOICE_DETECTED`                   | `invoice: string`                                                                                                            | Lightning invoice in message body                                               |
| `CommandType.UNKNOWN` → Greeting | `Intent.GREETING`                           | `rawText: string`                                                                                                            | Casual messages → AI                                                            |
| Payment Confirmation             | `Intent.CONFIRM_PAYMENT`                    | `confirmation: 'yes'\|'no'\|amount`                                                                                          | Cross-cutting interceptor                                                       |
| vCard received                   | `Intent.SAVE_CONTACT_VCARD`                 | `name: string`, `phone: string`                                                                                              | Media message type                                                              |
| Plugin: `trivia`                 | `PluginId.TRIVIA`                           | `subCommand: 'start'\|'answer'\|'hint'\|'leaderboard'`, `category?: string`, `difficulty?: string`, `answer?: string`        | Sats rewards                                                                    |
| Plugin: `daily-challenge`        | `PluginId.DAILY_CHALLENGE`                  | `subCommand: 'view'\|'streak'\|'complete'`, `answer?: string`                                                                | Streak bonuses                                                                  |
| Plugin: `group-games`            | `PluginId.GROUP_GAMES`                      | `subCommand: 'poll'\|'vote'\|'results'\|'game'\|'join'\|'guess'`, `gameType?: string`, `data?: string`                       | Group-only games                                                                |
| Plugin: `anonymous-messaging`    | `PluginId.ANONYMOUS`                        | `subCommand: 'send'\|'reply'`, `message: string`                                                                             | Animal+color aliases                                                            |
| Plugin: `decision-making`        | `PluginId.DECISION`                         | `subCommand: 'decide'\|'vote'\|'consensus'\|'discuss'`, `data: string`                                                       | Multiple voting methods                                                         |
| Plugin: `translation`            | `PluginId.TRANSLATION`                      | `subCommand: 'translate'\|'detect'\|'languages'\|'autotranslate'`, `text?: string`, `targetLang?: string`                    | 20 languages                                                                    |
| Plugin: `joke-meme`              | `PluginId.ENTERTAINMENT`                    | `subCommand: 'joke'\|'meme'\|'roast'\|'dadjoke'\|'fortune'`, `target?: string`, `topic?: string`                             | Stateless                                                                       |

---

## Summary Matrix

| Feature         | Auth Required | Group Support | Voice Support | Flash API     | Redis State | Plugin |
| --------------- | ------------- | ------------- | ------------- | ------------- | ----------- | ------ |
| Help            | No            | Yes           | No            | No            | No          | No     |
| Link            | No            | Yes (privacy) | No            | Yes           | Yes         | No     |
| Unlink          | Yes           | No            | No            | Yes           | Yes         | No     |
| Verify          | No            | No            | Yes (force)   | Yes           | Yes         | No     |
| Balance         | Yes           | Yes           | Yes           | Yes           | Yes (cache) | No     |
| Refresh         | Yes           | Yes           | No            | Yes           | Yes (cache) | No     |
| Username        | Yes           | Yes           | No            | Yes           | Yes         | No     |
| Price           | No            | Yes           | No            | Yes           | Yes (cache) | No     |
| Send            | Yes           | Yes           | Yes           | Yes           | Yes         | No     |
| Receive         | Yes           | Yes           | No            | Yes           | Yes         | No     |
| History         | Yes           | Yes           | Yes           | Yes           | No          | No     |
| Request         | Yes           | Yes           | No            | Yes           | Yes         | No     |
| Contacts        | Yes           | Yes           | Yes           | No            | Yes         | No     |
| Consent         | Yes           | No            | No            | Yes           | Yes         | No     |
| Pay             | Yes           | No            | No            | Yes           | Yes         | No     |
| Vybz            | Yes           | No            | No            | Partial       | Yes         | No     |
| Pending         | Partial       | No            | No            | Yes           | Yes         | No     |
| Voice           | No            | Partial       | Yes           | No            | Yes         | No     |
| Settings        | No            | No            | No            | Yes           | Yes         | No     |
| Admin           | Admin         | No            | No            | No            | Yes         | No     |
| Undo            | Yes           | No            | No            | Yes           | Yes         | No     |
| Template        | Yes           | No            | No            | Yes           | Yes         | No     |
| Skip            | No            | No            | No            | No            | Yes         | No     |
| Learn           | Partial       | No            | No            | No            | Yes         | No     |
| AI Fallback     | No            | Yes           | Yes           | Yes (Gemini)  | Yes         | No     |
| Trivia          | Yes           | Yes           | No            | Yes (rewards) | Yes         | Yes    |
| Daily Challenge | Yes           | Partial       | No            | No            | Yes         | Yes    |
| Group Games     | No            | Yes           | No            | No            | Yes         | Yes    |
| Anonymous Msg   | No            | Yes           | No            | No            | Yes         | Yes    |
| Decision Making | No            | Yes           | No            | No            | Yes         | Yes    |
| Translation     | No            | Yes           | No            | No            | Yes         | Yes    |
| Jokes/Memes     | No            | Yes           | No            | No            | No          | Yes    |

**Totals**: 25 core CommandTypes + 7 plugins = **32 features**
**Core handlers**: 29 `handle*` methods in god service
**Natural language patterns**: ~200+ patterns across command parser
**Flash API integrations**: Balance, Price, Invoice, Payment, Transaction, Username, Auth services
**Redis key patterns**: ~20 distinct key patterns with encryption, TTL, and set operations
